-- ═══ REPEATING TASKS: ADD ONCE, BACK EVERY DAY ═══
-- tasks.repeats ('none' | 'daily' | 'weekdays') already exists, but a repeating task only
-- came back when its owner pressed "close the day". This nightly job brings every repeating
-- task back on its own, just after midnight IST:
--   * the day's tick is kept in task_days (the history), then the task is un-ticked,
--   * its due date moves to the new day,
--   * 'weekdays' means "every working day", any day Mon–Sun except that person's days off:
--     their weekly off (is_off_day(), so an approved weekly off shift counts too), a fixed
--     company holiday (holidays) and their own approved flexi holiday (leave_requests 'flexi'),
--   * nothing is deleted.
-- Repeating tasks also stop sending a "Due today" notice every morning.

-- Is this a day off for this person: weekly off, a company holiday, or their approved flexi holiday.
CREATE OR REPLACE FUNCTION public.task_rest_day(p_profile_id uuid, p_date date) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
           SELECT 1 FROM profiles p
            WHERE p.id = p_profile_id
              AND (public.is_off_day(p.id, p.weekly_off, p_date)
                   OR EXISTS (SELECT 1 FROM holidays h WHERE h.org_id = p.org_id AND h.date = p_date)))
      OR EXISTS (SELECT 1 FROM leave_requests l
                  WHERE l.profile_id = p_profile_id AND l.type = 'flexi' AND l.status = 'approved'
                    AND p_date BETWEEN l.from_date AND l.to_date)
$$;
REVOKE ALL ON FUNCTION public.task_rest_day(uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.task_rest_day(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.tasks_repeat_tick() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n integer := 0;
  r record;
  v_rest boolean;
  v_next date;
BEGIN
  FOR r IN SELECT * FROM tasks WHERE repeats <> 'none' LOOP
    v_rest := false;
    v_next := v_today;
    IF r.repeats = 'weekdays' THEN
      v_rest := public.task_rest_day(r.owner_id, v_today);
      -- the next day this person works (a fortnight at most)
      WHILE public.task_rest_day(r.owner_id, v_next) AND v_next < v_today + 14 LOOP
        v_next := v_next + 1;
      END LOOP;
    END IF;

    -- keep the record of a day that was planned but never closed
    IF r.committed_on IS NOT NULL AND r.committed_on < v_today THEN
      UPDATE task_days SET done = r.done, done_at = r.done_at
       WHERE task_id = r.id AND day = r.committed_on;
    END IF;

    -- on a day off a working-day task waits; a finished one stays ticked until the next working day
    IF v_rest THEN
      IF r.due_date IS NULL OR r.due_date < v_next THEN
        UPDATE tasks SET due_date = v_next WHERE id = r.id AND NOT done;
      END IF;
      CONTINUE;
    END IF;

    IF r.status IN ('completed', 'review') THEN
      -- a fresh copy of the day's work: no notification, because the status moves to
      -- 'accepted' (own task) or 'assigned' (somebody else's), which notify nobody
      UPDATE tasks
         SET status = CASE WHEN created_by IS NULL OR created_by = owner_id
                           THEN 'accepted' ELSE 'assigned' END,
             done = false,
             committed_on = NULL,
             due_date = v_next
       WHERE id = r.id;
      v_n := v_n + 1;
    ELSIF r.due_date IS NULL OR r.due_date < v_next
          OR (r.committed_on IS NOT NULL AND r.committed_on < v_today) THEN
      UPDATE tasks
         SET due_date = GREATEST(coalesce(due_date, v_next), v_next),
             committed_on = CASE WHEN committed_on < v_today THEN NULL ELSE committed_on END
       WHERE id = r.id;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.tasks_repeat_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tasks_repeat_tick() TO service_role;

-- 00:05 IST, before the 09:10 IST due-date notices
-- (pg_cron lives only in the 'postgres' database, not in the deploy rehearsal copy)
DO $$
BEGIN
  IF current_database() = 'postgres' THEN
    PERFORM cron.schedule('ce-task-repeat-tick', '35 18 * * *',
                          $c$SELECT public.tasks_repeat_tick()$c$);
  END IF;
END $$;

-- Same as before, except repeating tasks don't get a "Due today" notice every single day.
CREATE OR REPLACE FUNCTION public.tasks_due_tick() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n integer := 0;
  r record;
BEGIN
  FOR r IN SELECT * FROM tasks
            WHERE status <> 'completed' AND due_date < v_today AND overdue_notified_on IS NULL
  LOOP
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (r.org_id, r.owner_id, 'Overdue: ' || r.title,
            'This was due ' || to_char(r.due_date, 'FMDD Mon') || '.', '/tasks');
    IF r.created_by IS NOT NULL AND r.created_by <> r.owner_id THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (r.org_id, r.created_by, audit_name(r.owner_id) || '''s task is overdue',
              r.title || ' was due ' || to_char(r.due_date, 'FMDD Mon') || '.', '/tasks');
    END IF;
    INSERT INTO task_events (org_id, task_id, kind, to_value) VALUES (r.org_id, r.id, 'overdue', r.due_date::text);
    UPDATE tasks SET overdue_notified_on = v_today WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;

  FOR r IN SELECT * FROM tasks
            WHERE status <> 'completed' AND due_date BETWEEN v_today AND v_today + 1
              AND due_soon_notified_on IS NULL AND repeats = 'none'
  LOOP
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (r.org_id, r.owner_id,
            CASE WHEN r.due_date = v_today THEN 'Due today: ' ELSE 'Due tomorrow: ' END || r.title,
            NULL, '/tasks');
    UPDATE tasks SET due_soon_notified_on = v_today WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.tasks_due_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tasks_due_tick() TO service_role;
