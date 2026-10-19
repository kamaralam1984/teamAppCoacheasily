-- ═══ MANAGER / HR / BOSS DASHBOARDS ═══
-- Two read-only functions feed the Overview screen:
--   dash_team()  one row per person in scope: today's attendance, tasks, goals, pending leave
--                (HR / admin: everyone; a manager: their line)
--   dash_hr()    organisation-wide HR numbers (HR / admin only)
-- Nothing here writes anything.

CREATE OR REPLACE FUNCTION public.dash_team() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_hr boolean := my_role() = ANY (ARRAY['hr', 'admin']);
  v_cycle uuid;
  v_rows jsonb;
BEGIN
  IF NOT (v_hr OR my_role() = 'manager') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT id INTO v_cycle FROM cycles WHERE org_id = my_org() AND status = 'active'
   ORDER BY start_date DESC LIMIT 1;

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.department NULLS LAST, t.full_name), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT p.id AS profile_id, p.full_name, p.department, p.title, p.role, p.manager_id,
             (SELECT m.full_name FROM profiles m WHERE m.id = p.manager_id) AS manager_name,
             attendance_day_info(p.id, v_today) AS today,
             (SELECT jsonb_build_object(
                 'open', count(*) FILTER (WHERE k.status <> 'completed'),
                 'assigned', count(*) FILTER (WHERE k.status = 'assigned'),
                 'in_progress', count(*) FILTER (WHERE k.status IN ('accepted', 'in_progress')),
                 'review', count(*) FILTER (WHERE k.status = 'review'),
                 'overdue', count(*) FILTER (WHERE k.status <> 'completed' AND k.due_date < v_today),
                 'completed_7d', count(*) FILTER (WHERE k.status = 'completed' AND k.done_at >= now() - interval '7 days'))
                FROM tasks k WHERE k.owner_id = p.id) AS tasks,
             (SELECT jsonb_build_object(
                 'total', count(*),
                 'on_track', count(*) FILTER (WHERE s.info->>'status' = 'on_track'),
                 'at_risk', count(*) FILTER (WHERE s.info->>'status' = 'at_risk'),
                 'overdue', count(*) FILTER (WHERE s.info->>'status' = 'overdue'),
                 'completed', count(*) FILTER (WHERE s.info->>'status' = 'completed'))
                FROM goals g CROSS JOIN LATERAL goal_status_info(g.id) AS s(info)
               WHERE g.profile_id = p.id AND g.cycle_id = v_cycle AND g.archived = false) AS goals,
             (SELECT count(*) FROM leave_requests l
               WHERE l.profile_id = p.id AND l.status = 'pending') AS pending_leave
        FROM profiles p
       WHERE p.org_id = my_org() AND p.status = 'active' AND (v_hr OR manages(p.id))
    ) t;

  RETURN jsonb_build_object('scope', CASE WHEN v_hr THEN 'organisation' ELSE 'line' END,
                            'today', v_today, 'rows', v_rows);
END $$;
REVOKE ALL ON FUNCTION public.dash_team() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dash_team() TO authenticated;

CREATE OR REPLACE FUNCTION public.dash_hr() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cycle uuid;
  v_last date;
  v_skip integer;
  v_active integer;
  i integer;
  v_attendance jsonb;
  v_absent jsonb;
  v_late jsonb;
BEGIN
  IF NOT (my_role() = ANY (ARRAY['hr', 'admin'])) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT id INTO v_cycle FROM cycles WHERE org_id = v_org AND status = 'active'
   ORDER BY start_date DESC LIMIT 1;
  SELECT count(*) INTO v_active FROM profiles WHERE org_id = v_org AND status = 'active';

  -- Today, by kind
  SELECT coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) INTO v_attendance FROM (
    SELECT attendance_day_info(p.id, v_today)->>'kind' AS kind, count(*) AS n
      FROM profiles p WHERE p.org_id = v_org AND p.status = 'active' GROUP BY 1) x;

  -- The most recent day that was an ordinary working day for most people
  v_last := v_today - 1;
  FOR i IN 1..7 LOOP
    SELECT count(*) INTO v_skip FROM profiles p
     WHERE p.org_id = v_org AND p.status = 'active'
       AND attendance_day_info(p.id, v_last)->>'kind' IN ('holiday', 'weekly_off', 'not_joined');
    EXIT WHEN v_active = 0 OR v_skip * 10 < v_active * 7;
    v_last := v_last - 1;
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object('profile_id', id, 'full_name', full_name) ORDER BY full_name), '[]'::jsonb)
    INTO v_absent FROM profiles p
    WHERE p.org_id = v_org AND p.status = 'active'
     AND attendance_day_info(p.id, v_last)->>'kind' = 'absent';
  SELECT coalesce(jsonb_agg(jsonb_build_object('profile_id', id, 'full_name', full_name,
                                               'check_in', attendance_day_info(p.id, v_last)->>'check_in')
                           ORDER BY full_name), '[]'::jsonb)
    INTO v_late FROM profiles p
   WHERE p.org_id = v_org AND p.status = 'active'
     AND attendance_day_info(p.id, v_last)->>'kind' = 'late';

  RETURN jsonb_build_object(
    'today', v_today,
    'headcount', jsonb_build_object(
      'active', v_active,
      'exited', (SELECT count(*) FROM profiles WHERE org_id = v_org AND status = 'exited')),
    'new_joiners', (SELECT coalesce(jsonb_agg(jsonb_build_object(
         'profile_id', id, 'full_name', full_name, 'joined_on', joined_on) ORDER BY joined_on DESC), '[]'::jsonb)
       FROM profiles WHERE org_id = v_org AND status = 'active' AND joined_on >= v_today - 30),
    'probation', jsonb_build_object(
      'on_probation', (SELECT count(*) FROM probations pr JOIN profiles p ON p.id = pr.profile_id
                        WHERE p.org_id = v_org AND p.status = 'active' AND pr.status <> 'confirmed'),
      'ending_soon', (SELECT coalesce(jsonb_agg(jsonb_build_object(
           'profile_id', p.id, 'full_name', p.full_name, 'end_date', pr.end_date,
           'days_left', pr.end_date - v_today, 'status', pr.status) ORDER BY pr.end_date), '[]'::jsonb)
         FROM probations pr JOIN profiles p ON p.id = pr.profile_id
        WHERE p.org_id = v_org AND p.status = 'active' AND pr.status <> 'confirmed'
          AND pr.end_date <= v_today + 14)),
    'leave', jsonb_build_object(
      'pending_count', (SELECT count(*) FROM leave_requests WHERE org_id = v_org AND status = 'pending'),
      'pending', (SELECT coalesce(jsonb_agg(x ORDER BY x.from_date), '[]'::jsonb) FROM (
         SELECT l.id, l.profile_id, p.full_name, l.type, l.from_date, l.to_date, l.days
            FROM leave_requests l JOIN profiles p ON p.id = l.profile_id
          WHERE l.org_id = v_org AND l.status = 'pending'
          ORDER BY l.from_date LIMIT 8) x)),
    'attendance', jsonb_build_object(
      'today', v_attendance, 'last_working_day', v_last, 'absent', v_absent, 'late', v_late),
    'earned_leave', jsonb_build_object(
      'credits_30d', (SELECT count(*) FROM el_ledger WHERE org_id = v_org AND created_at >= now() - interval '30 days'),
      'lapses_30d', (SELECT count(*) FROM el_lapses WHERE org_id = v_org AND created_at >= now() - interval '30 days'),
      'exceptions', (SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) FROM (
         SELECT l.profile_id, p.full_name, 'capped' AS kind, l.amount - l.credited AS days, l.created_at
            FROM el_ledger l JOIN profiles p ON p.id = l.profile_id
          WHERE l.org_id = v_org AND l.credited < l.amount AND l.created_at >= now() - interval '60 days'
         UNION ALL
         SELECT z.profile_id, p.full_name, 'lapsed', z.amount, z.created_at
           FROM el_lapses z JOIN profiles p ON p.id = z.profile_id
          WHERE z.org_id = v_org AND z.created_at >= now() - interval '60 days'
         ORDER BY created_at DESC LIMIT 10) x)),
    'goals', (SELECT jsonb_build_object(
         'total', count(*),
         'on_track', count(*) FILTER (WHERE s.info->>'status' = 'on_track'),
         'at_risk', count(*) FILTER (WHERE s.info->>'status' = 'at_risk'),
         'overdue', count(*) FILTER (WHERE s.info->>'status' = 'overdue'),
         'completed', count(*) FILTER (WHERE s.info->>'status' = 'completed'))
       FROM goals g JOIN profiles p ON p.id = g.profile_id AND p.status = 'active'
       CROSS JOIN LATERAL goal_status_info(g.id) AS s(info)
      WHERE g.org_id = v_org AND g.cycle_id = v_cycle AND g.archived = false),
    'tasks', (SELECT jsonb_build_object(
         'open', count(*) FILTER (WHERE k.status <> 'completed'),
         'in_progress', count(*) FILTER (WHERE k.status IN ('accepted', 'in_progress')),
         'review', count(*) FILTER (WHERE k.status = 'review'),
         'overdue', count(*) FILTER (WHERE k.status <> 'completed' AND k.due_date < v_today),
         'completed_7d', count(*) FILTER (WHERE k.status = 'completed' AND k.done_at >= now() - interval '7 days'))
       FROM tasks k WHERE k.org_id = v_org));
END $$;
REVOKE ALL ON FUNCTION public.dash_hr() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dash_hr() TO authenticated;