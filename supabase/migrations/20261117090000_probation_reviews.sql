-- ═══ PROBATION REVIEW: KRA SHEET + MANAGER / HR / SIR FEEDBACK AT 90 DAYS ═══
-- The KRA sheet HR used to keep in Excel, inside the app, one per person on probation:
--   * KRAs (goal + measure) are added by the person's managers or HR / admin.
--   * The person fills their own achievement %, self evaluation and remark.
--   * Managers fill the manager achievement %, evaluation and a reply remark.
--   * Manager, HR and Sir (admin) each write an overall feedback (the person sees it once the
--     review is final) and an internal note (never shown to the person).
--   * HR or Sir make the final decision, which goes through the existing probation_decide().
-- Reading: the person, their managers (whole chain) and HR / admin. Developers read through a
-- gated server function. Nothing can be deleted: KRAs are hidden with removed_at instead, and
-- every change is kept in probation_review_log.
-- Only adds functions and tables; no existing table, column or row is changed or deleted.

-- ───────── 1. WHO ─────────
-- may open the review: the person, anyone above them, HR / admin
CREATE OR REPLACE FUNCTION public.can_view_probation_review(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_role() IN ('hr', 'admin') OR manages(p_profile_id)
$$;
-- reviews it: anyone above the person, HR / admin; never the person themselves
CREATE OR REPLACE FUNCTION public.is_probation_reviewer(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_profile_id IS DISTINCT FROM my_profile_id()
     AND (my_role() IN ('hr', 'admin') OR manages(p_profile_id))
$$;
REVOKE ALL ON FUNCTION public.can_view_probation_review(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_probation_reviewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_probation_review(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_probation_reviewer(uuid) TO authenticated, service_role;

-- ───────── 2. TABLES ─────────
CREATE TABLE IF NOT EXISTS public.probation_reviews (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  emp_submitted_at timestamptz,
  mgr_submitted_at timestamptz,
  mgr_submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  mgr_recommendation text CHECK (mgr_recommendation IN ('confirm', 'extend', 'review')),
  finalized_at timestamptz,
  finalized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  final_decision text CHECK (final_decision IN ('confirm', 'extend', 'review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.probation_kras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  measure text NOT NULL DEFAULT '',
  emp_achievement text,
  emp_evaluation text,
  mgr_achievement text,
  mgr_evaluation text,
  emp_remark text,
  mgr_remark text,
  removed_at timestamptz,          -- hidden, never deleted
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS probation_kras_profile_idx ON public.probation_kras (profile_id, position);

-- overall feedback: shown to the person once the review is final
CREATE TABLE IF NOT EXISTS public.probation_feedback (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('manager', 'hr', 'sir')),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  feedback text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, kind)
);

-- internal notes: never shown to the person
CREATE TABLE IF NOT EXISTS public.probation_internal_notes (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('manager', 'hr', 'sir')),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, kind)
);

-- every change, for HR / admin (and developers)
CREATE TABLE IF NOT EXISTS public.probation_review_log (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  actor uuid,
  entity text NOT NULL,
  entity_key text,
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS probation_review_log_profile_idx
  ON public.probation_review_log (profile_id, created_at DESC);

ALTER TABLE public.probation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probation_kras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probation_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probation_review_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.probation_reviews, public.probation_review_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.probation_kras, public.probation_feedback,
  public.probation_internal_notes TO authenticated;
GRANT ALL ON public.probation_reviews, public.probation_kras, public.probation_feedback,
  public.probation_internal_notes, public.probation_review_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.probation_review_log_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.probation_review_final(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM probation_reviews r
                  WHERE r.profile_id = p_profile_id AND r.finalized_at IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION public.probation_review_final(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.probation_review_final(uuid) TO authenticated, service_role;

-- may write this kind of feedback / note: managers 'manager', HR 'hr', admin 'sir'; not after final
CREATE OR REPLACE FUNCTION public.can_write_probation_feedback(p_profile_id uuid, p_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_profile_id IS DISTINCT FROM my_profile_id()
     AND NOT probation_review_final(p_profile_id)
     AND CASE p_kind
           WHEN 'manager' THEN manages(p_profile_id)
           WHEN 'hr' THEN my_role() = 'hr'
           WHEN 'sir' THEN my_role() = 'admin'
           ELSE false END
$$;
REVOKE ALL ON FUNCTION public.can_write_probation_feedback(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_probation_feedback(uuid, text) TO authenticated, service_role;

-- ───────── 3. POLICIES (no DELETE policy anywhere: nothing can be deleted) ─────────
DROP POLICY IF EXISTS probation_reviews_read ON public.probation_reviews;
CREATE POLICY probation_reviews_read ON public.probation_reviews FOR SELECT TO authenticated
  USING (org_id = my_org() AND can_view_probation_review(profile_id));

DROP POLICY IF EXISTS probation_kras_read ON public.probation_kras;
CREATE POLICY probation_kras_read ON public.probation_kras FOR SELECT TO authenticated
  USING (org_id = my_org() AND can_view_probation_review(profile_id));
DROP POLICY IF EXISTS probation_kras_insert ON public.probation_kras;
CREATE POLICY probation_kras_insert ON public.probation_kras FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND is_probation_reviewer(profile_id)
              AND NOT probation_review_final(profile_id)
              AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = profile_id AND p.org_id = my_org()));
DROP POLICY IF EXISTS probation_kras_update ON public.probation_kras;
CREATE POLICY probation_kras_update ON public.probation_kras FOR UPDATE TO authenticated
  USING (org_id = my_org() AND can_view_probation_review(profile_id))
  WITH CHECK (org_id = my_org() AND can_view_probation_review(profile_id));

DROP POLICY IF EXISTS probation_feedback_read ON public.probation_feedback;
CREATE POLICY probation_feedback_read ON public.probation_feedback FOR SELECT TO authenticated
  USING (org_id = my_org() AND (is_probation_reviewer(profile_id)
         OR (profile_id = my_profile_id() AND probation_review_final(profile_id))));
DROP POLICY IF EXISTS probation_feedback_insert ON public.probation_feedback;
CREATE POLICY probation_feedback_insert ON public.probation_feedback FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND can_write_probation_feedback(profile_id, kind)
              AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = profile_id AND p.org_id = my_org()));
DROP POLICY IF EXISTS probation_feedback_update ON public.probation_feedback;
CREATE POLICY probation_feedback_update ON public.probation_feedback FOR UPDATE TO authenticated
  USING (org_id = my_org() AND can_write_probation_feedback(profile_id, kind))
  WITH CHECK (org_id = my_org() AND can_write_probation_feedback(profile_id, kind));

DROP POLICY IF EXISTS probation_notes_read ON public.probation_internal_notes;
CREATE POLICY probation_notes_read ON public.probation_internal_notes FOR SELECT TO authenticated
  USING (org_id = my_org() AND is_probation_reviewer(profile_id));
DROP POLICY IF EXISTS probation_notes_insert ON public.probation_internal_notes;
CREATE POLICY probation_notes_insert ON public.probation_internal_notes FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND can_write_probation_feedback(profile_id, kind)
              AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = profile_id AND p.org_id = my_org()));
DROP POLICY IF EXISTS probation_notes_update ON public.probation_internal_notes;
CREATE POLICY probation_notes_update ON public.probation_internal_notes FOR UPDATE TO authenticated
  USING (org_id = my_org() AND can_write_probation_feedback(profile_id, kind))
  WITH CHECK (org_id = my_org() AND can_write_probation_feedback(profile_id, kind));

DROP POLICY IF EXISTS probation_log_read ON public.probation_review_log;
CREATE POLICY probation_log_read ON public.probation_review_log FOR SELECT TO authenticated
  USING (org_id = my_org() AND my_role() IN ('hr', 'admin'));

-- ───────── 4. KRA COLUMNS: EACH SIDE WRITES ONLY ITS OWN ─────────
CREATE OR REPLACE FUNCTION public.probation_kras_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_self boolean;
  v_rev probation_reviews%ROWTYPE;
BEGIN
  -- the service role (developer route, maintenance) is not limited here
  IF auth.uid() IS NULL THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := v_me;
    NEW.updated_by := v_me;
    NEW.emp_achievement := NULL; NEW.emp_evaluation := NULL; NEW.emp_remark := NULL;
    NEW.removed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'These fields cannot be changed.';
  END IF;

  SELECT * INTO v_rev FROM probation_reviews WHERE profile_id = OLD.profile_id;
  IF v_rev.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'This probation review is final and can no longer be changed.';
  END IF;

  v_self := OLD.profile_id = v_me;
  IF v_self THEN
    -- the person: only their own columns
    IF NEW.position IS DISTINCT FROM OLD.position OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.measure IS DISTINCT FROM OLD.measure OR NEW.removed_at IS DISTINCT FROM OLD.removed_at
       OR NEW.mgr_achievement IS DISTINCT FROM OLD.mgr_achievement
       OR NEW.mgr_evaluation IS DISTINCT FROM OLD.mgr_evaluation
       OR NEW.mgr_remark IS DISTINCT FROM OLD.mgr_remark THEN
      RAISE EXCEPTION 'Only your manager or HR can change the KRA and the manager columns.';
    END IF;
    IF v_rev.emp_submitted_at IS NOT NULL
       AND (NEW.emp_achievement IS DISTINCT FROM OLD.emp_achievement
            OR NEW.emp_evaluation IS DISTINCT FROM OLD.emp_evaluation) THEN
      RAISE EXCEPTION 'You have submitted your self evaluation. Ask HR to reopen it to change it.';
    END IF;
  ELSIF is_probation_reviewer(OLD.profile_id) THEN
    -- managers / HR / admin: never the person's own columns
    IF NEW.emp_achievement IS DISTINCT FROM OLD.emp_achievement
       OR NEW.emp_evaluation IS DISTINCT FROM OLD.emp_evaluation
       OR NEW.emp_remark IS DISTINCT FROM OLD.emp_remark THEN
      RAISE EXCEPTION 'Only the person can change their own achievement, evaluation and remark.';
    END IF;
    IF v_rev.mgr_submitted_at IS NOT NULL AND my_role() NOT IN ('hr', 'admin')
       AND (NEW.mgr_achievement IS DISTINCT FROM OLD.mgr_achievement
            OR NEW.mgr_evaluation IS DISTINCT FROM OLD.mgr_evaluation
            OR NEW.title IS DISTINCT FROM OLD.title OR NEW.measure IS DISTINCT FROM OLD.measure) THEN
      RAISE EXCEPTION 'The manager evaluation has been submitted. Ask HR to reopen it to change it.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Not allowed';
  END IF;

  NEW.updated_by := v_me;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS probation_kras_guard_trg ON public.probation_kras;
CREATE TRIGGER probation_kras_guard_trg BEFORE INSERT OR UPDATE ON public.probation_kras
  FOR EACH ROW EXECUTE FUNCTION public.probation_kras_guard();

CREATE OR REPLACE FUNCTION public.probation_feedback_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.updated_by := my_profile_id(); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS probation_feedback_stamp_trg ON public.probation_feedback;
CREATE TRIGGER probation_feedback_stamp_trg BEFORE INSERT OR UPDATE ON public.probation_feedback
  FOR EACH ROW EXECUTE FUNCTION public.probation_feedback_stamp();
DROP TRIGGER IF EXISTS probation_notes_stamp_trg ON public.probation_internal_notes;
CREATE TRIGGER probation_notes_stamp_trg BEFORE INSERT OR UPDATE ON public.probation_internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.probation_feedback_stamp();

-- ───────── 5. HISTORY OF EVERY CHANGE ─────────
CREATE OR REPLACE FUNCTION public.probation_review_log_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := to_jsonb(NEW);
  v_changes jsonb := '{}'::jsonb;
  k text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(v_new) LOOP
    CONTINUE WHEN k IN ('updated_at', 'updated_by', 'created_at', 'created_by', 'org_id', 'profile_id', 'id');
    IF (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
    END IF;
  END LOOP;
  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO probation_review_log (org_id, profile_id, actor, entity, entity_key, action, changes)
    VALUES (NEW.org_id, NEW.profile_id, my_profile_id(), TG_TABLE_NAME,
            coalesce(v_new ->> 'id', v_new ->> 'kind'), lower(TG_OP), v_changes);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS probation_kras_log_trg ON public.probation_kras;
CREATE TRIGGER probation_kras_log_trg AFTER INSERT OR UPDATE ON public.probation_kras
  FOR EACH ROW EXECUTE FUNCTION public.probation_review_log_change();
DROP TRIGGER IF EXISTS probation_feedback_log_trg ON public.probation_feedback;
CREATE TRIGGER probation_feedback_log_trg AFTER INSERT OR UPDATE ON public.probation_feedback
  FOR EACH ROW EXECUTE FUNCTION public.probation_review_log_change();
DROP TRIGGER IF EXISTS probation_notes_log_trg ON public.probation_internal_notes;
CREATE TRIGGER probation_notes_log_trg AFTER INSERT OR UPDATE ON public.probation_internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.probation_review_log_change();
DROP TRIGGER IF EXISTS probation_reviews_log_trg ON public.probation_reviews;
CREATE TRIGGER probation_reviews_log_trg AFTER INSERT OR UPDATE ON public.probation_reviews
  FOR EACH ROW EXECUTE FUNCTION public.probation_review_log_change();

-- ───────── 6. STEPS: SUBMIT, REOPEN, FINAL DECISION ─────────
CREATE OR REPLACE FUNCTION public.probation_review_submit(
  p_profile_id uuid, p_stage text, p_recommendation text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_p profiles%ROWTYPE;
  v_rev probation_reviews%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM profiles WHERE id = p_profile_id AND org_id = my_org();
  IF NOT FOUND OR v_me IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  INSERT INTO probation_reviews (profile_id, org_id) VALUES (p_profile_id, v_p.org_id)
    ON CONFLICT (profile_id) DO NOTHING;
  SELECT * INTO v_rev FROM probation_reviews WHERE profile_id = p_profile_id FOR UPDATE;
  IF v_rev.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'This review is already final.'; END IF;

  IF p_stage = 'employee' THEN
    IF p_profile_id <> v_me THEN RAISE EXCEPTION 'Only the person can submit their self evaluation.'; END IF;
    UPDATE probation_reviews SET emp_submitted_at = now(), updated_at = now()
     WHERE profile_id = p_profile_id;
    -- tell the managers above them (or HR / admin when there is no manager)
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT v_p.org_id, t.id, format('%s submitted their probation self evaluation', v_p.full_name),
           'Add the manager evaluation.', '/probation-review?person=' || p_profile_id
      FROM profiles t
     WHERE t.org_id = v_p.org_id AND t.status = 'active' AND t.id <> p_profile_id
       AND (t.id = v_p.manager_id
            OR (v_p.manager_id IS NULL AND t.role IN ('hr', 'admin')));
  ELSIF p_stage = 'manager' THEN
    IF NOT is_probation_reviewer(p_profile_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
    IF p_recommendation NOT IN ('confirm', 'extend', 'review') THEN
      RAISE EXCEPTION 'Choose a recommendation: confirm, extend or review.';
    END IF;
    UPDATE probation_reviews SET mgr_submitted_at = now(), mgr_submitted_by = v_me,
           mgr_recommendation = p_recommendation, updated_at = now()
     WHERE profile_id = p_profile_id;
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT v_p.org_id, t.id, format('%s''s probation review is ready for HR and Sir', v_p.full_name),
           'Add your feedback and the final decision.', '/probation-review?person=' || p_profile_id
      FROM profiles t
     WHERE t.org_id = v_p.org_id AND t.status = 'active' AND t.id <> p_profile_id
       AND t.role IN ('hr', 'admin');
  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.probation_review_reopen(p_profile_id uuid, p_stage text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF my_role() NOT IN ('hr', 'admin') OR p_profile_id = my_profile_id() THEN
    RAISE EXCEPTION 'Only HR or Sir can reopen a step.';
  END IF;
  IF probation_review_final(p_profile_id) THEN RAISE EXCEPTION 'This review is already final.'; END IF;
  IF p_stage = 'employee' THEN
    UPDATE probation_reviews SET emp_submitted_at = NULL, updated_at = now()
     WHERE profile_id = p_profile_id AND org_id = my_org();
  ELSIF p_stage = 'manager' THEN
    UPDATE probation_reviews SET mgr_submitted_at = NULL, updated_at = now()
     WHERE profile_id = p_profile_id AND org_id = my_org();
  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.probation_review_finalize(
  p_profile_id uuid, p_decision text, p_months integer DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_org uuid;
  v_out jsonb;
BEGIN
  IF my_role() NOT IN ('hr', 'admin') OR p_profile_id = v_me THEN
    RAISE EXCEPTION 'Only HR or Sir can make the final decision.';
  END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = p_profile_id AND org_id = my_org();
  IF v_org IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF probation_review_final(p_profile_id) THEN RAISE EXCEPTION 'This review is already final.'; END IF;

  v_out := probation_decide(p_profile_id, p_decision, p_months, p_note);

  INSERT INTO probation_reviews (profile_id, org_id) VALUES (p_profile_id, v_org)
    ON CONFLICT (profile_id) DO NOTHING;
  UPDATE probation_reviews SET finalized_at = now(), finalized_by = v_me,
         final_decision = p_decision, updated_at = now()
   WHERE profile_id = p_profile_id;

  INSERT INTO notifications (org_id, profile_id, title, body, link)
  VALUES (v_org, p_profile_id, 'Your probation review is ready',
          'See the feedback from your manager, HR and Sir.', '/probation-review');
  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.probation_review_submit(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.probation_review_reopen(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.probation_review_finalize(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.probation_review_submit(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.probation_review_reopen(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.probation_review_finalize(uuid, text, integer, text) TO authenticated;
