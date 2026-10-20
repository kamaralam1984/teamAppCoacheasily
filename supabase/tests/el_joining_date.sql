-- Earned leave counted from the joining date: the day rules, the preview, the rebuild and the ledger.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_joining_date.sql

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

-- working days (Mon-Sat) in [d1, d2], the way a person with a Sunday off would count them
CREATE FUNCTION pg_temp.non_sundays(d1 date, d2 date) RETURNS integer LANGUAGE sql AS $$
  SELECT count(*)::integer FROM generate_series(d1::timestamp, d2::timestamp, interval '1 day') g
   WHERE extract(dow FROM g) <> 0
$$;

CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO PUBLIC;

-- ───────── fixtures ─────────
DO $$
DECLARE
  o uuid; hr uuid; joan uuid; maya uuid; opal uuid; newbie uuid; nodate uuid;
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('T4', '{}') RETURNING id INTO o;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;
  INSERT INTO el_policy (org_id) VALUES (o) ON CONFLICT DO NOTHING;

  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Hema HR', 'hr', uids[1], today - 400, 'Sunday') RETURNING id INTO hr;
  -- Joan: joined 59 days ago and never marked attendance
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, opening_earned_leave)
  VALUES (o, 'Joan Joiner', 'member', uids[2], today - 59, 'Sunday', 0) RETURNING id INTO joan;
  -- Maya: joined 60 days ago, marked attendance on 25 days, so she already has one credit
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, opening_earned_leave)
  VALUES (o, 'Maya Marker', 'member', uids[3], today - 60, 'Sunday', 0) RETURNING id INTO maya;
  -- Opal: an opening balance, used some earned leave
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off, opening_earned_leave)
  VALUES (o, 'Opal Opening', 'member', uids[4], today - 90, 'Sunday', 3) RETURNING id INTO opal;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Newbie Nia', 'member', uids[5], today, 'Sunday') RETURNING id INTO newbie;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Nodate Neel', 'member', uids[6], NULL, 'Sunday') RETURNING id INTO nodate;

  INSERT INTO ids VALUES ('org', o), ('hr', hr), ('joan', joan), ('maya', maya), ('opal', opal), ('newbie', newbie), ('nodate', nodate);

  -- Maya's 25 punches, in the days after she joined (punch mode: one credit)
  INSERT INTO attendance (org_id, profile_id, date, marked_at)
  SELECT o, maya, d::date, (d::date::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata'
    FROM generate_series((today - 59)::timestamp, (today - 35)::timestamp, interval '1 day') d;
END $$;

-- ═══════════ 1. THE DEFAULT STILL COUNTS PUNCHES ═══════════
DO $$
DECLARE hr uuid := (SELECT v FROM ids WHERE k='hr'); o uuid := (SELECT v FROM ids WHERE k='org');
BEGIN
  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.fails('policy: the counting rule cannot be switched by a plain update',
    format('UPDATE el_policy SET count_from = ''joining_date'' WHERE org_id = %L', o), 'only be changed with the rebuild');
  PERFORM pg_temp.eq('policy: ...and stays as it was', (SELECT count_from FROM el_policy WHERE org_id = o), 'punches');
  UPDATE el_policy SET required_days = 20 WHERE org_id = o;     -- ordinary edits still work
END $$;

DO $$
DECLARE joan uuid := (SELECT v FROM ids WHERE k='joan'); maya uuid := (SELECT v FROM ids WHERE k='maya');
BEGIN
  PERFORM pg_temp.eq('punch mode: the default', (SELECT count_from FROM el_policy WHERE org_id = (SELECT v FROM ids WHERE k='org')), 'punches');
  PERFORM pg_temp.eq('punch mode: no punches, no days', (SELECT count(*) FROM el_eligible_days(joan, date '1900-01-01'))::int, 0);
  PERFORM pg_temp.eq('punch mode: Maya''s 25 punches give one credit', el_run_credits(maya), 1);
  PERFORM pg_temp.eq('punch mode: ...and Joan none', el_run_credits(joan), 0);
END $$;

-- ═══════════ 2. THE DAY RULES, FROM THE JOINING DATE ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); joan uuid := (SELECT v FROM ids WHERE k='joan');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  expected int; got int; hol date; lwp_day date; leave_day date;
BEGIN
  expected := pg_temp.non_sundays(today - 59, today - 1);
  SELECT count(*) INTO got FROM el_days_joining(joan, date '1900-01-01');
  PERFORM pg_temp.eq('joining: every working day since joining, no punches needed', got, expected);
  PERFORM pg_temp.eq('joining: only finished days (today is not in it)', (SELECT max(d) FROM el_days_joining(joan, date '1900-01-01') d) < today, true);
  PERFORM pg_temp.eq('joining: starts on the joining date or the day after if that is a weekly off',
    (SELECT min(d) FROM el_days_joining(joan, date '1900-01-01') d) <= today - 58, true);
  PERFORM pg_temp.eq('joining: a day before the joining date never counts',
    (SELECT count(*) FROM el_days_joining(joan, date '1900-01-01') d WHERE d < today - 59)::int, 0);
  PERFORM pg_temp.eq('joining: a joiner starting today has no finished days',
    (SELECT count(*) FROM el_days_joining((SELECT v FROM ids WHERE k='newbie'), date '1900-01-01'))::int, 0);
  PERFORM pg_temp.eq('joining: no joining date means nothing to count',
    (SELECT count(*) FROM el_days_joining((SELECT v FROM ids WHERE k='nodate'), date '1900-01-01'))::int, 0);

  -- a company holiday is not a working day
  hol := today - 10; WHILE extract(dow FROM hol) = 0 LOOP hol := hol - 1; END LOOP;
  INSERT INTO holidays (org_id, date, name) VALUES (o, hol, 'Rule Day');
  PERFORM pg_temp.eq('joining: a holiday is skipped', (SELECT count(*) FROM el_days_joining(joan, date '1900-01-01'))::int, expected - 1);
  UPDATE el_policy SET exclude_holidays = false WHERE org_id = o;
  PERFORM pg_temp.eq('joining: ...unless the policy counts holidays', (SELECT count(*) FROM el_days_joining(joan, date '1900-01-01'))::int, expected);
  UPDATE el_policy SET exclude_holidays = true WHERE org_id = o;
  DELETE FROM holidays WHERE name = 'Rule Day';

  -- approved leave
  leave_day := today - 20; WHILE extract(dow FROM leave_day) = 0 LOOP leave_day := leave_day - 1; END LOOP;
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days, status)
  VALUES (o, joan, 'casual', leave_day, leave_day, 1, 'approved');
  PERFORM pg_temp.eq('joining: a day of approved leave is not counted (default)',
    (SELECT count(*) FROM el_days_joining(joan, date '1900-01-01'))::int, expected - 1);
  UPDATE el_policy SET count_approved_leave = true WHERE org_id = o;
  PERFORM pg_temp.eq('joining: ...but is, when the policy counts approved leave',
    (SELECT count(*) FROM el_days_joining(joan, date '1900-01-01'))::int, expected);

  lwp_day := today - 25; WHILE extract(dow FROM lwp_day) = 0 OR lwp_day = leave_day LOOP lwp_day := lwp_day - 1; END LOOP;
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days, status)
  VALUES (o, joan, 'lwp', lwp_day, lwp_day, 1, 'approved');
  PERFORM pg_temp.eq('joining: unpaid leave never counts, even when approved leave does',
    (SELECT count(*) FROM el_days_joining(joan, date '1900-01-01'))::int, expected - 1);
  UPDATE el_policy SET count_approved_leave = false WHERE org_id = o;
  DELETE FROM leave_requests WHERE profile_id = joan;

  -- a pending request changes nothing
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days, status)
  VALUES (o, joan, 'casual', today - 3, today - 3, 1, 'pending');
  PERFORM pg_temp.eq('joining: a pending request does not remove a day', (SELECT count(*) FROM el_days_joining(joan, date '1900-01-01'))::int, expected);
  DELETE FROM leave_requests WHERE profile_id = joan;
END $$;

-- ═══════════ 3. PREVIEW, AND WHO MAY USE IT ═══════════
DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k='hr'); joan uuid := (SELECT v FROM ids WHERE k='joan'); maya uuid := (SELECT v FROM ids WHERE k='maya');
  opal uuid := (SELECT v FROM ids WHERE k='opal'); nodate uuid := (SELECT v FROM ids WHERE k='nodate');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; r jsonb; row_j jsonb; row_m jsonb; row_o jsonb;
  nj int := pg_temp.non_sundays(today - 59, today - 1);
  nm int := pg_temp.non_sundays(today - 60, today - 1);
BEGIN
  PERFORM pg_temp.as_user(joan);
  PERFORM pg_temp.fails('preview: a member cannot see it', 'SELECT el_rebuild_preview()', 'Not allowed');
  PERFORM pg_temp.fails('rebuild: a member cannot run it', $q$SELECT el_rebuild_apply('REBUILD')$q$, 'Not allowed');

  PERFORM pg_temp.as_user(hr);
  r := el_rebuild_preview();
  PERFORM pg_temp.eq('preview: the current mode', r->>'mode_now', 'punches');
  SELECT e INTO row_j FROM jsonb_array_elements(r->'people') e WHERE e->>'profile_id' = joan::text;
  SELECT e INTO row_m FROM jsonb_array_elements(r->'people') e WHERE e->>'profile_id' = maya::text;
  SELECT e INTO row_o FROM jsonb_array_elements(r->'people') e WHERE e->>'profile_id' = opal::text;
  PERFORM pg_temp.eq('preview: Joan''s working days', (row_j->>'working_days')::int, nj);
  PERFORM pg_temp.eq('preview: Joan has no credits now', (row_j->>'credits_now')::int, 0);
  PERFORM pg_temp.eq('preview: ...and would get floor(days / 20)', (row_j->>'credits_new')::int, nj / 20);
  PERFORM pg_temp.eq('preview: the change for Joan', (row_j->>'change')::int, nj / 20);
  PERFORM pg_temp.eq('preview: Maya has one credit now', (row_m->>'credits_now')::int, 1);
  PERFORM pg_temp.eq('preview: ...and would have floor(her days / 20)', (row_m->>'credits_new')::int, nm / 20);
  PERFORM pg_temp.eq('preview: Opal''s opening balance is carried', (row_o->>'opening')::int, 3);
  PERFORM pg_temp.eq('preview: ...and flagged, since it may overlap days now counted', (row_o->>'note') IS NOT NULL, true);
  PERFORM pg_temp.eq('preview: a person without a joining date is listed with a reason',
    (SELECT e->>'note' FROM jsonb_array_elements(r->'people') e WHERE e->>'profile_id' = nodate::text) LIKE 'No joining date%', true);
  PERFORM pg_temp.eq('preview: it changed nothing', (SELECT count_from FROM el_policy WHERE org_id = (SELECT v FROM ids WHERE k='org')), 'punches');
  PERFORM pg_temp.eq('preview: ...nor the ledgers', (SELECT count(*) FROM el_ledger WHERE profile_id = maya)::int, 1);
END $$;

-- ═══════════ 4. THE REBUILD ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr');
  joan uuid := (SELECT v FROM ids WHERE k='joan'); maya uuid := (SELECT v FROM ids WHERE k='maya'); opal uuid := (SELECT v FROM ids WHERE k='opal');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; n int; audits_before int;
  nj int := pg_temp.non_sundays(today - 59, today - 1);
  nm int := pg_temp.non_sundays(today - 60, today - 1);
BEGIN
  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.fails('rebuild: needs the word REBUILD', 'SELECT el_rebuild_apply(NULL)', 'Type REBUILD');
  PERFORM pg_temp.fails('rebuild: and exactly that word', $q$SELECT el_rebuild_apply('yes')$q$, 'Type REBUILD');

  SELECT count(*) INTO audits_before FROM audit_log WHERE action = 'el.credit';
  n := el_rebuild_apply('REBUILD');
  PERFORM pg_temp.eq('rebuild: the policy now counts from the joining date', (SELECT count_from FROM el_policy WHERE org_id = o), 'joining_date');
  PERFORM pg_temp.eq('rebuild: Joan''s credits are what the preview said', (SELECT coalesce(sum(credited), 0) FROM el_ledger WHERE profile_id = joan)::int, nj / 20);
  PERFORM pg_temp.eq('rebuild: ...marked as a rebuild', (SELECT bool_and(source = 'rebuild') FROM el_ledger WHERE profile_id = joan), true);
  PERFORM pg_temp.eq('rebuild: each credit covers 20 working days',
    (SELECT bool_and(eligible_days = 20) FROM el_ledger WHERE profile_id = joan), true);
  PERFORM pg_temp.eq('rebuild: the credits follow each other without overlap',
    (SELECT coalesce(bool_and(a.period_end < b.period_start), true) FROM el_ledger a JOIN el_ledger b
       ON a.profile_id = b.profile_id AND a.period_end < b.period_end WHERE a.profile_id = joan), true);
  PERFORM pg_temp.eq('rebuild: Maya''s credits are recounted', (SELECT coalesce(sum(credited), 0) FROM el_ledger WHERE profile_id = maya)::int, nm / 20);
  PERFORM pg_temp.eq('rebuild: Maya''s old row is kept in the archive, not deleted',
    (SELECT count(*) FROM el_ledger_archive WHERE profile_id = maya AND archived_reason LIKE 'rebuilt%')::int, 1);
  PERFORM pg_temp.eq('rebuild: the balance includes the opening', (attendance_summary(opal)->>'earned_available')::int, 3 + pg_temp.non_sundays(today - 90, today - 1) / 20);
  PERFORM pg_temp.eq('rebuild: the summary says where counting starts', attendance_summary(joan)->>'count_from', 'joining_date');
  PERFORM pg_temp.eq('rebuild: ...and how many days have counted', (attendance_summary(joan)->>'el_days_total')::int, nj);
  PERFORM pg_temp.eq('rebuild: ...from which date', (attendance_summary(joan)->>'joined_on')::date, today - 59);
  PERFORM pg_temp.eq('rebuild: progress towards the next credit', (attendance_summary(joan)->>'el_progress')::int, nj % 20);

  PERFORM pg_temp.eq('rebuild: one audit line per changed person', (SELECT count(*) FROM audit_log WHERE action = 'el.rebuild')::int, n);
  PERFORM pg_temp.eq('rebuild: ...and no flood of per-credit lines', (SELECT count(*) FROM audit_log WHERE action = 'el.credit')::int, audits_before);
  PERFORM pg_temp.eq('rebuild: a changed person is told',
    (SELECT count(*) FROM notifications WHERE profile_id = joan AND title = 'Your earned leave was recalculated')::int, CASE WHEN nj / 20 > 0 THEN 1 ELSE 0 END);
  PERFORM pg_temp.eq('rebuild: a person who is not counted is not touched',
    (SELECT count(*) FROM el_ledger WHERE profile_id = (SELECT v FROM ids WHERE k='nodate'))::int, 0);

  PERFORM pg_temp.eq('rebuild: running the nightly job afterwards adds nothing', el_run_credits(joan), 0);
  PERFORM pg_temp.eq('rebuild: ...for Maya either', el_run_credits(maya), 0);
  PERFORM pg_temp.eq('rebuild: doing it again changes nobody', el_rebuild_apply('REBUILD'), 0);
  PERFORM pg_temp.eq('rebuild: ...and archives nothing more',
    (SELECT count(*) FROM el_ledger_archive WHERE profile_id = maya)::int, 1);
END $$;

-- someone with no joining date keeps being counted by attendance, not by nothing
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); nodate uuid := (SELECT v FROM ids WHERE k='nodate');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO attendance (org_id, profile_id, date, marked_at)
  SELECT o, nodate, d::date, (d::date::text || ' 09:30')::timestamp AT TIME ZONE 'Asia/Kolkata'
    FROM generate_series((today - 30)::timestamp, (today - 2)::timestamp, interval '1 day') d
   WHERE extract(dow FROM d) <> 0;
  PERFORM pg_temp.eq('no joining date: still counted by attendance after the switch',
    (SELECT count(*) FROM el_eligible_days(nodate, date '1900-01-01'))::int, pg_temp.non_sundays(today - 30, today - 2));
END $$;

-- ═══════════ 5. THE LEDGER AS AN ACCOUNT ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr'); opal uuid := (SELECT v FROM ids WHERE k='opal');
  joan uuid := (SELECT v FROM ids WHERE k='joan');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; r jsonb; credits int; top jsonb; bal numeric;
BEGIN
  PERFORM pg_temp.as_user(hr);
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days, status)
  VALUES (o, opal, 'earned', today - 5, today - 4, 2, 'approved'),
         (o, opal, 'earned', today + 10, today + 10, 1, 'pending');
  SELECT coalesce(sum(credited), 0) INTO credits FROM el_ledger WHERE profile_id = opal;

  PERFORM pg_temp.as_user(opal);
  r := el_ledger_for();
  PERFORM pg_temp.eq('account: opening balance is a line', (SELECT count(*) FROM jsonb_array_elements(r) e WHERE e->>'kind' = 'opening')::int, 1);
  PERFORM pg_temp.eq('account: each credit is a line', (SELECT count(*) FROM jsonb_array_elements(r) e WHERE e->>'kind' = 'credit')::int, (SELECT count(*) FROM el_ledger WHERE profile_id = opal)::int);
  PERFORM pg_temp.eq('account: used leave is a line', (SELECT count(*) FROM jsonb_array_elements(r) e WHERE e->>'kind' = 'used')::int, 1);
  PERFORM pg_temp.eq('account: ...of the right size', (SELECT (e->>'amount')::numeric FROM jsonb_array_elements(r) e WHERE e->>'kind' = 'used'), 2::numeric);
  PERFORM pg_temp.eq('account: a pending request is listed but changes nothing',
    (SELECT (e->>'delta')::numeric FROM jsonb_array_elements(r) e WHERE e->>'kind' = 'pending'), 0::numeric);
  -- credits are dated the day they were earned, not the day the job ran
  PERFORM pg_temp.eq('account: a credit is dated by when it was earned',
    (SELECT bool_and((e->>'credited_on')::date = (SELECT period_end FROM el_ledger WHERE id = (e->>'id')::uuid)) FROM jsonb_array_elements(r) e WHERE e->>'kind' = 'credit'), true);
  top := r->0;
  PERFORM pg_temp.eq('account: the running balance after the newest real line is opening + credits - used',
    (SELECT (e->>'available_after')::numeric FROM jsonb_array_elements(r) e WHERE e->>'kind' = 'used'), (3 + credits - 2)::numeric);
  -- the account and the Leave screen agree
  SELECT (e->>'balance')::numeric INTO bal FROM jsonb_array_elements(leave_balances(opal)) e WHERE e->>'type' = 'earned';
  PERFORM pg_temp.eq('account: the balance on the Leave screen is the account balance less what is pending',
    bal, (3 + credits - 2 - 1)::numeric);
  PERFORM pg_temp.eq('account: oldest line first in the running total (opening)',
    (SELECT (e->>'available_after')::numeric FROM jsonb_array_elements(r) e WHERE e->>'kind' = 'opening'), 3::numeric);

  -- half a day of leave stays half a day
  PERFORM pg_temp.as_user(hr);
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days, half_day, status)
  VALUES (o, opal, 'earned', today - 8, today - 8, 0.5, true, 'approved');
  PERFORM pg_temp.as_user(opal);
  PERFORM pg_temp.eq('account: half a day is half a day',
    (SELECT count(*) FROM jsonb_array_elements(el_ledger_for()) e WHERE e->>'kind' = 'used' AND (e->>'amount')::numeric = 0.5)::int, 1);

  PERFORM pg_temp.fails('account: nobody reads another person''s', format('SELECT el_ledger_for(%L)', joan), 'Not allowed');
  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.eq('account: HR can read anyone''s', jsonb_typeof(el_ledger_for(opal)), 'array');
  PERFORM pg_temp.eq('account: HR also sees the period and policy behind a credit',
    (SELECT bool_and(e ? 'period_start' AND e ? 'policy') FROM jsonb_array_elements(el_ledger_for(joan)) e WHERE e->>'kind' = 'credit'), true);
END $$;

ROLLBACK;
