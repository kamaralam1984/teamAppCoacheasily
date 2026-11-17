-- ═══ ANNUAL SELF-EVALUATION: THE MANAGER EVALUATION FORM ═══
-- The manager's side now follows the "Annual Manager Evaluation Form" exactly:
--   About this review (review discussion date), Part A goals (rating + remarks) and summary,
--   Part B values (rating + remarks) and summary, Part C overall (A, B and the final rating),
--   Part D readiness of talent, Part E six feedback questions, Recommendation, the team
--   member's comments after the discussion, and the manager's sign-off.
-- Only the manager the person reports to rates (HR / admin only when the person has no
-- manager). HR and admin no longer rate; they see everything and can reopen a step.
-- The manager's sign-off completes the evaluation (final rating = the manager's Part C rating).
-- Adds two columns (extra, member_comment) and replaces self-evaluation functions only.
-- Nothing is deleted; no other feature (Probation included) is changed.

ALTER TABLE public.self_eval_reviews ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.self_evaluations ADD COLUMN IF NOT EXISTS member_comment text;
ALTER TABLE public.self_evaluations ADD COLUMN IF NOT EXISTS member_comment_at timestamptz;

-- writes the manager evaluation: the direct manager; HR / admin only for someone with no manager
CREATE OR REPLACE FUNCTION public.self_eval_is_rater(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_direct_manager_of(p_profile_id)
      OR (my_role() IN ('hr', 'admin') AND p_profile_id IS DISTINCT FROM my_profile_id()
          AND EXISTS (SELECT 1 FROM profiles p
                       WHERE p.id = p_profile_id AND p.org_id = my_org() AND p.manager_id IS NULL))
$$;
REVOKE ALL ON FUNCTION public.self_eval_is_rater(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_eval_is_rater(uuid) TO authenticated, service_role;

-- only the manager evaluation is written now, from the person's submit until it is complete
CREATE OR REPLACE FUNCTION public.can_write_self_eval_review(p_profile_id uuid, p_year integer, p_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_kind = 'manager'
     AND self_eval_is_rater(p_profile_id)
     AND EXISTS (SELECT 1 FROM self_evaluations e
                  WHERE e.profile_id = p_profile_id AND e.year = p_year
                    AND e.emp_submitted_at IS NOT NULL AND e.finalized_at IS NULL)
$$;

-- sets doc #> path = value, making the objects on the way
CREATE OR REPLACE FUNCTION public.self_eval_jsonb_put(p_doc jsonb, p_path text[], p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_doc jsonb := coalesce(p_doc, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(v_doc) <> 'object' THEN v_doc := '{}'::jsonb; END IF;
  IF array_length(p_path, 1) = 1 THEN
    RETURN v_doc || jsonb_build_object(p_path[1], p_value);
  END IF;
  RETURN v_doc || jsonb_build_object(p_path[1],
    self_eval_jsonb_put(v_doc -> p_path[1], p_path[2:], p_value));
END $$;

-- one box of the manager evaluation form (beyond the per-goal / per-value ratings and remarks,
-- which stay in self_eval_review_save)
CREATE OR REPLACE FUNCTION public.self_eval_manager_save(
  p_profile_id uuid, p_year integer, p_path text[], p_value jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_n integer := coalesce(array_length(p_path, 1), 0);
  v_ok boolean := false;
  v_text text := p_value #>> '{}';
BEGIN
  IF NOT can_write_self_eval_review(p_profile_id, p_year, 'manager') THEN
    RAISE EXCEPTION 'You cannot write this manager evaluation now.';
  END IF;
  IF p_value IS NOT NULL AND jsonb_typeof(p_value) NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'Unknown box.';
  END IF;
  IF length(coalesce(v_text, '')) > 20000 THEN RAISE EXCEPTION 'That text is too long.'; END IF;

  IF v_n = 1 AND p_path[1] = 'discussion_date' THEN
    v_ok := coalesce(v_text, '') = '' OR v_text ~ '^\d{4}-\d{2}-\d{2}$';
  ELSIF v_n = 2 AND p_path[1] IN ('goals_summary', 'values_summary') THEN
    v_ok := p_path[2] = 'remarks' OR (p_path[2] = 'rating' AND self_eval_rating_ok(p_value));
  ELSIF v_n = 3 AND p_path[1] = 'overall' AND p_path[2] IN ('goals', 'values') THEN
    v_ok := p_path[3] = 'remarks' OR (p_path[3] = 'rating' AND self_eval_rating_ok(p_value));
  ELSIF v_n = 3 AND p_path[1] = 'potential'
        AND p_path[2] IN ('learn', 'bigger_role', 'help_others', 'stretch') THEN
    v_ok := p_path[3] = 'remarks' OR (p_path[3] = 'rating' AND self_eval_potential_ok(p_value));
  ELSIF v_n = 2 AND p_path[1] = 'feedback' THEN
    v_ok := p_path[2] IN ('strengths', 'development', 'accuracy', 'support', 'goals_next', 'training');
  ELSIF v_n = 2 AND p_path[1] = 'recommendation' AND p_path[2] = 'choice' THEN
    v_ok := coalesce(v_text, '') IN ('', 'promotion', 'scope', 'continue', 'pip');
  ELSIF v_n = 3 AND p_path[1] = 'recommendation' AND p_path[2] = 'comments' THEN
    v_ok := p_path[3] IN ('promotion', 'scope', 'continue', 'pip');
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'Unknown box.'; END IF;

  SELECT org_id INTO v_org FROM profiles WHERE id = p_profile_id;
  INSERT INTO self_eval_reviews (profile_id, year, kind, org_id)
  VALUES (p_profile_id, p_year, 'manager', v_org) ON CONFLICT DO NOTHING;
  UPDATE self_eval_reviews
     SET extra = self_eval_jsonb_put(extra, p_path, coalesce(p_value, '""'::jsonb)),
         updated_at = now(), updated_by = my_profile_id()
   WHERE profile_id = p_profile_id AND year = p_year AND kind = 'manager';
  PERFORM self_eval_log_add(v_org, p_profile_id, p_year, 'review_manager', 'save',
    jsonb_build_object('path', to_jsonb(p_path), 'value', to_jsonb(left(coalesce(v_text, ''), 300))));
END $$;
REVOKE ALL ON FUNCTION public.self_eval_manager_save(uuid, integer, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_eval_manager_save(uuid, integer, text[], jsonb) TO authenticated;

-- the team member's comments on the evaluation, after the review discussion (optional)
CREATE OR REPLACE FUNCTION public.self_eval_member_comment(p_year integer, p_comment text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row self_evaluations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM self_evaluations WHERE profile_id = my_profile_id() AND year = p_year;
  IF NOT FOUND OR v_row.finalized_at IS NULL THEN
    RAISE EXCEPTION 'You can comment once your manager has completed the evaluation.';
  END IF;
  IF length(coalesce(p_comment, '')) > 20000 THEN RAISE EXCEPTION 'That text is too long.'; END IF;
  UPDATE self_evaluations SET member_comment = p_comment, member_comment_at = now(), updated_at = now()
   WHERE id = v_row.id;
  PERFORM self_eval_log_add(v_row.org_id, v_row.profile_id, p_year, 'form', 'member_comment',
    jsonb_build_object('value', to_jsonb(left(coalesce(p_comment, ''), 300))));
END $$;
REVOKE ALL ON FUNCTION public.self_eval_member_comment(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_eval_member_comment(integer, text) TO authenticated;

-- HR / admin reopen a step, also after it is complete: the person's own form (everything after
-- it opens again too) or only the manager evaluation
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
  IF p_stage = 'employee' THEN
    UPDATE self_evaluations
       SET emp_submitted_at = NULL, mgr_submitted_at = NULL, finalized_at = NULL,
           final_rating = NULL, updated_at = now()
     WHERE profile_id = p_profile_id AND year = p_year;
  ELSIF p_stage = 'manager' THEN
    UPDATE self_evaluations
       SET mgr_submitted_at = NULL, finalized_at = NULL, final_rating = NULL, updated_at = now()
     WHERE profile_id = p_profile_id AND year = p_year;
  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;
  PERFORM self_eval_log_add(v_org, p_profile_id, p_year, 'step', 'reopen_' || p_stage, '{}'::jsonb);
END $$;

-- the person submits as before; the manager's sign-off completes the evaluation
CREATE OR REPLACE FUNCTION public.self_eval_submit(
  p_profile_id uuid, p_year integer, p_stage text, p_signed_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_p profiles%ROWTYPE;
  v_row self_evaluations%ROWTYPE;
  v_r self_eval_reviews%ROWTYPE;
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
           'Add your manager evaluation.',
           '/self-evaluation?year=' || p_year || '&person=' || p_profile_id
      FROM profiles t
     WHERE t.org_id = v_p.org_id AND t.status = 'active' AND t.id <> p_profile_id
       AND (t.id = v_p.manager_id OR (v_p.manager_id IS NULL AND t.role IN ('hr', 'admin')));
  ELSIF p_stage = 'manager' THEN
    -- the manager evaluation: signed off by the person's direct manager; that completes it
    IF NOT self_eval_is_rater(p_profile_id) THEN
      RAISE EXCEPTION 'Only the manager this person reports to can sign off their evaluation.';
    END IF;
    IF v_row.emp_submitted_at IS NULL THEN RAISE EXCEPTION 'Waiting for the self-evaluation.'; END IF;
    SELECT * INTO v_r FROM self_eval_reviews
     WHERE profile_id = p_profile_id AND year = p_year AND kind = 'manager';
    IF v_r.overall_rating IS NULL THEN RAISE EXCEPTION 'Choose the final rating in Part C first.'; END IF;
    IF length(trim(coalesce(p_signed_name, ''))) < 2 THEN
      RAISE EXCEPTION 'Type your name to sign off.';
    END IF;
    UPDATE self_eval_reviews
       SET extra = extra || jsonb_build_object('signed_name', trim(p_signed_name),
                                               'signed_at', to_jsonb(now())),
           updated_at = now(), updated_by = v_me
     WHERE profile_id = p_profile_id AND year = p_year AND kind = 'manager';
    UPDATE self_evaluations
       SET mgr_submitted_at = now(), mgr_submitted_by = v_me,
           finalized_at = now(), finalized_by = v_me, final_rating = v_r.overall_rating,
           updated_at = now()
     WHERE id = v_row.id;
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (v_p.org_id, p_profile_id, format('Your annual evaluation %s is complete', p_year),
            'See your manager''s ratings and feedback, and add your comments.',
            '/self-evaluation?year=' || p_year);
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT v_p.org_id, t.id, format('%s''s annual evaluation %s is complete', v_p.full_name, p_year),
           'The manager has signed off.', '/self-evaluation?year=' || p_year || '&person=' || p_profile_id
      FROM profiles t
     WHERE t.org_id = v_p.org_id AND t.status = 'active' AND t.id NOT IN (p_profile_id, v_me)
       AND t.role IN ('hr', 'admin');
  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;
  PERFORM self_eval_log_add(v_p.org_id, p_profile_id, p_year, 'step', 'submit_' || p_stage, '{}'::jsonb);
END $$;
