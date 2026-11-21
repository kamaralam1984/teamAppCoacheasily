-- Self-Evaluation Part B: "What it looks like in practice" becomes a box the person can type in.
-- value_answers.<value>.practice is now allowed (text, same limit as the example). When it is
-- empty the page and the PDF show the company's standard line for that value.
-- Only the three save/check functions are replaced (CREATE OR REPLACE keeps their grants);
-- no table, column or row is changed or removed.

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
                  WHERE f NOT IN (CASE p_section WHEN 'values' THEN 'example' ELSE 'why' END, 'rating',
                                  CASE p_section WHEN 'values' THEN 'practice' ELSE 'rating' END)) THEN
        RETURN false;
      END IF;
      IF p_section = 'values' AND NOT (self_eval_rating_ok(v_el -> 'rating')
                                       AND self_eval_text_ok(v_el -> 'example')
                                       AND self_eval_text_ok(v_el -> 'practice')) THEN
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
          AND p_path[2] IN ('example', 'practice', 'rating', 'why') THEN
      IF p_section = 'values' AND p_path[2] = 'why' THEN RAISE EXCEPTION 'Unknown box.'; END IF;
      IF p_section = 'potential' AND p_path[2] IN ('example', 'practice') THEN RAISE EXCEPTION 'Unknown box.'; END IF;
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
          AND p_path[2] IN ('example', 'practice', 'rating', 'why') THEN
      IF p_section = 'values' AND p_path[2] = 'why' THEN RAISE EXCEPTION 'Unknown box.'; END IF;
      IF p_section = 'potential' AND p_path[2] IN ('example', 'practice') THEN RAISE EXCEPTION 'Unknown box.'; END IF;
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
