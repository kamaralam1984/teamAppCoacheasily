-- ═══ MY REPORT, AND "WHAT IS STILL PENDING" REMINDERS ═══
-- 1. my_report(from, to): every person can pull their OWN tasks, goals and daily numbers for a stretch of
--    days (45 by default in the app) and take them away as CSV, Excel or PDF. It answers about the
--    signed-in person only; there is no way to ask about anybody else.
-- 2. tasks_pending_digest(): every evening (18:00 IST) each person with tasks they still have to act on
--    that are overdue or due today gets ONE notice saying what is left. Nobody is nagged twice in a day,
--    and nobody is nagged on a weekly off, a holiday or an approved leave day.

-- ───────── 1. MY REPORT ─────────
CREATE OR REPLACE FUNCTION public.my_report(p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_from date := p_from;
  v_to date := p_to;
  v_name text;
  v_dept text;
  v_range text;
  v_tasks jsonb;
  v_goals jsonb;
  v_numbers jsonb;
  v_summary jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;
  IF v_from IS NULL OR v_to IS NULL THEN RAISE EXCEPTION 'Pick both dates.'; END IF;
  IF v_to < v_from THEN RAISE EXCEPTION 'The end date is before the start date.'; END IF;
  IF v_to - v_from > 365 THEN RAISE EXCEPTION 'Pick a range of at most a year.'; END IF;

  SELECT full_name, department INTO v_name, v_dept FROM profiles WHERE id = v_me;
  v_range := to_char(v_from, 'FMDD Mon YYYY') || ' to ' || to_char(v_to, 'FMDD Mon YYYY');

  -- tasks: due in the range, made in it, or finished in it
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'task', t.title,
           'due', t.due_date,
           'priority', t.priority,
           'status', CASE WHEN t.status = 'completed' THEN 'Completed'
                          WHEN t.due_date IS NOT NULL AND t.due_date < v_today THEN 'Overdue'
                          ELSE CASE t.status WHEN 'assigned' THEN 'Not started'
                                             WHEN 'accepted' THEN 'Not started'
                                             WHEN 'in_progress' THEN 'In progress'
                                             WHEN 'review' THEN 'In review'
                                             ELSE t.status END END,
           'created', (t.created_at AT TIME ZONE 'Asia/Kolkata')::date,
           'completed_on', (t.done_at AT TIME ZONE 'Asia/Kolkata')::date,
           'on_time', CASE WHEN t.status <> 'completed' THEN NULL
                           WHEN t.due_date IS NULL THEN 'No due date'
                           WHEN (t.done_at AT TIME ZONE 'Asia/Kolkata')::date <= t.due_date THEN 'Yes'
                           ELSE 'No' END,
           'days_late', CASE WHEN t.due_date IS NULL THEN NULL
                             WHEN t.status = 'completed'
                               THEN greatest(0, (t.done_at AT TIME ZONE 'Asia/Kolkata')::date - t.due_date)
                             ELSE greatest(0, v_today - t.due_date) END,
           'given_by', CASE WHEN t.created_by IS NULL OR t.created_by = t.owner_id THEN 'Myself'
                            ELSE (SELECT full_name FROM profiles c WHERE c.id = t.created_by) END,
           'goal', (SELECT g.name FROM goals g WHERE g.id = t.goal_id))
         ORDER BY t.due_date NULLS LAST, t.created_at), '[]'::jsonb)
    INTO v_tasks
    FROM tasks t
   WHERE t.owner_id = v_me
     AND (t.due_date BETWEEN v_from AND v_to
          OR (t.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to
          OR (t.done_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to);

  -- goals in any cycle that overlaps the range
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.cycle_start, x.created_at), '[]'::jsonb)
    INTO v_goals
    FROM (
       SELECT g.created_at, c.start_date AS cycle_start,
             g.name AS goal, c.name AS cycle,
             CASE g.kind WHEN 'funnel' THEN 'Funnel' ELSE 'Number' END AS kind,
             coalesce(g.unit, '') AS unit,
             g.baseline AS started_at,
             n.now_value AS now,
             g.target AS going_to,
             CASE WHEN g.kind = 'funnel' OR g.target = g.baseline THEN
                    CASE WHEN g.kind = 'funnel' THEN n.now_value ELSE 0 END
                  ELSE round(greatest(0, least(100, (n.now_value - g.baseline) / (g.target - g.baseline) * 100)), 1)
              END AS progress_pct,
             (SELECT count(*) FROM goal_entries e WHERE e.goal_id = g.id AND e.date BETWEEN v_from AND v_to) AS numbers_logged,
             (SELECT max(e.date) FROM goal_entries e WHERE e.goal_id = g.id AND e.date <= v_to) AS last_logged,
             initcap(replace(goal_status_info(g.id)->>'status', '_', ' ')) AS status_today
        FROM goals g
        JOIN cycles c ON c.id = g.cycle_id
        CROSS JOIN LATERAL (
          SELECT CASE WHEN g.kind = 'funnel' THEN
                        coalesce((SELECT CASE WHEN sum(coalesce(e.counts[1], 0)) > 0
                                  THEN round(sum(coalesce(e.counts[array_length(g.stages, 1)], 0))::numeric
                                              / sum(coalesce(e.counts[1], 0)) * 100, 1) ELSE 0 END
                                    FROM goal_entries e WHERE e.goal_id = g.id AND e.date <= v_to), 0)
                      ELSE coalesce((SELECT e.value FROM goal_entries e
                                      WHERE e.goal_id = g.id AND e.value IS NOT NULL AND e.date <= v_to
                                      ORDER BY e.date DESC LIMIT 1), g.baseline) END AS now_value
        ) n
       WHERE g.profile_id = v_me AND g.archived = false
         AND c.start_date <= v_to AND c.end_date >= v_from
    ) x;

  -- the daily numbers, one row per day per goal
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'date', e.date,
           'goal', g.name,
           'number', CASE WHEN g.kind = 'funnel' AND e.counts IS NOT NULL THEN
                            (SELECT string_agg(coalesce(g.stages[i], 'Step ' || i) || ' ' || coalesce(e.counts[i], 0), ' → ' ORDER BY i)
                               FROM generate_subscripts(g.stages, 1) i)
                          ELSE e.value::text END,
           'amount', e.amount,
           'note', e.note)
          ORDER BY e.date, g.name), '[]'::jsonb)
    INTO v_numbers
    FROM goal_entries e
    JOIN goals g ON g.id = e.goal_id
   WHERE g.profile_id = v_me AND g.archived = false
     AND e.date BETWEEN v_from AND v_to;

  SELECT jsonb_build_object(
           'tasks', jsonb_array_length(v_tasks),
           'completed', (SELECT count(*) FROM jsonb_array_elements(v_tasks) r WHERE r->>'status' = 'Completed'),
            'overdue', (SELECT count(*) FROM jsonb_array_elements(v_tasks) r WHERE r->>'status' = 'Overdue'),
           'pending', (SELECT count(*) FROM jsonb_array_elements(v_tasks) r WHERE r->>'status' <> 'Completed'),
           'on_time', (SELECT count(*) FROM jsonb_array_elements(v_tasks) r WHERE r->>'on_time' = 'Yes'),
           'goals', jsonb_array_length(v_goals),
           'numbers_logged', jsonb_array_length(v_numbers),
           'days', (v_to - v_from) + 1)
    INTO v_summary;

  RETURN jsonb_build_object(
    'person', v_name,
    'department', v_dept,
    'from', v_from,
    'to', v_to,
    'summary', v_summary,
    'tasks', jsonb_build_object(
      'title', 'My tasks',
      'subtitle', v_name || ' · ' || v_range || '. Tasks due, created or finished in these days.',
      'columns', '[{"key":"task","label":"Task"},{"key":"due","label":"Due"},{"key":"priority","label":"Priority"},{"key":"status","label":"Status"},{"key":"created","label":"Created"},{"key":"completed_on","label":"Completed on"},{"key":"on_time","label":"On time"},{"key":"days_late","label":"Days late"},{"key":"given_by","label":"Given by"},{"key":"goal","label":"Goal"}]'::jsonb,
      'rows', v_tasks),
    'goals', jsonb_build_object(
      'title', 'My goals',
      'subtitle', v_name || ' · ' || v_range || '. Where each goal stands on the last day. Progress is measured from where you started to where you are going; for a funnel it is the last step out of the first.',
      'columns', '[{"key":"goal","label":"Goal"},{"key":"cycle","label":"Cycle"},{"key":"kind","label":"Type"},{"key":"unit","label":"Unit"},{"key":"started_at","label":"Started at"},{"key":"now","label":"Now"},{"key":"going_to","label":"Going to"},{"key":"progress_pct","label":"Progress %"},{"key":"numbers_logged","label":"Days logged"},{"key":"last_logged","label":"Last logged"},{"key":"status_today","label":"Status today"}]'::jsonb,
      'rows', v_goals),
    'numbers', jsonb_build_object(
      'title', 'My daily numbers',
      'subtitle', v_name || ' · ' || v_range || '. Every number you logged against a goal, day by day.',
      'columns', '[{"key":"date","label":"Date"},{"key":"goal","label":"Goal"},{"key":"number","label":"Number"},{"key":"amount","label":"Amount (Rs)"},{"key":"note","label":"Note"}]'::jsonb,
      'rows', v_numbers));
END $$;
REVOKE ALL ON FUNCTION public.my_report(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_report(date, date) TO authenticated, service_role;

-- ───────── 2. "WHAT IS STILL PENDING" REMINDER ─────────
CREATE TABLE IF NOT EXISTS public.task_pending_digests (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sent_on date NOT NULL,
  PRIMARY KEY (profile_id, sent_on)
);
ALTER TABLE public.task_pending_digests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_pending_digests FROM anon, authenticated;
GRANT ALL ON public.task_pending_digests TO service_role;

CREATE OR REPLACE FUNCTION public.tasks_pending_digest() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n integer := 0;
  v_inserted integer;
  r record;
  v_titles text;
BEGIN
  FOR r IN
    SELECT p.id, p.org_id,
           count(*) FILTER (WHERE t.due_date < v_today)::integer AS late,
           count(*) FILTER (WHERE t.due_date = v_today)::integer AS today
      FROM profiles p
      JOIN tasks t ON t.owner_id = p.id
     WHERE p.status = 'active'
       -- tasks waiting on somebody else's review are not the owner's to finish
       AND t.status IN ('assigned', 'accepted', 'in_progress')
       AND t.due_date IS NOT NULL AND t.due_date <= v_today
       AND (p.weekly_off IS NULL OR trim(to_char(v_today, 'Day')) <> p.weekly_off)
       AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.org_id = p.org_id AND h.date = v_today)
       AND NOT EXISTS (SELECT 1 FROM leave_requests l
                        WHERE l.profile_id = p.id AND l.status = 'approved' AND NOT l.half_day
                          AND v_today BETWEEN l.from_date AND l.to_date)
     GROUP BY p.id, p.org_id
  LOOP
    INSERT INTO task_pending_digests (profile_id, sent_on) VALUES (r.id, v_today) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    CONTINUE WHEN v_inserted = 0;

    SELECT string_agg(x.title, '; ' ORDER BY x.due_date, x.created_at) INTO v_titles FROM (
      SELECT t.title, t.due_date, t.created_at FROM tasks t
       WHERE t.owner_id = r.id AND t.status IN ('assigned', 'accepted', 'in_progress')
         AND t.due_date IS NOT NULL AND t.due_date <= v_today
       ORDER BY t.due_date, t.created_at LIMIT 3) x;

    INSERT INTO notifications (org_id, profile_id, title, body, link)
     VALUES (r.org_id, r.id,
            format('%s task%s still pending', r.late + r.today, CASE WHEN r.late + r.today = 1 THEN '' ELSE 's' END),
            CASE WHEN r.late > 0 AND r.today > 0 THEN format('%s overdue and %s due today. ', r.late, r.today)
                 WHEN r.late > 0 THEN format('%s overdue. ', r.late)
                 ELSE format('%s due today. ', r.today) END
              || 'Still to do: ' || v_titles || CASE WHEN r.late + r.today > 3 THEN ' and more.' ELSE '.' END,
            '/tasks');
    v_n := v_n + 1;
  END LOOP;

  DELETE FROM task_pending_digests WHERE sent_on < v_today - 30;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.tasks_pending_digest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tasks_pending_digest() TO service_role;

-- 18:00 India time (12:30 UTC). A job with this name is replaced, so running this again is safe.
SELECT cron.schedule('ce-task-pending', '30 12 * * *', $$SELECT public.tasks_pending_digest()$$);