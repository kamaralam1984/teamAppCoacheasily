-- Leave: edit, cancel, half of the day, reminder, the release switch, and the two fixes.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/leave_extras.sql   (rolls back)

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


DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); a uuid := (SELECT v FROM ids WHERE k='a');
  mgr uuid := (SELECT v FROM ids WHERE k='mgr'); hr uuid := (SELECT v FROM ids WHERE k='hr');
  t date := (now() AT TIME ZONE 'Asia/Kolkata')::date; id1 uuid; id2 uuid; id3 uuid; tk uuid; c int;
BEGIN
  PERFORM pg_temp.as_user(a);
  SET LOCAL ROLE authenticated;
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, approver_id, half_day, half_part, created_at)
  VALUES (o, a, 'sick', t+10, t+10, hr, true, 'first', now() - interval '9 days') RETURNING id INTO id1;
  PERFORM pg_temp.eq('fix: the approver in the request is ignored', (SELECT approver_id FROM leave_requests WHERE id=id1), mgr);
  PERFORM pg_temp.eq('half: kept', (SELECT half_part FROM leave_requests WHERE id=id1), 'first');
  UPDATE leave_requests SET approver_id = hr WHERE id = id1; GET DIAGNOSTICS c = ROW_COUNT;
  PERFORM pg_temp.eq('fix: own direct update touches nothing', c, 0);
  DELETE FROM leave_requests WHERE id = id1; GET DIAGNOSTICS c = ROW_COUNT;
  PERFORM pg_temp.eq('own direct delete touches nothing', c, 0);
  PERFORM pg_temp.eq('gate: off for a member', leave_extras_on(), false);
  PERFORM pg_temp.fails('gate: edit', format('SELECT leave_edit(%L,''sick'',%L,%L)', id1, t+11, t+12), 'not available');
  PERFORM pg_temp.fails('gate: cancel', format('SELECT leave_cancel(%L)', id1), 'not available');
  PERFORM pg_temp.fails('gate: reminder', format('SELECT leave_send_reminder(%L)', id1), 'not available');
  PERFORM pg_temp.fails('gate: cannot be opened by a user', 'UPDATE feature_releases SET released = true', 'permission denied');
  PERFORM pg_temp.fails('gate: cannot join the preview', format('SELECT leave_extras_preview(%L)', a), 'permission denied');
  PERFORM pg_temp.as_user(mgr); PERFORM pg_temp.eq('gate: off for a manager', leave_extras_on(), false);
  PERFORM pg_temp.as_user(hr); PERFORM pg_temp.eq('gate: on for HR', leave_extras_on(), true);
  PERFORM pg_temp.fails('gate: HR cannot approve it', 'UPDATE feature_releases SET released = true', 'permission denied');
  RESET ROLE;
  PERFORM leave_extras_preview(a);
  SET LOCAL ROLE authenticated; PERFORM pg_temp.as_user(a);
  PERFORM pg_temp.eq('gate: on in preview', leave_extras_on(), true);
  RESET ROLE; UPDATE feature_releases SET preview_profile_ids = '{}', released = true;
  SET LOCAL ROLE authenticated; PERFORM pg_temp.eq('gate: on for everyone after approval', leave_extras_on(), true);

  PERFORM leave_edit(id1, 'sick', t+11, t+12, NULL, false, 'new reason');
  PERFORM pg_temp.eq('edit: days recounted', (SELECT days FROM leave_requests WHERE id=id1), 2::numeric);
  PERFORM pg_temp.eq('edit: half cleared', (SELECT half_part FROM leave_requests WHERE id=id1), NULL::text);
  PERFORM pg_temp.fails('edit: half needs a part', format('SELECT leave_edit(%L,''sick'',%L,%L,NULL,true)', id1, t+11, t+11), 'first or the second');
  PERFORM pg_temp.fails('edit: half is one day', format('SELECT leave_edit(%L,''sick'',%L,%L,''first'',true)', id1, t+11, t+12), 'one day only');
  PERFORM pg_temp.fails('edit: past the casual cap', format('SELECT leave_edit(%L,''casual'',%L,%L)', id1, t+11, t+30), 'capped');
  PERFORM leave_send_reminder(id1);
  PERFORM pg_temp.fails('reminder: once in 24 hours', format('SELECT leave_send_reminder(%L)', id1), 'already sent');
  PERFORM pg_temp.as_user(mgr);
  PERFORM pg_temp.eq('told: applied, changed, reminded', (SELECT count(*)::int FROM notifications WHERE profile_id = mgr AND link = '/approvals'), 3);
  PERFORM pg_temp.fails('cancel: not somebody else''s', format('SELECT leave_cancel(%L)', id1), 'not found');
  PERFORM pg_temp.fails('cancel: not by a direct write', format('UPDATE leave_requests SET status=''cancelled'' WHERE id=%L', id1), 'Only the person');
  PERFORM pg_temp.as_user(a); PERFORM leave_cancel(id1);
  PERFORM pg_temp.eq('cancel: status', (SELECT status FROM leave_requests WHERE id=id1), 'cancelled');
  PERFORM pg_temp.eq('cancel: days given back', (SELECT (e->>'pending')::numeric FROM jsonb_array_elements(leave_balances(a)) e WHERE e->>'type'='sick'), 0::numeric);
  PERFORM pg_temp.fails('cancel: final', format('SELECT leave_edit(%L,''sick'',%L,%L)', id1, t+11, t+12), 'already cancelled');
  PERFORM pg_temp.as_user(mgr);
  PERFORM pg_temp.fails('cancel: cannot be approved', format('UPDATE leave_requests SET status=''approved'' WHERE id=%L', id1), 'was cancelled');

  -- a casual request at the full quarter cap can be edited without counting itself twice
  RESET ROLE;
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, created_at)
  VALUES (o, a, 'casual', date_trunc('year', t)::date + 375, date_trunc('year', t)::date + 376, now()) RETURNING id INTO id2;
  SET LOCAL ROLE authenticated; PERFORM pg_temp.as_user(a);
  PERFORM leave_edit(id2, 'casual', date_trunc('year', t)::date + 376, date_trunc('year', t)::date + 377, NULL, false, NULL);
  PERFORM pg_temp.eq('edit: own days not counted twice', (SELECT from_date FROM leave_requests WHERE id=id2), date_trunc('year', t)::date + 376);

  -- handover
  RESET ROLE;
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date) VALUES (o, a, a, 'T', t+20) RETURNING id INTO tk;
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, handover_to, handover_task_ids)
  VALUES (o, a, 'sick', t+20, t+20, hr, '{}') RETURNING id INTO id3;
  PERFORM pg_temp.as_user(mgr); SET LOCAL ROLE authenticated;
  UPDATE leave_requests SET status='approved', decided_by=mgr WHERE id=id3;
  RESET ROLE;
  PERFORM pg_temp.eq('fix: nothing ticked, nothing moves', (SELECT owner_id FROM tasks WHERE id=tk), a);
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, handover_to, handover_task_ids)
  VALUES (o, a, 'sick', t+22, t+22, hr, ARRAY[tk]) RETURNING id INTO id3;
  UPDATE leave_requests SET status='approved', decided_by=mgr WHERE id=id3;
  PERFORM pg_temp.eq('a ticked task still moves', (SELECT owner_id FROM tasks WHERE id=tk), hr);
END $$;
ROLLBACK;
