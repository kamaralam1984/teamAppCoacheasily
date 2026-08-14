CREATE OR REPLACE FUNCTION public.appraisal_matrix()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := my_org();
  v_cycles jsonb;
  v_rows jsonb;
BEGIN
  IF my_role() IS NULL OR my_role() NOT IN ('hr', 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT coalesce(jsonb_agg(c ORDER BY c.no), '[]'::jsonb) INTO v_cycles
  FROM (
    SELECT id, no, name, status, start_date, end_date
    FROM cycles WHERE org_id = v_org
  ) c;

  SELECT coalesce(jsonb_agg(r ORDER BY r.sort_order, r.full_name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT p.id AS profile_id, p.full_name, p.title, p.department,
           p.sort_order,
           (
             SELECT coalesce(jsonb_object_agg(x.cycle_id, jsonb_build_object(
                      'pct', x.pct, 'goals', x.goals)), '{}'::jsonb)
             FROM (
               SELECT g.cycle_id::text AS cycle_id,
                      round(avg(goal_pct(g.id)), 1) AS pct,
                      count(*) AS goals
               FROM goals g
               WHERE g.profile_id = p.id AND g.org_id = v_org AND NOT g.archived
               GROUP BY g.cycle_id
             ) x
           ) AS scores
    FROM profiles p
    WHERE p.org_id = v_org AND p.status = 'active'
  ) r;

  RETURN jsonb_build_object('cycles', v_cycles, 'rows', v_rows);
END $function$
;

CREATE OR REPLACE FUNCTION public.goals_remind_pending(p_cycle_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := my_org();
  v_me uuid := my_profile_id();
  v_role text := my_role();
  v_cycle uuid := p_cycle_id;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n int := 0;
  v_has_goals boolean;
  v_logged boolean;
  p record;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('manager','hr','admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF v_cycle IS NULL THEN
    SELECT id INTO v_cycle FROM cycles WHERE org_id = v_org AND status = 'active'
      ORDER BY start_date DESC LIMIT 1;
  END IF;
  IF v_cycle IS NULL THEN RETURN 0; END IF;

  FOR p IN
    SELECT * FROM profiles
     WHERE org_id = v_org AND status = 'active'
       AND (CASE WHEN v_role IN ('hr','admin') THEN id <> v_me ELSE manages(id) AND id <> v_me END)
  LOOP
    SELECT EXISTS (SELECT 1 FROM goals WHERE profile_id = p.id AND cycle_id = v_cycle AND archived = false)
      INTO v_has_goals;
    SELECT EXISTS (SELECT 1 FROM goal_entries e JOIN goals g ON g.id = e.goal_id
                    WHERE g.profile_id = p.id AND g.cycle_id = v_cycle AND e.date = v_today)
      INTO v_logged;

    IF NOT v_has_goals THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (v_org, p.id, 'You have no goals this cycle',
        'Write them today so your numbers start counting.', '/goals');
      v_n := v_n + 1;
    ELSIF NOT v_logged THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (v_org, p.id, 'Today''s numbers are still blank',
        'It takes twenty seconds. Log them before you close the laptop.', '/dashboard');
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END $function$
;

CREATE OR REPLACE FUNCTION public.leave_check(p_type text, p_from date, p_to date, p_half boolean DEFAULT false, p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_days numeric;
  v_errors text[] := '{}';
  v_warnings text[] := '{}';
  v_balances jsonb;
  v_bal numeric;
  v_quarter int;
  v_qcount numeric;
  v_notice int;
  v_msg text;
  v_summary jsonb;
  v_cap numeric;
BEGIN
  IF v_target IS NULL THEN RETURN jsonb_build_object('errors','[]'::jsonb,'warnings','[]'::jsonb,'days',0); END IF;
  IF NOT (v_target = my_profile_id() OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- array_append everywhere: `arr || 'literal'` resolves as array||array and crashes.
  IF p_to < p_from THEN
    v_errors := array_append(v_errors, 'The last day cannot be before the first day.');
    RETURN jsonb_build_object('errors', to_jsonb(v_errors), 'warnings', to_jsonb(v_warnings), 'days', 0);
  END IF;

  v_days := CASE WHEN p_half THEN 0.5 ELSE (p_to - p_from) + 1 END;
  v_balances := leave_balances(v_target);
  v_notice := p_from - (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT (e->>'balance')::numeric INTO v_bal
    FROM jsonb_array_elements(v_balances) e WHERE e->>'type' = p_type;

  IF p_type = 'casual' THEN
    SELECT coalesce((o.settings->>'casual_quarter_cap')::numeric, 2) INTO v_cap
      FROM organisations o JOIN profiles p ON p.org_id = o.id WHERE p.id = v_target;
    v_quarter := extract(quarter FROM p_from)::int;
    SELECT coalesce(sum(days), 0) INTO v_qcount FROM leave_requests
      WHERE profile_id = v_target AND type = 'casual' AND status IN ('pending','approved')
        AND extract(year FROM from_date) = extract(year FROM p_from)
        AND extract(quarter FROM from_date) = v_quarter;
    IF v_qcount + v_days > coalesce(v_cap, 2) THEN
      v_errors := array_append(v_errors, format(
        'Casual leave is capped at %s per quarter. You already have %s in Q%s.',
        coalesce(v_cap, 2), v_qcount, v_quarter));
    END IF;
    IF v_notice < 7 THEN
      v_warnings := array_append(v_warnings, 'This is less than 7 days'' notice — please give your team a heads-up.');
    END IF;
  END IF;

  IF p_type = 'earned' THEN
    v_summary := attendance_summary(v_target);
    IF coalesce(v_bal, 0) <= 0 THEN
      v_errors := array_append(v_errors, format(
        'You have no earned leave yet — 1 is earned for every 20 days worked. You are at %s day(s) in the app.',
        coalesce((v_summary->>'days_marked')::int, 0)));
    END IF;
    IF v_notice < 30 THEN
      v_warnings := array_append(v_warnings, 'Earned leave usually needs 30 days'' notice so cover can be planned.');
    END IF;
  END IF;

  -- Illness must never carry friction: no balance warning, no blocker, no sandwich rule.
  IF p_type IN ('casual','earned','comp_off') AND coalesce(v_bal, 0) > 0 AND v_days > v_bal THEN
    v_warnings := array_append(v_warnings, format(
      'This is more than your balance of %s day(s) — the extra will be unpaid.', v_bal));
  END IF;

  IF p_type IN ('casual','comp_off') AND coalesce(v_bal, 0) <= 0 THEN
    v_errors := array_append(v_errors, format('You have no %s leave left this year.', replace(p_type, '_', '-')));
  END IF;

  IF p_type <> 'sick' THEN
    v_msg := leave_sandwich_conflict(v_target, p_from, p_to, NULL);
    IF v_msg IS NOT NULL THEN
      v_errors := array_append(v_errors, v_msg);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'days', v_days);
END $function$
;

CREATE OR REPLACE FUNCTION public.leave_ledger()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := my_org();
  v_out jsonb := '[]'::jsonb;
  p record;
  b jsonb;
  v_worked int;
BEGIN
  IF my_role() IS NULL OR my_role() NOT IN ('hr', 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  FOR p IN
    SELECT id, full_name, title, department, sort_order
    FROM profiles WHERE org_id = v_org AND status = 'active'
    ORDER BY sort_order, full_name
  LOOP
    b := leave_balances(p.id);
    SELECT count(*) INTO v_worked FROM attendance WHERE profile_id = p.id AND org_id = v_org;
    v_out := v_out || jsonb_build_object(
      'profile_id', p.id,
      'full_name', p.full_name,
      'title', p.title,
      'department', p.department,
      'balances', b,
      'days_worked', v_worked
    );
  END LOOP;

  RETURN v_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.open_cycle(p_end_date date, p_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := my_org();
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_prev record;
  v_no int;
  v_name text;
  v_id uuid;
  r record;
BEGIN
  IF my_role() IS NULL OR my_role() NOT IN ('hr','admin') THEN
    RAISE EXCEPTION 'Only HR or Admin may open a cycle.';
  END IF;
  IF p_end_date <= v_today THEN
    RAISE EXCEPTION 'The next strategic meeting must be in the future.';
  END IF;

  SELECT * INTO v_prev FROM cycles WHERE org_id = v_org AND status = 'active'
    ORDER BY start_date DESC LIMIT 1;
  SELECT coalesce(max(no), 0) + 1 INTO v_no FROM cycles WHERE org_id = v_org;
  v_name := coalesce(nullif(p_name, ''), 'Strategic Meeting ' || v_no);

  UPDATE cycles SET status = 'closed' WHERE org_id = v_org AND status = 'active';

  INSERT INTO cycles (org_id, no, name, start_date, end_date, status, created_by)
  VALUES (v_org, v_no, v_name, v_today, p_end_date, 'active', v_me)
  RETURNING id INTO v_id;

  FOR r IN SELECT id FROM profiles WHERE org_id = v_org AND status = 'active' LOOP
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (v_org, r.id,
      'A new cycle has opened — ' || v_name,
      'It runs to ' || to_char(p_end_date, 'DD Mon') ||
      '. Write your fresh goals and start logging your numbers.',
      '/goals');
  END LOOP;

  RETURN jsonb_build_object('id', v_id, 'name', v_name, 'no', v_no,
    'start_date', v_today, 'end_date', p_end_date,
    'closed', CASE WHEN v_prev.id IS NULL THEN NULL ELSE v_prev.name END);
END $function$
;

CREATE OR REPLACE FUNCTION public.profiles_protect_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  -- Deliberate escape hatch for supervised SQL maintenance.
  IF coalesce(current_setting('app.allow_profile_admin', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    -- Raw SQL / seeding. Re-running a seed must never overwrite a real person.
    IF NEW.title              IS DISTINCT FROM OLD.title
    OR NEW.department         IS DISTINCT FROM OLD.department
    OR NEW.manager_id         IS DISTINCT FROM OLD.manager_id
    OR NEW.role               IS DISTINCT FROM OLD.role
    OR NEW.opening_earned_leave IS DISTINCT FROM OLD.opening_earned_leave
    THEN
      RAISE EXCEPTION 'Title, department, reporting line, access level and opening earned leave can only be changed by a signed-in HR or Admin person.';
    END IF;
    RETURN NEW;
  END IF;

  v_role := my_role();
  IF v_role = ANY (ARRAY['hr','admin']) THEN
    RETURN NEW;
  END IF;

  -- An ordinary signed-in warrior may change their photo and their human detail,
  -- and nothing else. Allow-list, so any column added later is protected by default.
  IF (to_jsonb(NEW) - 'avatar_url' - 'fun_fact')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'avatar_url' - 'fun_fact')
  THEN
    RAISE EXCEPTION 'Only HR can change that. You can update your own photo and your one human detail.';
  END IF;

  RETURN NEW;
END
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_roster()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := my_org();
  v_root uuid;
  v_fixed text[] := '{}';
  v_rerouted int := 0;
  r record;
BEGIN
  IF my_role() IS NULL OR my_role() NOT IN ('hr','admin') THEN
    RAISE EXCEPTION 'Only HR or Admin may reconcile the roster.';
  END IF;

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('fixed', '[]'::jsonb, 'count', 0, 'rerouted', 0);
  END IF;

  FOR r IN
    SELECT id, full_name FROM profiles WHERE org_id = v_org AND manager_id = id
  LOOP
    UPDATE profiles SET manager_id = NULL WHERE id = r.id;
    v_fixed := v_fixed || (r.full_name || ' (self-manager cleared)');
  END LOOP;

  SELECT id INTO v_root FROM profiles
   WHERE org_id = v_org AND status = 'active' AND manager_id IS NULL
     AND role IN ('admin','hr')
   ORDER BY created_at LIMIT 1;

  IF v_root IS NULL THEN
    SELECT id INTO v_root FROM profiles
     WHERE org_id = v_org AND status = 'active' AND role IN ('admin','hr')
     ORDER BY created_at LIMIT 1;
    IF v_root IS NOT NULL THEN
      UPDATE profiles SET manager_id = NULL WHERE id = v_root;
      v_fixed := v_fixed || ((SELECT full_name FROM profiles WHERE id = v_root) || ' promoted to top of chart');
    END IF;
  END IF;

  IF v_root IS NOT NULL THEN
    FOR r IN
      SELECT p.id, p.full_name
        FROM profiles p
        LEFT JOIN profiles m ON m.id = p.manager_id
       WHERE p.org_id = v_org
         AND p.status = 'active'
         AND p.manager_id IS NOT NULL
         AND p.id <> v_root
         AND (m.id IS NULL OR m.status <> 'active' OR m.role NOT IN ('manager','hr','admin'))
    LOOP
      UPDATE profiles SET manager_id = v_root WHERE id = r.id;
      v_fixed := v_fixed || r.full_name;
    END LOOP;
  END IF;

  FOR r IN
    SELECT lr.id, lr.approver_id, lr.org_id, lr.profile_id,
           leave_approver_for(lr.profile_id) AS correct,
           p.full_name
      FROM leave_requests lr JOIN profiles p ON p.id = lr.profile_id
     WHERE lr.org_id = v_org AND lr.status = 'pending'
  LOOP
    IF r.correct IS NOT NULL AND r.correct IS DISTINCT FROM r.approver_id THEN
      UPDATE leave_requests SET approver_id = r.correct WHERE id = r.id;
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (r.org_id, r.correct,
        r.full_name || '''s leave request is now yours to review',
        'It moved to you after a reporting change.', '/approvals');
      v_rerouted := v_rerouted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'fixed', to_jsonb(v_fixed),
    'count', coalesce(array_length(v_fixed, 1), 0),
    'rerouted', v_rerouted
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_leave_quotas(p_casual numeric, p_sick numeric, p_effective_from date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from date := coalesce(p_effective_from, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_list jsonb;
  v_out jsonb;
BEGIN
  IF my_role() IS NULL OR my_role() NOT IN ('hr','admin') THEN
    RAISE EXCEPTION 'Only HR or Admin may change entitlements.';
  END IF;

  SELECT coalesce(settings->'leave_quotas','[]'::jsonb) INTO v_list
    FROM organisations WHERE id = my_org();

  SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO v_list
    FROM jsonb_array_elements(v_list) e WHERE (e->>'from')::date <> v_from;

  v_list := v_list || jsonb_build_array(jsonb_build_object(
    'from', v_from, 'casual', p_casual, 'sick', p_sick));

  UPDATE organisations
     SET settings = coalesce(settings,'{}'::jsonb)
       || jsonb_build_object('leave_quotas', v_list,
                             'casual_quota', p_casual,
                             'sick_quota', p_sick,
                             'quota_effective_from', v_from)
   WHERE id = my_org() RETURNING settings INTO v_out;
  RETURN v_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.team_goals(p_cycle_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := my_org();
  v_me uuid := my_profile_id();
  v_role text := my_role();
  v_cycle uuid := p_cycle_id;
  v_active uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_out jsonb := '[]'::jsonb;
  v_goals jsonb;
  v_sum numeric;
  v_n int;
  v_last date;
  p record;
  r record;
BEGIN
  IF v_me IS NULL THEN RETURN v_out; END IF;
  IF v_role IS NULL OR v_role NOT IN ('manager','hr','admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT id INTO v_active FROM cycles WHERE org_id = v_org AND status = 'active'
    ORDER BY start_date DESC LIMIT 1;

  IF v_cycle IS NULL THEN
    v_cycle := v_active;
  ELSIF v_role = 'manager' AND v_cycle IS DISTINCT FROM v_active THEN
    -- The appraisal record belongs to People & Culture and Admin.
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_cycle IS NULL THEN RETURN v_out; END IF;

  FOR p IN
    SELECT * FROM profiles
     WHERE org_id = v_org AND status = 'active'
       AND (CASE WHEN v_role IN ('hr','admin') THEN true ELSE manages(id) AND id <> v_me END)
     ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'hr' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
              sort_order, full_name
  LOOP
    v_goals := '[]'::jsonb;
    v_sum := 0; v_n := 0;
    FOR r IN SELECT * FROM goals WHERE profile_id = p.id AND cycle_id = v_cycle AND archived = false
             ORDER BY created_at ASC
    LOOP
      v_goals := v_goals || jsonb_build_object('goal', to_jsonb(r), 'progress', goal_progress(r.id));
      v_sum := v_sum + coalesce((goal_progress(r.id)->>'pct')::numeric, 0);
      v_n := v_n + 1;
    END LOOP;

    SELECT max(e.date) INTO v_last FROM goal_entries e
      JOIN goals g ON g.id = e.goal_id
     WHERE g.profile_id = p.id AND g.cycle_id = v_cycle;

    v_out := v_out || jsonb_build_object(
      'profile', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'title', p.title,
                 'department', p.department, 'role', p.role, 'manager_id', p.manager_id),
      'goals', v_goals,
      'goal_count', v_n,
      'avg_pct', CASE WHEN v_n > 0 THEN round(v_sum / v_n, 1) ELSE 0 END,
      'last_entry_date', v_last,
      'logged_today', v_last = v_today,
      'days_since_log', CASE WHEN v_last IS NULL THEN NULL ELSE (v_today - v_last) END
    );
  END LOOP;

  RETURN v_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.team_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cycle uuid;
  v_warriors int;
  v_present int;
  v_leave int;
  v_with_goals int;
  v_avg numeric;
  v_overdue int;
BEGIN
  IF my_role() IS NULL OR my_role() NOT IN ('hr', 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT id INTO v_cycle FROM cycles WHERE org_id = v_org AND status = 'active'
   ORDER BY start_date DESC LIMIT 1;

  SELECT count(*) INTO v_warriors FROM profiles WHERE org_id = v_org AND status = 'active';
  SELECT count(*) INTO v_present FROM attendance WHERE org_id = v_org AND date = v_today;
  SELECT count(DISTINCT profile_id) INTO v_leave FROM leave_requests
    WHERE org_id = v_org AND status = 'approved' AND v_today BETWEEN from_date AND to_date;
  SELECT count(DISTINCT profile_id) INTO v_with_goals FROM goals
    WHERE org_id = v_org AND cycle_id = v_cycle AND NOT archived;
  SELECT round(avg(goal_pct(id)), 1) INTO v_avg FROM goals
    WHERE org_id = v_org AND cycle_id = v_cycle AND NOT archived;
  SELECT count(*) INTO v_overdue FROM tasks
    WHERE org_id = v_org AND NOT done AND due_date IS NOT NULL AND due_date < v_today;

  RETURN jsonb_build_object(
    'warriors', v_warriors,
    'present_today', v_present,
    'on_leave_today', v_leave,
    'goals_written', v_with_goals,
    'avg_progress', coalesce(v_avg, 0),
    'tasks_overdue', v_overdue,
    'cycle_id', v_cycle
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.update_org_settings(p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF my_role() IS NULL OR my_role() NOT IN ('hr','admin') THEN
    RAISE EXCEPTION 'Only HR or Admin may change company settings.';
  END IF;
  UPDATE organisations SET settings = coalesce(settings,'{}'::jsonb) || p_patch
   WHERE id = my_org() RETURNING settings INTO v;
  RETURN v;
END $function$
;

-- ── RLS: nobody may approve their own leave ────────────────────
DROP POLICY IF EXISTS "decide or amend leave" ON public.leave_requests;
DROP POLICY IF EXISTS "amend own pending leave" ON public.leave_requests;
CREATE POLICY "amend own pending leave" ON public.leave_requests
  FOR UPDATE
  USING ((org_id = my_org()) AND (profile_id = my_profile_id()) AND (status = 'pending'::text))
  WITH CHECK ((org_id = my_org()) AND (profile_id = my_profile_id()) AND (status = 'pending'::text));

DROP POLICY IF EXISTS "decide leave for someone else" ON public.leave_requests;
CREATE POLICY "decide leave for someone else" ON public.leave_requests
  FOR UPDATE
  USING ((org_id = my_org()) AND (profile_id <> my_profile_id()) AND ((approver_id = my_profile_id()) OR manages(profile_id) OR (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))))
  WITH CHECK ((org_id = my_org()) AND (profile_id <> my_profile_id()) AND ((approver_id = my_profile_id()) OR manages(profile_id) OR (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))));

DROP POLICY IF EXISTS "update own or downline tasks" ON public.tasks;
CREATE POLICY "update own or downline tasks" ON public.tasks
  FOR UPDATE
  USING ((org_id = my_org()) AND ((owner_id = my_profile_id()) OR (created_by = my_profile_id()) OR manages(owner_id) OR (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))))
  WITH CHECK ((org_id = my_org()) AND ((owner_id = my_profile_id()) OR manages(owner_id) OR (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))));

-- ── signed-out callers may not run these ───────────────────────
REVOKE EXECUTE ON FUNCTION public.birthday_nudges() FROM anon;
REVOKE EXECUTE ON FUNCTION public.checkin_talked(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_checkin(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_leave_quotas(numeric, numeric, date) FROM anon;

-- calendar_feed(uuid) stays executable by anon on purpose: it is the ICS
-- subscription endpoint, guarded by a private per-person UUID token.