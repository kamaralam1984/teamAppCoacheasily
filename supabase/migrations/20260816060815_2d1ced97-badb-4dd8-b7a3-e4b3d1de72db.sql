-- ═══════════ PART A · RELEASES ═══════════
CREATE TABLE public.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  title text NOT NULL,
  summary text,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.release_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  what_it_does text,
  how_to_use text,
  why_it_helps text,
  idea_id uuid REFERENCES public.ideas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.release_seen (
  release_id uuid NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, profile_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.releases TO authenticated;
GRANT ALL ON public.releases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.release_items TO authenticated;
GRANT ALL ON public.release_items TO service_role;
GRANT SELECT, INSERT ON public.release_seen TO authenticated;
GRANT ALL ON public.release_seen TO service_role;

ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "releases readable in org" ON public.releases
  FOR SELECT TO authenticated
  USING (org_id = public.my_org() AND (published OR public.my_role() IN ('hr','admin')));

CREATE POLICY "releases writable by hr" ON public.releases
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.my_org() AND public.my_role() IN ('hr','admin'));

CREATE POLICY "releases updatable by hr" ON public.releases
  FOR UPDATE TO authenticated
  USING (org_id = public.my_org() AND public.my_role() IN ('hr','admin'))
  WITH CHECK (org_id = public.my_org() AND public.my_role() IN ('hr','admin'));

CREATE POLICY "releases deletable by hr" ON public.releases
  FOR DELETE TO authenticated
  USING (org_id = public.my_org() AND public.my_role() IN ('hr','admin'));

CREATE POLICY "release items readable in org" ON public.release_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = release_items.release_id
      AND r.org_id = public.my_org()
      AND (r.published OR public.my_role() IN ('hr','admin'))
  ));

CREATE POLICY "release items insertable by hr" ON public.release_items
  FOR INSERT TO authenticated
  WITH CHECK (public.my_role() IN ('hr','admin') AND EXISTS (
    SELECT 1 FROM public.releases r WHERE r.id = release_items.release_id AND r.org_id = public.my_org()
  ));

CREATE POLICY "release items updatable by hr" ON public.release_items
  FOR UPDATE TO authenticated
  USING (public.my_role() IN ('hr','admin') AND EXISTS (
    SELECT 1 FROM public.releases r WHERE r.id = release_items.release_id AND r.org_id = public.my_org()
  ))
  WITH CHECK (public.my_role() IN ('hr','admin') AND EXISTS (
    SELECT 1 FROM public.releases r WHERE r.id = release_items.release_id AND r.org_id = public.my_org()
  ));

CREATE POLICY "release items deletable by hr" ON public.release_items
  FOR DELETE TO authenticated
  USING (public.my_role() IN ('hr','admin') AND EXISTS (
    SELECT 1 FROM public.releases r WHERE r.id = release_items.release_id AND r.org_id = public.my_org()
  ));

CREATE POLICY "release seen own read" ON public.release_seen
  FOR SELECT TO authenticated
  USING (profile_id = public.my_profile_id());

CREATE POLICY "release seen own insert" ON public.release_seen
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.my_profile_id());

CREATE TRIGGER releases_touch_updated_at
  BEFORE UPDATE ON public.releases
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

-- items json helper is inlined in each function below

CREATE OR REPLACE FUNCTION public.latest_unseen_release()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public.my_profile_id();
  v_org uuid := public.my_org();
  v_rel record;
BEGIN
  IF v_me IS NULL OR v_org IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.* INTO v_rel
  FROM public.releases r
  WHERE r.org_id = v_org
    AND r.published
    AND NOT EXISTS (
      SELECT 1 FROM public.release_seen s
      WHERE s.release_id = r.id AND s.profile_id = v_me
    )
  ORDER BY COALESCE(r.published_at, r.created_at) DESC
  LIMIT 1;

  IF v_rel.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_rel.id,
    'title', v_rel.title,
    'summary', v_rel.summary,
    'published_at', v_rel.published_at,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'title', i.title,
        'what_it_does', i.what_it_does,
        'how_to_use', i.how_to_use,
        'why_it_helps', i.why_it_helps,
        'credit', CASE
          WHEN i.idea_id IS NULL THEN NULL
          WHEN idea.is_anonymous THEN 'Anonymous'
          ELSE author.full_name
        END
      ) ORDER BY i.sort_order ASC, i.created_at ASC)
      FROM public.release_items i
      LEFT JOIN public.ideas idea ON idea.id = i.idea_id
      LEFT JOIN public.profiles author ON author.id = idea.profile_id
      WHERE i.release_id = v_rel.id
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.latest_unseen_release() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.latest_unseen_release() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_release_seen(p_release_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public.my_profile_id();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No profile';
  END IF;
  INSERT INTO public.release_seen (release_id, profile_id)
  VALUES (p_release_id, v_me)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_release_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_release_seen(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_history()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.my_org();
BEGIN
  IF public.my_profile_id() IS NULL OR v_org IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_json ORDER BY sort_key DESC)
    FROM (
      SELECT
        COALESCE(r.published_at, r.created_at) AS sort_key,
        jsonb_build_object(
          'id', r.id,
          'title', r.title,
          'summary', r.summary,
          'published_at', r.published_at,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', i.id,
              'title', i.title,
              'what_it_does', i.what_it_does,
              'how_to_use', i.how_to_use,
              'why_it_helps', i.why_it_helps,
              'credit', CASE
                WHEN i.idea_id IS NULL THEN NULL
                WHEN idea.is_anonymous THEN 'Anonymous'
                ELSE author.full_name
              END
            ) ORDER BY i.sort_order ASC, i.created_at ASC)
            FROM public.release_items i
            LEFT JOIN public.ideas idea ON idea.id = i.idea_id
            LEFT JOIN public.profiles author ON author.id = idea.profile_id
            WHERE i.release_id = r.id
          ), '[]'::jsonb)
        ) AS row_json
      FROM public.releases r
      WHERE r.org_id = v_org AND r.published
    ) q
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.release_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_history() TO authenticated;

-- ═══════════ PART B · PULSE ═══════════
CREATE TABLE public.pulse_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('first_week','monthly')),
  questions jsonb NOT NULL,
  opens_on date NOT NULL,
  closes_on date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pulse_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.pulse_rounds(id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  submitted_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date
);

CREATE TABLE public.pulse_done (
  round_id uuid NOT NULL REFERENCES public.pulse_rounds(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  done_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  PRIMARY KEY (round_id, profile_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_rounds TO authenticated;
GRANT ALL ON public.pulse_rounds TO service_role;
GRANT ALL ON public.pulse_responses TO service_role;
GRANT SELECT ON public.pulse_done TO authenticated;
GRANT ALL ON public.pulse_done TO service_role;

ALTER TABLE public.pulse_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_done ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pulse rounds readable in org" ON public.pulse_rounds
  FOR SELECT TO authenticated USING (org_id = public.my_org());
CREATE POLICY "pulse rounds insert hr" ON public.pulse_rounds
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.my_org() AND public.my_role() IN ('hr','admin'));
CREATE POLICY "pulse rounds update hr" ON public.pulse_rounds
  FOR UPDATE TO authenticated
  USING (org_id = public.my_org() AND public.my_role() IN ('hr','admin'))
  WITH CHECK (org_id = public.my_org() AND public.my_role() IN ('hr','admin'));
CREATE POLICY "pulse rounds delete hr" ON public.pulse_rounds
  FOR DELETE TO authenticated
  USING (org_id = public.my_org() AND public.my_role() IN ('hr','admin'));

-- pulse_responses: no policies at all. Nobody reads or writes directly.

CREATE POLICY "pulse done own read" ON public.pulse_done
  FOR SELECT TO authenticated USING (profile_id = public.my_profile_id());

CREATE OR REPLACE FUNCTION public.my_pulse()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public.my_profile_id();
  v_org uuid := public.my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_joined date;
  v_first_att date;
  v_start date;
  v_round record;
BEGIN
  IF v_me IS NULL OR v_org IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT joined_on INTO v_joined FROM public.profiles WHERE id = v_me;
  SELECT min(date) INTO v_first_att FROM public.attendance WHERE profile_id = v_me;
  v_start := GREATEST(COALESCE(v_joined, v_first_att), COALESCE(v_first_att, v_joined));

  SELECT r.* INTO v_round
  FROM public.pulse_rounds r
  WHERE r.org_id = v_org
    AND r.active
    AND r.opens_on <= v_today
    AND (r.closes_on IS NULL OR r.closes_on >= v_today)
    AND NOT EXISTS (
      SELECT 1 FROM public.pulse_done d WHERE d.round_id = r.id AND d.profile_id = v_me
    )
    AND (
      r.kind <> 'first_week'
      OR (v_start IS NOT NULL AND v_today >= v_start + 7)
    )
  ORDER BY (r.kind = 'first_week') DESC, r.opens_on DESC
  LIMIT 1;

  IF v_round.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_round.id,
    'label', v_round.label,
    'kind', v_round.kind,
    'questions', v_round.questions
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_pulse() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pulse() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_pulse(p_round_id uuid, p_answers jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public.my_profile_id();
  v_org uuid := public.my_org();
BEGIN
  IF v_me IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'No profile';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pulse_rounds r WHERE r.id = p_round_id AND r.org_id = v_org) THEN
    RAISE EXCEPTION 'Unknown round';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pulse_done d WHERE d.round_id = p_round_id AND d.profile_id = v_me) THEN
    RAISE EXCEPTION 'Already answered';
  END IF;

  INSERT INTO public.pulse_done (round_id, profile_id) VALUES (p_round_id, v_me);
  INSERT INTO public.pulse_responses (round_id, answers) VALUES (p_round_id, p_answers);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_pulse(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pulse(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.pulse_results(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.my_org();
  v_count integer;
  v_avg numeric;
BEGIN
  IF public.my_role() IS NULL OR public.my_role() NOT IN ('hr','admin') OR v_org IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pulse_rounds r WHERE r.id = p_round_id AND r.org_id = v_org) THEN
    RAISE EXCEPTION 'Unknown round';
  END IF;

  SELECT count(*) INTO v_count FROM public.pulse_responses WHERE round_id = p_round_id;

  IF v_count < 4 THEN
    RETURN jsonb_build_object('count', v_count, 'sealed', true, 'average', NULL, 'texts', '[]'::jsonb);
  END IF;

  SELECT avg(v) INTO v_avg FROM (
    SELECT (a.value)::numeric AS v
    FROM public.pulse_responses pr, jsonb_array_elements(pr.answers) a
    WHERE pr.round_id = p_round_id
      AND jsonb_typeof(a.value) = 'number'
  ) s;

  RETURN jsonb_build_object(
    'count', v_count,
    'sealed', false,
    'average', v_avg,
    'texts', COALESCE((
      SELECT jsonb_agg(t ORDER BY r)
      FROM (
        SELECT a.value #>> '{}' AS t, random() AS r
        FROM public.pulse_responses pr, jsonb_array_elements(pr.answers) a
        WHERE pr.round_id = p_round_id
          AND jsonb_typeof(a.value) = 'string'
          AND length(trim(a.value #>> '{}')) > 0
      ) q
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.pulse_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pulse_results(uuid) TO authenticated;

INSERT INTO public.pulse_rounds (org_id, label, kind, questions, opens_on, active)
SELECT o.id, 'Your first week', 'first_week',
  '[{"type":"scale","min":1,"max":5,"text":"How much is the app helping you do your work?"},{"type":"text","text":"What is the one thing you would change?"},{"type":"text","text":"What is working well?"}]'::jsonb,
  (now() AT TIME ZONE 'Asia/Kolkata')::date, true
FROM public.organisations o;