-- ═══ REPORT CENTRE ═══
-- report_run(report, from, to) returns one table, ready to show and to export:
--   { title, subtitle, columns: [{key, label}], rows: [ {key: value, ...} ] }
-- Managers can run the people reports for their own line; HR and admin can run all of them.
--
--   attendance   per person: working days, present, late, WFH, half days, leave, absent, attendance %
--   tasks        per person: tasks due in the range, completed, on time, pending, in review, overdue
--   activity     per person: days in, tasks completed, goal numbers logged, weekly reviews, comments
--   goals        one row per goal in the active cycle: status, progress, even pace, milestones
--   department   per department: the people numbers rolled up           (HR / admin)
--   manager      per manager:    the people numbers rolled up           (HR / admin)
--   leave        every leave request that touches the range             (HR / admin)
--   earned_leave credits and lapses in the range, with the calculation  (HR / admin)
--   holidays     the holiday calendar in the range                      (HR / admin)
--   probation    everyone's probation, soonest end first                (HR / admin)
--   birthdays    birthdays that fall in the range                       (HR / admin)

-- Per-person numbers behind the people reports. Internal: report_run does the access check.
CREATE OR REPLACE FUNCTION public.report_person_metrics(p_from date, p_to date)
RETURNS TABLE (
  profile_id uuid, full_name text, department text, manager_id uuid, manager_name text,
  working_days integer, present integer, late integer, wfh integer, half_day integer,
  leave_days integer, absent integer, attendance_pct numeric,
  tasks_assigned integer, tasks_completed integer, tasks_on_time integer, tasks_pending integer,
  tasks_review integer, tasks_overdue integer, tasks_completion_pct numeric,
  goals_total integer, goals_on_track integer, goals_at_risk integer, goals_overdue integer,
  goals_completed integer,
  goal_entries integer, weekly_reviews integer, task_comments integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hr boolean := my_role() = ANY (ARRAY['hr', 'admin']);
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cycle uuid;
BEGIN
  SELECT c.id INTO v_cycle FROM cycles c WHERE c.org_id = my_org() AND c.status = 'active'
   ORDER BY c.start_date DESC LIMIT 1;

  RETURN QUERY
  WITH scope AS (
    SELECT p.id, p.full_name, p.department, p.manager_id
      FROM profiles p
     WHERE p.org_id = my_org() AND p.status = 'active' AND (v_hr OR manages(p.id))
  ), att AS (
    SELECT s.id AS pid,
           count(*) FILTER (WHERE k.kind IN ('present', 'late', 'wfh', 'half_day', 'absent', 'leave'))::integer AS working_days,
           count(*) FILTER (WHERE k.kind IN ('present', 'late'))::integer AS present,
           count(*) FILTER (WHERE k.kind = 'late')::integer AS late,
           count(*) FILTER (WHERE k.kind = 'wfh')::integer AS wfh,
           count(*) FILTER (WHERE k.kind = 'half_day')::integer AS half_day,
           count(*) FILTER (WHERE k.kind = 'leave')::integer AS leave_days,
           count(*) FILTER (WHERE k.kind = 'absent')::integer AS absent
      FROM scope s
      CROSS JOIN generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
      CROSS JOIN LATERAL (SELECT attendance_day_info(s.id, d::date)->>'kind' AS kind) k
     GROUP BY s.id
  ), tk AS (
    SELECT t.owner_id AS pid,
           count(*)::integer AS assigned,
           count(*) FILTER (WHERE t.status = 'completed')::integer AS completed,
           count(*) FILTER (WHERE t.status = 'completed' AND t.due_date IS NOT NULL
                              AND (t.done_at AT TIME ZONE 'Asia/Kolkata')::date <= t.due_date)::integer AS on_time,
           count(*) FILTER (WHERE t.status <> 'completed')::integer AS pending,
           count(*) FILTER (WHERE t.status = 'review')::integer AS in_review,
           count(*) FILTER (WHERE t.status <> 'completed' AND t.due_date < v_today)::integer AS overdue
      FROM tasks t
     WHERE t.owner_id IN (SELECT id FROM scope)
       AND (t.due_date BETWEEN p_from AND p_to
            OR (t.due_date IS NULL AND (t.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to))
     GROUP BY t.owner_id
  ), gl AS (
    SELECT g.profile_id AS pid,
           count(*)::integer AS total,
           count(*) FILTER (WHERE s.info->>'status' = 'on_track')::integer AS on_track,
           count(*) FILTER (WHERE s.info->>'status' = 'at_risk')::integer AS at_risk,
           count(*) FILTER (WHERE s.info->>'status' = 'overdue')::integer AS overdue,
           count(*) FILTER (WHERE s.info->>'status' = 'completed')::integer AS completed
      FROM goals g CROSS JOIN LATERAL goal_status_info(g.id) AS s(info)
     WHERE g.cycle_id = v_cycle AND g.archived = false AND g.profile_id IN (SELECT id FROM scope)
     GROUP BY g.profile_id
  )
  SELECT s.id, s.full_name, s.department, s.manager_id,
         (SELECT m.full_name FROM profiles m WHERE m.id = s.manager_id),
         coalesce(a.working_days, 0), coalesce(a.present, 0), coalesce(a.late, 0), coalesce(a.wfh, 0),
         coalesce(a.half_day, 0), coalesce(a.leave_days, 0), coalesce(a.absent, 0),
         round(100.0 * (coalesce(a.present, 0) + coalesce(a.wfh, 0) + 0.5 * coalesce(a.half_day, 0))
               / nullif(coalesce(a.working_days, 0) - coalesce(a.leave_days, 0), 0), 1),
         coalesce(k.assigned, 0), coalesce(k.completed, 0), coalesce(k.on_time, 0), coalesce(k.pending, 0),
         coalesce(k.in_review, 0), coalesce(k.overdue, 0),
         round(100.0 * coalesce(k.completed, 0) / nullif(coalesce(k.assigned, 0), 0), 1),
         coalesce(g.total, 0), coalesce(g.on_track, 0), coalesce(g.at_risk, 0), coalesce(g.overdue, 0),
         coalesce(g.completed, 0),
         (SELECT count(*)::integer FROM goal_entries e JOIN goals gg ON gg.id = e.goal_id
           WHERE gg.profile_id = s.id AND e.date BETWEEN p_from AND p_to),
         (SELECT count(*)::integer FROM weekly_reviews w WHERE w.profile_id = s.id AND w.week_start BETWEEN p_from - 6 AND p_to),
         (SELECT count(*)::integer FROM task_comments c WHERE c.author_id = s.id
             AND (c.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to)
    FROM scope s
    LEFT JOIN att a ON a.pid = s.id
    LEFT JOIN tk k ON k.pid = s.id
    LEFT JOIN gl g ON g.pid = s.id
   ORDER BY s.full_name;
END $$;
REVOKE ALL ON FUNCTION public.report_person_metrics(date, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_person_metrics(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.report_run(p_report text, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_from date := coalesce(p_from, date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::timestamp)::date);
  v_to date := coalesce(p_to, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_hr boolean := my_role() = ANY (ARRAY['hr', 'admin']);
  v_title text;
  v_note text;
  v_cols jsonb;
  v_rows jsonb;
  v_cycle uuid;
  v_range text;
BEGIN
  IF NOT (v_hr OR my_role() = 'manager') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_report NOT IN ('attendance', 'tasks', 'activity', 'goals', 'department', 'manager', 'leave',
                      'earned_leave', 'holidays', 'probation', 'birthdays') THEN
    RAISE EXCEPTION 'Unknown report.';
  END IF;
  IF p_report IN ('department', 'manager', 'leave', 'earned_leave', 'holidays', 'probation', 'birthdays')
     AND NOT v_hr THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_to < v_from THEN RAISE EXCEPTION 'The end date is before the start date.'; END IF;
  IF p_report IN ('attendance', 'activity', 'department', 'manager', 'tasks') AND v_to - v_from > 92 THEN
    RAISE EXCEPTION 'Pick a range of at most 93 days.';
  END IF;
  IF v_to - v_from > 731 THEN RAISE EXCEPTION 'Pick a range of at most two years.'; END IF;

  v_range := to_char(v_from, 'FMDD Mon YYYY') || ' to ' || to_char(v_to, 'FMDD Mon YYYY');

  IF p_report = 'attendance' THEN
    v_title := 'Attendance';
    v_note := v_range || '. Attendance % counts present and work-from-home days, and half days as half, out of working days minus approved leave.';
    v_cols := '[{"key":"name","label":"Warrior"},{"key":"department","label":"Department"},{"key":"working_days","label":"Working days"},{"key":"present","label":"Present"},{"key":"late","label":"Late"},{"key":"wfh","label":"Work from home"},{"key":"half_day","label":"Half days"},{"key":"leave","label":"On leave"},{"key":"absent","label":"Absent"},{"key":"attendance_pct","label":"Attendance %"}]';
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', m.full_name, 'department', m.department, 'working_days', m.working_days,
             'present', m.present, 'late', m.late, 'wfh', m.wfh, 'half_day', m.half_day,
             'leave', m.leave_days, 'absent', m.absent, 'attendance_pct', m.attendance_pct)
           ORDER BY m.full_name), '[]'::jsonb) INTO v_rows FROM report_person_metrics(v_from, v_to) m;

  ELSIF p_report = 'tasks' THEN
    v_title := 'Tasks';
    v_note := v_range || '. Tasks that were due in the range, plus undated tasks created in it.';
    v_cols := '[{"key":"name","label":"Warrior"},{"key":"department","label":"Department"},{"key":"assigned","label":"Tasks"},{"key":"completed","label":"Completed"},{"key":"on_time","label":"Completed on time"},{"key":"pending","label":"Pending"},{"key":"in_review","label":"In review"},{"key":"overdue","label":"Overdue"},{"key":"completion_pct","label":"Completion %"}]';
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', m.full_name, 'department', m.department, 'assigned', m.tasks_assigned,
             'completed', m.tasks_completed, 'on_time', m.tasks_on_time, 'pending', m.tasks_pending,
             'in_review', m.tasks_review, 'overdue', m.tasks_overdue, 'completion_pct', m.tasks_completion_pct)
           ORDER BY m.full_name), '[]'::jsonb) INTO v_rows FROM report_person_metrics(v_from, v_to) m;

  ELSIF p_report = 'activity' THEN
    v_title := 'Work and activity';
    v_note := v_range || '.';
    v_cols := '[{"key":"name","label":"Warrior"},{"key":"department","label":"Department"},{"key":"days_in","label":"Days in"},{"key":"tasks_completed","label":"Tasks completed"},{"key":"goal_entries","label":"Goal numbers logged"},{"key":"weekly_reviews","label":"Weekly reviews"},{"key":"task_comments","label":"Task comments"}]';
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', m.full_name, 'department', m.department, 'days_in', m.present + m.wfh + m.half_day,
             'tasks_completed', m.tasks_completed, 'goal_entries', m.goal_entries,
             'weekly_reviews', m.weekly_reviews, 'task_comments', m.task_comments)
           ORDER BY m.full_name), '[]'::jsonb) INTO v_rows FROM report_person_metrics(v_from, v_to) m;

  ELSIF p_report = 'goals' THEN
    v_title := 'Goal progress';
    SELECT c.id, 'Cycle: ' || c.name || ' (' || to_char(c.start_date, 'FMDD Mon') || ' to ' || to_char(c.end_date, 'FMDD Mon YYYY') || ').'
      INTO v_cycle, v_note FROM cycles c WHERE c.org_id = my_org() AND c.status = 'active'
     ORDER BY c.start_date DESC LIMIT 1;
    v_note := coalesce(v_note, 'No goal cycle is running.') || ' Progress is measured from the baseline to the target; the even pace is where progress would be today if it grew steadily through the cycle.';
    v_cols := '[{"key":"name","label":"Warrior"},{"key":"department","label":"Department"},{"key":"goal","label":"Goal"},{"key":"status","label":"Status"},{"key":"progress_pct","label":"Progress %"},{"key":"even_pace_pct","label":"Even pace %"},{"key":"milestones","label":"Milestones"},{"key":"last_update","label":"Last number logged"},{"key":"comments","label":"Comments"}]';
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', p.full_name, 'department', p.department, 'goal', g.name,
             'status', initcap(replace(s.info->>'status', '_', ' ')),
             'progress_pct', (s.info->>'pct')::numeric, 'even_pace_pct', (s.info->>'expected_pct')::numeric,
             'milestones', (SELECT count(*) FILTER (WHERE m.done) || '/' || count(*) FROM goal_milestones m WHERE m.goal_id = g.id),
             'last_update', (SELECT max(e.date) FROM goal_entries e WHERE e.goal_id = g.id),
             'comments', (SELECT count(*) FROM goal_comments k WHERE k.goal_id = g.id))
           ORDER BY p.full_name, g.created_at), '[]'::jsonb)
      INTO v_rows
      FROM goals g JOIN profiles p ON p.id = g.profile_id
      CROSS JOIN LATERAL goal_status_info(g.id) AS s(info)
     WHERE g.cycle_id = v_cycle AND g.archived = false AND p.status = 'active'
       AND p.org_id = my_org() AND (v_hr OR manages(p.id));

  ELSIF p_report IN ('department', 'manager') THEN
    v_title := CASE WHEN p_report = 'department' THEN 'Department performance' ELSE 'Manager performance' END;
    v_note := v_range || '. Rolled up from each person: attendance, tasks due in the range, and goals in the active cycle.';
    v_cols := CASE WHEN p_report = 'department'
      THEN '[{"key":"group","label":"Department"}'
      ELSE '[{"key":"group","label":"Manager"}' END
      || ',{"key":"people","label":"People"},{"key":"attendance_pct","label":"Attendance %"},{"key":"late","label":"Late days"},{"key":"absent","label":"Absent days"},{"key":"tasks","label":"Tasks"},{"key":"completion_pct","label":"Completion %"},{"key":"overdue","label":"Overdue"},{"key":"goals","label":"Goals"},{"key":"on_track","label":"On track"},{"key":"at_risk","label":"At risk"},{"key":"goals_overdue","label":"Goals overdue"}]';
    v_cols := v_cols::text::jsonb;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'group', x.grp, 'people', x.people,
             'attendance_pct', round(100.0 * (x.present + x.wfh + 0.5 * x.half) / nullif(x.working - x.leave_days, 0), 1),
             'late', x.late, 'absent', x.absent, 'tasks', x.tasks,
             'completion_pct', round(100.0 * x.done / nullif(x.tasks, 0), 1),
             'overdue', x.overdue, 'goals', x.goals, 'on_track', x.on_track, 'at_risk', x.at_risk,
             'goals_overdue', x.goals_overdue) ORDER BY x.grp), '[]'::jsonb)
      INTO v_rows FROM (
        SELECT CASE WHEN p_report = 'department' THEN coalesce(m.department, 'No department')
                    ELSE coalesce(m.manager_name, 'No manager') END AS grp,
               count(*)::integer AS people,
               sum(m.present)::integer AS present, sum(m.wfh)::integer AS wfh, sum(m.half_day)::integer AS half,
               sum(m.working_days)::integer AS working, sum(m.leave_days)::integer AS leave_days,
               sum(m.late)::integer AS late, sum(m.absent)::integer AS absent,
               sum(m.tasks_assigned)::integer AS tasks, sum(m.tasks_completed)::integer AS done,
               sum(m.tasks_overdue)::integer AS overdue, sum(m.goals_total)::integer AS goals,
               sum(m.goals_on_track)::integer AS on_track, sum(m.goals_at_risk)::integer AS at_risk,
               sum(m.goals_overdue)::integer AS goals_overdue
          FROM report_person_metrics(v_from, v_to) m GROUP BY 1) x;

  ELSIF p_report = 'leave' THEN
    v_title := 'Leave';
    v_note := v_range || '. Every request that touches the range.';
    v_cols := '[{"key":"name","label":"Warrior"},{"key":"department","label":"Department"},{"key":"type","label":"Type"},{"key":"from","label":"From"},{"key":"to","label":"To"},{"key":"days","label":"Days"},{"key":"half_day","label":"Half day"},{"key":"status","label":"Status"},{"key":"decided_by","label":"Decided by"},{"key":"decided_on","label":"Decided on"}]';
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', p.full_name, 'department', p.department, 'type', l.type, 'from', l.from_date,
             'to', l.to_date, 'days', l.days, 'half_day', CASE WHEN l.half_day THEN 'Yes' ELSE 'No' END,
             'status', initcap(l.status), 'decided_by', (SELECT d.full_name FROM profiles d WHERE d.id = l.decided_by),
             'decided_on', (l.decided_at AT TIME ZONE 'Asia/Kolkata')::date)
           ORDER BY l.from_date, p.full_name), '[]'::jsonb)
      INTO v_rows FROM leave_requests l JOIN profiles p ON p.id = l.profile_id
     WHERE l.org_id = my_org() AND l.from_date <= v_to AND l.to_date >= v_from;

  ELSIF p_report = 'earned_leave' THEN
    v_title := 'Earned leave transactions';
    v_note := v_range || '. Each automatic credit with the working days it was calculated from, and any yearly lapse.';
    v_cols := '[{"key":"name","label":"Warrior"},{"key":"department","label":"Department"},{"key":"date","label":"Date"},{"key":"kind","label":"Kind"},{"key":"days","label":"Days"},{"key":"balance","label":"Balance"},{"key":"period","label":"Working-day period"},{"key":"eligible_days","label":"Eligible days"},{"key":"source","label":"Source"}]';
    SELECT coalesce(jsonb_agg(x.j ORDER BY x.d, x.n), '[]'::jsonb) INTO v_rows FROM (
      SELECT (l.created_at AT TIME ZONE 'Asia/Kolkata')::date AS d, p.full_name AS n,
             jsonb_build_object(
               'name', p.full_name, 'department', p.department,
               'date', (l.created_at AT TIME ZONE 'Asia/Kolkata')::date, 'kind', 'Credit',
               'days', l.credited, 'balance', l.previous_balance || ' → ' || l.new_balance,
               'period', to_char(l.period_start, 'FMDD Mon YYYY') || ' to ' || to_char(l.period_end, 'FMDD Mon YYYY'),
               'eligible_days', l.eligible_days, 'source', l.source) AS j
        FROM el_ledger l JOIN profiles p ON p.id = l.profile_id
       WHERE l.org_id = my_org() AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to
      UNION ALL
      SELECT z.lapse_on, p.full_name,
             jsonb_build_object(
               'name', p.full_name, 'department', p.department, 'date', z.lapse_on, 'kind', 'Lapse',
               'days', -z.amount, 'balance', z.balance_before || ' → ' || z.balance_after,
               'period', 'Carry-forward limit ' || z.carry_limit, 'eligible_days', NULL, 'source', 'system')
        FROM el_lapses z JOIN profiles p ON p.id = z.profile_id
       WHERE z.org_id = my_org() AND z.lapse_on BETWEEN v_from AND v_to) x;

  ELSIF p_report = 'holidays' THEN
    v_title := 'Holidays';
    v_note := v_range || '. Only approved national, regional and company holidays are days off for everyone.';
    v_cols := '[{"key":"date","label":"Date"},{"key":"day","label":"Day"},{"key":"name","label":"Holiday"},{"key":"kind","label":"Type"},{"key":"status","label":"Status"},{"key":"region","label":"Region"}]';
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'date', h.date, 'day', to_char(h.date, 'FMDay'), 'name', h.name, 'kind', initcap(h.kind),
             'status', initcap(h.status), 'region', h.region) ORDER BY h.date, h.name), '[]'::jsonb)
      INTO v_rows FROM holiday_calendar h
     WHERE h.org_id = my_org() AND h.date BETWEEN v_from AND v_to;

  ELSIF p_report = 'probation' THEN
    v_title := 'Probation';
    v_note := 'Everyone with a probation record, open ones first. The date range is not used.';
    v_cols := '[{"key":"name","label":"Warrior"},{"key":"department","label":"Department"},{"key":"manager","label":"Manager"},{"key":"start","label":"Started"},{"key":"end","label":"Ends"},{"key":"status","label":"Status"},{"key":"days_left","label":"Days left"},{"key":"decisions","label":"Decisions"}]';
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', p.full_name, 'department', p.department,
             'manager', (SELECT m.full_name FROM profiles m WHERE m.id = p.manager_id),
             'start', pr.start_date, 'end', pr.end_date,
             'status', CASE pr.status WHEN 'on_probation' THEN 'On probation' WHEN 'under_review' THEN 'Under review' ELSE 'Confirmed' END,
             'days_left', CASE WHEN pr.status = 'confirmed' THEN NULL ELSE pr.end_date - v_today END,
             'decisions', (SELECT count(*) FROM probation_decisions d WHERE d.profile_id = p.id))
           ORDER BY (pr.status = 'confirmed'), pr.end_date, p.full_name), '[]'::jsonb)
      INTO v_rows FROM probations pr JOIN profiles p ON p.id = pr.profile_id
     WHERE p.org_id = my_org() AND p.status = 'active';

  ELSE  -- birthdays
    v_title := 'Birthdays';
    v_note := v_range || '. Dates are the next time each birthday falls on or after the start date.';
    v_cols := '[{"key":"name","label":"Warrior"},{"key":"department","label":"Department"},{"key":"date","label":"Birthday"},{"key":"day","label":"Day"},{"key":"days_to_go","label":"Days to go"}]';
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', b.full_name, 'department', b.department, 'date', b.nb, 'day', to_char(b.nb, 'FMDay'),
             'days_to_go', GREATEST(b.nb - v_today, 0)) ORDER BY b.nb, b.full_name), '[]'::jsonb)
      INTO v_rows FROM (
        SELECT p.full_name, p.department, birthday_next(p.birthday, v_from) AS nb
          FROM profiles p WHERE p.org_id = my_org() AND p.status = 'active' AND p.birthday IS NOT NULL) b
     WHERE b.nb IS NOT NULL AND b.nb <= v_to;
  END IF;

  RETURN jsonb_build_object('report', p_report, 'title', v_title, 'subtitle', v_note,
                            'columns', v_cols, 'rows', coalesce(v_rows, '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.report_run(text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.report_run(text, date, date) TO authenticated;
