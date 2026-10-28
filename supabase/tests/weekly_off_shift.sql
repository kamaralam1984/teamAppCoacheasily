-- Shifting one week's weekly off to another day of the same week.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/weekly_off_shift.sql

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

-- ═══════════ 1. QUARTERS AND YEARS FROM JOINING ═══════════
SELECT pg_temp.eq('window: joined 1 Jan, 28 Oct is in the Oct quarter',
  weekly_off_shift_window(DATE '2025-01-01', DATE '2026-10-28', 3), daterange('2026-10-01', '2027-01-01'));
SELECT pg_temp.eq('window: and in the 2026 joining year',
  weekly_off_shift_window(DATE '2025-01-01', DATE '2026-10-28', 12), daterange('2026-01-01', '2027-01-01'));
SELECT pg_temp.eq('window: joined on the 31st, the quarter ends on the 30th',
  weekly_off_shift_window(DATE '2026-01-31', DATE '2026-04-29', 3), daterange('2026-01-31', '2026-04-30'));
SELECT pg_temp.eq('window: and the next one starts there',
  lower(weekly_off_shift_window(DATE '2026-01-31', DATE '2026-04-30', 3)), DATE '2026-04-30');

-- ═══════════ 2. FREE, THEN HR, THEN THE YEAR LIMIT ═══════════
DO $$
DECLARE
  o uuid; hr uuid; w uuid;
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid()];
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  mon date := date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')::date + 7)::date;  -- next Monday
  r jsonb;
  s3 uuid;
  v_err text;
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('T-shift', '{}') RETURNING id INTO o;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;
  INSERT INTO el_policy (org_id) VALUES (o) ON CONFLICT DO NOTHING;
  INSERT INTO profiles (org_id, full_name, role, department, auth_user_id, joined_on, weekly_off)
  VALUES (o, 'Hema HR', 'hr', 'People & Culture', uids[1], mon - 14, 'Saturday,Sunday') RETURNING id INTO hr;
  -- joined two weeks before next Monday, so the next few Sundays share one quarter
  INSERT INTO profiles (org_id, full_name, role, department, auth_user_id, joined_on, weekly_off, manager_id)
  VALUES (o, 'Wes Worker', 'member', 'Sales', uids[2], mon - 14, 'Sunday', hr) RETURNING id INTO w;

  PERFORM pg_temp.as_user(w);

  -- the rules
  PERFORM pg_temp.eq('rule: Monday is not the weekly off',
    weekly_off_shift_problem(w, mon, mon + 2) IS NOT NULL, true);
  PERFORM pg_temp.eq('rule: the new day cannot be a weekly off too',
    weekly_off_shift_problem(w, mon + 6, mon + 13) IS NOT NULL, true);
  PERFORM pg_temp.eq('rule: both days in one week',
    weekly_off_shift_problem(w, mon + 6, mon + 7), 'Both days have to be in the same week (Monday to Sunday).');
  PERFORM pg_temp.eq('rule: Sunday to Wednesday is fine',
    weekly_off_shift_problem(w, mon + 6, mon + 2), NULL::text);

  -- 1st and 2nd go through on their own
  r := weekly_off_shift_request(mon + 6, mon + 2, NULL);
  PERFORM pg_temp.eq('1st: approved straight away', r->>'status', 'approved');
  PERFORM pg_temp.eq('1st: no HR', (r->>'needs_hr')::boolean, false);
  r := weekly_off_shift_request(mon + 13, mon + 9, 'family function');
  PERFORM pg_temp.eq('2nd: approved straight away', r->>'status', 'approved');
  PERFORM pg_temp.eq('2nd: the manager hears about it',
    (SELECT count(*) FROM notifications WHERE profile_id = hr AND title LIKE 'Wes Worker shifted%')::int, 2);

  -- the shifted days everywhere
  PERFORM pg_temp.eq('day: the moved Sunday is a working day',
    attendance_day_info(w, mon + 6)->>'kind' = 'weekly_off', false);
  PERFORM pg_temp.eq('day: Wednesday is the weekly off', attendance_day_info(w, mon + 2)->>'kind', 'weekly_off');
  PERFORM pg_temp.eq('day: helper agrees', is_off_day(w, 'Sunday', mon + 2), true);
  PERFORM pg_temp.eq('day: a Sunday nobody moved is still off', is_off_day(w, 'Sunday', mon + 20), true);
  PERFORM pg_temp.eq('leave: Monday to Sunday is still 6 days, Wednesday off instead of Sunday',
    leave_days_for(w, mon, mon + 6, false, 'earned'), 6::numeric);
  PERFORM pg_temp.eq('leave: Monday to Saturday is 5 days now',
    leave_days_for(w, mon, mon + 5, false, 'earned'), 5::numeric);

  -- 3rd in the quarter waits for HR, and needs a reason
  BEGIN
    PERFORM weekly_off_shift_request(mon + 20, mon + 16, NULL);
    v_err := 'no error';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  PERFORM pg_temp.eq('3rd: HR needs a reason', v_err LIKE 'You have used your 2 free shifts%', true);
  r := weekly_off_shift_request(mon + 20, mon + 16, 'wedding in the family');
  s3 := (r->>'id')::uuid;
  PERFORM pg_temp.eq('3rd: waits for HR', r->>'status', 'pending');
  PERFORM pg_temp.eq('3rd: not counted as a shift yet', is_off_day(w, 'Sunday', mon + 20), true);
  PERFORM pg_temp.eq('3rd: HR is told',
    (SELECT count(*) FROM notifications WHERE profile_id = hr AND link = '/approvals')::int, 1);

  -- the worker cannot decide it; HR can
  BEGIN
    PERFORM weekly_off_shift_decide(s3, true, NULL);
    v_err := 'no error';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  PERFORM pg_temp.eq('decide: only HR', v_err, 'Only HR can decide a weekly off shift.');
  PERFORM pg_temp.as_user(hr);
  PERFORM pg_temp.eq('decide: HR sees it waiting', jsonb_array_length(weekly_off_shifts_pending()), 1);
  PERFORM weekly_off_shift_decide(s3, true, NULL);
  PERFORM pg_temp.eq('decide: approved', (SELECT status FROM weekly_off_shifts WHERE id = s3), 'approved');
  PERFORM pg_temp.eq('decide: now counted', is_off_day(w, 'Sunday', mon + 16), true);
  PERFORM pg_temp.eq('decide: the worker is told',
    (SELECT count(*) FROM notifications WHERE profile_id = w AND title = 'Your weekly off shift is approved')::int, 1);

  -- the year limit (lowered to 3 here) counts every shift of the year
  UPDATE organisations SET settings = '{"weekly_off_shift_per_year": 3}' WHERE id = o;
  PERFORM pg_temp.as_user(w);
  PERFORM pg_temp.eq('year: the 4th is refused',
    weekly_off_shift_problem(w, mon + 27, mon + 23) LIKE 'You can shift your weekly off 3 times a year%', true);

  -- cancelling gives the usual weekly off back and frees the slot
  PERFORM weekly_off_shift_cancel((SELECT id FROM weekly_off_shifts WHERE profile_id = w AND off_date = mon + 6));
  PERFORM pg_temp.eq('cancel: Sunday is off again', is_off_day(w, 'Sunday', mon + 6), true);
  PERFORM pg_temp.eq('cancel: and the slot is free', weekly_off_shift_problem(w, mon + 27, mon + 23), NULL::text);
  PERFORM pg_temp.eq('mine: today is not shifted', (weekly_off_shifts_mine()->>'off_today')::boolean,
    is_weekly_off('Sunday', v_today));
END $$;

ROLLBACK;
