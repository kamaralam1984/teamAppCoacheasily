-- Employee ids and the 360 profile, the holiday calendar, birthday reminders, and the report centre.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/people_holidays_reports.sql

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

-- ───────── fixtures: hr, mgr, a (under mgr), b (under hr); and a second organisation ─────────
DO $$
DECLARE
  o uuid; o2 uuid; hr uuid; mgr uuid; a uuid; b uuid; outsider uuid; cyc uuid;
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('T3', '{}') RETURNING id INTO o;
  INSERT INTO organisations (name, settings) VALUES ('Other', '{}') RETURNING id INTO o2;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;

  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, department, birthday)
  VALUES (o, 'Hema HR', 'hr', uids[1], date '2025-01-01', 'People', to_char(today + 3, 'MM-DD')) RETURNING id INTO hr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id, department)
  VALUES (o, 'Mohan Mgr', 'manager', uids[2], date '2025-01-01', hr, 'Sales') RETURNING id INTO mgr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id, department)
  VALUES (o, 'Asha Member', 'member', uids[3], today - 10, mgr, 'Sales') RETURNING id INTO a;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id, department)
  VALUES (o, 'Bala Member', 'member', uids[4], date '2025-01-01', hr, 'People') RETURNING id INTO b;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, department)
  VALUES (o2, 'Olga Outsider', 'member', uids[5], date '2025-01-01', 'Elsewhere') RETURNING id INTO outsider;

  INSERT INTO cycles (org_id, no, name, start_date, end_date, status)
  VALUES (o, 1, 'Cycle', today - 30, today + 30, 'active') RETURNING id INTO cyc;

  INSERT INTO ids VALUES ('org', o), ('org2', o2), ('hr', hr), ('mgr', mgr), ('a', a), ('b', b), ('outsider', outsider), ('cyc', cyc);
END $$;

-- ═══════════ G. EMPLOYEE ID ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr');
  a uuid := (SELECT v FROM ids WHERE k='a'); n uuid; code text; last_num int;
BEGIN
  PERFORM pg_temp.eq('id: everybody has one', (SELECT count(*) FROM profiles WHERE org_id = o AND employee_code IS NULL)::int, 0);
  PERFORM pg_temp.eq('id: format', (SELECT employee_code ~ '^CE-\d{3}$' FROM profiles WHERE id = a), true);

  SELECT max(substring(employee_code FROM '(\d+)$')::int) INTO last_num FROM profiles WHERE org_id = o;
  INSERT INTO profiles (org_id, full_name, role) VALUES (o, 'Newcomer', 'member') RETURNING id, employee_code INTO n, code;
  PERFORM pg_temp.eq('id: a new person gets the next number', code, 'CE-' || lpad((last_num + 1)::text, 3, '0'));

  UPDATE organisations SET settings = '{"employee_code_prefix":"WAR"}' WHERE id = o;
  INSERT INTO profiles (org_id, full_name, role) VALUES (o, 'Another', 'member') RETURNING employee_code INTO code;
  PERFORM pg_temp.eq('id: the organisation can choose a prefix', code ~ '^WAR-\d{3}$', true);
  UPDATE organisations SET settings = '{}' WHERE id = o;

  INSERT INTO profiles (org_id, full_name, role, employee_code) VALUES (o, 'Chosen', 'member', 'X-77') RETURNING employee_code INTO code;
  PERFORM pg_temp.eq('id: one given by HR is kept', code, 'X-77');
  PERFORM pg_temp.fails('id: no duplicates, whatever the case',
    format('INSERT INTO profiles (org_id, full_name, role, employee_code) VALUES (%L, ''Dup'', ''member'', ''x-77'')', o), 'duplicate key');
  PERFORM pg_temp.fails('id: a sensible shape',
    format('INSERT INTO profiles (org_id, full_name, role, employee_code) VALUES (%L, ''Bad'', ''member'', ''no spaces!'')', o), 'check constraint');

  PERFORM pg_temp.as_user(a);
  PERFORM pg_temp.fails('id: a member cannot change their own', format('UPDATE profiles SET employee_code = ''Z-1'' WHERE id = %L', a), 'Only HR');
  PERFORM pg_temp.as_user(hr);
  UPDATE profiles SET employee_code = 'ASHA-1' WHERE id = a;
  PERFORM pg_temp.eq('id: HR can change it', (SELECT employee_code FROM profiles WHERE id = a), 'ASHA-1');
  PERFORM pg_temp.eq('id: the change is in the audit trail',
    (SELECT count(*) FROM audit_log WHERE action = 'profile.employee_code' AND subject_id = a)::int, 1);
END $$;

-- ═══════════ G. THE 360 PROFILE ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
  a uuid := (SELECT v FROM ids WHERE k='a'); b uuid := (SELECT v FROM ids WHERE k='b'); outsider uuid := (SELECT v FROM ids WHERE k='outsider');
  cyc uuid := (SELECT v FROM ids WHERE k='cyc'); g uuid; t1 uuid; r jsonb;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  -- some work for Asha
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target) VALUES (o, a, cyc, 'number', 'Sales goal', 0, 100) RETURNING id INTO g;
  INSERT INTO goal_entries (org_id, goal_id, date, value) VALUES (o, g, today, 10);
  PERFORM pg_temp.as_user(mgr);
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date) VALUES (o, a, mgr, 'Open task', today + 3) RETURNING id INTO t1;
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date) VALUES (o, a, mgr, 'Late task', today - 2);
  INSERT INTO goal_comments (org_id, goal_id, author_id, body) VALUES (o, g, mgr, 'Push the pipeline');
  PERFORM probation_tick();

  PERFORM pg_temp.as_user(a);
  r := profile_360(a);
  PERFORM pg_temp.eq('360: the person sees their own in full', r->>'access', 'full');
  PERFORM pg_temp.eq('360: employee id shown', r->>'employee_code', (SELECT employee_code FROM profiles WHERE id = a));
  PERFORM pg_temp.eq('360: manager name', r->>'manager_name', 'Mohan Mgr');
  PERFORM pg_temp.eq('360: HR contact', r->'hr_contact'->>'full_name', 'Hema HR');
  PERFORM pg_temp.eq('360: tasks total', (r->'tasks'->>'total')::int, 2);
  PERFORM pg_temp.eq('360: tasks overdue', (r->'tasks'->>'overdue')::int, 1);
  PERFORM pg_temp.eq('360: completion rate starts at zero', (r->'tasks'->>'completion_rate')::int, 0);
  PERFORM pg_temp.eq('360: goals listed', jsonb_array_length(r->'goals'), 1);
  PERFORM pg_temp.eq('360: probation shown', r->'probation'->>'status', 'on_probation');
  PERFORM pg_temp.eq('360: leave balances present', jsonb_array_length(r->'leave'->'balances') >= 3, true);
  PERFORM pg_temp.eq('360: attendance counts the month so far', (r->'attendance'->>'working_days') IS NOT NULL, true);
  PERFORM pg_temp.eq('360: the manager''s comment shows up as activity',
    (SELECT count(*) FROM jsonb_array_elements(r->'recent') e WHERE e->>'kind' = 'goal_comment' AND e->>'text' LIKE '%Push the pipeline%')::int, 1);

  PERFORM pg_temp.as_user(mgr);
  PERFORM pg_temp.eq('360: the manager sees the report in full', profile_360(a)->>'access', 'full');
  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.eq('360: HR sees anyone in full', profile_360(a)->>'access', 'full');
  PERFORM pg_temp.as_user(b);
  r := profile_360(a);
  PERFORM pg_temp.eq('360: a peer gets the directory card only', r->>'access', 'directory');
  PERFORM pg_temp.eq('360: ...with no work, leave or goals in it', r ? 'tasks' OR r ? 'leave' OR r ? 'goals' OR r ? 'attendance', false);
  PERFORM pg_temp.eq('360: ...but the basics are there', r->>'full_name', 'Asha Member');
  PERFORM pg_temp.fails('360: nobody from another organisation', format('SELECT profile_360(%L)', outsider), 'Not found');
END $$;

-- ═══════════ H. THE HOLIDAY CALENDAR ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr'); a uuid := (SELECT v FROM ids WHERE k='a');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  d1 date := today - 5; d2 date := today - 6; d3 date := today - 7; d4 date := today - 8;
  c_nat uuid; c_opt uuid; c_prop uuid; n int;
BEGIN
  PERFORM pg_temp.as_user(hr);

  INSERT INTO holiday_calendar (org_id, date, name, kind) VALUES (o, d1, 'Test National', 'national') RETURNING id INTO c_nat;
  PERFORM pg_temp.eq('holiday: an approved national holiday is a day off',
    (SELECT count(*) FROM holidays WHERE org_id = o AND date = d1 AND calendar_id = c_nat)::int, 1);
  PERFORM pg_temp.eq('holiday: ...and the attendance engine sees it', attendance_day_info(a, d1)->>'kind' IN ('holiday', 'weekly_off'), true);

  INSERT INTO holiday_calendar (org_id, date, name, kind) VALUES (o, d2, 'Test Optional', 'optional') RETURNING id INTO c_opt;
  PERFORM pg_temp.eq('holiday: an optional holiday is not a day off for everyone',
    (SELECT count(*) FROM holidays WHERE org_id = o AND date = d2)::int, 0);
  PERFORM pg_temp.eq('holiday: restricted is the same', (SELECT count(*) FROM holidays WHERE org_id = o AND date = d3)::int, 0);

  INSERT INTO holiday_calendar (org_id, date, name, kind, status, source) VALUES (o, d3, 'Test Proposed', 'regional', 'proposed', 'suggested') RETURNING id INTO c_prop;
  PERFORM pg_temp.eq('holiday: a proposed holiday is not a day off yet', (SELECT count(*) FROM holidays WHERE org_id = o AND date = d3)::int, 0);
  PERFORM pg_temp.eq('holiday: who proposed it', (SELECT proposed_by FROM holiday_calendar WHERE id = c_prop), hr);

  UPDATE holiday_calendar SET status = 'approved' WHERE id = c_prop;
  PERFORM pg_temp.eq('holiday: approving makes it a day off', (SELECT count(*) FROM holidays WHERE org_id = o AND date = d3 AND calendar_id = c_prop)::int, 1);
  PERFORM pg_temp.eq('holiday: who approved it', (SELECT approved_by FROM holiday_calendar WHERE id = c_prop), hr);

  UPDATE holiday_calendar SET kind = 'optional' WHERE id = c_prop;
  PERFORM pg_temp.eq('holiday: turning it optional takes the day off away', (SELECT count(*) FROM holidays WHERE org_id = o AND date = d3)::int, 0);
  UPDATE holiday_calendar SET kind = 'company', date = d4 WHERE id = c_prop;
  PERFORM pg_temp.eq('holiday: moving a date moves the day off',
    (SELECT count(*) FROM holidays WHERE org_id = o AND date = d4 AND calendar_id = c_prop)::int, 1);

  DELETE FROM holiday_calendar WHERE id = c_nat;
  PERFORM pg_temp.eq('holiday: removing an entry removes the day off', (SELECT count(*) FROM holidays WHERE org_id = o AND date = d1)::int, 0);

  -- old direct writes still work and stay in step
  INSERT INTO holidays (org_id, date, name) VALUES (o, today - 12, 'Legacy Day');
  PERFORM pg_temp.eq('holiday: a direct write appears on the calendar',
    (SELECT count(*) FROM holiday_calendar WHERE org_id = o AND name = 'Legacy Day' AND source = 'legacy' AND status = 'approved')::int, 1);
  PERFORM pg_temp.eq('holiday: ...and is linked', (SELECT calendar_id IS NOT NULL FROM holidays WHERE name = 'Legacy Day'), true);
  DELETE FROM holidays WHERE name = 'Legacy Day';
  PERFORM pg_temp.eq('holiday: a direct delete clears the calendar too', (SELECT count(*) FROM holiday_calendar WHERE name = 'Legacy Day')::int, 0);

  -- the story in the audit trail, once each
  PERFORM pg_temp.eq('holiday audit: add', (SELECT count(*) FROM audit_log WHERE action = 'holiday.add' AND summary LIKE '%Test National%')::int, 1);
  PERFORM pg_temp.eq('holiday audit: propose', (SELECT count(*) FROM audit_log WHERE action = 'holiday.propose')::int, 1);
  PERFORM pg_temp.eq('holiday audit: approve', (SELECT count(*) FROM audit_log WHERE action = 'holiday.approve' AND summary LIKE '% approved %')::int, 1);
  PERFORM pg_temp.eq('holiday audit: edit', (SELECT count(*) FROM audit_log WHERE action = 'holiday.edit')::int, 2);
  PERFORM pg_temp.eq('holiday audit: remove', (SELECT count(*) FROM audit_log WHERE action = 'holiday.remove' AND summary LIKE '%Test National%')::int, 1);
  PERFORM pg_temp.eq('holiday audit: a legacy write is logged once, not twice',
    (SELECT count(*) FROM audit_log WHERE summary LIKE '%Legacy Day%' AND action IN ('holiday.add'))::int, 1);
END $$;

-- who can see and change the calendar
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr'); a uuid := (SELECT v FROM ids WHERE k='a');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; n int;
BEGIN
  PERFORM pg_temp.as_user(hr);
  INSERT INTO holiday_calendar (org_id, date, name, kind, status) VALUES (o, today + 20, 'Secret Proposal', 'company', 'proposed');
  INSERT INTO holiday_calendar (org_id, date, name, kind, status) VALUES (o, today + 21, 'Public One', 'company', 'approved');

  PERFORM pg_temp.as_user(a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM holiday_calendar WHERE name = 'Secret Proposal';
  PERFORM pg_temp.eq('holiday access: a member does not see proposals', n, 0);
  SELECT count(*) INTO n FROM holiday_calendar WHERE name = 'Public One';
  PERFORM pg_temp.eq('holiday access: a member sees approved ones', n, 1);
  PERFORM pg_temp.fails('holiday access: a member cannot add',
    format('INSERT INTO holiday_calendar (org_id, date, name) VALUES (%L, %L, ''Mine'')', o, today + 30), 'row-level security');
  RESET ROLE;
END $$;

-- ═══════════ H. BIRTHDAYS ═══════════
DO $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM pg_temp.eq('birthday_next: later this year', birthday_next('12-25', date '2026-10-19'), date '2026-12-25');
  PERFORM pg_temp.eq('birthday_next: already passed rolls to next year', birthday_next('01-05', date '2026-10-19'), date '2027-01-05');
  PERFORM pg_temp.eq('birthday_next: today counts', birthday_next('10-19', date '2026-10-19'), date '2026-10-19');
  PERFORM pg_temp.eq('birthday_next: 29 Feb in a normal year is kept on 28 Feb', birthday_next('02-29', date '2027-01-10'), date '2027-02-28');
  PERFORM pg_temp.eq('birthday_next: 29 Feb in a leap year is 29 Feb', birthday_next('02-29', date '2028-01-10'), date '2028-02-29');
  PERFORM pg_temp.eq('birthday_next: nonsense gives null', birthday_next('13-40', date '2026-10-19'), NULL::date);
  PERFORM pg_temp.eq('birthday_next: empty gives null', birthday_next(NULL, date '2026-10-19'), NULL::date);
END $$;

DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
  b uuid := (SELECT v FROM ids WHERE k='b'); a uuid := (SELECT v FROM ids WHERE k='a');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; adm uuid; u uuid := gen_random_uuid();
BEGIN
  PERFORM pg_temp.as_user(hr);
  -- Hema (HR) has a birthday in 3 days; a second HR-level person will hear about it, she will not
  INSERT INTO auth.users (id, email) VALUES (u, 'adm@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on) VALUES (o, 'Boss Bee', 'admin', u, date '2025-01-01') RETURNING id INTO adm;
  UPDATE profiles SET birthday = to_char(today + 5, 'MM-DD') WHERE id = a;      -- Asha, in 5 days: not a default lead time
  UPDATE profiles SET birthday = to_char(today + 1, 'MM-DD') WHERE id = b;      -- Bala, tomorrow

  PERFORM pg_temp.eq('birthday reminder: first run', birthday_reminders() >= 2, true);
  PERFORM pg_temp.eq('birthday reminder: admin told about the 3-day birthday',
    (SELECT count(*) FROM notifications WHERE profile_id = adm AND title LIKE 'Hema HR''s birthday is in 3 days%')::int, 1);
  PERFORM pg_temp.eq('birthday reminder: and about tomorrow''s',
    (SELECT count(*) FROM notifications WHERE profile_id = adm AND title = 'Bala Member''s birthday is tomorrow')::int, 1);
  PERFORM pg_temp.eq('birthday reminder: nobody is told about their own',
    (SELECT count(*) FROM notifications WHERE profile_id = hr AND title LIKE 'Hema HR''s birthday%')::int, 0);
  PERFORM pg_temp.eq('birthday reminder: a 5-day lead is not in the default 7/3/1',
    (SELECT count(*) FROM notifications WHERE profile_id = adm AND title LIKE 'Asha Member''s birthday%')::int, 0);
  PERFORM pg_temp.eq('birthday reminder: ordinary members get none',
    (SELECT count(*) FROM notifications WHERE profile_id = mgr AND title LIKE '%birthday is%')::int, 0);
  PERFORM pg_temp.eq('birthday reminder: a second run says nothing new', birthday_reminders(), 0);

  UPDATE organisations SET settings = '{"birthday_reminder_days":[5]}' WHERE id = o;
  PERFORM pg_temp.eq('birthday reminder: the lead times are configurable', birthday_reminders(), 1);
  PERFORM pg_temp.eq('birthday reminder: ...and used', (SELECT count(*) FROM notifications WHERE profile_id = adm AND title LIKE 'Asha Member''s birthday is in 5 days%')::int, 1);

  UPDATE organisations SET settings = '{"birthday_reminders_enabled":false}' WHERE id = o;
  UPDATE profiles SET birthday = to_char(today + 7, 'MM-DD') WHERE id = mgr;
  PERFORM pg_temp.eq('birthday reminder: can be switched off', birthday_reminders(), 0);
  UPDATE organisations SET settings = '{}' WHERE id = o;
END $$;

-- ═══════════ I. REPORTS ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
  a uuid := (SELECT v FROM ids WHERE k='a'); b uuid := (SELECT v FROM ids WHERE k='b');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  r jsonb; rep text; cols int;
BEGIN
  -- Asha: three attended days and a late one last week; some leave
  PERFORM set_config('app.attendance_write', 'on', true);
  INSERT INTO attendance (org_id, profile_id, date, marked_at, status) VALUES
    (o, a, today - 1, ((today - 1)::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata', 'present'),
    (o, a, today - 2, ((today - 2)::text || ' 11:40')::timestamp AT TIME ZONE 'Asia/Kolkata', 'present'),
    (o, a, today - 3, ((today - 3)::text || ' 09:45')::timestamp AT TIME ZONE 'Asia/Kolkata', 'wfh');
  PERFORM set_config('app.attendance_write', 'off', true);
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days, status, decided_by, decided_at)
  VALUES (o, a, 'casual', today + 2, today + 2, 1, 'approved', mgr, now());
  INSERT INTO el_policy (org_id) VALUES (o) ON CONFLICT DO NOTHING;
  UPDATE el_policy SET required_days = 1 WHERE org_id = o;
  PERFORM el_run_credits(a);        -- the nightly job, run by hand: one credit per eligible day

  PERFORM pg_temp.as_user(hr);
  -- every report runs and has the shape the screen and the exporters expect
  FOREACH rep IN ARRAY ARRAY['attendance','tasks','activity','goals','department','manager','leave','earned_leave','holidays','probation','birthdays'] LOOP
    r := report_run(rep, today - 20, today + 40);
    cols := jsonb_array_length(r->'columns');
    PERFORM pg_temp.eq('report ' || rep || ': has a title and columns', (r->>'title') IS NOT NULL AND cols >= 5, true);
    PERFORM pg_temp.eq('report ' || rep || ': rows are a list', jsonb_typeof(r->'rows'), 'array');
    PERFORM pg_temp.eq('report ' || rep || ': every column key exists in the rows',
      NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'columns') c, jsonb_array_elements(r->'rows') w
                   WHERE NOT (w ? (c->>'key'))), true);
  END LOOP;

  r := report_run('attendance', today - 6, today - 1);
  PERFORM pg_temp.eq('attendance report: Asha present days (late counts as present)',
    (SELECT (w->>'present')::int FROM jsonb_array_elements(r->'rows') w WHERE w->>'name' = 'Asha Member'), 2);
  PERFORM pg_temp.eq('attendance report: Asha late', (SELECT (w->>'late')::int FROM jsonb_array_elements(r->'rows') w WHERE w->>'name' = 'Asha Member'), 1);
  PERFORM pg_temp.eq('attendance report: Asha work from home', (SELECT (w->>'wfh')::int FROM jsonb_array_elements(r->'rows') w WHERE w->>'name' = 'Asha Member'), 1);
  PERFORM pg_temp.eq('attendance report: everyone in scope is listed', jsonb_array_length(r->'rows') >= 4, true);

  r := report_run('tasks', today - 5, today + 5);
  PERFORM pg_temp.eq('tasks report: runs for HR', jsonb_typeof(r->'rows'), 'array');

  r := report_run('department', today - 6, today - 1);
  PERFORM pg_temp.eq('department report: Sales is a row', (SELECT count(*) FROM jsonb_array_elements(r->'rows') w WHERE w->>'group' = 'Sales')::int, 1);
  PERFORM pg_temp.eq('department report: Sales has two people', (SELECT (w->>'people')::int FROM jsonb_array_elements(r->'rows') w WHERE w->>'group' = 'Sales'), 2);
  r := report_run('manager', today - 6, today - 1);
  PERFORM pg_temp.eq('manager report: Mohan''s team is Asha', (SELECT (w->>'people')::int FROM jsonb_array_elements(r->'rows') w WHERE w->>'group' = 'Mohan Mgr'), 1);

  r := report_run('leave', today, today + 5);
  PERFORM pg_temp.eq('leave report: the approved request is there',
    (SELECT count(*) FROM jsonb_array_elements(r->'rows') w WHERE w->>'name' = 'Asha Member' AND w->>'status' = 'Approved')::int, 1);
  PERFORM pg_temp.eq('leave report: who decided', (SELECT w->>'decided_by' FROM jsonb_array_elements(r->'rows') w WHERE w->>'name' = 'Asha Member'), 'Mohan Mgr');

  r := report_run('earned_leave', today - 10, today + 1);
  PERFORM pg_temp.eq('earned leave report: Asha''s credits (one day per punch with a 1-day rule) appear',
    (SELECT count(*) FROM jsonb_array_elements(r->'rows') w WHERE w->>'name' = 'Asha Member' AND w->>'kind' = 'Credit')::int >= 1, true);
  PERFORM pg_temp.eq('earned leave report: the calculation is shown',
    (SELECT bool_and((w->>'period') LIKE '% to %') FROM jsonb_array_elements(r->'rows') w WHERE w->>'kind' = 'Credit'), true);

  r := report_run('holidays', today - 30, today + 30);
  PERFORM pg_temp.eq('holiday report: proposed and optional ones are listed with their status',
    (SELECT count(*) FROM jsonb_array_elements(r->'rows') w WHERE w->>'name' = 'Secret Proposal' AND w->>'status' = 'Proposed')::int, 1);

  r := report_run('probation', NULL, NULL);
  PERFORM pg_temp.eq('probation report: Asha is on probation', (SELECT w->>'status' FROM jsonb_array_elements(r->'rows') w WHERE w->>'name' = 'Asha Member'), 'On probation');

  r := report_run('birthdays', today, today + 10);
  PERFORM pg_temp.eq('birthday report: the next ten days',
    (SELECT count(*) FROM jsonb_array_elements(r->'rows') w WHERE w->>'name' IN ('Hema HR', 'Bala Member', 'Asha Member'))::int, 3);
  PERFORM pg_temp.eq('birthday report: in date order', (SELECT (r->'rows'->0->>'name')), 'Bala Member');

  r := report_run('goals', NULL, NULL);
  PERFORM pg_temp.eq('goal report: the active cycle is named', (r->>'subtitle') LIKE 'Cycle: Cycle%', true);
END $$;

DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k='hr'); mgr uuid := (SELECT v FROM ids WHERE k='mgr'); a uuid := (SELECT v FROM ids WHERE k='a');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; r jsonb; rep text;
BEGIN
  PERFORM pg_temp.as_user(a);
  PERFORM pg_temp.fails('report access: members have none', 'SELECT report_run(''attendance'')', 'Not allowed');

  PERFORM pg_temp.as_user(mgr);
  r := report_run('attendance', today - 6, today - 1);
  PERFORM pg_temp.eq('report access: a manager sees their line only (self + Asha)', jsonb_array_length(r->'rows'), 2);
  FOREACH rep IN ARRAY ARRAY['tasks', 'activity', 'goals'] LOOP
    r := report_run(rep, today - 6, today);
    PERFORM pg_temp.eq('report access: a manager can run ' || rep, jsonb_typeof(r->'rows'), 'array');
  END LOOP;
  FOREACH rep IN ARRAY ARRAY['department', 'manager', 'leave', 'earned_leave', 'holidays', 'probation', 'birthdays'] LOOP
    PERFORM pg_temp.fails('report access: a manager cannot run ' || rep, format('SELECT report_run(%L)', rep), 'Not allowed');
  END LOOP;

  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.fails('report limits: unknown report', 'SELECT report_run(''nope'')', 'Unknown report');
  PERFORM pg_temp.fails('report limits: backwards range', format('SELECT report_run(''attendance'', %L, %L)', today, today - 3), 'before the start');
  PERFORM pg_temp.fails('report limits: too long for people reports', format('SELECT report_run(''attendance'', %L, %L)', today - 200, today), 'at most 93 days');
  PERFORM pg_temp.eq('report limits: a long range is fine for calendar-style reports', jsonb_typeof(report_run('holidays', today - 200, today)->'rows'), 'array');
END $$;

ROLLBACK;
