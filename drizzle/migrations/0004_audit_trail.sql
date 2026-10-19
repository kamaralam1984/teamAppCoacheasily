-- ═══ AUDIT TRAIL ═══
-- One log for the things HR must be able to trace: who changed a person's access, manager,
-- exit or opening balance; every leave request and decision; every earned-leave credit and
-- lapse; policy changes; attendance corrections; probation decisions; holidays; goal cycles.
-- Task assignment and status changes are written by the task workflow (next migration).
-- Rows are written only by triggers; nobody can edit or delete them from the app.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text NOT NULL DEFAULT 'System',
  entity text NOT NULL,
  action text NOT NULL,
  subject_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_name text,
  target_id uuid,
  summary text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_org_created_idx ON public.audit_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_subject_idx ON public.audit_log (subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log (org_id, entity, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
DROP POLICY IF EXISTS "hr admin read audit" ON public.audit_log;
CREATE POLICY "hr admin read audit" ON public.audit_log FOR SELECT TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['hr', 'admin']));

CREATE OR REPLACE FUNCTION public.audit_write(
  p_org uuid, p_entity text, p_action text, p_subject uuid, p_target uuid,
  p_summary text, p_old jsonb DEFAULT NULL, p_new jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := my_profile_id();
BEGIN
  INSERT INTO audit_log (org_id, actor_id, actor_name, entity, action, subject_id, subject_name,
                         target_id, summary, old_value, new_value)
  VALUES (p_org, v_actor,
          coalesce((SELECT full_name FROM profiles WHERE id = v_actor), 'System'),
          p_entity, p_action, p_subject,
          (SELECT full_name FROM profiles WHERE id = p_subject),
          p_target, p_summary, p_old, p_new);
END $$;
REVOKE ALL ON FUNCTION public.audit_write(uuid, text, text, uuid, uuid, text, jsonb, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_write(uuid, text, text, uuid, uuid, text, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.audit_name(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT full_name FROM profiles WHERE id = p_id), 'nobody') $$;
REVOKE ALL ON FUNCTION public.audit_name(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_name(uuid) TO service_role;

-- who did it, in a sentence ("Someone" when it was the system, e.g. the nightly job)
CREATE OR REPLACE FUNCTION public.audit_actor() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT full_name FROM profiles WHERE id = my_profile_id()), 'The system') $$;
REVOKE ALL ON FUNCTION public.audit_actor() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_actor() TO service_role;

-- ───────── people ─────────
CREATE OR REPLACE FUNCTION public.audit_profiles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM audit_write(NEW.org_id, 'profile', 'profile.create', NEW.id, NEW.id,
      format('%s added %s (%s)', audit_actor(), NEW.full_name, NEW.role),
      NULL, jsonb_build_object('role', NEW.role, 'department', NEW.department, 'title', NEW.title));
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM audit_write(NEW.org_id, 'profile', 'profile.role', NEW.id, NEW.id,
      format('%s changed %s''s access level from %s to %s', audit_actor(), NEW.full_name, OLD.role, NEW.role),
      jsonb_build_object('role', OLD.role), jsonb_build_object('role', NEW.role));
  END IF;
  IF NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
    PERFORM audit_write(NEW.org_id, 'profile', 'profile.manager', NEW.id, NEW.id,
      format('%s changed %s''s manager from %s to %s', audit_actor(), NEW.full_name,
             audit_name(OLD.manager_id), audit_name(NEW.manager_id)),
      jsonb_build_object('manager_id', OLD.manager_id), jsonb_build_object('manager_id', NEW.manager_id));
  END IF;
  IF NEW.department IS DISTINCT FROM OLD.department OR NEW.title IS DISTINCT FROM OLD.title THEN
    PERFORM audit_write(NEW.org_id, 'profile', 'profile.details', NEW.id, NEW.id,
      format('%s changed %s''s title or department (%s, %s → %s, %s)', audit_actor(), NEW.full_name,
             coalesce(OLD.title, '—'), coalesce(OLD.department, '—'),
             coalesce(NEW.title, '—'), coalesce(NEW.department, '—')),
      jsonb_build_object('title', OLD.title, 'department', OLD.department),
      jsonb_build_object('title', NEW.title, 'department', NEW.department));
  END IF;
  IF NEW.weekly_off IS DISTINCT FROM OLD.weekly_off OR NEW.joined_on IS DISTINCT FROM OLD.joined_on THEN
    PERFORM audit_write(NEW.org_id, 'profile', 'profile.calendar', NEW.id, NEW.id,
      format('%s changed %s''s weekly off or joining date', audit_actor(), NEW.full_name),
      jsonb_build_object('weekly_off', OLD.weekly_off, 'joined_on', OLD.joined_on),
      jsonb_build_object('weekly_off', NEW.weekly_off, 'joined_on', NEW.joined_on));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM audit_write(NEW.org_id, 'profile',
      CASE WHEN NEW.status = 'exited' THEN 'profile.exit' ELSE 'profile.rejoin' END, NEW.id, NEW.id,
      format('%s marked %s as %s', audit_actor(), NEW.full_name,
             CASE WHEN NEW.status = 'exited' THEN 'exited' ELSE 'active again' END),
      jsonb_build_object('status', OLD.status, 'exited_on', OLD.exited_on),
      jsonb_build_object('status', NEW.status, 'exited_on', NEW.exited_on));
  END IF;
  IF NEW.opening_earned_leave IS DISTINCT FROM OLD.opening_earned_leave THEN
    PERFORM audit_write(NEW.org_id, 'leave', 'leave.opening_balance', NEW.id, NEW.id,
      format('%s changed %s''s opening earned leave from %s to %s', audit_actor(), NEW.full_name,
             OLD.opening_earned_leave, NEW.opening_earned_leave),
      jsonb_build_object('opening_earned_leave', OLD.opening_earned_leave),
      jsonb_build_object('opening_earned_leave', NEW.opening_earned_leave));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_profiles_ins ON public.profiles;
CREATE TRIGGER audit_profiles_ins AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profiles();
DROP TRIGGER IF EXISTS audit_profiles_upd ON public.profiles;
CREATE TRIGGER audit_profiles_upd AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profiles();

-- ───────── leave ─────────
CREATE OR REPLACE FUNCTION public.audit_leave() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r leave_requests%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM audit_write(NEW.org_id, 'leave', 'leave.request', NEW.profile_id, NEW.id,
      format('%s asked for %s day(s) of %s leave (%s → %s)', audit_name(NEW.profile_id),
             NEW.days, NEW.type, to_char(NEW.from_date, 'FMDD Mon'), to_char(NEW.to_date, 'FMDD Mon')),
      NULL, jsonb_build_object('type', NEW.type, 'days', NEW.days, 'from', NEW.from_date, 'to', NEW.to_date));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
      PERFORM audit_write(NEW.org_id, 'leave', 'leave.' || NEW.status, NEW.profile_id, NEW.id,
        format('%s %s %s''s %s leave of %s day(s) (%s → %s)', audit_actor(), NEW.status,
               audit_name(NEW.profile_id), NEW.type, NEW.days,
               to_char(NEW.from_date, 'FMDD Mon'), to_char(NEW.to_date, 'FMDD Mon')),
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status, 'type', NEW.type, 'days', NEW.days));
    END IF;
    RETURN NEW;
  ELSE
    r := OLD;
    PERFORM audit_write(r.org_id, 'leave', 'leave.delete', r.profile_id, r.id,
      format('%s removed %s''s %s leave request (%s, %s day(s))', audit_actor(), audit_name(r.profile_id),
             r.type, r.status, r.days),
      jsonb_build_object('status', r.status, 'type', r.type, 'days', r.days), NULL);
    RETURN OLD;
  END IF;
END $$;

DROP TRIGGER IF EXISTS audit_leave_ins ON public.leave_requests;
CREATE TRIGGER audit_leave_ins AFTER INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_leave();
DROP TRIGGER IF EXISTS audit_leave_upd ON public.leave_requests;
CREATE TRIGGER audit_leave_upd AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_leave();
DROP TRIGGER IF EXISTS audit_leave_del ON public.leave_requests;
CREATE TRIGGER audit_leave_del AFTER DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_leave();

-- ───────── earned leave ─────────
CREATE OR REPLACE FUNCTION public.audit_el_ledger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM audit_write(NEW.org_id, 'leave', 'el.credit', NEW.profile_id, NEW.id,
    format('%s earned %s day(s) of earned leave (%s eligible days, balance %s → %s)',
           audit_name(NEW.profile_id), NEW.credited, NEW.eligible_days, NEW.previous_balance, NEW.new_balance),
    jsonb_build_object('balance', NEW.previous_balance),
    jsonb_build_object('balance', NEW.new_balance, 'period_start', NEW.period_start, 'period_end', NEW.period_end));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_el_ledger_ins ON public.el_ledger;
CREATE TRIGGER audit_el_ledger_ins AFTER INSERT ON public.el_ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_el_ledger();

CREATE OR REPLACE FUNCTION public.audit_el_lapse() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM audit_write(NEW.org_id, 'leave', 'el.lapse', NEW.profile_id, NEW.id,
    format('%s lost %s day(s) of earned leave at the new leave year (limit %s)',
           audit_name(NEW.profile_id), NEW.amount, NEW.carry_limit),
    jsonb_build_object('balance', NEW.balance_before), jsonb_build_object('balance', NEW.balance_after));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_el_lapse_ins ON public.el_lapses;
CREATE TRIGGER audit_el_lapse_ins AFTER INSERT ON public.el_lapses
  FOR EACH ROW EXECUTE FUNCTION public.audit_el_lapse();

CREATE OR REPLACE FUNCTION public.audit_el_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changes text;
BEGIN
  SELECT string_agg(n.key || ': ' || coalesce(o.value #>> '{}', 'none') || ' → ' || coalesce(n.value #>> '{}', 'none'), ', ')
    INTO v_changes
    FROM jsonb_each(NEW.new_policy) n
    LEFT JOIN jsonb_each(NEW.old_policy) o ON o.key = n.key
   WHERE n.key NOT IN ('updated_at', 'updated_by', 'carry_forward_since')
     AND n.value IS DISTINCT FROM o.value;
  PERFORM audit_write(NEW.org_id, 'policy', 'el.policy', NULL, NEW.id,
    format('%s changed the earned leave policy (%s)', audit_name(NEW.changed_by), coalesce(v_changes, 'no visible change')),
    NEW.old_policy, NEW.new_policy);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_el_policy_ins ON public.el_policy_log;
CREATE TRIGGER audit_el_policy_ins AFTER INSERT ON public.el_policy_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_el_policy();

-- ───────── attendance corrections, probation, holidays, goal cycles ─────────
CREATE OR REPLACE FUNCTION public.audit_attendance_correction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM audit_write(NEW.org_id, 'attendance', 'attendance.correction', NEW.profile_id, NEW.id,
    format('%s corrected %s''s attendance for %s: %s', audit_name(NEW.corrected_by), audit_name(NEW.profile_id),
           to_char(NEW.date, 'FMDD Mon'), NEW.reason),
    NEW.old_value, NEW.new_value);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_attendance_correction_ins ON public.attendance_corrections;
CREATE TRIGGER audit_attendance_correction_ins AFTER INSERT ON public.attendance_corrections
  FOR EACH ROW EXECUTE FUNCTION public.audit_attendance_correction();

CREATE OR REPLACE FUNCTION public.audit_probation_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM audit_write(NEW.org_id, 'probation', 'probation.' || NEW.decision, NEW.profile_id, NEW.id,
    format('%s %s %s''s probation%s', audit_name(NEW.decided_by),
           CASE NEW.decision WHEN 'confirm' THEN 'confirmed' WHEN 'extend' THEN 'extended' ELSE 'marked for review' END,
           audit_name(NEW.profile_id),
           CASE WHEN NEW.decision = 'extend' THEN format(' by %s month(s), to %s', NEW.extension_months, to_char(NEW.new_end, 'FMDD Mon YYYY')) ELSE '' END),
    jsonb_build_object('end_date', NEW.previous_end), jsonb_build_object('end_date', NEW.new_end, 'note', NEW.note));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_probation_decision_ins ON public.probation_decisions;
CREATE TRIGGER audit_probation_decision_ins AFTER INSERT ON public.probation_decisions
  FOR EACH ROW EXECUTE FUNCTION public.audit_probation_decision();

CREATE OR REPLACE FUNCTION public.audit_holiday() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM audit_write(NEW.org_id, 'holiday', 'holiday.add', NULL, NEW.id,
      format('%s added the holiday "%s" on %s', audit_actor(), NEW.name, to_char(NEW.date, 'FMDD Mon YYYY')),
      NULL, jsonb_build_object('name', NEW.name, 'date', NEW.date));
    RETURN NEW;
  END IF;
  PERFORM audit_write(OLD.org_id, 'holiday', 'holiday.remove', NULL, OLD.id,
    format('%s removed the holiday "%s" on %s', audit_actor(), OLD.name, to_char(OLD.date, 'FMDD Mon YYYY')),
    jsonb_build_object('name', OLD.name, 'date', OLD.date), NULL);
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS audit_holiday_ins ON public.holidays;
CREATE TRIGGER audit_holiday_ins AFTER INSERT ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.audit_holiday();
DROP TRIGGER IF EXISTS audit_holiday_del ON public.holidays;
CREATE TRIGGER audit_holiday_del AFTER DELETE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.audit_holiday();

CREATE OR REPLACE FUNCTION public.audit_cycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM audit_write(NEW.org_id, 'goals', 'cycle.open', NULL, NEW.id,
      format('%s opened the goal cycle "%s" (%s → %s)', audit_actor(), NEW.name,
             to_char(NEW.start_date, 'FMDD Mon'), to_char(NEW.end_date, 'FMDD Mon YYYY')),
      NULL, jsonb_build_object('name', NEW.name, 'start', NEW.start_date, 'end', NEW.end_date));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM audit_write(NEW.org_id, 'goals', 'cycle.' || NEW.status, NULL, NEW.id,
      format('%s set the goal cycle "%s" to %s', audit_actor(), NEW.name, NEW.status),
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_cycle_ins ON public.cycles;
CREATE TRIGGER audit_cycle_ins AFTER INSERT ON public.cycles
  FOR EACH ROW EXECUTE FUNCTION public.audit_cycle();
DROP TRIGGER IF EXISTS audit_cycle_upd ON public.cycles;
CREATE TRIGGER audit_cycle_upd AFTER UPDATE OF status ON public.cycles
  FOR EACH ROW EXECUTE FUNCTION public.audit_cycle();