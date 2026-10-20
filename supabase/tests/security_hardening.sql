-- Security hardening and the revenue card: what a signed-out visitor can reach, the internal helpers,
-- the organisation check on the calendar helpers, the invite throttle and revenue_summary().
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_hardening.sql

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

-- ───────── fixtures: two organisations ─────────
DO $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  o1 uuid; o2 uuid; hr uuid; mem uuid; far uuid; cyc uuid; g uuid;
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('S1', '{}') RETURNING id INTO o1;
  INSERT INTO organisations (name, settings) VALUES ('S2', '{}') RETURNING id INTO o2;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, email)
  VALUES (o1, 'Hema HR', 'hr', uids[1], today - 400, 'hema@s1.test') RETURNING id INTO hr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id)
  VALUES (o1, 'Mia Member', 'member', uids[2], today - 400, hr) RETURNING id INTO mem;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on)
  VALUES (o2, 'Far Away', 'member', uids[3], today - 400) RETURNING id INTO far;
  -- an invited person who has not signed up yet
  INSERT INTO profiles (org_id, full_name, role, joined_on, email, status)
  VALUES (o1, 'Ivy Invited', 'member', today, 'ivy@s1.test', 'active');

  INSERT INTO cycles (org_id, no, name, start_date, end_date, status)
  VALUES (o1, 1, 'Running', today - 10, today + 20, 'active') RETURNING id INTO cyc;
  INSERT INTO goals (org_id, profile_id, cycle_id, name, tracks_revenue)
  VALUES (o1, mem, cyc, 'Sales', true) RETURNING id INTO g;
  INSERT INTO goal_entries (org_id, goal_id, date, amount) VALUES (o1, g, today, 5000);

  -- a programme hosted in each organisation, covering the next few days
  INSERT INTO programs (org_id, name, type, from_date, to_date, host_id) VALUES (o1, 'Own camp', 'Webinar', today, today + 5, mem);
  INSERT INTO programs (org_id, name, type, from_date, to_date, host_id) VALUES (o2, 'Other camp', 'Webinar', today, today + 5, far);

  INSERT INTO ids VALUES ('hr', hr), ('mem', mem), ('far', far);
END $$;

DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k = 'hr');
  mem uuid := (SELECT v FROM ids WHERE k = 'mem');
  far uuid := (SELECT v FROM ids WHERE k = 'far');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  r jsonb; n int; i int;
BEGIN
  -- ── revenue card ──
  PERFORM pg_temp.as_user(hr);
  r := revenue_summary();
  PERFORM pg_temp.eq('revenue: the running cycle is found', r #>> '{cycle,name}', 'Running');
  PERFORM pg_temp.eq('revenue: the total is added up', (r->>'total')::numeric, 5000::numeric);

  -- ── signed-out visitors ──
  PERFORM pg_temp.eq('anon: may run exactly two functions',
    (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND has_function_privilege('anon', p.oid, 'EXECUTE'))::int, 2);
  PERFORM pg_temp.eq('anon: claim_invite is one of them', has_function_privilege('anon', 'public.claim_invite(text)', 'EXECUTE'), true);
  PERFORM pg_temp.eq('anon: calendar_feed is the other', has_function_privilege('anon', 'public.calendar_feed(uuid)', 'EXECUTE'), true);
  PERFORM pg_temp.eq('anon: no table is readable',
    (SELECT count(*) FROM information_schema.role_table_grants WHERE grantee = 'anon' AND table_schema = 'public')::int, 0);
  PERFORM pg_temp.eq('anon: no policy applies to "everybody"',
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND roles = '{public}')::int, 0);

  -- ── signed-in users keep what the app uses ──
  PERFORM pg_temp.eq('signed in: my_role() still runs', has_function_privilege('authenticated', 'public.my_role()', 'EXECUTE'), true);
  PERFORM pg_temp.eq('signed in: attendance_summary still runs', has_function_privilege('authenticated', 'public.attendance_summary(uuid)', 'EXECUTE'), true);
  PERFORM pg_temp.eq('signed in: el_credit_me still runs', has_function_privilege('authenticated', 'public.el_credit_me()', 'EXECUTE'), true);

  -- ── internal helpers are closed ──
  PERFORM pg_temp.eq('helper: el_eligible_days is closed', has_function_privilege('authenticated', 'public.el_eligible_days(uuid,date)', 'EXECUTE'), false);
  PERFORM pg_temp.eq('helper: leave_approver_for is closed', has_function_privilege('authenticated', 'public.leave_approver_for(uuid)', 'EXECUTE'), false);
  PERFORM pg_temp.eq('helper: goal_pct is closed', has_function_privilege('authenticated', 'public.goal_pct(uuid)', 'EXECUTE'), false);
  PERFORM pg_temp.eq('helper: birthday_nudges is closed', has_function_privilege('authenticated', 'public.birthday_nudges()', 'EXECUTE'), false);

  -- ── calendar helpers answer only about the caller's organisation ──
  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.eq('calendar: own organisation sees its clash',
    jsonb_array_length(leave_host_conflicts(mem, today, today + 3)), 1);
  PERFORM pg_temp.eq('calendar: another organisation shows nothing',
    jsonb_array_length(leave_host_conflicts(far, today, today + 3)), 0);
  PERFORM pg_temp.eq('calendar: own organisation sees its clash (cover check)',
    jsonb_array_length(leave_cover_conflicts(mem, today, today + 3)), 1);
  PERFORM pg_temp.eq('calendar: cover check on another organisation shows nothing',
    jsonb_array_length(leave_cover_conflicts(far, today, today + 3)), 0);

  -- ── invite throttle ──
  PERFORM set_config('request.headers', '{"x-forwarded-for":"203.0.113.9"}', true);
  r := claim_invite('IVY@s1.test');
  PERFORM pg_temp.eq('invite: expected person is recognised', (r->>'expected')::boolean, true);
  PERFORM pg_temp.eq('invite: only the first name is returned', r->>'first_name', 'Ivy');
  r := claim_invite('nobody@s1.test');
  PERFORM pg_temp.eq('invite: a stranger is not expected', (r->>'expected')::boolean, false);
  FOR i IN 1..40 LOOP r := claim_invite('nobody' || i || '@s1.test'); END LOOP;
  PERFORM pg_temp.eq('invite: after 30 checks in an hour it is limited', (r->>'limited')::boolean, true);
  r := claim_invite('ivy@s1.test');
  PERFORM pg_temp.eq('invite: limited means even a real invitee is not confirmed', (r->>'expected')::boolean, false);
  PERFORM set_config('request.headers', '{"x-forwarded-for":"198.51.100.7"}', true);
  r := claim_invite('ivy@s1.test');
  PERFORM pg_temp.eq('invite: another address is not affected', (r->>'expected')::boolean, true);
END $$;

ROLLBACK;
