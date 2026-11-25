-- ═══ ANNUAL SELF-EVALUATION: HR AND ADMIN DO NOT FILL ONE ═══
-- People whose role is hr or admin have no self-evaluation of their own: nobody (themselves,
-- another HR / admin, a developer) can start, fill, submit or upload files to a form that
-- belongs to them, and opening the year does not ask them to fill one.
-- HR and admin still open / close the year, see everyone, fill and upload for other people,
-- reopen steps, and write the manager evaluation of the people who report to them.
-- Nothing already saved is changed or removed; if the role changes back, the form opens again.

CREATE OR REPLACE FUNCTION public.self_eval_exempt(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_profile_id AND p.role IN ('hr', 'admin'))
$$;
REVOKE ALL ON FUNCTION public.self_eval_exempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_eval_exempt(uuid) TO authenticated, service_role;

-- on the tables, so every way of writing a form (also the developer functions) is covered
CREATE OR REPLACE FUNCTION public.self_eval_exempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF self_eval_exempt(NEW.profile_id) THEN
    RAISE EXCEPTION 'HR and admin do not fill a self-evaluation.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.self_eval_exempt_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS self_eval_exempt_insert ON public.self_evaluations;
CREATE TRIGGER self_eval_exempt_insert BEFORE INSERT ON public.self_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.self_eval_exempt_guard();
-- the person's answers and their submit; reopening a step (clears the submit) stays possible
DROP TRIGGER IF EXISTS self_eval_exempt_update ON public.self_evaluations;
CREATE TRIGGER self_eval_exempt_update BEFORE UPDATE ON public.self_evaluations
  FOR EACH ROW WHEN (
    (NEW.role_team, NEW.manager_name, NEW.review_period, NEW.goals, NEW.value_answers,
     NEW.reflection, NEW.potential)
      IS DISTINCT FROM
    (OLD.role_team, OLD.manager_name, OLD.review_period, OLD.goals, OLD.value_answers,
     OLD.reflection, OLD.potential)
    OR (NEW.emp_submitted_at IS NOT NULL AND NEW.emp_submitted_at IS DISTINCT FROM OLD.emp_submitted_at))
  EXECUTE FUNCTION public.self_eval_exempt_guard();
DROP TRIGGER IF EXISTS self_eval_exempt_file ON public.self_eval_files;
CREATE TRIGGER self_eval_exempt_file BEFORE INSERT ON public.self_eval_files
  FOR EACH ROW EXECUTE FUNCTION public.self_eval_exempt_guard();

-- the three functions below are as before, plus the exemption (CREATE OR REPLACE keeps grants)
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
     WHERE t.org_id = v_org AND t.status = 'active'
       AND t.role NOT IN ('hr', 'admin');
  END IF;
END $$;

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
     WHERE t.org_id = p_org AND t.status = 'active'
       AND t.role NOT IN ('hr', 'admin');
  END IF;
END $$;

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
       AND NOT self_eval_exempt(v_id)
       AND NOT self_eval_final(v_id, v_parts[2]::integer);
  END IF;
  RETURN true;
END $$;
