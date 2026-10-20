-- The hand-set team order: HR and admin can place people, an ordinary person cannot.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/team_order.sql

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

DO $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  o uuid; hr uuid; a uuid; b uuid;
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('TO', '{}') RETURNING id INTO o;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on)
  VALUES (o, 'Hema HR', 'hr', uids[1], today - 400) RETURNING id INTO hr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id)
  VALUES (o, 'Asha A', 'member', uids[2], today - 400, hr) RETURNING id INTO a;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id)
  VALUES (o, 'Bela B', 'member', uids[3], today - 400, hr) RETURNING id INTO b;
  INSERT INTO ids VALUES ('hr', hr), ('a', a), ('b', b);
END $$;


DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k = 'hr');
  a uuid := (SELECT v FROM ids WHERE k = 'a');
  b uuid := (SELECT v FROM ids WHERE k = 'b');
BEGIN
  PERFORM pg_temp.eq('nobody is placed to begin with', (SELECT team_order FROM profiles WHERE id = a), NULL::integer);

  PERFORM pg_temp.as_user(hr);
  UPDATE profiles SET team_order = 10 WHERE id = b;
  UPDATE profiles SET team_order = 20 WHERE id = a;
  PERFORM pg_temp.eq('HR can place somebody', (SELECT team_order FROM profiles WHERE id = b), 10);
  PERFORM pg_temp.eq('...and somebody else', (SELECT team_order FROM profiles WHERE id = a), 20);

  PERFORM pg_temp.as_user(a);
  BEGIN
    UPDATE profiles SET team_order = 1 WHERE id = a;
    RAISE EXCEPTION 'FAIL an ordinary person placed themselves';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'ok   an ordinary person cannot place themselves (%)', SQLERRM;
  END;
  PERFORM pg_temp.eq('...and their place is unchanged', (SELECT team_order FROM profiles WHERE id = a), 20);
END $$;

ROLLBACK;
