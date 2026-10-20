-- A number goal's week is the distance its figure travelled, and HR is told when a cycle is ending or has ended.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/goal_week_cycle.sql

BEGIN;

CREATE FUNCTION pg_temp.eq(label text, actual anyelement, expected anyelement) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL %: expected %, got %', label, expected, actual;
  END IF;
  RAISE NOTICE 'ok   %', label;
END $$;

CREATE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', (SELECT auth_user_id::text FROM public.profiles WHERE id = p), true)
$$;

CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO PUBLIC;

-- ───────── fixtures ─────────
DO $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  wk date := (now() AT TIME ZONE 'Asia/Kolkata')::date - (extract(isodow FROM (now() AT TIME ZONE 'Asia/Kolkata')::date)::int - 1);
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; hr uuid; adm uuid; gone uuid; mem uuid;
  cyc uuid; g uuid; hana uuid; hana_uid uuid := gen_random_uuid();
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('G1', '{}') RETURNING id INTO o1;
  INSERT INTO organisations (name, settings) VALUES ('G2', '{}') RETURNING id INTO o2;
  INSERT INTO organisations (name, settings) VALUES ('G3', '{}') RETURNING id INTO o3;
  INSERT INTO organisations (name, settings) VALUES ('G4', '{}') RETURNING id INTO o4;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on)
  VALUES (o1, 'Hema HR', 'hr', uids[1], today - 400) RETURNING id INTO hr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id)
  VALUES (o1, 'Mia Member', 'member', uids[2], today - 400, hr) RETURNING id INTO mem;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on)
  VALUES (o2, 'Ada Admin', 'admin', uids[3], today - 400) RETURNING id INTO adm;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, status)
  VALUES (o2, 'Gone HR', 'hr', uids[4], today - 400, 'exited') RETURNING id INTO gone;

  -- goals
  INSERT INTO cycles (org_id, no, name, start_date, end_date, status)
  VALUES (o1, 1, 'Goal cycle', today - 60, today + 20, 'active') RETURNING id INTO cyc;
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target)
  VALUES (o1, mem, cyc, 'number', 'Running total', 0, 40) RETURNING id INTO g;
  INSERT INTO ids VALUES ('g_run', g);
  INSERT INTO goal_entries (org_id, goal_id, date, value) VALUES (o1, g, wk - 10, 4), (o1, g, wk - 3, 10), (o1, g, today, 25);

  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target)
  VALUES (o1, mem, cyc, 'number', 'Down goal', 120, 30) RETURNING id INTO g;
  INSERT INTO ids VALUES ('g_down', g);
  INSERT INTO goal_entries (org_id, goal_id, date, value) VALUES (o1, g, wk - 2, 100), (o1, g, today, 75);

  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target)
  VALUES (o1, mem, cyc, 'number', 'First ever', 0, 20) RETURNING id INTO g;
  INSERT INTO ids VALUES ('g_first', g);
  INSERT INTO goal_entries (org_id, goal_id, date, value) VALUES (o1, g, today, 8);

  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target)
  VALUES (o1, mem, cyc, 'number', 'No numbers', 5, 20) RETURNING id INTO g;
  INSERT INTO ids VALUES ('g_none', g);

  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, stages, baseline, target)
  VALUES (o1, mem, cyc, 'funnel', 'Funnel', ARRAY['Calls', 'Closed'], 0, 20) RETURNING id INTO g;
  INSERT INTO ids VALUES ('g_funnel', g);
  INSERT INTO goal_entries (org_id, goal_id, date, counts) VALUES (o1, g, today, ARRAY[10, 5]);

  -- cycles: org 2 ended yesterday, org 3 ends in two days, org 4 ends in a month
  INSERT INTO cycles (org_id, no, name, start_date, end_date, status)
  VALUES (o2, 1, 'Ended cycle', today - 45, today - 1, 'active');
  INSERT INTO cycles (org_id, no, name, start_date, end_date, status)
  VALUES (o3, 1, 'Ending cycle', today - 40, today + 2, 'active');
  INSERT INTO cycles (org_id, no, name, start_date, end_date, status)
  VALUES (o4, 1, 'Far cycle', today - 5, today + 30, 'active');
  INSERT INTO cycles (org_id, no, name, start_date, end_date, status)
  VALUES (o4, 0, 'Old closed cycle', today - 90, today - 40, 'closed');
  INSERT INTO auth.users (id, email) VALUES (hana_uid, hana_uid::text || '@t.test');
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on)
  VALUES (o3, 'Hana HR', 'hr', hana_uid, today - 400) RETURNING id INTO hana;
  INSERT INTO ids VALUES ('hr', hr), ('mem', mem), ('adm', adm), ('gone', gone), ('hana', hana), ('o2', o2), ('o3', o3), ('o4', o4);
END $$;

DO $$
DECLARE
  mem uuid := (SELECT v FROM ids WHERE k = 'mem');
  p jsonb;
BEGIN
  PERFORM pg_temp.as_user(mem);

  p := goal_progress((SELECT v FROM ids WHERE k = 'g_run'));
  PERFORM pg_temp.eq('week: running total moved 15 this week (25 − 10)', (p->>'week_sum')::numeric, 15::numeric);
  PERFORM pg_temp.eq('week: ...and 6 the week before (10 − 4)', (p->>'prev_week_sum')::numeric, 6::numeric);
  PERFORM pg_temp.eq('week: "Now" is still the latest figure', (p->>'current_value')::numeric, 25::numeric);

  p := goal_progress((SELECT v FROM ids WHERE k = 'g_down'));
  PERFORM pg_temp.eq('week: a goal that should come down moved −25', (p->>'week_sum')::numeric, (-25)::numeric);
  PERFORM pg_temp.eq('week: ...and −20 before (100 from the 120 it started at)', (p->>'prev_week_sum')::numeric, (-20)::numeric);

  p := goal_progress((SELECT v FROM ids WHERE k = 'g_first'));
  PERFORM pg_temp.eq('week: a first-ever figure counts from the starting point', (p->>'week_sum')::numeric, 8::numeric);
  PERFORM pg_temp.eq('week: nothing the week before', (p->>'prev_week_sum')::numeric, 0::numeric);

  p := goal_progress((SELECT v FROM ids WHERE k = 'g_none'));
  PERFORM pg_temp.eq('week: no figures means no movement', (p->>'week_sum')::numeric, 0::numeric);
  PERFORM pg_temp.eq('week: ...and no change in the week before', (p->>'prev_week_sum')::numeric, 0::numeric);

  p := goal_progress((SELECT v FROM ids WHERE k = 'g_funnel'));
  PERFORM pg_temp.eq('funnel: this week''s counts are unchanged', (p #>> '{week_totals,0}')::numeric, 10::numeric);
  PERFORM pg_temp.eq('funnel: the rate is unchanged', (p->>'week_rate')::numeric, 50::numeric);

  PERFORM pg_temp.eq('anon still cannot read progress', has_function_privilege('anon', 'public.goal_progress(uuid)', 'EXECUTE'), false);
  PERFORM pg_temp.eq('signed-in still can', has_function_privilege('authenticated', 'public.goal_progress(uuid)', 'EXECUTE'), true);
END $$;

-- ───────── cycles ─────────
DO $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  adm uuid := (SELECT v FROM ids WHERE k = 'adm');
  gone uuid := (SELECT v FROM ids WHERE k = 'gone');
  hr uuid := (SELECT v FROM ids WHERE k = 'hr');
  hana uuid := (SELECT v FROM ids WHERE k = 'hana');
  mem uuid := (SELECT v FROM ids WHERE k = 'mem');
  o3 uuid := (SELECT v FROM ids WHERE k = 'o3');
  n int;
BEGIN
  n := cycles_tick();
  PERFORM pg_temp.eq('cycles: at least the ended one and the ending one are noticed', n >= 2, true);
  PERFORM pg_temp.eq('cycles: HR hears a cycle is about to end',
    (SELECT title FROM notifications WHERE profile_id = hana AND title LIKE 'Ending cycle%'), 'Ending cycle ends soon');
  PERFORM pg_temp.eq('cycles: nobody hears about the far cycle',
    (SELECT count(*) FROM notifications WHERE title LIKE 'Far cycle%')::int, 0);
  PERFORM pg_temp.eq('cycles: the admin hears the cycle has ended',
    (SELECT title FROM notifications WHERE profile_id = adm AND title LIKE 'Ended cycle%'), 'Ended cycle has ended');
  PERFORM pg_temp.eq('cycles: ...with what to do',
    (SELECT body FROM notifications WHERE profile_id = adm AND title LIKE 'Ended cycle%'),
    'It ended on ' || to_char(today - 1, 'FMDD Mon') || '. Open the next cycle so everyone can write new goals.');
  PERFORM pg_temp.eq('cycles: ...pointing at goals', (SELECT link FROM notifications WHERE profile_id = adm AND title LIKE 'Ended cycle%'), '/goals');
  PERFORM pg_temp.eq('cycles: somebody who has left is not told',
    (SELECT count(*) FROM notifications WHERE profile_id = gone AND title LIKE '%cycle%')::int, 0);
  PERFORM pg_temp.eq('cycles: an ordinary member is not told',
    (SELECT count(*) FROM notifications WHERE profile_id = mem AND title LIKE '%cycle%')::int, 0);
  PERFORM cycles_tick();
  PERFORM pg_temp.eq('cycles: running again the same day adds nothing', (SELECT count(*) FROM notifications WHERE profile_id = adm AND title LIKE 'Ended cycle%')::int, 1);
  PERFORM pg_temp.eq('cycles: the admin still has one notice', (SELECT count(*) FROM notifications WHERE profile_id = adm AND title LIKE 'Ended cycle%')::int, 1);
  PERFORM pg_temp.eq('cycles: a closed cycle is never mentioned',
    (SELECT count(*) FROM cycle_notices cn JOIN cycles c ON c.id = cn.cycle_id WHERE c.status = 'closed')::int, 0);

  -- the ending cycle then actually ends: HR hears a second, different notice
  UPDATE cycles SET end_date = today - 1 WHERE org_id = o3;
  PERFORM cycles_tick();
  PERFORM pg_temp.eq('cycles: once it has ended it is noticed again', (SELECT count(*) FROM notifications WHERE profile_id = hana AND title LIKE 'Ending cycle%')::int, 2);
  PERFORM pg_temp.eq('cycles: ...with a different message',
    (SELECT count(*) FROM notifications WHERE profile_id = hana AND title = 'Ending cycle has ended')::int, 1);
  PERFORM pg_temp.eq('cycles: the tick is closed to signed-in users', has_function_privilege('authenticated', 'public.cycles_tick()', 'EXECUTE'), false);
  PERFORM pg_temp.eq('cycles: the job is scheduled once', (SELECT count(*) FROM cron.job WHERE jobname = 'ce-cycle-tick')::int, 1);
END $$;

ROLLBACK;
