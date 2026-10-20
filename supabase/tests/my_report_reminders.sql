-- My report (a person's own tasks, goals and numbers) and the evening "still pending" reminder.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/my_report_reminders.sql

BEGIN;

CREATE FUNCTION pg_temp.eq(label text, actual anyelement, expected anyelement) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL %: expected %, got %', label, expected, actual;
  END IF;
  RAISE NOTICE 'ok   %', label;
END $$;

CREATE FUNCTION pg_temp.fails(label text, stmt text, expect_text text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF NOT EXISTS (SELECT 1 FROM unnest(string_to_array(expect_text, '|')) alt WHERE position(alt IN SQLERRM) > 0) THEN
      RAISE EXCEPTION 'FAIL %: error was "%", expected to contain "%"', label, SQLERRM, expect_text;
    END IF;
    RAISE NOTICE 'ok   % (%)', label, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: expected an error containing "%"', label, expect_text;
END $$;

CREATE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', (SELECT auth_user_id::text FROM public.profiles WHERE id = p), true)
$$;

CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO PUBLIC;

-- ───────── fixtures ─────────
-- Org 1: Asha (the reporter), Bela (somebody else, must never show in Asha's report), Cara (only has a
-- task in review), Dan (on a weekly off today), Esha (on approved leave today), Hema (HR, her manager).
-- Org 2: Fay, in an organisation that has a holiday today.
DO $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  today_name text := trim(to_char(today, 'Day'));
  other_name text := trim(to_char(today + 2, 'Day'));
  o1 uuid; o2 uuid; hr uuid; a uuid; b uuid; c uuid; d uuid; e uuid; f uuid;
  cyc uuid; g1 uuid; g2 uuid; gb uuid; t uuid;
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                       gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('R1', '{}') RETURNING id INTO o1;
  INSERT INTO organisations (name, settings) VALUES ('R2', '{}') RETURNING id INTO o2;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, department)
  VALUES (o1, 'Hema HR', 'hr', uids[1], today - 400, other_name, 'People & Culture') RETURNING id INTO hr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id, department)
  VALUES (o1, 'Asha Reporter', 'member', uids[2], today - 400, other_name, hr, 'Technology') RETURNING id INTO a;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o1, 'Bela Other', 'member', uids[3], today - 400, other_name, hr) RETURNING id INTO b;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o1, 'Cara Review', 'member', uids[4], today - 400, other_name, hr) RETURNING id INTO c;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o1, 'Dan Off', 'member', uids[5], today - 400, today_name, hr) RETURNING id INTO d;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o1, 'Esha Leave', 'member', uids[6], today - 400, other_name, hr) RETURNING id INTO e;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o2, 'Fay Holiday', 'member', uids[7], today - 400, other_name) RETURNING id INTO f;

  -- Asha's tasks
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date, priority)
  VALUES (o1, a, a, 'Late one', today - 3, 'High');                                   -- overdue, 3 days
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date)
  VALUES (o1, a, a, 'Due today', today);                                              -- due today
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date)
  VALUES (o1, a, a, 'Done on time', today - 10) RETURNING id INTO t;
  UPDATE tasks SET done = true WHERE id = t;
  UPDATE tasks SET done_at = (today - 12)::timestamp AT TIME ZONE 'Asia/Kolkata' WHERE id = t;
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date)
  VALUES (o1, a, a, 'Done late', today - 20) RETURNING id INTO t;
  UPDATE tasks SET done = true WHERE id = t;
  UPDATE tasks SET done_at = (today - 17)::timestamp AT TIME ZONE 'Asia/Kolkata' WHERE id = t;
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date)
  VALUES (o1, a, hr, 'From the boss', today + 5);                                     -- given by Hema, not started
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date)
  VALUES (o1, a, a, 'Ancient', today - 200);                                          -- outside any short range
  -- everything was made a month ago, except the ancient one
  UPDATE tasks SET created_at = (today - 30)::timestamp AT TIME ZONE 'Asia/Kolkata' WHERE owner_id = a;
  UPDATE tasks SET created_at = (today - 210)::timestamp AT TIME ZONE 'Asia/Kolkata' WHERE title = 'Ancient';
  -- Bela's task: must never show for Asha
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date)
  VALUES (o1, b, b, 'Bela secret', today - 1);
  -- Cara: only something waiting for review
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date)
  VALUES (o1, c, hr, 'Waiting on review', today - 1) RETURNING id INTO t;
  UPDATE tasks SET status = 'accepted' WHERE id = t;
  UPDATE tasks SET status = 'in_progress' WHERE id = t;
  UPDATE tasks SET status = 'review' WHERE id = t;
  -- Dan (weekly off today), Esha (leave today), Fay (holiday today): each has an overdue task
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date) VALUES (o1, d, d, 'Dan overdue', today - 2);
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date) VALUES (o1, e, e, 'Esha overdue', today - 2);
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date) VALUES (o2, f, f, 'Fay overdue', today - 2);
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days, status)
  VALUES (o1, e, 'casual', today, today, 1, 'approved');
  INSERT INTO holidays (org_id, date, name) VALUES (o2, today, 'Test holiday');

  -- Asha's goals, in a cycle that spans the last 45 days
  INSERT INTO cycles (org_id, no, name, start_date, end_date, status)
  VALUES (o1, 1, 'Report cycle', today - 40, today + 5, 'active') RETURNING id INTO cyc;
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, unit, baseline, target)
  VALUES (o1, a, cyc, 'number', 'Tickets resolved', 'tickets', 0, 40) RETURNING id INTO g1;
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, unit, baseline, target)
  VALUES (o1, a, cyc, 'number', 'Downtime', 'minutes', 120, 30) RETURNING id INTO g2;
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, stages, baseline, target)
  VALUES (o1, a, cyc, 'funnel', 'Calls to closures', ARRAY['Calls', 'Connected', 'Closed'], 0, 20) RETURNING id INTO gb;
  INSERT INTO goal_entries (org_id, goal_id, date, value, note) VALUES (o1, g1, today - 6, 5, 'first week');
  INSERT INTO goal_entries (org_id, goal_id, date, value) VALUES (o1, g1, today - 1, 10);
  INSERT INTO goal_entries (org_id, goal_id, date, value) VALUES (o1, g2, today - 2, 75);
  INSERT INTO goal_entries (org_id, goal_id, date, counts, amount) VALUES (o1, gb, today - 3, ARRAY[20, 10, 5], 1500);
  -- somebody else's goal and number
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target)
  VALUES (o1, b, cyc, 'number', 'Bela goal', 0, 5) RETURNING id INTO t;
  INSERT INTO goal_entries (org_id, goal_id, date, value) VALUES (o1, t, today - 1, 3);

  INSERT INTO ids VALUES ('hr', hr), ('a', a), ('b', b), ('c', c), ('d', d), ('e', e), ('f', f);
END $$;

DO $$
DECLARE
  a uuid := (SELECT v FROM ids WHERE k = 'a');
  b uuid := (SELECT v FROM ids WHERE k = 'b');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  r jsonb; rows jsonb;
BEGIN
  -- ── my report ──
  PERFORM pg_temp.as_user(a);
  r := my_report(today - 44, today);
  PERFORM pg_temp.eq('report: it names the person', r->>'person', 'Asha Reporter');
  PERFORM pg_temp.eq('report: 45 days', (r #>> '{summary,days}')::int, 45);
  rows := r #> '{tasks,rows}';
  PERFORM pg_temp.eq('tasks: only her own, inside the range', jsonb_array_length(rows), 5);
  PERFORM pg_temp.eq('tasks: nobody else''s task appears',
    (SELECT count(*) FROM jsonb_array_elements(rows) x WHERE x->>'task' = 'Bela secret')::int, 0);
  PERFORM pg_temp.eq('tasks: one too old to be in range is left out',
    (SELECT count(*) FROM jsonb_array_elements(rows) x WHERE x->>'task' = 'Ancient')::int, 0);
  PERFORM pg_temp.eq('tasks: overdue label', (SELECT x->>'status' FROM jsonb_array_elements(rows) x WHERE x->>'task' = 'Late one'), 'Overdue');
  PERFORM pg_temp.eq('tasks: days late counts up', (SELECT (x->>'days_late')::int FROM jsonb_array_elements(rows) x WHERE x->>'task' = 'Late one'), 3);
  PERFORM pg_temp.eq('tasks: finished on time', (SELECT x->>'on_time' FROM jsonb_array_elements(rows) x WHERE x->>'task' = 'Done on time'), 'Yes');
  PERFORM pg_temp.eq('tasks: finished late', (SELECT x->>'on_time' FROM jsonb_array_elements(rows) x WHERE x->>'task' = 'Done late'), 'No');
  PERFORM pg_temp.eq('tasks: days late when finished late', (SELECT (x->>'days_late')::int FROM jsonb_array_elements(rows) x WHERE x->>'task' = 'Done late'), 3);
  PERFORM pg_temp.eq('tasks: handed over by the boss', (SELECT x->>'given_by' FROM jsonb_array_elements(rows) x WHERE x->>'task' = 'From the boss'), 'Hema HR');
  PERFORM pg_temp.eq('tasks: her own task says Myself', (SELECT x->>'given_by' FROM jsonb_array_elements(rows) x WHERE x->>'task' = 'Due today'), 'Myself');
  PERFORM pg_temp.eq('tasks: not started label', (SELECT x->>'status' FROM jsonb_array_elements(rows) x WHERE x->>'task' = 'From the boss'), 'Not started');
  PERFORM pg_temp.eq('summary: completed', (r #>> '{summary,completed}')::int, 2);
  PERFORM pg_temp.eq('summary: overdue', (r #>> '{summary,overdue}')::int, 1);
  PERFORM pg_temp.eq('summary: pending', (r #>> '{summary,pending}')::int, 3);
  PERFORM pg_temp.eq('summary: on time', (r #>> '{summary,on_time}')::int, 1);
  PERFORM pg_temp.eq('range: a short range shrinks the list',
    jsonb_array_length(my_report(today, today) #> '{tasks,rows}'), 1);
  PERFORM pg_temp.eq('range: a wide range brings the old one back',
    jsonb_array_length(my_report(today - 250, today) #> '{tasks,rows}'), 6);

  -- goals
  rows := r #> '{goals,rows}';
  PERFORM pg_temp.eq('goals: hers only', jsonb_array_length(rows), 3);
  PERFORM pg_temp.eq('goals: a count goal shows the latest number', (SELECT (x->>'now')::numeric FROM jsonb_array_elements(rows) x WHERE x->>'goal' = 'Tickets resolved'), 10::numeric);
  PERFORM pg_temp.eq('goals: progress from the start', (SELECT (x->>'progress_pct')::numeric FROM jsonb_array_elements(rows) x WHERE x->>'goal' = 'Tickets resolved'), 25::numeric);
  PERFORM pg_temp.eq('goals: days logged in range', (SELECT (x->>'numbers_logged')::int FROM jsonb_array_elements(rows) x WHERE x->>'goal' = 'Tickets resolved'), 2);
  PERFORM pg_temp.eq('goals: a goal that should come down works', (SELECT (x->>'progress_pct')::numeric FROM jsonb_array_elements(rows) x WHERE x->>'goal' = 'Downtime'), 50::numeric);
  PERFORM pg_temp.eq('goals: a funnel shows its end-to-end rate', (SELECT (x->>'now')::numeric FROM jsonb_array_elements(rows) x WHERE x->>'goal' = 'Calls to closures'), 25::numeric);
  PERFORM pg_temp.eq('goals: a range before the cycle brings nothing',
    jsonb_array_length(my_report(today - 200, today - 100) #> '{goals,rows}'), 0);

  -- numbers
  rows := r #> '{numbers,rows}';
  PERFORM pg_temp.eq('numbers: every entry of hers', jsonb_array_length(rows), 4);
  PERFORM pg_temp.eq('numbers: nothing of Bela''s',
    (SELECT count(*) FROM jsonb_array_elements(rows) x WHERE x->>'goal' = 'Bela goal')::int, 0);
  PERFORM pg_temp.eq('numbers: a funnel day reads as a flow',
    (SELECT x->>'number' FROM jsonb_array_elements(rows) x WHERE x->>'goal' = 'Calls to closures'), 'Calls 20 → Connected 10 → Closed 5');
  PERFORM pg_temp.eq('numbers: the note travels', (SELECT x->>'note' FROM jsonb_array_elements(rows) x WHERE x->>'note' IS NOT NULL), 'first week');
  PERFORM pg_temp.eq('numbers: the amount travels', (SELECT (x->>'amount')::numeric FROM jsonb_array_elements(rows) x WHERE x->>'amount' IS NOT NULL), 1500::numeric);

  -- somebody else asking sees their own, never Asha's
  PERFORM pg_temp.as_user(b);
  r := my_report(today - 44, today);
  PERFORM pg_temp.eq('other person: sees only her own task', jsonb_array_length(r #> '{tasks,rows}'), 1);
  PERFORM pg_temp.eq('other person: her own name', r->>'person', 'Bela Other');
  PERFORM pg_temp.eq('other person: her own goal', (r #>> '{goals,rows,0,goal}'), 'Bela goal');

  -- bad asks
  PERFORM pg_temp.fails('bad: end before start', format('SELECT my_report(%L, %L)', today, today - 1), 'end date is before');
  PERFORM pg_temp.fails('bad: too wide', format('SELECT my_report(%L, %L)', today - 400, today), 'at most a year');
  PERFORM pg_temp.fails('bad: no dates', 'SELECT my_report(NULL, NULL)', 'Pick both dates');
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_temp.fails('bad: nobody signed in', format('SELECT my_report(%L, %L)', today - 5, today), 'profile isn''t set up');
  PERFORM pg_temp.eq('anon cannot run it', has_function_privilege('anon', 'public.my_report(date,date)', 'EXECUTE'), false);
  PERFORM pg_temp.eq('signed-in can', has_function_privilege('authenticated', 'public.my_report(date,date)', 'EXECUTE'), true);
END $$;

-- ───────── the evening reminder ─────────
DO $$
DECLARE
  a uuid := (SELECT v FROM ids WHERE k = 'a');
  b uuid := (SELECT v FROM ids WHERE k = 'b');
  c uuid := (SELECT v FROM ids WHERE k = 'c');
  d uuid := (SELECT v FROM ids WHERE k = 'd');
  e uuid := (SELECT v FROM ids WHERE k = 'e');
  f uuid := (SELECT v FROM ids WHERE k = 'f');
  n int; msg record;
BEGIN
  n := tasks_pending_digest();
  PERFORM pg_temp.eq('digest: Asha and Bela are told', n, 2);
  SELECT title, body, link INTO msg FROM notifications WHERE profile_id = a AND title LIKE '%still pending';
  PERFORM pg_temp.eq('digest: Asha is told 3 are pending', msg.title, '3 tasks still pending');
  PERFORM pg_temp.eq('digest: ...with what is left', msg.body, '2 overdue and 1 due today. Still to do: Ancient; Late one; Due today.');
  PERFORM pg_temp.eq('digest: ...pointing at tasks', msg.link, '/tasks');
  PERFORM pg_temp.eq('digest: Bela has one overdue',
    (SELECT title FROM notifications WHERE profile_id = b AND title LIKE '%still pending'), '1 task still pending');
  PERFORM pg_temp.eq('digest: a task in review is not hers to finish',
    (SELECT count(*) FROM notifications WHERE profile_id = c AND title LIKE '%still pending')::int, 0);
  PERFORM pg_temp.eq('digest: nobody on a weekly off is nagged',
    (SELECT count(*) FROM notifications WHERE profile_id = d AND title LIKE '%still pending')::int, 0);
  PERFORM pg_temp.eq('digest: nobody on approved leave is nagged',
    (SELECT count(*) FROM notifications WHERE profile_id = e AND title LIKE '%still pending')::int, 0);
  PERFORM pg_temp.eq('digest: nobody on a holiday is nagged',
    (SELECT count(*) FROM notifications WHERE profile_id = f AND title LIKE '%still pending')::int, 0);
  PERFORM pg_temp.eq('digest: running again the same day adds nothing', tasks_pending_digest(), 0);
  PERFORM pg_temp.eq('digest: Asha still has one notice', (SELECT count(*) FROM notifications WHERE profile_id = a AND title LIKE '%still pending')::int, 1);

  UPDATE tasks SET done = true WHERE owner_id = b AND title = 'Bela secret';
  DELETE FROM task_pending_digests;
  PERFORM pg_temp.eq('digest: finished tasks stop the reminder', tasks_pending_digest(), 1);
  PERFORM pg_temp.eq('digest: has no access for signed-in users', has_function_privilege('authenticated', 'public.tasks_pending_digest()', 'EXECUTE'), false);
  PERFORM pg_temp.eq('digest: the job is scheduled once', (SELECT count(*) FROM cron.job WHERE jobname = 'ce-task-pending')::int, 1);
END $$;

ROLLBACK;
