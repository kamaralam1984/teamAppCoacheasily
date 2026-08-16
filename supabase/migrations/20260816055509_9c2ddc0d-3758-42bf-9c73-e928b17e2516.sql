CREATE TABLE public.ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid REFERENCES public.profiles(id),
  is_anonymous boolean NOT NULL DEFAULT false,
  kind text NOT NULL CHECK (kind IN ('broken','confusing','idea','praise')),
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','looking','building','shipped','declined')),
  status_note text,
  source text NOT NULL DEFAULT 'team_app',
  screen text,
  device text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  CONSTRAINT ideas_anonymous_has_no_author CHECK (NOT is_anonymous OR profile_id IS NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ideas TO authenticated;
GRANT ALL ON public.ideas TO service_role;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ideas_select_org" ON public.ideas
  FOR SELECT TO authenticated
  USING (org_id = public.my_org());

CREATE POLICY "ideas_insert_own" ON public.ideas
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.my_org()
    AND (
      (is_anonymous AND profile_id IS NULL)
      OR (NOT is_anonymous AND profile_id = public.my_profile_id())
    )
  );

CREATE POLICY "ideas_update_hr" ON public.ideas
  FOR UPDATE TO authenticated
  USING (org_id = public.my_org() AND public.my_role() IS NOT NULL AND public.my_role() IN ('hr','admin'))
  WITH CHECK (org_id = public.my_org() AND public.my_role() IS NOT NULL AND public.my_role() IN ('hr','admin'));

CREATE POLICY "ideas_delete_own_new" ON public.ideas
  FOR DELETE TO authenticated
  USING (
    org_id = public.my_org()
    AND NOT is_anonymous
    AND status = 'new'
    AND profile_id = public.my_profile_id()
  );

CREATE TABLE public.idea_votes (
  idea_id uuid NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, profile_id)
);

GRANT SELECT, INSERT, DELETE ON public.idea_votes TO authenticated;
GRANT ALL ON public.idea_votes TO service_role;
ALTER TABLE public.idea_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "idea_votes_select_org" ON public.idea_votes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ideas i WHERE i.id = idea_id AND i.org_id = public.my_org()));

CREATE POLICY "idea_votes_insert_own" ON public.idea_votes
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.my_profile_id());

CREATE POLICY "idea_votes_delete_own" ON public.idea_votes
  FOR DELETE TO authenticated
  USING (profile_id = public.my_profile_id());

CREATE INDEX ideas_org_created_idx ON public.ideas (org_id, created_at DESC);
CREATE INDEX idea_votes_idea_idx ON public.idea_votes (idea_id);

CREATE TRIGGER ideas_touch_updated_at
  BEFORE UPDATE ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

CREATE OR REPLACE FUNCTION public.submit_idea(
  p_kind text,
  p_title text,
  p_detail text DEFAULT NULL,
  p_anonymous boolean DEFAULT false,
  p_screen text DEFAULT NULL,
  p_device text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.my_org();
  v_me uuid := public.my_profile_id();
  v_id uuid;
BEGIN
  IF v_org IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'Not part of an organisation';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Please give it a one-line title';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('broken','confusing','idea','praise') THEN
    RAISE EXCEPTION 'Unknown kind';
  END IF;

  INSERT INTO public.ideas (org_id, profile_id, is_anonymous, kind, title, detail, screen, device)
  VALUES (
    v_org,
    CASE WHEN coalesce(p_anonymous, false) THEN NULL ELSE v_me END,
    coalesce(p_anonymous, false),
    p_kind,
    btrim(p_title),
    nullif(btrim(coalesce(p_detail, '')), ''),
    nullif(btrim(coalesce(p_screen, '')), ''),
    nullif(btrim(coalesce(p_device, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_idea(text, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_idea(text, text, text, boolean, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.vote_idea(p_idea_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.my_org();
  v_me uuid := public.my_profile_id();
  v_exists boolean;
  v_count integer;
BEGIN
  IF v_org IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'Not part of an organisation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ideas i WHERE i.id = p_idea_id AND i.org_id = v_org) THEN
    RAISE EXCEPTION 'Idea not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.idea_votes v WHERE v.idea_id = p_idea_id AND v.profile_id = v_me
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.idea_votes v WHERE v.idea_id = p_idea_id AND v.profile_id = v_me;
  ELSE
    INSERT INTO public.idea_votes (idea_id, profile_id) VALUES (p_idea_id, v_me)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(*)::int INTO v_count FROM public.idea_votes v WHERE v.idea_id = p_idea_id;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.vote_idea(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vote_idea(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_idea_status(p_idea_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.my_org();
  v_me uuid := public.my_profile_id();
  v_idea public.ideas%ROWTYPE;
  v_title text;
  v_body text;
BEGIN
  IF public.my_role() IS NULL OR public.my_role() NOT IN ('hr','admin') THEN
    RAISE EXCEPTION 'Only HR can move an idea along';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('new','looking','building','shipped','declined') THEN
    RAISE EXCEPTION 'Unknown status';
  END IF;

  SELECT * INTO v_idea FROM public.ideas WHERE id = p_idea_id AND org_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Idea not found';
  END IF;

  IF p_status = 'declined' AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Please say why, in one line';
  END IF;

  UPDATE public.ideas
  SET status = p_status,
      status_note = nullif(btrim(coalesce(p_note, '')), ''),
      decided_by = v_me,
      decided_at = now()
  WHERE id = p_idea_id
  RETURNING * INTO v_idea;

  IF p_status IN ('shipped','declined') THEN
    v_title := CASE WHEN p_status = 'shipped' THEN 'Shipped: ' ELSE 'Not now: ' END || v_idea.title;
    v_body := coalesce(v_idea.status_note, '');

    INSERT INTO public.notifications (org_id, profile_id, title, body, link)
    SELECT v_org, p.id, v_title, v_body, '/ideas'
    FROM (
      SELECT v_idea.profile_id AS id WHERE v_idea.profile_id IS NOT NULL AND NOT v_idea.is_anonymous
      UNION
      SELECT v.profile_id FROM public.idea_votes v WHERE v.idea_id = p_idea_id
    ) p
    WHERE p.id IS NOT NULL AND p.id <> v_me;
  END IF;

  RETURN jsonb_build_object('id', v_idea.id, 'status', v_idea.status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_idea_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_idea_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ideas_board()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.my_org();
  v_me uuid := public.my_profile_id();
  v_rows jsonb;
BEGIN
  IF v_org IS NULL OR v_me IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'votes')::int DESC, (r->>'created_at') DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', i.id,
      'kind', i.kind,
      'title', i.title,
      'detail', i.detail,
      'status', i.status,
      'status_note', i.status_note,
      'screen', i.screen,
      'device', i.device,
      'source', i.source,
      'created_at', i.created_at,
      'decided_at', i.decided_at,
      'is_anonymous', i.is_anonymous,
      'is_mine', (i.profile_id IS NOT NULL AND i.profile_id = v_me),
      'author', CASE WHEN i.is_anonymous THEN 'Anonymous' ELSE coalesce(pr.full_name, 'Someone') END,
      'votes', (SELECT count(*)::int FROM public.idea_votes v WHERE v.idea_id = i.id),
      'voted', EXISTS (SELECT 1 FROM public.idea_votes v WHERE v.idea_id = i.id AND v.profile_id = v_me)
    ) AS r
    FROM public.ideas i
    LEFT JOIN public.profiles pr ON pr.id = i.profile_id
    WHERE i.org_id = v_org
  ) s;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.ideas_board() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ideas_board() TO authenticated;