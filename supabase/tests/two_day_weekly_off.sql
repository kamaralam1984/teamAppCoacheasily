-- A weekly off of more than one day ("Saturday,Sunday").
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/two_day_weekly_off.sql

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

-- 2026-10-23 is a Friday, 24 a Saturday, 25 a Sunday, 26 a Monday.

-- ═══════════ 1. THE HELPERS ═══════════
SELECT pg_temp.eq('helper: Saturday is off for Saturday,Sunday', is_weekly_off('Saturday,Sunday', DATE '2026-10-24'), true);
SELECT pg_temp.eq('helper: Sunday is off for Saturday,Sunday', is_weekly_off('Saturday,Sunday', DATE '2026-10-25'), true);
SELECT pg_temp.eq('helper: Friday is not', is_weekly_off('Saturday,Sunday', DATE '2026-10-23'), false);
SELECT pg_temp.eq('helper: a single day still works', is_weekly_off('Sunday', DATE '2026-10-25'), true);
SELECT pg_temp.eq('helper: and only that day', is_weekly_off('Sunday', DATE '2026-10-24'), false);
SELECT pg_temp.eq('helper: spaces after the comma are fine', is_weekly_off('Saturday, Sunday', DATE '2026-10-25'), true);
SELECT pg_temp.eq('helper: Based on work is never off', is_weekly_off('Based on work', DATE '2026-10-25'), false);
SELECT pg_temp.eq('helper: nor is no value', is_weekly_off(NULL, DATE '2026-10-25'), false);
SELECT pg_temp.eq('fixed: two days is a fixed off', has_fixed_weekly_off('Saturday,Sunday'), true);
SELECT pg_temp.eq('fixed: one day is a fixed off', has_fixed_weekly_off('Sunday'), true);
SELECT pg_temp.eq('fixed: Based on work is not', has_fixed_weekly_off('Based on work'), false);

-- ═══════════ 2. THE PEOPLE & CULTURE TEAM ═══════════
DO $$
DECLARE
  o uuid; hr uuid; pc uuid; w uuid; sam uuid;
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_days numeric; k text;
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('T-2off', '{}') RETURNING id INTO o;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;
  INSERT INTO el_policy (org_id) VALUES (o) ON CONFLICT DO NOTHING;
  INSERT INTO profiles (org_id, full_name, role, department, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Hema HR', 'hr', 'People & Culture', uids[1], DATE '2025-01-01', 'Saturday,Sunday') RETURNING id INTO hr;
  INSERT INTO profiles (org_id, full_name, role, department, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o, 'Paro Peopleops', 'member', 'People & Culture', uids[2], DATE '2025-01-01', 'Saturday,Sunday', hr) RETURNING id INTO pc;
  INSERT INTO profiles (org_id, full_name, role, department, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o, 'Wes Worker', 'member', 'Sales', uids[3], DATE '2025-01-01', 'Sunday', hr) RETURNING id INTO w;
  INSERT INTO profiles (org_id, full_name, role, department, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o, 'Sam Flexible', 'member', 'Coaching', uids[4], DATE '2025-01-01', 'Based on work', hr) RETURNING id INTO sam;
  INSERT INTO ids VALUES ('hr', hr), ('pc', pc), ('w', w), ('sam', sam);

  PERFORM pg_temp.as_user(hr);

  -- the calendar sees both days as the weekly off
  PERFORM pg_temp.eq('day: Friday is a working day', attendance_day_info(pc, DATE '2026-10-23')->>'kind' = 'weekly_off', false);
  PERFORM pg_temp.eq('day: Saturday is the weekly off', attendance_day_info(pc, DATE '2026-10-24')->>'kind', 'weekly_off');
  PERFORM pg_temp.eq('day: Sunday is the weekly off', attendance_day_info(pc, DATE '2026-10-25')->>'kind', 'weekly_off');
  PERFORM pg_temp.eq('day: someone with only Sunday works Saturday', attendance_day_info(w, DATE '2026-10-24')->>'kind' = 'weekly_off', false);
  PERFORM pg_temp.eq('day: Based on work has no weekly off on Sunday', attendance_day_info(sam, DATE '2026-10-25')->>'kind' = 'weekly_off', false);

  -- leave from Friday to Monday: the weekend is not leave for the two-day person
  v_days := leave_days_for(pc, DATE '2026-10-23', DATE '2026-10-26', false, 'earned');
  PERFORM pg_temp.eq('leave: Friday to Monday is 2 days with Saturday and Sunday off', v_days, 2::numeric);
  v_days := leave_days_for(w, DATE '2026-10-23', DATE '2026-10-26', false, 'earned');
  PERFORM pg_temp.eq('leave: and 3 days with only Sunday off', v_days, 3::numeric);

  -- the weekly off column is set as written
  PERFORM pg_temp.eq('data: the team works Monday to Friday',
    (SELECT count(*) FROM profiles WHERE org_id = o AND department = 'People & Culture' AND weekly_off = 'Saturday,Sunday')::int, 2);
END $$;

ROLLBACK;
