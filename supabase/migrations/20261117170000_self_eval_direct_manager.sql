-- ═══ ANNUAL SELF-EVALUATION: ONLY THE DIRECT MANAGER ═══
-- Who sees and rates a self-evaluation is now:
--   * the person themselves (their own form only, their own uploads only);
--   * the manager they report to directly (manager_id) — not the managers above them;
--   * HR and admin (everyone); developers keep their gated server route.
-- The "manager" rating is written only by the direct manager.
-- Replaces three self-evaluation functions; every policy and the file storage rules call
-- them, so they follow. No table, row or other feature (Probation included) is changed.

-- the signed-in person is the one this person reports to directly
CREATE OR REPLACE FUNCTION public.is_direct_manager_of(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_profile_id() IS NOT NULL
     AND p_profile_id IS DISTINCT FROM my_profile_id()
     AND EXISTS (SELECT 1 FROM profiles p
                  WHERE p.id = p_profile_id AND p.manager_id = my_profile_id())
$$;
REVOKE ALL ON FUNCTION public.is_direct_manager_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_direct_manager_of(uuid) TO authenticated, service_role;

-- may open the form: the person, their direct manager, HR / admin (same organisation)
CREATE OR REPLACE FUNCTION public.can_view_self_eval(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_profile_id() IS NOT NULL
     AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_profile_id AND p.org_id = my_org())
     AND (p_profile_id = my_profile_id() OR my_role() IN ('hr', 'admin')
          OR is_direct_manager_of(p_profile_id))
$$;

-- may write this kind: the direct manager 'manager', HR 'hr', admin 'sir'; once the person
-- has submitted; the manager's own until the manager rating is submitted; never after final
CREATE OR REPLACE FUNCTION public.can_write_self_eval_review(p_profile_id uuid, p_year integer, p_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_self_eval_reviewer(p_profile_id)
     AND EXISTS (SELECT 1 FROM self_evaluations e
                  WHERE e.profile_id = p_profile_id AND e.year = p_year
                    AND e.emp_submitted_at IS NOT NULL AND e.finalized_at IS NULL
                    AND (p_kind <> 'manager' OR e.mgr_submitted_at IS NULL
                         OR my_role() IN ('hr', 'admin')))
     AND CASE p_kind
           WHEN 'manager' THEN is_direct_manager_of(p_profile_id)
           WHEN 'hr' THEN my_role() = 'hr'
           WHEN 'sir' THEN my_role() = 'admin'
           ELSE false END
$$;

-- the same steps as before; the manager who must choose an overall rating is the direct one
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
    IF is_direct_manager_of(p_profile_id) AND my_role() NOT IN ('hr', 'admin') AND NOT EXISTS (
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
