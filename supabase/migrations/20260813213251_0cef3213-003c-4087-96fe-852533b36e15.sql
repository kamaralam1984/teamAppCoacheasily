-- helper: achievement % of one goal, same maths as goal_progress
CREATE OR REPLACE FUNCTION public.goal_pct(p_goal_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g record;
  v_n int;
  v_first numeric;
  v_last numeric;
  v_cur numeric;
BEGIN
  SELECT * INTO g FROM goals WHERE id = p_goal_id;
  IF g.id IS NULL THEN RETURN NULL; END IF;

  IF g.kind = 'funnel' THEN
    v_n := coalesce(array_length(g.stages, 1), 0);
    IF v_n < 2 THEN RETURN 0; END IF;
    SELECT coalesce(sum(coalesce(counts[1], 0)), 0),
           coalesce(sum(coalesce(counts[v_n], 0)), 0)
      INTO v_first, v_last
      FROM goal_entries WHERE goal_id = g.id;
    v_cur := CASE WHEN v_first > 0 THEN v_last / v_first * 100 ELSE 0 END;
  ELSE
    SELECT value INTO v_cur FROM goal_entries
      WHERE goal_id = g.id AND value IS NOT NULL ORDER BY date DESC LIMIT 1;
    v_cur := coalesce(v_cur, g.baseline);
  END IF;

  IF g.target IS DISTINCT FROM g.baseline THEN
    RETURN round(greatest(0, least(100, (v_cur - g.baseline) / (g.target - g.baseline) * 100)), 1);
  END IF;
  RETURN 0;
END $$;

-- A1/A2 — appraisal matrix, People & Culture only
CREATE OR REPLACE FUNCTION public.appraisal_matrix()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := my_org();
  v_cycles jsonb;
  v_rows jsonb;
BEGIN
  IF my_role() NOT IN ('hr', 'admin') THEN
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
END $$;

-- A4 — leave ledger, People & Culture only
CREATE OR REPLACE FUNCTION public.leave_ledger()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := my_org();
  v_out jsonb := '[]'::jsonb;
  p record;
  b jsonb;
  v_worked int;
BEGIN
  IF my_role() NOT IN ('hr', 'admin') THEN
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
END $$;

-- A5 — team health, People & Culture only
CREATE OR REPLACE FUNCTION public.team_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  IF my_role() NOT IN ('hr', 'admin') THEN
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
END $$;