-- ═══ ANNUAL SELF-EVALUATION: DEVELOPER POWERS ═══
-- The developer (auth-email allowlist, checked in the server functions — never a profile role)
-- may open / close the year's cycle, fill or correct anyone's form until it is final (also
-- after it was submitted), upload files to anyone's form and hide files from it.
-- Every function here is for the service role only: the server calls it after checking the
-- developer allowlist and writing dev_audit_log. Each change is also kept in self_eval_log
-- under the developer's own profile. Nothing is deleted; the ratings stay with the manager,
-- HR and admin. Only adds functions; no table, policy or existing function is changed.

-- history row with a given actor (the service role has no signed-in profile)
CREATE OR REPLACE FUNCTION public.self_eval_log_as(
  p_actor uuid, p_org uuid, p_profile uuid, p_year integer, p_entity text, p_action text, p_changes jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO self_eval_log (org_id, profile_id, year, actor, entity, action, changes)
  VALUES (p_org, p_profile, p_year, p_actor, p_entity, p_action, coalesce(p_changes, '{}'::jsonb))
$$;

CREATE OR REPLACE FUNCTION public.self_eval_dev_open_cycle(
  p_actor uuid, p_org uuid, p_year integer, p_due date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first boolean;
BEGIN
  IF p_org IS NULL OR p_year NOT BETWEEN 2020 AND 2100 THEN RAISE EXCEPTION 'Choose a year.'; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM self_eval_cycles WHERE org_id = p_org AND year = p_year
                                                     AND opened_at IS NOT NULL)
    INTO v_first;
  INSERT INTO self_eval_cycles (org_id, year, due_date, opened_at, opened_by)
  VALUES (p_org, p_year, p_due, now(), p_actor)
  ON CONFLICT (org_id, year) DO UPDATE
    SET due_date = EXCLUDED.due_date,
        opened_at = coalesce(self_eval_cycles.opened_at, now()),
        opened_by = coalesce(self_eval_cycles.opened_by, EXCLUDED.opened_by),
        closed_at = NULL, closed_by = NULL, updated_at = now();
  PERFORM self_eval_log_as(p_actor, p_org, coalesce(p_actor, '00000000-0000-0000-0000-000000000000'),
                           p_year, 'cycle', 'dev_open', jsonb_build_object('due_date', p_due));
  IF v_first THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT p_org, t.id, format('Annual Self-Evaluation %s is open', p_year),
           CASE WHEN p_due IS NULL THEN 'Fill your self-evaluation form.'
                ELSE 'Fill your self-evaluation form by ' || trim(to_char(p_due, 'FMDD Mon YYYY')) || '.' END,
           '/self-evaluation?year=' || p_year
      FROM profiles t
     WHERE t.org_id = p_org AND t.status = 'active';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.self_eval_dev_close_cycle(p_actor uuid, p_org uuid, p_year integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE self_eval_cycles SET closed_at = now(), closed_by = p_actor, updated_at = now()
   WHERE org_id = p_org AND year = p_year AND closed_at IS NULL;
  PERFORM self_eval_log_as(p_actor, p_org, coalesce(p_actor, '00000000-0000-0000-0000-000000000000'),
                           p_year, 'cycle', 'dev_close', '{}'::jsonb);
END $$;

-- the same boxes and checks as self_eval_save(), for anyone's form, until it is final
CREATE OR REPLACE FUNCTION public.self_eval_dev_save(
  p_actor uuid, p_profile_id uuid, p_year integer, p_section text, p_path text[], p_value jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := p_actor;
  v_row self_evaluations%ROWTYPE;
  v_n integer := coalesce(array_length(p_path, 1), 0);
  v_idx integer;
  v_cur jsonb;
  v_keys text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_profile_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  v_row := self_eval_ensure(p_profile_id, p_year);
  -- a developer may correct the form after it was submitted, never after it is final
  IF v_row.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'This self-evaluation is final.'; END IF;

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
  PERFORM self_eval_log_as(p_actor, v_row.org_id, p_profile_id, p_year, 'form', 'dev_save',
    jsonb_build_object('section', p_section, 'path', to_jsonb(p_path),
                       'value', CASE WHEN v_n = 0 THEN '"(whole part)"'::jsonb
                                     ELSE to_jsonb(left(coalesce(p_value #>> '{}', ''), 300)) END));
END $$;

CREATE OR REPLACE FUNCTION public.self_eval_dev_file_add(
  p_actor uuid, p_profile_id uuid, p_year integer, p_kind text, p_goal_index integer,
  p_path text, p_name text, p_mime text, p_size bigint,
  p_original_size bigint DEFAULT NULL, p_encoding text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_id uuid;
BEGIN
  SELECT org_id INTO v_org FROM profiles WHERE id = p_profile_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF self_eval_final(p_profile_id, p_year) THEN RAISE EXCEPTION 'This self-evaluation is final.'; END IF;
  IF p_kind NOT IN ('evidence', 'form', 'other') THEN RAISE EXCEPTION 'Unknown kind of file.'; END IF;
  IF p_encoding IS NOT NULL AND p_encoding <> 'gzip' THEN RAISE EXCEPTION 'Unknown file encoding.'; END IF;
  IF coalesce(p_original_size, p_size, 0) > 20971520 THEN RAISE EXCEPTION 'That file is over 20MB.'; END IF;
  IF p_path IS NULL OR left(p_path, length(p_profile_id::text || '/' || p_year || '/'))
                       <> p_profile_id::text || '/' || p_year || '/' THEN
    RAISE EXCEPTION 'Wrong file location.';
  END IF;
  INSERT INTO self_eval_files (org_id, profile_id, year, kind, goal_index, path, file_name, mime,
                               size_bytes, original_size, encoding, uploaded_by)
  VALUES (v_org, p_profile_id, p_year, p_kind,
          CASE WHEN p_kind = 'evidence' THEN p_goal_index END,
          p_path, left(coalesce(nullif(trim(p_name), ''), 'file'), 200), left(coalesce(p_mime, ''), 120),
          coalesce(p_size, 0), coalesce(p_original_size, p_size, 0), p_encoding, p_actor)
  RETURNING id INTO v_id;
  PERFORM self_eval_log_as(p_actor, v_org, p_profile_id, p_year, 'file', 'dev_add',
    jsonb_build_object('kind', p_kind, 'goal_index', p_goal_index, 'name', p_name,
                       'size', p_size, 'original_size', p_original_size));
  RETURN v_id;
END $$;

-- hides any file from the form (the file itself is kept), until the form is final
CREATE OR REPLACE FUNCTION public.self_eval_dev_file_remove(p_actor uuid, p_file_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_f self_eval_files%ROWTYPE;
BEGIN
  SELECT * INTO v_f FROM self_eval_files WHERE id = p_file_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF self_eval_final(v_f.profile_id, v_f.year) THEN RAISE EXCEPTION 'This self-evaluation is final.'; END IF;
  UPDATE self_eval_files SET removed_at = now(), removed_by = p_actor
   WHERE id = p_file_id AND removed_at IS NULL;
  PERFORM self_eval_log_as(p_actor, v_f.org_id, v_f.profile_id, v_f.year, 'file', 'dev_remove',
    jsonb_build_object('name', v_f.file_name));
END $$;

-- service role only: the server checks the developer allowlist first
REVOKE ALL ON FUNCTION public.self_eval_log_as(uuid, uuid, uuid, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_eval_dev_open_cycle(uuid, uuid, integer, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_eval_dev_close_cycle(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_eval_dev_save(uuid, uuid, integer, text, text[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_eval_dev_file_add(uuid, uuid, integer, text, integer, text, text, text, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_eval_dev_file_remove(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_eval_log_as(uuid, uuid, uuid, integer, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.self_eval_dev_open_cycle(uuid, uuid, integer, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.self_eval_dev_close_cycle(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.self_eval_dev_save(uuid, uuid, integer, text, text[], jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.self_eval_dev_file_add(uuid, uuid, integer, text, integer, text, text, text, bigint, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.self_eval_dev_file_remove(uuid, uuid) TO service_role;
