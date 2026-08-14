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

  IF p_to < p_from THEN
    v_errors := v_errors || 'The last day cannot be before the first day.';
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
      v_errors := v_errors || format(
        'Casual leave is capped at %s per quarter. You already have %s in Q%s.',
        coalesce(v_cap, 2), v_qcount, v_quarter);
    END IF;
    IF v_notice < 7 THEN
      v_warnings := v_warnings || 'This is less than 7 days'' notice — please give your team a heads-up.';
    END IF;
  END IF;

  IF p_type = 'earned' THEN
    v_summary := attendance_summary(v_target);
    IF coalesce(v_bal, 0) <= 0 THEN
      v_errors := v_errors || format(
        'You have no earned leave yet — 1 is earned for every 20 days worked. You are at %s day(s) in the app.',
        coalesce((v_summary->>'days_marked')::int, 0));
    END IF;
    IF v_notice < 30 THEN
      v_warnings := v_warnings || 'Earned leave usually needs 30 days'' notice so cover can be planned.';
    END IF;
  END IF;

  -- Illness must never carry friction: no balance warning, no blocker, no sandwich rule.
  IF p_type IN ('casual','earned','comp_off') AND coalesce(v_bal, 0) > 0 AND v_days > v_bal THEN
    v_warnings := v_warnings || format(
      'This is more than your balance of %s day(s) — the extra will be unpaid.', v_bal);
  END IF;

  IF p_type IN ('casual','comp_off') AND coalesce(v_bal, 0) <= 0 THEN
    v_errors := v_errors || format('You have no %s leave left this year.', replace(p_type, '_', '-'));
  END IF;

  IF p_type <> 'sick' THEN
    v_msg := leave_sandwich_conflict(v_target, p_from, p_to, NULL);
    IF v_msg IS NOT NULL THEN
      v_errors := v_errors || v_msg;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'days', v_days);
END $function$;

CREATE OR REPLACE FUNCTION public.leave_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bal numeric; v_q numeric; v_msg text; v_days numeric; v_cap numeric;
BEGIN
  IF NEW.to_date < NEW.from_date THEN
    RAISE EXCEPTION 'The last day cannot be before the first day.';
  END IF;

  NEW.days := CASE WHEN NEW.half_day THEN 0.5 ELSE (NEW.to_date - NEW.from_date) + 1 END;
  v_days := NEW.days;

  IF TG_OP = 'INSERT' OR NEW.from_date <> OLD.from_date OR NEW.to_date <> OLD.to_date
     OR NEW.type <> OLD.type THEN

    IF NEW.type = 'casual' THEN
      SELECT coalesce((o.settings->>'casual_quarter_cap')::numeric, 2) INTO v_cap
        FROM organisations o JOIN profiles p ON p.org_id = o.id WHERE p.id = NEW.profile_id;
      v_cap := coalesce(v_cap, 2);
      SELECT coalesce(sum(days), 0) INTO v_q FROM leave_requests
        WHERE profile_id = NEW.profile_id AND type = 'casual' AND status IN ('pending','approved')
          AND id <> NEW.id
          AND extract(year FROM from_date) = extract(year FROM NEW.from_date)
          AND extract(quarter FROM from_date) = extract(quarter FROM NEW.from_date);
      IF v_q + v_days > v_cap THEN
        RAISE EXCEPTION 'Casual leave is capped at % per quarter. You already have % in Q%.',
          v_cap, v_q, extract(quarter FROM NEW.from_date)::int;
      END IF;
    END IF;

    IF NEW.type = 'earned' THEN
      SELECT (e->>'balance')::numeric INTO v_bal
        FROM jsonb_array_elements(leave_balances(NEW.profile_id)) e WHERE e->>'type' = 'earned';
      IF coalesce(v_bal, 0) <= 0 THEN
        RAISE EXCEPTION 'You have no earned leave yet — 1 is earned for every 20 days worked.';
      END IF;
    END IF;

    IF NEW.type <> 'sick' THEN
      v_msg := leave_sandwich_conflict(NEW.profile_id, NEW.from_date, NEW.to_date, NEW.id);
      IF v_msg IS NOT NULL THEN RAISE EXCEPTION '%', v_msg; END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.approver_id IS NULL THEN
    NEW.approver_id := leave_approver_for(NEW.profile_id);
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.goal_pct(p_goal_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (goal_progress(p_goal_id)->>'pct')::numeric;
END $function$;

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
  IF v_role NOT IN ('manager','hr','admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;

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
END $function$;

CREATE OR REPLACE FUNCTION public.cycles_sync_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM events WHERE cycle_id = NEW.id;
  INSERT INTO events (org_id, cycle_id, name, type, date, location, created_by)
  VALUES (NEW.org_id, NEW.id, NEW.name, 'Meeting',
          NEW.end_date, 'Strategic meeting', NEW.created_by);
  RETURN NEW;
END $function$;