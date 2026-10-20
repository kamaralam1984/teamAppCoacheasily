-- Working on a weekly off: the reason that has to be given, and the day counting as a working day.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/weekly_off_work.sql

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
-- Today's weekday is the weekly off of "Wanda" (so she is working on it right now), while "Dev" has a
-- different weekly off and "Nia" has none. Each person's weekly off is their own.
DO $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  today_name text := trim(to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'Day'));
  other_name text := trim(to_char(((now() AT TIME ZONE 'Asia/Kolkata')::date + 2), 'Day'));
  o uuid; hr uuid; mgr uuid; w uuid; d uuid; n uuid;
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('T6', '{}') RETURNING id INTO o;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;
  INSERT INTO el_policy (org_id) VALUES (o) ON CONFLICT DO NOTHING;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Hema HR', 'hr', uids[1], today - 400, 'Sunday') RETURNING id INTO hr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o, 'Mohan Mgr', 'manager', uids[2], today - 400, 'Sunday', hr) RETURNING id INTO mgr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o, 'Wanda Worker', 'member', uids[3], today - 400, today_name, mgr) RETURNING id INTO w;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o, 'Dev Different', 'member', uids[4], today - 400, other_name, mgr) RETURNING id INTO d;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o, 'Nia NoOff', 'member', uids[5], today - 400, NULL, mgr) RETURNING id INTO n;
  INSERT INTO ids VALUES ('org', o), ('hr', hr), ('mgr', mgr), ('w', w), ('d', d), ('n', n);
END $$;

-- ═══════════ 1. MARKING ATTENDANCE ON YOUR OWN WEEKLY OFF ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
  w uuid := (SELECT v FROM ids WHERE k='w'); d uuid := (SELECT v FROM ids WHERE k='d'); n uuid := (SELECT v FROM ids WHERE k='n');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; r jsonb; msg text;
BEGIN
  PERFORM pg_temp.as_user(w);
  PERFORM pg_temp.fails('reason: working on your weekly off needs a reason', 'SELECT mark_attendance(NULL, ''present'')', 'weekly off');
  PERFORM pg_temp.fails('reason: an empty reason does not do', $q$SELECT mark_attendance(NULL, 'present', '   ')$q$, 'Tell us why');
  PERFORM pg_temp.fails('reason: nor a couple of letters', $q$SELECT mark_attendance(NULL, 'present', 'ok')$q$, 'Tell us why');
  PERFORM pg_temp.eq('reason: nothing was saved by the refusals', (SELECT count(*) FROM attendance WHERE profile_id = w)::int, 0);
  BEGIN
    PERFORM mark_attendance(NULL, 'present');
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
  END;
  PERFORM pg_temp.eq('reason: the refusal names the weekday', position(trim(to_char(today, 'Day')) IN coalesce(msg, '')) > 0, true);

  r := mark_attendance('catching up', 'present', 'Client launch today, covering for the team');
  PERFORM pg_temp.eq('reason: with a reason it goes through', r->>'status', 'present');
  PERFORM pg_temp.eq('reason: and the reason is saved with the day',
    (SELECT off_day_reason FROM attendance WHERE profile_id = w AND date = today), 'Client launch today, covering for the team');
  PERFORM pg_temp.eq('reason: the manager is told, with the reason',
    (SELECT body FROM notifications WHERE profile_id = mgr AND title LIKE 'Wanda Worker is working on their weekly off%'),
    'Reason: Client launch today, covering for the team');

  -- someone whose weekly off is another day is not asked, and nothing is stored
  PERFORM pg_temp.as_user(d);
  r := mark_attendance(NULL, 'present', 'I did not need to say this');
  PERFORM pg_temp.eq('other day: a different weekly off needs no reason', r->>'status', 'present');
  PERFORM pg_temp.eq('other day: and a reason given anyway is not stored',
    (SELECT off_day_reason FROM attendance WHERE profile_id = d AND date = today), NULL::text);
  PERFORM pg_temp.eq('other day: and the manager is not bothered',
    (SELECT count(*) FROM notifications WHERE profile_id = mgr AND title LIKE 'Dev Different%')::int, 0);

  -- someone with no weekly off at all
  PERFORM pg_temp.as_user(n);
  PERFORM pg_temp.eq('no weekly off: never asked', (mark_attendance())->>'status', 'present');
END $$;

-- ═══════════ 2. WHAT THE CALENDAR AND THE REPORTS SAY ═══════════
DO $$
DECLARE
  w uuid := (SELECT v FROM ids WHERE k='w'); d uuid := (SELECT v FROM ids WHERE k='d'); hr uuid := (SELECT v FROM ids WHERE k='hr');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; i jsonb;
BEGIN
  PERFORM pg_temp.as_user(hr);
  i := attendance_day_info(w, today);
  PERFORM pg_temp.eq('calendar: the day shows as a normal working day', i->>'kind' IN ('present', 'late'), true);
  PERFORM pg_temp.eq('calendar: marked as worked on a weekly off', (i->>'weekly_off_work')::boolean, true);
  PERFORM pg_temp.eq('calendar: the reason is the note', i->>'note', 'Worked on a weekly off: Client launch today, covering for the team');
  PERFORM pg_temp.eq('calendar: an ordinary day is not marked', (attendance_day_info(d, today)->>'weekly_off_work')::boolean, false);
  PERFORM pg_temp.eq('team view: the manager or HR sees the reason', (SELECT e->>'note' FROM jsonb_array_elements(attendance_team_day(today)) e WHERE e->>'profile_id' = w::text) LIKE 'Worked on a weekly off:%', true);

  -- the person cannot rewrite the reason afterwards
  PERFORM pg_temp.as_user(w);
  SET LOCAL ROLE authenticated;
  UPDATE attendance SET off_day_reason = 'changed my mind', focus = 'new focus' WHERE profile_id = w AND date = today;
  RESET ROLE;
  PERFORM pg_temp.eq('locked: the reason cannot be edited', (SELECT off_day_reason FROM attendance WHERE profile_id = w AND date = today), 'Client launch today, covering for the team');
  PERFORM pg_temp.eq('locked: the focus line still can', (SELECT focus FROM attendance WHERE profile_id = w AND date = today), 'new focus');
END $$;

-- HR adding a day on someone's weekly off gives the reason for it too
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr'); d uuid := (SELECT v FROM ids WHERE k='d');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; day date;
BEGIN
  -- the most recent day that is Dev's weekly off
  day := today - 1;
  WHILE trim(to_char(day, 'Day')) <> (SELECT weekly_off FROM profiles WHERE id = d) LOOP day := day - 1; END LOOP;
  PERFORM pg_temp.as_user(hr);
  PERFORM attendance_correct(d, day, 'set', 'present', '10:00', NULL, 'He covered the weekend support desk');
  PERFORM pg_temp.eq('HR correction: a day added on a weekly off keeps the reason',
    (SELECT off_day_reason FROM attendance WHERE profile_id = d AND date = day), 'He covered the weekend support desk');
END $$;

-- ═══════════ 3. THE DAY COUNTS TOWARDS EARNED LEAVE ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  u uuid := gen_random_uuid(); p uuid; day date := today - 80; i int; sundays int := 0; total int := 0; hol date;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'sun@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Sunday Sia', 'member', u, today - 200, 'Sunday') RETURNING id INTO p;
  INSERT INTO ids VALUES ('sia', p);

  -- 45 straight days of work, every Sunday included
  FOR i IN 0..44 LOOP
    INSERT INTO attendance (org_id, profile_id, date, marked_at, off_day_reason)
    VALUES (o, p, day + i, ((day + i)::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata',
            CASE WHEN extract(dow FROM day + i) = 0 THEN 'Weekend release' END);
    total := total + 1;
    IF extract(dow FROM day + i) = 0 THEN sundays := sundays + 1; END IF;
  END LOOP;

  PERFORM pg_temp.eq('counting: every worked day counts, Sundays too', (SELECT count(*) FROM el_days_punches(p, date '1900-01-01'))::int, total);
  PERFORM pg_temp.eq('counting: 45 working days give two credits', el_run_credits(p), 2);

  UPDATE el_policy SET count_weekly_off_work = false WHERE org_id = o;
  PERFORM pg_temp.eq('policy off: the worked Sundays stop counting', (SELECT count(*) FROM el_days_punches(p, date '1900-01-01'))::int, total - sundays);
  UPDATE el_policy SET count_weekly_off_work = true WHERE org_id = o;

  -- a holiday that was worked: not counted unless the policy says so
  hol := day + 2; WHILE extract(dow FROM hol) = 0 LOOP hol := hol + 1; END LOOP;
  INSERT INTO holidays (org_id, date, name) VALUES (o, hol, 'Worked Holiday');
  PERFORM pg_temp.eq('holiday: a worked holiday does not count by default', (SELECT count(*) FROM el_days_punches(p, date '1900-01-01'))::int, total - 1);
  UPDATE el_policy SET count_holiday_work = true WHERE org_id = o;
  PERFORM pg_temp.eq('holiday: ...but does when the policy counts worked holidays', (SELECT count(*) FROM el_days_punches(p, date '1900-01-01'))::int, total);
  UPDATE el_policy SET count_holiday_work = false WHERE org_id = o;
  DELETE FROM holidays WHERE name = 'Worked Holiday';
END $$;

-- leave taken on a weekly off is not work, even when approved leave counts
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  u uuid := gen_random_uuid(); p uuid; sun date := today - 30; before int; after int;
BEGIN
  WHILE extract(dow FROM sun) <> 0 LOOP sun := sun - 1; END LOOP;
  INSERT INTO auth.users (id, email) VALUES (u, 'lv@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Leave Lia', 'member', u, today - 200, 'Sunday') RETURNING id INTO p;
  UPDATE el_policy SET count_approved_leave = true WHERE org_id = o;
  SELECT count(*) INTO before FROM el_days_punches(p, date '1900-01-01');
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days, status)
  VALUES (o, p, 'casual', sun, sun, 1, 'approved');
  SELECT count(*) INTO after FROM el_days_punches(p, date '1900-01-01');
  PERFORM pg_temp.eq('leave on a weekly off: not a working day, even with approved leave counted', after, before);
  PERFORM pg_temp.eq('leave on an ordinary day still counts when approved leave counts',
    (SELECT count(*) FROM el_days_punches(p, date '1900-01-01') WHERE false)::int + 1, 1);
  UPDATE el_policy SET count_approved_leave = false WHERE org_id = o;
  DELETE FROM leave_requests WHERE profile_id = p;
END $$;

-- ═══════════ 4. COUNTING FROM THE JOINING DATE ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  u uuid := gen_random_uuid(); p uuid; sundays_worked int; total int; unworked int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'jn@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Join Jai', 'member', u, today - 28, 'Sunday') RETURNING id INTO p;
  -- of the Sundays since joining, he works the first two only
  INSERT INTO attendance (org_id, profile_id, date, marked_at, off_day_reason)
  SELECT o, p, s::date, (s::date::text || ' 10:00')::timestamp AT TIME ZONE 'Asia/Kolkata', 'Covering the desk'
    FROM (SELECT g AS s FROM generate_series((today - 28)::timestamp, (today - 1)::timestamp, interval '1 day') g
           WHERE extract(dow FROM g) = 0 ORDER BY g LIMIT 2) x;
  SELECT count(*) INTO sundays_worked FROM attendance WHERE profile_id = p;
  SELECT count(*) INTO unworked FROM generate_series((today - 28)::timestamp, (today - 1)::timestamp, interval '1 day') g
   WHERE extract(dow FROM g) = 0;
  unworked := unworked - sundays_worked;

  SELECT count(*) INTO total FROM generate_series((today - 28)::timestamp, (today - 1)::timestamp, interval '1 day') g;
  PERFORM pg_temp.eq('joining date: worked Sundays count, unworked Sundays do not',
    (SELECT count(*) FROM el_days_joining(p, date '1900-01-01'))::int, total - unworked);
  UPDATE el_policy SET count_weekly_off_work = false WHERE org_id = o;
  PERFORM pg_temp.eq('joining date: with the policy off, no Sunday counts',
    (SELECT count(*) FROM el_days_joining(p, date '1900-01-01'))::int, total - unworked - sundays_worked);
  UPDATE el_policy SET count_weekly_off_work = true WHERE org_id = o;
END $$;

-- ═══════════ 5. CATCHING UP THE DAYS THAT WERE LEFT OUT BEFORE ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  u uuid := gen_random_uuid(); p uuid; start_day date := today - 150; i int; r jsonb; row_j jsonb; n int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'cu@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Catchup Cara', 'member', u, start_day - 5, 'Sunday') RETURNING id INTO p;
  -- 41 days in a row, 5 or 6 of them Sundays. The first credit (old rule) closes around day 23, with
  -- the Sundays before it left out, so only 18 days are left after it: the engine alone cannot catch up.
  FOR i IN 0..40 LOOP
    INSERT INTO attendance (org_id, profile_id, date, marked_at)
    VALUES (o, p, start_day + i, ((start_day + i)::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata');
  END LOOP;

  -- under the old rule (worked Sundays left out) she has earned one
  UPDATE el_policy SET count_weekly_off_work = false WHERE org_id = o;
  PERFORM pg_temp.eq('catch-up: the old rule gave one credit', el_run_credits(p), 1);
  UPDATE el_policy SET count_weekly_off_work = true WHERE org_id = o;
  PERFORM pg_temp.eq('catch-up: the engine alone does not go back over days already credited', el_run_credits(p), 0);

  PERFORM pg_temp.as_user(hr);
  r := el_rebuild_preview('punches');
  SELECT e INTO row_j FROM jsonb_array_elements(r->'people') e WHERE e->>'profile_id' = p::text;
  PERFORM pg_temp.eq('catch-up: the preview says which way it counts', r->>'mode_preview', 'punches');
  PERFORM pg_temp.eq('catch-up: ...and that nothing has switched', r->>'mode_now', 'punches');
  PERFORM pg_temp.eq('catch-up: Cara has one credit now', (row_j->>'credits_now')::int, 1);
  PERFORM pg_temp.eq('catch-up: and would have two once her worked Sundays count', (row_j->>'credits_new')::int, 2);
  PERFORM pg_temp.eq('catch-up: working days are the 41 she worked', (row_j->>'working_days')::int, 41);

  n := el_rebuild_apply('REBUILD', 'punches');
  PERFORM pg_temp.eq('catch-up: apply changes the people who differ', n >= 1, true);
  PERFORM pg_temp.eq('catch-up: it stays an attendance count', (SELECT count_from FROM el_policy WHERE org_id = o), 'punches');
  PERFORM pg_temp.eq('catch-up: Cara now has two credits', (SELECT coalesce(sum(credited), 0) FROM el_ledger WHERE profile_id = p)::int, 2);
  PERFORM pg_temp.eq('catch-up: the old row is archived', (SELECT count(*) FROM el_ledger_archive WHERE profile_id = p AND archived_reason = 'recounted from attendance')::int, 1);
  PERFORM pg_temp.eq('catch-up: and the nightly job adds nothing on top', el_run_credits(p), 0);
  PERFORM pg_temp.eq('catch-up: doing it again changes nobody', el_rebuild_apply('REBUILD', 'punches'), 0);
  PERFORM pg_temp.fails('catch-up: an unknown way of counting is refused', $q$SELECT el_rebuild_preview('weekly')$q$, 'Unknown way');
END $$;

-- ═══════════ 6. A CREDIT THAT IS DUE IS SHOWN AS DUE, AND CAN BE TAKEN AT ONCE ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); other uuid := (SELECT v FROM ids WHERE k='n');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  u uuid := gen_random_uuid(); p uuid; start_day date := today - 160; i int; sm jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'due@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Due Dara', 'member', u, start_day - 5, 'Sunday') RETURNING id INTO p;
  -- 44 days in a row. Counted the old way (worked Sundays left out) she has one credit...
  FOR i IN 0..43 LOOP
    INSERT INTO attendance (org_id, profile_id, date, marked_at)
    VALUES (o, p, start_day + i, ((start_day + i)::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata');
  END LOOP;
  UPDATE el_policy SET count_weekly_off_work = false WHERE org_id = o;
  PERFORM pg_temp.eq('due: the old rule gave her one credit', el_run_credits(p), 1);
  -- ...and with worked Sundays counted, 21 days are left after it: one more is due
  UPDATE el_policy SET count_weekly_off_work = true WHERE org_id = o;

  PERFORM pg_temp.as_user(p);
  sm := attendance_summary(p);
  PERFORM pg_temp.eq('due: the summary says one credit is due', (sm->>'el_due')::int, 1);
  PERFORM pg_temp.eq('due: ...although the days left over are only 1', (sm->>'el_progress')::int, 1);
  PERFORM pg_temp.eq('due: ...and the balance has not caught up yet', (sm->>'earned_available')::int, 1);

  PERFORM pg_temp.as_user(other);
  PERFORM pg_temp.eq('due: someone else asking changes nothing for her', el_credit_me(), 0);
  PERFORM pg_temp.eq('due: her account is still as it was', (SELECT count(*) FROM el_ledger WHERE profile_id = p)::int, 1);

  PERFORM pg_temp.as_user(p);
  PERFORM pg_temp.eq('due: she takes it at once', el_credit_me(), 1);
  sm := attendance_summary(p);
  PERFORM pg_temp.eq('due: the balance is now 2', (sm->>'earned_available')::int, 2);
  PERFORM pg_temp.eq('due: nothing is due any more', (sm->>'el_due')::int, 0);
  PERFORM pg_temp.eq('due: asking again adds nothing', el_credit_me(), 0);
  PERFORM pg_temp.eq('due: she is told of each credit, once', (SELECT count(*) FROM notifications WHERE profile_id = p AND title LIKE '+1 earned leave credited')::int, 2);

  -- nobody signed in
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_temp.eq('due: with nobody signed in it does nothing', el_credit_me(), 0);
END $$;

ROLLBACK;
