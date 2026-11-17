-- ═══ ANNUAL SELF-EVALUATION: FORM + MANAGER / HR / ADMIN RATINGS + FILE UPLOADS ═══
-- The yearly "Annual Self-Evaluation Form" (Jan–Dec) inside the app, one per person per year:
--   * HR or admin open the year's cycle (with a last date); everyone active is told.
--   * The person fills About you, Part A (4–5 goals), Part B (12 values), Part C (reflection),
--     Part D (potential), signs off and submits. They can upload evidence per goal and their
--     filled / signed form; an uploaded form can fill the boxes by itself (read in the app).
--   * Their managers (whole chain), HR and admin each rate every goal and value, give an
--     overall rating and feedback (shown to the person once final) and an internal note
--     (never shown to the person).
--   * The manager submits; HR or admin make it final with a final rating.
-- Reading: the person, their managers (whole chain) and HR / admin.
-- Nothing can be deleted: there is no DELETE grant or policy on any table or on the files;
-- a file is hidden with removed_at, and every change is kept in self_eval_log.
-- Only adds functions, tables and a bucket; no existing table, column or row is changed.

-- ───────── 1. WHO ─────────
-- may open the form: the person, anyone above them, HR / admin (same organisation)
CREATE OR REPLACE FUNCTION public.can_view_self_eval(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_profile_id() IS NOT NULL
     AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_profile_id AND p.org_id = my_org())
     AND (p_profile_id = my_profile_id() OR my_role() IN ('hr', 'admin') OR manages(p_profile_id))
$$;
-- rates it: anyone above the person, HR / admin; never the person themselves
CREATE OR REPLACE FUNCTION public.is_self_eval_reviewer(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_profile_id IS DISTINCT FROM my_profile_id()
     AND can_view_self_eval(p_profile_id)
$$;
REVOKE ALL ON FUNCTION public.can_view_self_eval(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_self_eval_reviewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_self_eval(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_self_eval_reviewer(uuid) TO authenticated, service_role;

-- ───────── 2. TABLES ─────────
CREATE TABLE IF NOT EXISTS public.self_eval_cycles (
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  due_date date,
  opened_at timestamptz,
  opened_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, year)
);

CREATE TABLE IF NOT EXISTS public.self_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  -- About you (filled from the profile, the person can correct it)
  role_team text NOT NULL DEFAULT '',
  manager_name text NOT NULL DEFAULT '',
  review_period text NOT NULL DEFAULT '',
  -- Part A: [{goal, target, result, evidence, rating}]
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Part B: {ownership: {example, rating}, ...}
  value_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Part C: {proud, missed, challenge, feedback, development, support}
  reflection jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Part D: {learn: {rating, why}, ...}
  potential jsonb NOT NULL DEFAULT '{}'::jsonb,
  signed_name text,
  signed_at timestamptz,
  emp_submitted_at timestamptz,
  mgr_submitted_at timestamptz,
  mgr_submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalized_at timestamptz,
  finalized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  final_rating text CHECK (final_rating IN ('O', 'EE', 'FME', 'PME', 'DNME')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (profile_id, year)
);

-- the ratings and overall feedback of one reviewer kind: shown to the person once final
CREATE TABLE IF NOT EXISTS public.self_eval_reviews (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('manager', 'hr', 'sir')),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  -- {"0": {rating, comment}, ...} by goal number (0-based)
  goal_ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- {ownership: {rating, comment}, ...}
  value_ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_rating text CHECK (overall_rating IN ('O', 'EE', 'FME', 'PME', 'DNME')),
  feedback text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, year, kind)
);

-- internal notes: never shown to the person
CREATE TABLE IF NOT EXISTS public.self_eval_notes (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('manager', 'hr', 'sir')),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, year, kind)
);

-- uploaded files: evidence for a goal, the filled / signed form, anything else
CREATE TABLE IF NOT EXISTS public.self_eval_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('evidence', 'form', 'other')),
  goal_index integer CHECK (goal_index BETWEEN 0 AND 9),
  path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime text NOT NULL DEFAULT '',
  size_bytes bigint NOT NULL DEFAULT 0,       -- as stored (after it was made smaller)
  original_size bigint,                       -- as uploaded
  encoding text CHECK (encoding IN ('gzip')), -- 'gzip': stored compressed, opened as the original
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,          -- hidden, never deleted
  removed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS self_eval_files_profile_idx ON public.self_eval_files (profile_id, year);

-- every change, for HR / admin
CREATE TABLE IF NOT EXISTS public.self_eval_log (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  year integer NOT NULL,
  actor uuid,
  entity text NOT NULL,
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS self_eval_log_profile_idx
  ON public.self_eval_log (profile_id, year, created_at DESC);

ALTER TABLE public.self_eval_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_eval_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_eval_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_eval_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_eval_log ENABLE ROW LEVEL SECURITY;
-- reading only: every write goes through the functions below, which check who may write what
GRANT SELECT ON public.self_eval_cycles, public.self_evaluations, public.self_eval_reviews,
  public.self_eval_notes, public.self_eval_files, public.self_eval_log TO authenticated;
GRANT ALL ON public.self_eval_cycles, public.self_evaluations, public.self_eval_reviews,
  public.self_eval_notes, public.self_eval_files, public.self_eval_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.self_eval_log_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.self_eval_final(p_profile_id uuid, p_year integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM self_evaluations e
                  WHERE e.profile_id = p_profile_id AND e.year = p_year
                    AND e.finalized_at IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION public.self_eval_final(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_eval_final(uuid, integer) TO authenticated, service_role;

-- ───────── 3. READ POLICIES (no write or DELETE policy anywhere) ─────────
DROP POLICY IF EXISTS self_eval_cycles_read ON public.self_eval_cycles;
CREATE POLICY self_eval_cycles_read ON public.self_eval_cycles FOR SELECT TO authenticated
  USING (org_id = my_org());

DROP POLICY IF EXISTS self_evaluations_read ON public.self_evaluations;
CREATE POLICY self_evaluations_read ON public.self_evaluations FOR SELECT TO authenticated
  USING (org_id = my_org() AND can_view_self_eval(profile_id));

DROP POLICY IF EXISTS self_eval_reviews_read ON public.self_eval_reviews;
CREATE POLICY self_eval_reviews_read ON public.self_eval_reviews FOR SELECT TO authenticated
  USING (org_id = my_org() AND (is_self_eval_reviewer(profile_id)
         OR (profile_id = my_profile_id() AND self_eval_final(profile_id, year))));

DROP POLICY IF EXISTS self_eval_notes_read ON public.self_eval_notes;
CREATE POLICY self_eval_notes_read ON public.self_eval_notes FOR SELECT TO authenticated
  USING (org_id = my_org() AND is_self_eval_reviewer(profile_id));

DROP POLICY IF EXISTS self_eval_files_read ON public.self_eval_files;
CREATE POLICY self_eval_files_read ON public.self_eval_files FOR SELECT TO authenticated
  USING (org_id = my_org() AND can_view_self_eval(profile_id));

DROP POLICY IF EXISTS self_eval_log_read ON public.self_eval_log;
CREATE POLICY self_eval_log_read ON public.self_eval_log FOR SELECT TO authenticated
  USING (org_id = my_org() AND my_role() IN ('hr', 'admin'));

-- ───────── 4. HELPERS ─────────
CREATE OR REPLACE FUNCTION public.self_eval_log_add(
  p_org uuid, p_profile uuid, p_year integer, p_entity text, p_action text, p_changes jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO self_eval_log (org_id, profile_id, year, actor, entity, action, changes)
  VALUES (p_org, p_profile, p_year, my_profile_id(), p_entity, p_action, coalesce(p_changes, '{}'::jsonb))
$$;
REVOKE ALL ON FUNCTION public.self_eval_log_add(uuid, uuid, integer, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.self_eval_cycle_open(p_org uuid, p_year integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM self_eval_cycles c
                  WHERE c.org_id = p_org AND c.year = p_year
                    AND c.opened_at IS NOT NULL AND c.closed_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.self_eval_cycle_open(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_eval_cycle_open(uuid, integer) TO authenticated, service_role;

-- a text box of the form: a JSON string (or null), at most 20,000 characters
CREATE OR REPLACE FUNCTION public.self_eval_text_ok(p_value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_value IS NULL OR jsonb_typeof(p_value) = 'null'
      OR (jsonb_typeof(p_value) = 'string' AND length(p_value #>> '{}') <= 20000)
$$;

CREATE OR REPLACE FUNCTION public.self_eval_rating_ok(p_value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_value IS NULL OR jsonb_typeof(p_value) = 'null'
      OR (p_value #>> '{}') IN ('', 'O', 'EE', 'FME', 'PME', 'DNME')
$$;

CREATE OR REPLACE FUNCTION public.self_eval_potential_ok(p_value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_value IS NULL OR jsonb_typeof(p_value) = 'null'
      OR (p_value #>> '{}') IN ('', 'Low', 'Low–Moderate', 'Moderate', 'Moderate–High', 'High')
$$;

-- a whole part, as an uploaded form fills it: right shape, known keys, known ratings
CREATE OR REPLACE FUNCTION public.self_eval_section_ok(p_section text, p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_el jsonb;
  v_k text;
BEGIN
  IF pg_column_size(p_value) > 200000 THEN RETURN false; END IF;
  IF p_section = 'goals' THEN
    IF jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) > 10 THEN RETURN false; END IF;
    FOR v_el IN SELECT * FROM jsonb_array_elements(p_value) LOOP
      IF jsonb_typeof(v_el) <> 'object' THEN RETURN false; END IF;
      FOR v_k IN SELECT jsonb_object_keys(v_el) LOOP
        IF v_k NOT IN ('goal', 'target', 'result', 'evidence', 'rating') THEN RETURN false; END IF;
        IF v_k = 'rating' AND NOT self_eval_rating_ok(v_el -> v_k) THEN RETURN false; END IF;
        IF v_k <> 'rating' AND NOT self_eval_text_ok(v_el -> v_k) THEN RETURN false; END IF;
      END LOOP;
    END LOOP;
    RETURN true;
  END IF;
  IF jsonb_typeof(p_value) <> 'object' THEN RETURN false; END IF;
  FOR v_k, v_el IN SELECT * FROM jsonb_each(p_value) LOOP
    IF p_section = 'reflection' THEN
      IF NOT self_eval_text_ok(v_el) THEN RETURN false; END IF;
    ELSE
      IF jsonb_typeof(v_el) <> 'object' THEN RETURN false; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_el) f
                  WHERE f NOT IN (CASE p_section WHEN 'values' THEN 'example' ELSE 'why' END, 'rating')) THEN
        RETURN false;
      END IF;
      IF p_section = 'values' AND NOT (self_eval_rating_ok(v_el -> 'rating')
                                       AND self_eval_text_ok(v_el -> 'example')) THEN
        RETURN false;
      END IF;
      IF p_section = 'potential' AND NOT (self_eval_potential_ok(v_el -> 'rating')
                                          AND self_eval_text_ok(v_el -> 'why')) THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;
  RETURN true;
END $$;

-- the person's form row, made with About you filled from the profile when it is missing
CREATE OR REPLACE FUNCTION public.self_eval_ensure(p_profile_id uuid, p_year integer)
RETURNS public.self_evaluations LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p profiles%ROWTYPE;
  v_mgr text;
  v_from date;
  v_row self_evaluations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM self_evaluations WHERE profile_id = p_profile_id AND year = p_year;
  IF FOUND THEN RETURN v_row; END IF;
  SELECT * INTO v_p FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT full_name INTO v_mgr FROM profiles WHERE id = v_p.manager_id;
  v_from := greatest(make_date(p_year, 1, 1), coalesce(v_p.joined_on, make_date(p_year, 1, 1)));
  INSERT INTO self_evaluations (org_id, profile_id, year, role_team, manager_name, review_period)
  VALUES (v_p.org_id, p_profile_id, p_year,
          concat_ws(', ', nullif(trim(v_p.title), ''), nullif(trim(v_p.department), '')),
          coalesce(v_mgr, ''),
          trim(to_char(v_from, 'FMDD FMMonth YYYY'))
            || CASE WHEN v_from > make_date(p_year, 1, 1) THEN ' (joining date)' ELSE '' END
            || ' – ' || trim(to_char(make_date(p_year, 12, 31), 'FMDD FMMonth YYYY')))
  ON CONFLICT (profile_id, year) DO NOTHING;
  SELECT * INTO v_row FROM self_evaluations WHERE profile_id = p_profile_id AND year = p_year;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.self_eval_ensure(uuid, integer) FROM PUBLIC, anon, authenticated;

-- ───────── 5. THE CYCLE: HR / ADMIN OPEN AND CLOSE THE YEAR ─────────
CREATE OR REPLACE FUNCTION public.self_eval_open_cycle(p_year integer, p_due date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := my_org();
  v_first boolean;
BEGIN
  IF my_role() NOT IN ('hr', 'admin') THEN RAISE EXCEPTION 'Only HR or admin can open the self-evaluation.'; END IF;
  IF p_year NOT BETWEEN 2020 AND 2100 THEN RAISE EXCEPTION 'Choose a year.'; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM self_eval_cycles WHERE org_id = v_org AND year = p_year
                                                     AND opened_at IS NOT NULL)
    INTO v_first;
  INSERT INTO self_eval_cycles (org_id, year, due_date, opened_at, opened_by)
  VALUES (v_org, p_year, p_due, now(), my_profile_id())
  ON CONFLICT (org_id, year) DO UPDATE
    SET due_date = EXCLUDED.due_date,
        opened_at = coalesce(self_eval_cycles.opened_at, now()),
        opened_by = coalesce(self_eval_cycles.opened_by, EXCLUDED.opened_by),
        closed_at = NULL, closed_by = NULL, updated_at = now();
  PERFORM self_eval_log_add(v_org, my_profile_id(), p_year, 'cycle', 'open',
                            jsonb_build_object('due_date', p_due));
  -- tell everyone active, the first time only
  IF v_first THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT v_org, t.id, format('Annual Self-Evaluation %s is open', p_year),
           CASE WHEN p_due IS NULL THEN 'Fill your self-evaluation form.'
                ELSE 'Fill your self-evaluation form by ' || trim(to_char(p_due, 'FMDD Mon YYYY')) || '.' END,
           '/self-evaluation?year=' || p_year
      FROM profiles t
     WHERE t.org_id = v_org AND t.status = 'active';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.self_eval_close_cycle(p_year integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := my_org();
BEGIN
  IF my_role() NOT IN ('hr', 'admin') THEN RAISE EXCEPTION 'Only HR or admin can close the self-evaluation.'; END IF;
  UPDATE self_eval_cycles SET closed_at = now(), closed_by = my_profile_id(), updated_at = now()
   WHERE org_id = v_org AND year = p_year AND closed_at IS NULL;
  PERFORM self_eval_log_add(v_org, my_profile_id(), p_year, 'cycle', 'close', '{}'::jsonb);
END $$;

-- ───────── 6. THE PERSON'S FORM ─────────
-- Saves one box (p_path) of one part (p_section), or the whole part (empty p_path) when an
-- uploaded form fills it. The person while the year is open and before they submit; HR /
-- admin on their behalf (e.g. a paper form) until it is submitted.
CREATE OR REPLACE FUNCTION public.self_eval_save(
  p_profile_id uuid, p_year integer, p_section text, p_path text[], p_value jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_self boolean := p_profile_id = my_profile_id();
  v_row self_evaluations%ROWTYPE;
  v_n integer := coalesce(array_length(p_path, 1), 0);
  v_idx integer;
  v_cur jsonb;
  v_keys text[];
BEGIN
  IF v_me IS NULL OR NOT can_view_self_eval(p_profile_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT v_self AND my_role() NOT IN ('hr', 'admin') THEN
    RAISE EXCEPTION 'Only the person (or HR) can fill the self-evaluation.';
  END IF;
  IF v_self AND NOT self_eval_cycle_open(my_org(), p_year) THEN
    RAISE EXCEPTION 'The self-evaluation for % is not open. HR opens it.', p_year;
  END IF;

  v_row := self_eval_ensure(p_profile_id, p_year);
  IF v_row.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'This self-evaluation is final.'; END IF;
  IF v_row.emp_submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'The self-evaluation has been submitted. Ask HR to reopen it to change it.';
  END IF;

  IF p_section = 'about' THEN
    IF v_n <> 1 OR p_path[1] NOT IN ('role_team', 'manager_name', 'review_period')
       OR jsonb_typeof(p_value) <> 'string' OR length(p_value #>> '{}') > 500 THEN
      RAISE EXCEPTION 'Unknown box.';
    END IF;
    EXECUTE format('UPDATE self_evaluations SET %I = $1 WHERE id = $2', p_path[1])
      USING p_value #>> '{}', v_row.id;

  ELSIF p_section = 'goals' THEN
    v_cur := v_row.goals;
    IF v_n = 0 THEN
      IF NOT self_eval_section_ok('goals', p_value) THEN
        RAISE EXCEPTION 'Part A takes up to 10 goals, each with goal, target, result, evidence and rating.';
      END IF;
      v_cur := p_value;
    ELSIF v_n = 2 THEN
      v_idx := p_path[1]::integer;
      IF v_idx NOT BETWEEN 0 AND 9 OR p_path[2] NOT IN ('goal', 'target', 'result', 'evidence', 'rating') THEN
        RAISE EXCEPTION 'Unknown box.';
      END IF;
      IF p_path[2] = 'rating' AND NOT self_eval_rating_ok(p_value) THEN RAISE EXCEPTION 'Unknown rating.'; END IF;
      IF p_path[2] <> 'rating' AND NOT self_eval_text_ok(p_value) THEN RAISE EXCEPTION 'That text is too long.'; END IF;
      WHILE jsonb_array_length(v_cur) <= v_idx LOOP
        v_cur := v_cur || jsonb_build_array('{}'::jsonb);
      END LOOP;
      v_cur := jsonb_set(v_cur, ARRAY[v_idx::text, p_path[2]], coalesce(p_value, '""'::jsonb), true);
    ELSE
      RAISE EXCEPTION 'Unknown box.';
    END IF;
    UPDATE self_evaluations SET goals = v_cur WHERE id = v_row.id;

  ELSIF p_section IN ('values', 'reflection', 'potential') THEN
    v_keys := CASE p_section
      WHEN 'values' THEN ARRAY['ownership', 'collaboration', 'problem_solving', 'growth_mindset',
                               'communication', 'optimism', 'courage', 'integrity', 'responsibility',
                               'leadership', 'efficiency', 'strategic_thinking']
      WHEN 'reflection' THEN ARRAY['proud', 'missed', 'challenge', 'feedback', 'development', 'support']
      ELSE ARRAY['learn', 'bigger_role', 'help_others', 'stretch'] END;
    v_cur := CASE p_section WHEN 'values' THEN v_row.value_answers
                            WHEN 'reflection' THEN v_row.reflection ELSE v_row.potential END;
    IF v_n = 0 THEN
      IF jsonb_typeof(p_value) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_value) k WHERE k <> ALL (v_keys)) THEN
        RAISE EXCEPTION 'Unknown box.';
      END IF;
      IF NOT self_eval_section_ok(p_section, p_value) THEN
        RAISE EXCEPTION 'That part of the form could not be saved: unknown boxes or ratings.';
      END IF;
      v_cur := p_value;
    ELSIF p_section = 'reflection' AND v_n = 1 AND p_path[1] = ANY (v_keys) THEN
      IF NOT self_eval_text_ok(p_value) THEN RAISE EXCEPTION 'That text is too long.'; END IF;
      v_cur := jsonb_set(v_cur, p_path, coalesce(p_value, '""'::jsonb), true);
    ELSIF p_section <> 'reflection' AND v_n = 2 AND p_path[1] = ANY (v_keys)
          AND p_path[2] IN ('example', 'rating', 'why') THEN
      IF p_section = 'values' AND p_path[2] = 'why' THEN RAISE EXCEPTION 'Unknown box.'; END IF;
      IF p_section = 'potential' AND p_path[2] = 'example' THEN RAISE EXCEPTION 'Unknown box.'; END IF;
      IF p_path[2] = 'rating' AND p_section = 'values' AND NOT self_eval_rating_ok(p_value) THEN
        RAISE EXCEPTION 'Unknown rating.';
      END IF;
      IF p_path[2] = 'rating' AND p_section = 'potential' AND NOT self_eval_potential_ok(p_value) THEN
        RAISE EXCEPTION 'Unknown rating.';
      END IF;
      IF p_path[2] <> 'rating' AND NOT self_eval_text_ok(p_value) THEN RAISE EXCEPTION 'That text is too long.'; END IF;
      v_cur := jsonb_set(v_cur, ARRAY[p_path[1]],
                         coalesce(v_cur -> p_path[1], '{}'::jsonb)
                           || jsonb_build_object(p_path[2], coalesce(p_value, '""'::jsonb)), true);
    ELSE
      RAISE EXCEPTION 'Unknown box.';
    END IF;
    IF p_section = 'values' THEN
      UPDATE self_evaluations SET value_answers = v_cur WHERE id = v_row.id;
    ELSIF p_section = 'reflection' THEN
      UPDATE self_evaluations SET reflection = v_cur WHERE id = v_row.id;
    ELSE
      UPDATE self_evaluations SET potential = v_cur WHERE id = v_row.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown part of the form.';
  END IF;

  UPDATE self_evaluations SET updated_at = now(), updated_by = v_me WHERE id = v_row.id;
  PERFORM self_eval_log_add(v_row.org_id, p_profile_id, p_year, 'form', 'save',
    jsonb_build_object('section', p_section, 'path', to_jsonb(p_path),
                       'value', CASE WHEN v_n = 0 THEN '"(whole part)"'::jsonb
                                     ELSE to_jsonb(left(coalesce(p_value #>> '{}', ''), 300)) END));
END $$;

-- Opens (makes) the person's own form for the year, so About you is filled from the profile.
CREATE OR REPLACE FUNCTION public.self_eval_start(p_year integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF my_profile_id() IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT self_eval_cycle_open(my_org(), p_year) THEN
    RAISE EXCEPTION 'The self-evaluation for % is not open. HR opens it.', p_year;
  END IF;
  PERFORM self_eval_ensure(my_profile_id(), p_year);
END $$;

-- ───────── 7. MANAGER / HR / ADMIN RATINGS, FEEDBACK AND NOTES ─────────
-- may write this kind: managers 'manager', HR 'hr', admin 'sir'; once the person has
-- submitted; the manager's own until the manager evaluation is submitted; never after final
CREATE OR REPLACE FUNCTION public.can_write_self_eval_review(p_profile_id uuid, p_year integer, p_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_self_eval_reviewer(p_profile_id)
     AND EXISTS (SELECT 1 FROM self_evaluations e
                  WHERE e.profile_id = p_profile_id AND e.year = p_year
                    AND e.emp_submitted_at IS NOT NULL AND e.finalized_at IS NULL
                    AND (p_kind <> 'manager' OR e.mgr_submitted_at IS NULL
                         OR my_role() IN ('hr', 'admin')))
     AND CASE p_kind
           WHEN 'manager' THEN manages(p_profile_id)
           WHEN 'hr' THEN my_role() = 'hr'
           WHEN 'sir' THEN my_role() = 'admin'
           ELSE false END
$$;
REVOKE ALL ON FUNCTION public.can_write_self_eval_review(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_self_eval_review(uuid, integer, text) TO authenticated, service_role;

-- p_path: {goals,<n>,rating|comment} · {values,<key>,rating|comment} · {overall_rating} · {feedback}
CREATE OR REPLACE FUNCTION public.self_eval_review_save(
  p_profile_id uuid, p_year integer, p_kind text, p_path text[], p_value jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_n integer := coalesce(array_length(p_path, 1), 0);
  v_r self_eval_reviews%ROWTYPE;
  v_cur jsonb;
BEGIN
  IF NOT can_write_self_eval_review(p_profile_id, p_year, p_kind) THEN
    RAISE EXCEPTION 'You cannot rate this self-evaluation now.';
  END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = p_profile_id;
  INSERT INTO self_eval_reviews (profile_id, year, kind, org_id)
  VALUES (p_profile_id, p_year, p_kind, v_org) ON CONFLICT DO NOTHING;
  SELECT * INTO v_r FROM self_eval_reviews
   WHERE profile_id = p_profile_id AND year = p_year AND kind = p_kind FOR UPDATE;

  IF v_n = 1 AND p_path[1] = 'overall_rating' THEN
    IF NOT self_eval_rating_ok(p_value) THEN RAISE EXCEPTION 'Unknown rating.'; END IF;
    UPDATE self_eval_reviews SET overall_rating = nullif(p_value #>> '{}', '')
     WHERE profile_id = p_profile_id AND year = p_year AND kind = p_kind;
  ELSIF v_n = 1 AND p_path[1] = 'feedback' THEN
    IF NOT self_eval_text_ok(p_value) THEN RAISE EXCEPTION 'That text is too long.'; END IF;
    UPDATE self_eval_reviews SET feedback = coalesce(p_value #>> '{}', '')
     WHERE profile_id = p_profile_id AND year = p_year AND kind = p_kind;
  ELSIF v_n = 3 AND p_path[1] IN ('goals', 'values') AND p_path[3] IN ('rating', 'comment') THEN
    IF p_path[1] = 'goals' AND (p_path[2] !~ '^[0-9]$') THEN RAISE EXCEPTION 'Unknown box.'; END IF;
    IF p_path[1] = 'values' AND p_path[2] NOT IN (
         'ownership', 'collaboration', 'problem_solving', 'growth_mindset', 'communication',
         'optimism', 'courage', 'integrity', 'responsibility', 'leadership', 'efficiency',
         'strategic_thinking') THEN
      RAISE EXCEPTION 'Unknown box.';
    END IF;
    IF p_path[3] = 'rating' AND NOT self_eval_rating_ok(p_value) THEN RAISE EXCEPTION 'Unknown rating.'; END IF;
    IF p_path[3] = 'comment' AND NOT self_eval_text_ok(p_value) THEN RAISE EXCEPTION 'That text is too long.'; END IF;
    v_cur := CASE p_path[1] WHEN 'goals' THEN v_r.goal_ratings ELSE v_r.value_ratings END;
    v_cur := jsonb_set(v_cur, ARRAY[p_path[2]],
                       coalesce(v_cur -> p_path[2], '{}'::jsonb)
                         || jsonb_build_object(p_path[3], coalesce(p_value, '""'::jsonb)), true);
    IF p_path[1] = 'goals' THEN
      UPDATE self_eval_reviews SET goal_ratings = v_cur
       WHERE profile_id = p_profile_id AND year = p_year AND kind = p_kind;
    ELSE
      UPDATE self_eval_reviews SET value_ratings = v_cur
       WHERE profile_id = p_profile_id AND year = p_year AND kind = p_kind;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown box.';
  END IF;

  UPDATE self_eval_reviews SET updated_at = now(), updated_by = my_profile_id()
   WHERE profile_id = p_profile_id AND year = p_year AND kind = p_kind;
  PERFORM self_eval_log_add(v_org, p_profile_id, p_year, 'review_' || p_kind, 'save',
    jsonb_build_object('path', to_jsonb(p_path),
                       'value', to_jsonb(left(coalesce(p_value #>> '{}', ''), 300))));
END $$;

CREATE OR REPLACE FUNCTION public.self_eval_note_save(
  p_profile_id uuid, p_year integer, p_kind text, p_note text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
BEGIN
  IF NOT can_write_self_eval_review(p_profile_id, p_year, p_kind) THEN
    RAISE EXCEPTION 'You cannot add a note to this self-evaluation now.';
  END IF;
  IF length(coalesce(p_note, '')) > 20000 THEN RAISE EXCEPTION 'That text is too long.'; END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = p_profile_id;
  INSERT INTO self_eval_notes (profile_id, year, kind, org_id, note, updated_by, updated_at)
  VALUES (p_profile_id, p_year, p_kind, v_org, coalesce(p_note, ''), my_profile_id(), now())
  ON CONFLICT (profile_id, year, kind) DO UPDATE
    SET note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM self_eval_log_add(v_org, p_profile_id, p_year, 'note_' || p_kind, 'save',
    jsonb_build_object('value', to_jsonb(left(coalesce(p_note, ''), 300))));
END $$;

-- ───────── 8. STEPS: SUBMIT, REOPEN, FINAL ─────────
CREATE OR REPLACE FUNCTION public.self_eval_submit(
  p_profile_id uuid, p_year integer, p_stage text, p_signed_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_p profiles%ROWTYPE;
  v_row self_evaluations%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM profiles WHERE id = p_profile_id AND org_id = my_org();
  IF NOT FOUND OR v_me IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO v_row FROM self_evaluations
   WHERE profile_id = p_profile_id AND year = p_year FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fill the form first.'; END IF;
  IF v_row.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'This self-evaluation is already final.'; END IF;

  IF p_stage = 'employee' THEN
    IF p_profile_id <> v_me THEN RAISE EXCEPTION 'Only the person can submit their self-evaluation.'; END IF;
    IF v_row.emp_submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Already submitted.'; END IF;
    IF NOT self_eval_cycle_open(v_p.org_id, p_year) THEN
      RAISE EXCEPTION 'The self-evaluation for % is closed.', p_year;
    END IF;
    IF length(trim(coalesce(p_signed_name, ''))) < 2 THEN
      RAISE EXCEPTION 'Type your name to sign off.';
    END IF;
    UPDATE self_evaluations
       SET emp_submitted_at = now(), signed_name = trim(p_signed_name), signed_at = now(),
           updated_at = now(), updated_by = v_me
     WHERE id = v_row.id;
    -- tell the manager (or HR / admin when there is no manager)
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT v_p.org_id, t.id, format('%s submitted their Annual Self-Evaluation %s', v_p.full_name, p_year),
           'Add your ratings and feedback.',
           '/self-evaluation?year=' || p_year || '&person=' || p_profile_id
      FROM profiles t
     WHERE t.org_id = v_p.org_id AND t.status = 'active' AND t.id <> p_profile_id
       AND (t.id = v_p.manager_id OR (v_p.manager_id IS NULL AND t.role IN ('hr', 'admin')));
  ELSIF p_stage = 'manager' THEN
    IF NOT is_self_eval_reviewer(p_profile_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
    IF v_row.emp_submitted_at IS NULL THEN RAISE EXCEPTION 'Waiting for the self-evaluation.'; END IF;
    IF v_row.mgr_submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Already submitted.'; END IF;
    IF manages(p_profile_id) AND my_role() NOT IN ('hr', 'admin') AND NOT EXISTS (
         SELECT 1 FROM self_eval_reviews r
          WHERE r.profile_id = p_profile_id AND r.year = p_year AND r.kind = 'manager'
            AND r.overall_rating IS NOT NULL) THEN
      RAISE EXCEPTION 'Choose your overall rating first.';
    END IF;
    UPDATE self_evaluations SET mgr_submitted_at = now(), mgr_submitted_by = v_me, updated_at = now()
     WHERE id = v_row.id;
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT v_p.org_id, t.id, format('%s''s self-evaluation is ready for HR and admin', v_p.full_name),
           'Add your ratings, feedback and the final rating.',
           '/self-evaluation?year=' || p_year || '&person=' || p_profile_id
      FROM profiles t
     WHERE t.org_id = v_p.org_id AND t.status = 'active' AND t.id <> p_profile_id
       AND t.role IN ('hr', 'admin');
  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;
  PERFORM self_eval_log_add(v_p.org_id, p_profile_id, p_year, 'step', 'submit_' || p_stage, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.self_eval_reopen(p_profile_id uuid, p_year integer, p_stage text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
BEGIN
  IF my_role() NOT IN ('hr', 'admin') OR p_profile_id = my_profile_id() THEN
    RAISE EXCEPTION 'Only HR or admin can reopen a step.';
  END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = p_profile_id AND org_id = my_org();
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF self_eval_final(p_profile_id, p_year) THEN RAISE EXCEPTION 'This self-evaluation is already final.'; END IF;
  IF p_stage = 'employee' THEN
    UPDATE self_evaluations SET emp_submitted_at = NULL, updated_at = now()
     WHERE profile_id = p_profile_id AND year = p_year;
  ELSIF p_stage = 'manager' THEN
    UPDATE self_evaluations SET mgr_submitted_at = NULL, updated_at = now()
     WHERE profile_id = p_profile_id AND year = p_year;
  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;
  PERFORM self_eval_log_add(v_org, p_profile_id, p_year, 'step', 'reopen_' || p_stage, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.self_eval_finalize(p_profile_id uuid, p_year integer, p_rating text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_row self_evaluations%ROWTYPE;
BEGIN
  IF my_role() NOT IN ('hr', 'admin') OR p_profile_id = my_profile_id() THEN
    RAISE EXCEPTION 'Only HR or admin can make the self-evaluation final.';
  END IF;
  IF p_rating NOT IN ('O', 'EE', 'FME', 'PME', 'DNME') THEN RAISE EXCEPTION 'Choose the final rating.'; END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = p_profile_id AND org_id = my_org();
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO v_row FROM self_evaluations WHERE profile_id = p_profile_id AND year = p_year FOR UPDATE;
  IF NOT FOUND OR v_row.emp_submitted_at IS NULL THEN RAISE EXCEPTION 'Waiting for the self-evaluation.'; END IF;
  IF v_row.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'This self-evaluation is already final.'; END IF;
  UPDATE self_evaluations SET finalized_at = now(), finalized_by = my_profile_id(),
         final_rating = p_rating, updated_at = now()
   WHERE id = v_row.id;
  INSERT INTO notifications (org_id, profile_id, title, body, link)
  VALUES (v_org, p_profile_id, format('Your Annual Self-Evaluation %s is final', p_year),
          'See the ratings and feedback from your manager, HR and admin.',
          '/self-evaluation?year=' || p_year);
  PERFORM self_eval_log_add(v_org, p_profile_id, p_year, 'step', 'finalize',
                            jsonb_build_object('final_rating', p_rating));
END $$;

-- ───────── 9. FILES ─────────
-- Files live in the private 'self-evaluation' bucket at <profile id>/<year>/<anything>.
CREATE OR REPLACE FUNCTION public.self_eval_file_add(
  p_profile_id uuid, p_year integer, p_kind text, p_goal_index integer,
  p_path text, p_name text, p_mime text, p_size bigint,
  p_original_size bigint DEFAULT NULL, p_encoding text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_id uuid;
BEGIN
  IF NOT can_view_self_eval(p_profile_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_profile_id <> my_profile_id() AND my_role() NOT IN ('hr', 'admin') THEN
    RAISE EXCEPTION 'Only the person (or HR) can upload files to the self-evaluation.';
  END IF;
  IF self_eval_final(p_profile_id, p_year) THEN RAISE EXCEPTION 'This self-evaluation is final.'; END IF;
  IF p_kind NOT IN ('evidence', 'form', 'other') THEN RAISE EXCEPTION 'Unknown kind of file.'; END IF;
  IF p_encoding IS NOT NULL AND p_encoding <> 'gzip' THEN RAISE EXCEPTION 'Unknown file encoding.'; END IF;
  IF coalesce(p_original_size, p_size, 0) > 20971520 THEN RAISE EXCEPTION 'That file is over 20MB.'; END IF;
  IF p_path IS NULL OR left(p_path, length(p_profile_id::text || '/' || p_year || '/'))
                       <> p_profile_id::text || '/' || p_year || '/' THEN
    RAISE EXCEPTION 'Wrong file location.';
  END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = p_profile_id;
  INSERT INTO self_eval_files (org_id, profile_id, year, kind, goal_index, path, file_name, mime,
                               size_bytes, original_size, encoding, uploaded_by)
  VALUES (v_org, p_profile_id, p_year, p_kind,
          CASE WHEN p_kind = 'evidence' THEN p_goal_index END,
          p_path, left(coalesce(nullif(trim(p_name), ''), 'file'), 200), left(coalesce(p_mime, ''), 120),
          coalesce(p_size, 0), coalesce(p_original_size, p_size, 0), p_encoding, my_profile_id())
  RETURNING id INTO v_id;
  PERFORM self_eval_log_add(v_org, p_profile_id, p_year, 'file', 'add',
    jsonb_build_object('kind', p_kind, 'goal_index', p_goal_index, 'name', p_name,
                       'size', p_size, 'original_size', p_original_size));
  RETURN v_id;
END $$;

-- hides a file from the form; the file itself is kept
CREATE OR REPLACE FUNCTION public.self_eval_file_remove(p_file_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_f self_eval_files%ROWTYPE;
BEGIN
  SELECT * INTO v_f FROM self_eval_files WHERE id = p_file_id AND org_id = my_org();
  IF NOT FOUND OR NOT can_view_self_eval(v_f.profile_id)
     OR (v_f.uploaded_by IS DISTINCT FROM my_profile_id() AND my_role() NOT IN ('hr', 'admin')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF self_eval_final(v_f.profile_id, v_f.year) THEN RAISE EXCEPTION 'This self-evaluation is final.'; END IF;
  UPDATE self_eval_files SET removed_at = now(), removed_by = my_profile_id()
   WHERE id = p_file_id AND removed_at IS NULL;
  PERFORM self_eval_log_add(v_f.org_id, v_f.profile_id, v_f.year, 'file', 'remove',
    jsonb_build_object('name', v_f.file_name));
END $$;

-- storage: may this signed-in user read / upload at this path?
CREATE OR REPLACE FUNCTION public.self_eval_storage_ok(p_name text, p_write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parts text[] := string_to_array(coalesce(p_name, ''), '/');
  v_id uuid;
BEGIN
  IF array_length(v_parts, 1) < 3
     OR v_parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR v_parts[2] !~ '^[0-9]{4}$' THEN
    RETURN false;
  END IF;
  v_id := v_parts[1]::uuid;
  IF NOT can_view_self_eval(v_id) THEN RETURN false; END IF;
  IF p_write THEN
    RETURN (v_id = my_profile_id() OR my_role() IN ('hr', 'admin'))
       AND NOT self_eval_final(v_id, v_parts[2]::integer);
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.self_eval_storage_ok(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_eval_storage_ok(text, boolean) TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- 20MB as uploaded; files are made smaller in the browser before they are stored
VALUES ('self-evaluation', 'self-evaluation', false, 20971520,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel', 'text/csv', 'text/plain', 'application/gzip'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "self evaluation files read" ON storage.objects;
CREATE POLICY "self evaluation files read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'self-evaluation' AND public.self_eval_storage_ok(name, false));
DROP POLICY IF EXISTS "self evaluation files upload" ON storage.objects;
CREATE POLICY "self evaluation files upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'self-evaluation' AND public.self_eval_storage_ok(name, true));
-- no UPDATE or DELETE policy: an uploaded file can never be overwritten or deleted

-- ───────── 10. GRANTS ─────────
REVOKE ALL ON FUNCTION public.self_eval_open_cycle(integer, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_eval_close_cycle(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_eval_save(uuid, integer, text, text[], jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_eval_start(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_eval_review_save(uuid, integer, text, text[], jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_eval_note_save(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_eval_submit(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_eval_reopen(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_eval_finalize(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_eval_file_add(uuid, integer, text, integer, text, text, text, bigint, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_eval_file_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_eval_open_cycle(integer, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_close_cycle(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_save(uuid, integer, text, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_start(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_review_save(uuid, integer, text, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_note_save(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_submit(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_reopen(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_finalize(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_file_add(uuid, integer, text, integer, text, text, text, bigint, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_file_remove(uuid) TO authenticated;
