-- ═══ EMPLOYEE ID + THE 360° PROFILE ═══
-- 1. profiles.employee_code: a short human id (CE-001), unique per organisation. HR can change it
--    (the existing profile guard already stops everybody else); new people get the next number.
-- 2. profile_360(): one call that gathers a person's work, goals, attendance, leave and HR status
--    for people allowed to see them (the person, their managers, HR and admin). Everybody else
--    gets the directory card only.
-- Search itself needs no database change: the app filters the directory it already loads.

-- ───────── 1. EMPLOYEE ID ─────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_code text;

-- Existing people, numbered in the order they joined.
WITH n AS (
  SELECT id, row_number() OVER (PARTITION BY org_id ORDER BY joined_on NULLS LAST, created_at, id) AS rn
    FROM public.profiles WHERE employee_code IS NULL)
UPDATE public.profiles p
   SET employee_code = 'CE-' || lpad(n.rn::text, 3, '0')
  FROM n WHERE n.id = p.id;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_employee_code_shape
    CHECK (employee_code IS NULL OR employee_code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,19}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_employee_code_uidx
  ON public.profiles (org_id, lower(employee_code)) WHERE employee_code IS NOT NULL;

-- A person added without an id gets the next number: the prefix is the organisation's
-- setting employee_code_prefix (default CE).
CREATE OR REPLACE FUNCTION public.profiles_assign_employee_code() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_prefix text;
  v_next integer;
BEGIN
  IF NEW.employee_code IS NOT NULL AND btrim(NEW.employee_code) <> '' THEN
    NEW.employee_code := btrim(NEW.employee_code);
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('employee-code:' || NEW.org_id::text));
  SELECT coalesce(nullif(btrim(settings->>'employee_code_prefix'), ''), 'CE') INTO v_prefix
    FROM organisations WHERE id = NEW.org_id;
  SELECT coalesce(max(substring(employee_code FROM '(\d+)$')::integer), 0) + 1 INTO v_next
    FROM profiles WHERE org_id = NEW.org_id AND employee_code ~ '\d+$';
  NEW.employee_code := coalesce(v_prefix, 'CE') || '-' || lpad(v_next::text, 3, '0');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_assign_employee_code_trg ON public.profiles;
CREATE TRIGGER profiles_assign_employee_code_trg BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_assign_employee_code();

-- The audit trail also notes a changed employee id.
CREATE OR REPLACE FUNCTION public.audit_profiles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM audit_write(NEW.org_id, 'profile', 'profile.create', NEW.id, NEW.id,
      format('%s added %s (%s)', audit_actor(), NEW.full_name, NEW.role),
      NULL, jsonb_build_object('role', NEW.role, 'department', NEW.department, 'title', NEW.title,
                               'employee_code', NEW.employee_code));
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
  IF NEW.employee_code IS DISTINCT FROM OLD.employee_code THEN
    PERFORM audit_write(NEW.org_id, 'profile', 'profile.employee_code', NEW.id, NEW.id,
      format('%s changed %s''s employee id from %s to %s', audit_actor(), NEW.full_name,
             coalesce(OLD.employee_code, '—'), coalesce(NEW.employee_code, '—')),
      jsonb_build_object('employee_code', OLD.employee_code),
      jsonb_build_object('employee_code', NEW.employee_code));
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

-- ───────── 2. THE 360° PROFILE ─────────
CREATE OR REPLACE FUNCTION public.profile_360(p_profile_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  p profiles%ROWTYPE;
  v_basic jsonb;
  v_probation jsonb;
  v_attendance jsonb;
  v_leave jsonb;
  v_tasks jsonb;
  v_goals jsonb;
  v_recent jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO p FROM profiles WHERE id = p_profile_id AND org_id = my_org();
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;

  v_basic := jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'employee_code', p.employee_code, 'title', p.title,
    'department', p.department, 'role', p.role, 'status', p.status, 'joined_on', p.joined_on,
    'exited_on', p.exited_on, 'weekly_off', p.weekly_off, 'avatar_url', p.avatar_url,
    'manager_id', p.manager_id,
    'manager_name', (SELECT m.full_name FROM profiles m WHERE m.id = p.manager_id),
    'hr_contact', (SELECT jsonb_build_object('id', h.id, 'full_name', h.full_name)
                     FROM profiles h
                    WHERE h.org_id = p.org_id AND h.role = 'hr' AND h.status = 'active'
                    ORDER BY h.sort_order, h.full_name LIMIT 1));

  -- Everybody may see the directory card; the rest is for the person, their managers and HR.
  IF NOT (p.id = v_me OR manages(p.id) OR my_role() = ANY (ARRAY['hr', 'admin'])) THEN
    RETURN jsonb_build_object('access', 'directory') || v_basic;
  END IF;

  SELECT jsonb_build_object(
           'start_date', pr.start_date, 'end_date', pr.end_date, 'status', pr.status,
           'days_left', pr.end_date - v_today,
           'decisions', (SELECT count(*) FROM probation_decisions d WHERE d.profile_id = p.id))
    INTO v_probation FROM probations pr WHERE pr.profile_id = p.id;

  SELECT jsonb_build_object(
           'today', (attendance_day_info(p.id, v_today))->>'kind',
           'month_start', date_trunc('month', v_today::timestamp)::date,
           'present', count(*) FILTER (WHERE k.kind IN ('present', 'late')),
           'late', count(*) FILTER (WHERE k.kind = 'late'),
           'wfh', count(*) FILTER (WHERE k.kind = 'wfh'),
           'half_day', count(*) FILTER (WHERE k.kind = 'half_day'),
           'leave', count(*) FILTER (WHERE k.kind = 'leave'),
           'absent', count(*) FILTER (WHERE k.kind = 'absent'),
           'working_days', count(*) FILTER (WHERE k.kind IN ('present', 'late', 'wfh', 'half_day', 'absent', 'leave')))
    INTO v_attendance
    FROM generate_series(date_trunc('month', v_today::timestamp), v_today::timestamp, interval '1 day') d
    CROSS JOIN LATERAL (SELECT attendance_day_info(p.id, d::date)->>'kind' AS kind) k;

  v_leave := jsonb_build_object(
    'balances', coalesce(leave_balances(p.id), '[]'::jsonb),
    'pending', (SELECT count(*) FROM leave_requests l WHERE l.profile_id = p.id AND l.status = 'pending'),
    'recent', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'id', l.id, 'type', l.type, 'from_date', l.from_date, 'to_date', l.to_date,
                 'days', l.days, 'status', l.status) ORDER BY l.from_date DESC)
               FROM (SELECT * FROM leave_requests WHERE profile_id = p.id
                      ORDER BY from_date DESC LIMIT 5) l), '[]'::jsonb));

  -- The last 90 days, plus anything still open
  SELECT jsonb_build_object(
           'total', count(*),
           'completed', count(*) FILTER (WHERE t.status = 'completed'),
           'pending', count(*) FILTER (WHERE t.status <> 'completed'),
           'in_review', count(*) FILTER (WHERE t.status = 'review'),
           'overdue', count(*) FILTER (WHERE t.status <> 'completed' AND t.due_date < v_today),
           'completion_rate', CASE WHEN count(*) = 0 THEN NULL
                              ELSE round(100.0 * count(*) FILTER (WHERE t.status = 'completed') / count(*), 0) END)
    INTO v_tasks
    FROM tasks t
   WHERE t.owner_id = p.id AND (t.created_at >= now() - interval '90 days' OR t.status <> 'completed');

  v_goals := coalesce(goals_status_for(p.id), '[]'::jsonb);

  SELECT coalesce(jsonb_agg(u.x ORDER BY u.at DESC), '[]'::jsonb) INTO v_recent FROM (
    SELECT * FROM (
      SELECT e.created_at AS at,
             jsonb_build_object('at', e.created_at, 'kind', 'task',
               'text', t.title || ': ' ||
                 CASE e.kind WHEN 'status' THEN replace(e.from_value, '_', ' ') || ' → ' || replace(e.to_value, '_', ' ')
                             WHEN 'comment' THEN 'comment, ' || coalesce(e.to_value, '')
                             ELSE replace(e.kind, '_', ' ') END) AS x
        FROM task_events e JOIN tasks t ON t.id = e.task_id
       WHERE t.owner_id = p.id ORDER BY e.created_at DESC LIMIT 8) a
    UNION ALL
    SELECT * FROM (
      SELECT c.created_at,
             jsonb_build_object('at', c.created_at, 'kind', 'goal_comment',
               'text', audit_name(c.author_id) || ' on "' || g.name || '": ' || left(c.body, 140))
        FROM goal_comments c JOIN goals g ON g.id = c.goal_id
       WHERE g.profile_id = p.id ORDER BY c.created_at DESC LIMIT 5) b
    ORDER BY at DESC LIMIT 10) u;

  RETURN jsonb_build_object('access', 'full') || v_basic || jsonb_build_object(
    'probation', v_probation, 'attendance', v_attendance, 'leave', v_leave,
    'tasks', v_tasks, 'goals', v_goals, 'recent', v_recent);
END $$;
REVOKE ALL ON FUNCTION public.profile_360(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.profile_360(uuid) TO authenticated;
