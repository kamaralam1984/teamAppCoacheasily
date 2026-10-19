-- Attendance engine + earned-leave rules: behaviour tests.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/attendance_engine.sql
-- Any failed check raises an exception and stops the run.

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
    IF position(expect_text IN SQLERRM) = 0 THEN
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

-- ───────── fixtures ─────────
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO PUBLIC;

DO $$
DECLARE
  o uuid; hr uuid; mgr uuid; a uuid; b uuid;
  -- four brand-new logins; never reuse anyone who already exists in the database
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('T', '{"daily_meeting_time":"11:00"}') RETURNING id INTO o;
  INSERT INTO ids VALUES ('org', o);

  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;

  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'HR Hema', 'hr', uids[1], date '2025-01-01', 'Sunday') RETURNING id INTO hr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o, 'Manager Mohan', 'manager', uids[2], date '2025-01-01', 'Sunday', hr) RETURNING id INTO mgr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o, 'Member Asha', 'member', uids[3], date '2025-01-01', 'Sunday', mgr) RETURNING id INTO a;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Member Bala', 'member', uids[4], date '2025-01-01', 'Sunday') RETURNING id INTO b;
  INSERT INTO ids VALUES ('hr', hr), ('mgr', mgr), ('a', a), ('b', b);
END $$;

-- ───────── mark attendance ─────────
DO $$
DECLARE hr uuid := (SELECT v FROM ids WHERE k='hr'); a uuid := (SELECT v FROM ids WHERE k='a'); r jsonb;
BEGIN
  PERFORM pg_temp.as_user(a);
  r := mark_attendance('plan');
  PERFORM pg_temp.eq('mark: default status is present', r->>'status', 'present');
  PERFORM pg_temp.fails('mark: second punch same day', 'SELECT mark_attendance()', 'duplicate key');
END $$;

DO $$
DECLARE b uuid := (SELECT v FROM ids WHERE k='b'); r jsonb;
BEGIN
  PERFORM pg_temp.as_user(b);
  PERFORM pg_temp.fails('mark: bad status', $q$SELECT mark_attendance(NULL, 'nap')$q$, 'Choose office');
  r := mark_attendance(NULL, 'wfh');
  PERFORM pg_temp.eq('mark: wfh stored', r->>'status', 'wfh');
  PERFORM pg_temp.eq('summary: today_status', r->'summary'->>'today_status', 'wfh');
END $$;

-- ───────── check-out ─────────
DO $$
DECLARE a uuid := (SELECT v FROM ids WHERE k='a'); hr uuid := (SELECT v FROM ids WHERE k='hr'); r jsonb;
BEGIN
  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.fails('checkout: before marking in', 'SELECT check_out_attendance()', 'Mark your attendance');
  PERFORM pg_temp.as_user(a);
  -- put the check-in an hour back so hours are measurable
  PERFORM set_config('app.attendance_write', 'on', true);
  UPDATE attendance SET marked_at = now() - interval '2 hours' WHERE profile_id = a;
  PERFORM set_config('app.attendance_write', 'off', true);
  r := check_out_attendance();
  PERFORM pg_temp.eq('checkout: ~2 hours', (r->>'hours')::numeric BETWEEN 1.9 AND 2.1, true);
  PERFORM pg_temp.fails('checkout: twice', 'SELECT check_out_attendance()', 'already checked out');
  PERFORM pg_temp.eq('summary: checked_out', (attendance_summary(a))->>'checked_out', 'true');
END $$;

-- an employee cannot rewrite status / check-out through a plain UPDATE (RLS role)
DO $$
DECLARE a uuid := (SELECT v FROM ids WHERE k='a'); s text; c timestamptz;
BEGIN
  PERFORM pg_temp.as_user(a);
  SET LOCAL ROLE authenticated;
  UPDATE attendance SET status = 'half_day', check_out_at = now() + interval '9 hours', focus = 'edited'
   WHERE profile_id = a;
  RESET ROLE;
  SELECT status, check_out_at INTO s, c FROM attendance WHERE profile_id = a;
  PERFORM pg_temp.eq('lock: status unchanged', s, 'present');
  PERFORM pg_temp.eq('lock: check-out unchanged', c <= now(), true);
  PERFORM pg_temp.eq('lock: focus still editable', (SELECT focus FROM attendance WHERE profile_id = a), 'edited');
END $$;

-- ───────── day kinds ─────────
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); a uuid := (SELECT v FROM ids WHERE k='a');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  d_hol date; d_off date; d_leave date; d_late date; d_absent date;
BEGIN
  -- four distinct working days (not Sundays) going back from yesterday, and the latest Sunday
  d_late := today - 1;   WHILE extract(dow FROM d_late)   = 0 LOOP d_late   := d_late   - 1; END LOOP;
  d_leave := d_late - 1; WHILE extract(dow FROM d_leave)  = 0 LOOP d_leave  := d_leave  - 1; END LOOP;
  d_hol := d_leave - 1;  WHILE extract(dow FROM d_hol)    = 0 LOOP d_hol    := d_hol    - 1; END LOOP;
  d_absent := d_hol - 1; WHILE extract(dow FROM d_absent) = 0 LOOP d_absent := d_absent - 1; END LOOP;
  d_off := today - 1;    WHILE extract(dow FROM d_off)    <> 0 LOOP d_off   := d_off    - 1; END LOOP;

  INSERT INTO holidays (org_id, date, name) VALUES (o, d_hol, 'Fest');
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days, status)
  VALUES (o, a, 'casual', d_leave, d_leave, 1, 'approved');
  PERFORM set_config('app.attendance_write', 'on', true);
  INSERT INTO attendance (org_id, profile_id, date, marked_at, status)
  VALUES (o, a, d_late, (d_late::text || ' 11:40')::timestamp AT TIME ZONE 'Asia/Kolkata', 'present');
  PERFORM set_config('app.attendance_write', 'off', true);

  PERFORM pg_temp.eq('kind: late',        attendance_day_info(a, d_late)->>'kind',   'late');
  PERFORM pg_temp.eq('kind: holiday',     attendance_day_info(a, d_hol)->>'kind',    'holiday');
  PERFORM pg_temp.eq('kind: weekly off',  attendance_day_info(a, d_off)->>'kind',    'weekly_off');
  PERFORM pg_temp.eq('kind: leave',       attendance_day_info(a, d_leave)->>'kind',  'leave');
  PERFORM pg_temp.eq('kind: absent',      attendance_day_info(a, d_absent)->>'kind', 'absent');
  PERFORM pg_temp.eq('kind: today is present or late', attendance_day_info(a, today)->>'kind' IN ('present', 'late'), true);
  PERFORM pg_temp.eq('kind: upcoming',    attendance_day_info(a, today + 5)->>'kind','upcoming');
  PERFORM pg_temp.eq('kind: before joining', attendance_day_info(a, date '2024-12-01')->>'kind', 'not_joined');
  PERFORM pg_temp.eq('kind: today unmarked is not absent',
                     attendance_day_info((SELECT v FROM ids WHERE k='hr'), today)->>'kind', 'not_marked');
END $$;

-- ───────── month / team / range access ─────────
DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k='hr'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
  a uuid := (SELECT v FROM ids WHERE k='a'); b uuid := (SELECT v FROM ids WHERE k='b');
  m jsonb; t jsonb; r jsonb;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM pg_temp.as_user(a);
  m := attendance_month(a, today);
  PERFORM pg_temp.eq('month: one entry per day',
    jsonb_array_length(m->'days'),
    extract(day FROM (date_trunc('month', today::timestamp) + interval '1 month - 1 day'))::int);
  PERFORM pg_temp.fails('month: member cannot read a peer', format('SELECT attendance_month(%L)', b), 'Not allowed');
  PERFORM pg_temp.fails('team: member denied', 'SELECT attendance_team_day()', 'Not allowed');

  PERFORM pg_temp.as_user(mgr);
  PERFORM attendance_month(a, today);
  PERFORM pg_temp.fails('month: manager cannot read outside the line', format('SELECT attendance_month(%L)', b), 'Not allowed');
  t := attendance_team_day();
  PERFORM pg_temp.eq('team: manager sees only the line (self + Asha)', jsonb_array_length(t), 2);

  PERFORM pg_temp.as_user(hr);
  t := attendance_team_day();
  PERFORM pg_temp.eq('team: HR sees everyone', jsonb_array_length(t), 4);

  r := attendance_range_report(today - 6, today);
  PERFORM pg_temp.eq('range: one row per person', jsonb_array_length(r), 4);
  PERFORM pg_temp.fails('range: too long', format('SELECT attendance_range_report(%L, %L)', today - 200, today), 'at most 93 days');
END $$;

-- ───────── HR correction ─────────
DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k='hr'); a uuid := (SELECT v FROM ids WHERE k='a'); b uuid := (SELECT v FROM ids WHERE k='b');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  d date := today - 20; r jsonb; n int;
BEGIN
  WHILE extract(dow FROM d) = 0 OR EXISTS (SELECT 1 FROM holidays WHERE date = d) LOOP d := d - 1; END LOOP;

  PERFORM pg_temp.as_user(a);
  PERFORM pg_temp.fails('correct: member denied',
    format('SELECT attendance_correct(%L, %L, ''set'', NULL, NULL, NULL, ''because'')', a, d), 'Not allowed');

  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.fails('correct: reason required',
    format('SELECT attendance_correct(%L, %L, ''set'', ''present'', ''09:30'', NULL, '' '')', a, d), 'reason');
  PERFORM pg_temp.fails('correct: no future',
    format('SELECT attendance_correct(%L, %L, ''set'', ''present'', ''09:30'', NULL, ''x y z'')', a, today + 1), 'future');
  PERFORM pg_temp.fails('correct: check-out before check-in',
    format('SELECT attendance_correct(%L, %L, ''set'', ''present'', ''10:00'', ''09:00'', ''typo fix'')', a, d), 'after check-in');
  PERFORM pg_temp.fails('correct: nothing to remove',
    format('SELECT attendance_correct(%L, %L, ''remove'', NULL, NULL, NULL, ''no such'')', a, d), 'no attendance');

  r := attendance_correct(a, d, 'set', 'present', '09:30', '18:15', 'Forgot to punch');
  PERFORM pg_temp.eq('correct: added day is on time', r->>'kind', 'present');
  PERFORM pg_temp.eq('correct: hours', (r->>'hours')::numeric, 8.75);

  r := attendance_correct(a, d, 'set', 'wfh', '11:30', NULL, 'Was working from home');
  PERFORM pg_temp.eq('correct: edit to wfh', r->>'kind', 'wfh');
  r := attendance_correct(a, d, 'set', 'present', NULL, NULL, 'Back to office');
  PERFORM pg_temp.eq('correct: late recomputed from the new check-in', r->>'late', 'true');

  r := attendance_correct(a, d, 'remove', NULL, NULL, NULL, 'Entered by mistake');
  PERFORM pg_temp.eq('correct: removed day is absent', r->>'kind', 'absent');

  SELECT count(*) INTO n FROM attendance_corrections WHERE profile_id = a AND date = d;
  PERFORM pg_temp.eq('audit: four corrections logged', n, 4);
  PERFORM pg_temp.eq('audit: old value kept',
    EXISTS (SELECT 1 FROM attendance_corrections
             WHERE profile_id = a AND date = d AND old_value->>'status' = 'wfh'
               AND new_value->>'status' = 'present'), true);
  PERFORM pg_temp.eq('notify: employee told',
    (SELECT count(*) FROM notifications WHERE profile_id = a AND title LIKE 'Your attendance for%') >= 1, true);

  PERFORM pg_temp.as_user(a);
  PERFORM pg_temp.eq('audit: employee can read own log', jsonb_array_length(attendance_corrections_for()) >= 4, true);
  PERFORM pg_temp.as_user(b);
  PERFORM pg_temp.fails('audit: nobody else can', format('SELECT attendance_corrections_for(%L)', a), 'Not allowed');
END $$;

-- ───────── earned leave rules ─────────
-- fresh person with a clean slate for the counting rules
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr');
  u uuid := gen_random_uuid(); p uuid;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  d date; n int := 0; i int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'el@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, opening_earned_leave)
  VALUES (o, 'EL Esha', 'member', u, today - 200, NULL, 2) RETURNING id INTO p;
  INSERT INTO ids VALUES ('el', p);

  -- 10 present + 6 wfh + 4 half-day punches on consecutive days
  d := today - 100;
  FOR i IN 1..20 LOOP
    PERFORM set_config('app.attendance_write', 'on', true);
    INSERT INTO attendance (org_id, profile_id, date, marked_at, status)
    VALUES (o, p, d, (d::text || ' 10:00')::timestamp AT TIME ZONE 'Asia/Kolkata',
            CASE WHEN i <= 10 THEN 'present' WHEN i <= 16 THEN 'wfh' ELSE 'half_day' END);
    d := d + 1;
  END LOOP;
  PERFORM set_config('app.attendance_write', 'off', true);
END $$;

DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k='hr'); p uuid := (SELECT v FROM ids WHERE k='el');
  o uuid := (SELECT v FROM ids WHERE k='org'); cnt int;
BEGIN
  PERFORM pg_temp.as_user(hr);
  -- defaults: wfh counts, half day does not -> 16 eligible days, no credit yet
  SELECT count(*) INTO cnt FROM el_eligible_days(p, date '1900-01-01');
  PERFORM pg_temp.eq('el rule: default counts present + wfh only', cnt, 16);

  UPDATE el_policy SET count_wfh = false WHERE org_id = o;
  SELECT count(*) INTO cnt FROM el_eligible_days(p, date '1900-01-01');
  PERFORM pg_temp.eq('el rule: wfh off', cnt, 10);

  UPDATE el_policy SET count_wfh = true, count_half_day = true WHERE org_id = o;
  SELECT count(*) INTO cnt FROM el_eligible_days(p, date '1900-01-01');
  PERFORM pg_temp.eq('el rule: half day on', cnt, 20);

  PERFORM pg_temp.eq('credit: exactly 20 days gives one credit', el_run_credits(p), 1);
  PERFORM pg_temp.eq('credit: running again adds nothing', el_run_credits(p), 0);
  PERFORM pg_temp.eq('credit: balance = opening 2 + 1', (attendance_summary(p)->>'earned_available')::int, 3);
  PERFORM pg_temp.eq('ledger: one credit row',
    (SELECT count(*) FROM jsonb_array_elements(el_ledger_for(p)) e WHERE e->>'kind' = 'credit')::int, 1);
END $$;

-- probation days can be excluded; days before joining never count
DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k='hr'); o uuid := (SELECT v FROM ids WHERE k='org');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  p uuid; u uuid := gen_random_uuid(); d date; i int; cnt int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'pr@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Probation Pia', 'member', u, today - 30, NULL) RETURNING id INTO p;
  d := today - 40;                                    -- 10 days before joining
  FOR i IN 1..40 LOOP
    PERFORM set_config('app.attendance_write', 'on', true);
    INSERT INTO attendance (org_id, profile_id, date, marked_at)
    VALUES (o, p, d, (d::text || ' 10:00')::timestamp AT TIME ZONE 'Asia/Kolkata');
    d := d + 1;
  END LOOP;
  PERFORM set_config('app.attendance_write', 'off', true);
  PERFORM pg_temp.as_user(hr);

  SELECT count(*) INTO cnt FROM el_eligible_days(p, date '1900-01-01');
  -- joined 30 days ago: 30 punches count, minus any company holiday in that window
  PERFORM pg_temp.eq('join: days before joining are ignored', cnt,
    30 - (SELECT count(*)::int FROM holidays WHERE org_id = o AND date BETWEEN today - 30 AND today - 1));

  PERFORM probation_tick();                           -- creates the probation row (3 months)
  UPDATE el_policy SET count_during_probation = false WHERE org_id = o;
  SELECT count(*) INTO cnt FROM el_eligible_days(p, date '1900-01-01');
  PERFORM pg_temp.eq('probation: nothing counts while on probation', cnt, 0);
  UPDATE el_policy SET count_during_probation = true WHERE org_id = o;
END $$;

-- ───────── carry-forward limit ─────────
DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k='hr'); o uuid := (SELECT v FROM ids WHERE k='org');
  p uuid := (SELECT v FROM ids WHERE k='el');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  ys date; since date;
BEGIN
  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.eq('lapse: off by default', el_run_lapses(p), 0);

  -- turning a limit on today never touches a leave year that already started
  UPDATE el_policy SET carry_forward_limit = 1 WHERE org_id = o;
  PERFORM pg_temp.eq('lapse: since is today', (SELECT carry_forward_since FROM el_policy WHERE org_id = o), today);
  PERFORM pg_temp.eq('lapse: no wipe of the current year', el_run_lapses(p), 0);

  -- pretend the limit was set before the current leave year began
  ys := make_date(extract(year FROM today)::int, extract(month FROM today)::int, 1);   -- this month starts a "year"
  UPDATE el_policy SET year_start_month = extract(month FROM today)::int,
                       carry_forward_since = ys - 40 WHERE org_id = o;
  -- the trigger resets "since" when the month changes, so set it again after
  UPDATE el_policy SET carry_forward_since = ys - 40 WHERE org_id = o;
  PERFORM pg_temp.eq('lapse: balance before', (attendance_summary(p)->>'earned_available')::int, 3);
  PERFORM pg_temp.eq('lapse: one row written', el_run_lapses(p), 1);
  PERFORM pg_temp.eq('lapse: balance after (limit 1)', (attendance_summary(p)->>'earned_available')::int, 1);
  PERFORM pg_temp.eq('lapse: idempotent', el_run_lapses(p), 0);
  PERFORM pg_temp.eq('lapse: shows in the ledger',
    (SELECT count(*) FROM jsonb_array_elements(el_ledger_for(p)) e WHERE e->>'kind' = 'lapse')::int, 1);
  PERFORM pg_temp.eq('lapse: employee told',
    (SELECT count(*) FROM notifications WHERE profile_id = p AND title LIKE '%lapsed%')::int, 1);
END $$;

-- leave_balances: earned leave taken in any year counts against the running balance
DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k='hr'); o uuid := (SELECT v FROM ids WHERE k='org');
  p uuid := (SELECT v FROM ids WHERE k='el'); r jsonb;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM pg_temp.as_user(hr);
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days, status)
  VALUES (o, p, 'earned', today - 400, today - 400, 1, 'approved');
  SELECT e INTO r FROM jsonb_array_elements(leave_balances(p)) e WHERE e->>'type' = 'earned';
  PERFORM pg_temp.eq('balances: last year''s earned leave counted', (r->>'used')::numeric, 1::numeric);
  PERFORM pg_temp.eq('balances: earned balance = entitled - used', (r->>'balance')::numeric, 0::numeric);
END $$;

-- ───────── the 20-day rule, the way HR describes it ─────────
-- 1 earned leave after 20 working days, 1 more after 40 (so 2 in all), none at 19 or 39.
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  u uuid := gen_random_uuid(); p uuid; start_day date := today - 300; i int;
  r record;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'rule@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, opening_earned_leave)
  VALUES (o, 'Rule Rani', 'member', u, start_day - 5, NULL, 0) RETURNING id INTO p;
  INSERT INTO el_policy (org_id) VALUES (o) ON CONFLICT DO NOTHING;
  -- plain policy: the carry-forward test above left a limit on, which would (rightly) lapse a day
  UPDATE el_policy SET required_days = 20, credit_amount = 1, max_balance = 30,
         exclude_weekly_off = true, exclude_holidays = true, carry_forward_limit = NULL,
         year_start_month = 1, count_wfh = true, count_half_day = false, count_during_probation = true
   WHERE org_id = o;

  -- 19 days: nothing yet
  FOR i IN 0..18 LOOP
    INSERT INTO attendance (org_id, profile_id, date, marked_at)
    VALUES (o, p, start_day + i, ((start_day + i)::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata');
  END LOOP;
  PERFORM pg_temp.eq('20-day rule: 19 days gives no leave', el_run_credits(p), 0);
  PERFORM pg_temp.eq('20-day rule: balance stays 0 at 19 days', (attendance_summary(p)->>'earned_available')::int, 0);
  PERFORM pg_temp.eq('20-day rule: 1 day to go', (attendance_summary(p)->>'to_next_leave')::int, 1);

  -- the 20th day
  INSERT INTO attendance (org_id, profile_id, date, marked_at)
  VALUES (o, p, start_day + 19, ((start_day + 19)::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata');
  PERFORM pg_temp.eq('20-day rule: the 20th day gives 1 leave', el_run_credits(p), 1);
  PERFORM pg_temp.eq('20-day rule: balance is 1', (attendance_summary(p)->>'earned_available')::int, 1);
  SELECT * INTO r FROM el_ledger WHERE profile_id = p ORDER BY period_end LIMIT 1;
  PERFORM pg_temp.eq('20-day rule: the credit was for 20 days', r.eligible_days, 20);
  PERFORM pg_temp.eq('20-day rule: the credit was 1 day', r.credited, 1);
  PERFORM pg_temp.eq('20-day rule: balance went 0 to 1', r.previous_balance || '>' || r.new_balance, '0>1');
  PERFORM pg_temp.eq('20-day rule: the period is exactly those 20 days', r.period_end - r.period_start, 19);
  PERFORM pg_temp.eq('20-day rule: running it again gives nothing more', el_run_credits(p), 0);
  PERFORM pg_temp.eq('20-day rule: counting restarts, 20 to go', (attendance_summary(p)->>'to_next_leave')::int, 20);

  -- days 21 to 39: still 1
  FOR i IN 20..38 LOOP
    INSERT INTO attendance (org_id, profile_id, date, marked_at)
    VALUES (o, p, start_day + i, ((start_day + i)::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata');
  END LOOP;
  PERFORM pg_temp.eq('20-day rule: 39 days gives no second leave', el_run_credits(p), 0);
  PERFORM pg_temp.eq('20-day rule: balance still 1 at 39 days', (attendance_summary(p)->>'earned_available')::int, 1);

  -- the 40th day: 1 + 1
  INSERT INTO attendance (org_id, profile_id, date, marked_at)
  VALUES (o, p, start_day + 39, ((start_day + 39)::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata');
  PERFORM pg_temp.eq('20-day rule: the 40th day gives the second leave', el_run_credits(p), 1);
  PERFORM pg_temp.eq('20-day rule: balance is 2 (1 + 1)', (attendance_summary(p)->>'earned_available')::int, 2);
  PERFORM pg_temp.eq('20-day rule: two credits, one per 20 days',
    (SELECT count(*) FROM el_ledger WHERE profile_id = p)::int, 2);
  SELECT * INTO r FROM el_ledger WHERE profile_id = p ORDER BY period_end DESC LIMIT 1;
  PERFORM pg_temp.eq('20-day rule: the second credit went 1 to 2', r.previous_balance || '>' || r.new_balance, '1>2');
  PERFORM pg_temp.eq('20-day rule: and the two periods do not overlap',
    (SELECT bool_and(a.period_end < b.period_start) FROM el_ledger a JOIN el_ledger b
       ON a.profile_id = b.profile_id AND a.period_end < b.period_end WHERE a.profile_id = p), true);
  PERFORM pg_temp.as_user(p);
  PERFORM pg_temp.eq('20-day rule: the Leave screen shows 2 earned leave to take',
    (SELECT (e->>'balance')::int FROM jsonb_array_elements(leave_balances(p)) e WHERE e->>'type' = 'earned'), 2);

  -- day 41: still 2, and 19 to go
  PERFORM pg_temp.as_user(hr);
  INSERT INTO attendance (org_id, profile_id, date, marked_at)
  VALUES (o, p, start_day + 40, ((start_day + 40)::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata');
  PERFORM pg_temp.eq('20-day rule: day 41 adds nothing', el_run_credits(p), 0);
  PERFORM pg_temp.eq('20-day rule: balance still 2 at day 41', (attendance_summary(p)->>'earned_available')::int, 2);
  PERFORM pg_temp.eq('20-day rule: 19 to go for the third', (attendance_summary(p)->>'to_next_leave')::int, 19);
END $$;

-- 40 days all at once (an old backlog, or the nightly job after a quiet spell): two credits, in order
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  u uuid := gen_random_uuid(); p uuid; start_day date := today - 200; i int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'backlog@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, opening_earned_leave)
  VALUES (o, 'Backlog Bina', 'member', u, start_day - 5, NULL, 3) RETURNING id INTO p;
  FOR i IN 0..39 LOOP
    INSERT INTO attendance (org_id, profile_id, date, marked_at)
    VALUES (o, p, start_day + i, ((start_day + i)::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata');
  END LOOP;
  PERFORM pg_temp.eq('backlog: 40 days in one run gives two credits', el_run_credits(p), 2);
  PERFORM pg_temp.eq('backlog: opening 3 + 2 = 5', (attendance_summary(p)->>'earned_available')::int, 5);
  PERFORM pg_temp.eq('backlog: the chain is 3 to 4 to 5',
    (SELECT string_agg(previous_balance || '>' || new_balance, ',' ORDER BY period_end) FROM el_ledger WHERE profile_id = p), '3>4,4>5');
END $$;

-- weekly offs and holidays are not working days: they never count towards the 20
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  u uuid := gen_random_uuid(); p uuid; d date := today - 120; n int := 0; worked int := 0;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'sun@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, opening_earned_leave)
  VALUES (o, 'Sunday Sana', 'member', u, d - 5, 'Sunday', 0) RETURNING id INTO p;
  -- she punches every day for 22 days, Sundays included: that is 22 punches but fewer working days
  WHILE n < 22 LOOP
    INSERT INTO attendance (org_id, profile_id, date, marked_at)
    VALUES (o, p, d, (d::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata');
    IF extract(dow FROM d) <> 0 THEN worked := worked + 1; END IF;
    d := d + 1; n := n + 1;
  END LOOP;
  PERFORM pg_temp.eq('weekly off: only non-Sunday punches count', (SELECT count(*) FROM el_eligible_days(p, date '1900-01-01'))::int, worked);
  PERFORM pg_temp.eq('weekly off: 22 punches over 3 weeks is fewer than 20 working days, so no leave yet',
    el_run_credits(p) = 0, worked < 20);
END $$;

ROLLBACK;
