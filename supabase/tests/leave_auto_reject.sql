-- A leave request nobody decides is rejected when its first day arrives.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/leave_auto_reject.sql

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
CREATE FUNCTION pg_temp.nobody() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', '', true) $$;

CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO PUBLIC;

-- ───────── fixtures: hr, mgr (the approver), a under mgr, and someone in another organisation ─────────
DO $$
DECLARE
  o uuid; o2 uuid; hr uuid; mgr uuid; a uuid; z uuid; z_hr uuid;
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('T5', '{}') RETURNING id INTO o;
  INSERT INTO organisations (name, settings) VALUES ('Other5', '{}') RETURNING id INTO o2;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on) VALUES (o, 'Hema HR', 'hr', uids[1], date '2025-01-01') RETURNING id INTO hr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id) VALUES (o, 'Mohan Mgr', 'manager', uids[2], date '2025-01-01', hr) RETURNING id INTO mgr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id) VALUES (o, 'Asha Member', 'member', uids[3], date '2025-01-01', mgr) RETURNING id INTO a;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on) VALUES (o2, 'Olga HR', 'hr', uids[4], date '2025-01-01') RETURNING id INTO z_hr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id) VALUES (o2, 'Otto Member', 'member', uids[5], date '2025-01-01', z_hr) RETURNING id INTO z;
  INSERT INTO ids VALUES ('org', o), ('org2', o2), ('hr', hr), ('mgr', mgr), ('a', a), ('z', z), ('z_hr', z_hr);
END $$;

-- requests, sent at different times relative to their first day (sick leave: no sandwich rule)
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); o2 uuid := (SELECT v FROM ids WHERE k='org2');
  a uuid := (SELECT v FROM ids WHERE k='a'); z uuid := (SELECT v FROM ids WHERE k='z'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; id1 uuid;
BEGIN
  -- sent yesterday, starts today: nobody decided in time
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, status, created_at, approver_id)
  VALUES (o, a, 'sick', today, today, 'pending', now() - interval '1 day', mgr) RETURNING id INTO id1;
  INSERT INTO ids VALUES ('late', id1);
  -- sent a week ago, started three days ago, still pending: also stale
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, status, created_at)
  VALUES (o, a, 'sick', today - 3, today - 2, 'pending', now() - interval '7 days') RETURNING id INTO id1;
  INSERT INTO ids VALUES ('stale', id1);
  -- starts tomorrow: still has time
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, status, created_at)
  VALUES (o, a, 'sick', today + 1, today + 1, 'pending', now() - interval '1 day') RETURNING id INTO id1;
  INSERT INTO ids VALUES ('future', id1);
  -- sent today for today (a sick day reported on the day): it never had a "before"
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, status)
  VALUES (o, a, 'sick', today - 6, today - 6, 'pending') RETURNING id INTO id1;
  UPDATE leave_requests SET from_date = today, to_date = today WHERE id = id1;
  INSERT INTO ids VALUES ('sameday', id1);
  -- already decided
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, status, created_at, decided_by, decided_at)
  VALUES (o, a, 'sick', today - 10, today - 10, 'approved', now() - interval '12 days', mgr, now() - interval '11 days') RETURNING id INTO id1;
  INSERT INTO ids VALUES ('approved', id1);
  -- another organisation's stale request
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, status, created_at)
  VALUES (o2, z, 'sick', today, today, 'pending', now() - interval '2 days') RETURNING id INTO id1;
  INSERT INTO ids VALUES ('other_org', id1);
END $$;

-- ═══════════ before the night job: nothing has changed, and nobody may approve the stale ones ═══════════
DO $$
DECLARE hr uuid := (SELECT v FROM ids WHERE k='hr'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
BEGIN
  PERFORM pg_temp.as_user(mgr);
  PERFORM pg_temp.fails('guard: the date has arrived, so it cannot be approved',
    format('UPDATE leave_requests SET status = ''approved'', decided_by = %L WHERE id = %L', mgr, (SELECT v FROM ids WHERE k='late')),
    'can no longer be approved');
  PERFORM pg_temp.fails('guard: ...nor one whose date is long past',
    format('UPDATE leave_requests SET status = ''approved'', decided_by = %L WHERE id = %L', mgr, (SELECT v FROM ids WHERE k='stale')),
    'can no longer be approved');
  UPDATE leave_requests SET status = 'approved', decided_by = mgr WHERE id = (SELECT v FROM ids WHERE k='future');
  PERFORM pg_temp.eq('guard: a request with time left can be approved', (SELECT status FROM leave_requests WHERE id = (SELECT v FROM ids WHERE k='future')), 'approved');
  UPDATE leave_requests SET status = 'pending', decided_by = NULL WHERE id = (SELECT v FROM ids WHERE k='future');   -- put it back for the next checks
  UPDATE leave_requests SET status = 'approved', decided_by = mgr WHERE id = (SELECT v FROM ids WHERE k='sameday');
  PERFORM pg_temp.eq('guard: a request sent on the day itself can still be approved (it never had a "before")',
    (SELECT status FROM leave_requests WHERE id = (SELECT v FROM ids WHERE k='sameday')), 'approved');
  UPDATE leave_requests SET status = 'pending', decided_by = NULL WHERE id = (SELECT v FROM ids WHERE k='sameday');
END $$;

-- ═══════════ the night job ═══════════
DO $$
DECLARE
  a uuid := (SELECT v FROM ids WHERE k='a'); mgr uuid := (SELECT v FROM ids WHERE k='mgr'); hr uuid := (SELECT v FROM ids WHERE k='hr');
  z uuid := (SELECT v FROM ids WHERE k='z'); n int; r leave_requests%ROWTYPE;
BEGIN
  PERFORM pg_temp.nobody();                       -- the job has no signed-in person
  n := leave_expire_pending();
  PERFORM pg_temp.eq('night job: closes the stale requests of every organisation (2 here + 1 elsewhere)', n, 3);

  SELECT * INTO r FROM leave_requests WHERE id = (SELECT v FROM ids WHERE k='late');
  PERFORM pg_temp.eq('night job: sent before, starts today: rejected', r.status, 'rejected');
  PERFORM pg_temp.eq('night job: ...by nobody', r.decided_by IS NULL, true);
  PERFORM pg_temp.eq('night job: ...with a time stamp', r.decided_at IS NOT NULL, true);
  PERFORM pg_temp.eq('night job: ...and the reason is kept', r.decision_note LIKE 'Nobody decided before the leave date%', true);
  PERFORM pg_temp.eq('night job: an old stale one is rejected too', (SELECT status FROM leave_requests WHERE id = (SELECT v FROM ids WHERE k='stale')), 'rejected');
  PERFORM pg_temp.eq('night job: a request with time left stays pending', (SELECT status FROM leave_requests WHERE id = (SELECT v FROM ids WHERE k='future')), 'pending');
  PERFORM pg_temp.eq('night job: one sent on the day itself stays pending', (SELECT status FROM leave_requests WHERE id = (SELECT v FROM ids WHERE k='sameday')), 'pending');
  PERFORM pg_temp.eq('night job: an approved one is untouched', (SELECT status FROM leave_requests WHERE id = (SELECT v FROM ids WHERE k='approved')), 'approved');
  PERFORM pg_temp.eq('night job: the other organisation''s stale one is closed too', (SELECT status FROM leave_requests WHERE id = (SELECT v FROM ids WHERE k='other_org')), 'rejected');

  PERFORM pg_temp.eq('notice: the person is told, and how it happened',
    (SELECT title FROM notifications WHERE profile_id = a AND title LIKE 'Your Sick leave was rejected automatically' LIMIT 1), 'Your Sick leave was rejected automatically');
  PERFORM pg_temp.eq('notice: ...and what to do',
    (SELECT bool_and(body LIKE '%apply again%') FROM notifications WHERE profile_id = a AND title LIKE '%rejected automatically'), true);
  PERFORM pg_temp.eq('notice: the approver is told', (SELECT count(*) FROM notifications WHERE profile_id = mgr AND title LIKE '%closed with no decision')::int, 2);
  PERFORM pg_temp.eq('notice: HR is told too', (SELECT count(*) FROM notifications WHERE profile_id = hr AND title LIKE '%closed with no decision')::int, 2);
  PERFORM pg_temp.eq('notice: the other organisation''s HR hears about their own', (SELECT count(*) FROM notifications WHERE profile_id = (SELECT v FROM ids WHERE k='z_hr') AND title LIKE '%closed with no decision')::int, 1);
  PERFORM pg_temp.eq('notice: the person whose leave it was is not in the "decide" notice',
    (SELECT count(*) FROM notifications WHERE profile_id = a AND title LIKE '%closed with no decision')::int, 0);

  PERFORM pg_temp.eq('audit: recorded as automatic',
    (SELECT count(*) FROM audit_log WHERE action = 'leave.auto_rejected' AND summary LIKE '%rejected automatically%')::int, 3);
  PERFORM pg_temp.eq('audit: and not as a person''s rejection',
    (SELECT count(*) FROM audit_log WHERE action = 'leave.rejected' AND target_id IN (SELECT v FROM ids WHERE k IN ('late', 'stale')))::int, 0);

  PERFORM pg_temp.eq('night job: running it again closes nothing', leave_expire_pending(), 0);
END $$;

-- ═══════════ after it: no way back ═══════════
DO $$
DECLARE mgr uuid := (SELECT v FROM ids WHERE k='mgr'); hr uuid := (SELECT v FROM ids WHERE k='hr');
BEGIN
  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.fails('closed: HR cannot approve it afterwards',
    format('UPDATE leave_requests SET status = ''approved'', decided_by = %L WHERE id = %L', hr, (SELECT v FROM ids WHERE k='late')),
    'closed automatically');
  PERFORM pg_temp.eq('closed: it stays rejected', (SELECT status FROM leave_requests WHERE id = (SELECT v FROM ids WHERE k='late')), 'rejected');
END $$;

-- ═══════════ the screens ask first ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); a uuid := (SELECT v FROM ids WHERE k='a'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
  hr uuid := (SELECT v FROM ids WHERE k='hr'); z uuid := (SELECT v FROM ids WHERE k='z'); id1 uuid; id2 uuid;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, status, created_at)
  VALUES (o, a, 'sick', today, today, 'pending', now() - interval '3 days') RETURNING id INTO id1;
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, status, created_at)
  VALUES ((SELECT v FROM ids WHERE k='org2'), z, 'sick', today, today, 'pending', now() - interval '3 days') RETURNING id INTO id2;

  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.eq('on opening the screen: HR closes only their own organisation''s', leave_expire_pending(), 1);
  PERFORM pg_temp.eq('on opening the screen: ...so it is rejected', (SELECT status FROM leave_requests WHERE id = id1), 'rejected');
  PERFORM pg_temp.eq('on opening the screen: ...and the other organisation''s is left for its own night job', (SELECT status FROM leave_requests WHERE id = id2), 'pending');
  PERFORM pg_temp.as_user(a);
  PERFORM pg_temp.eq('on opening the screen: anyone signed in can do it, nothing left to close', leave_expire_pending(), 0);
END $$;

ROLLBACK;
