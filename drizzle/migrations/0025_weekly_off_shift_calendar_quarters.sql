-- ═══ WEEKLY OFF SHIFT: CALENDAR QUARTERS AND YEARS ═══
-- Quarters and years for weekly off shifts now follow the calendar, not the joining date:
--   January–March, April–June, July–September, October–December; the year is January–December.
-- Everyone gets the usual free shifts a quarter (org setting weekly_off_shift_free_per_quarter, 2),
-- except in the quarter they joined if they joined in its last month (March, June, September or
-- December): then half of them, rounded up (1 of 2). The year limit (weekly_off_shift_per_year, 8)
-- stays the same whenever somebody joined. A shift still counts in the quarter of the weekly off it
-- moves (off_date). Every other rule is unchanged.

-- The calendar window of p_months (3 = quarter, 12 = year) that holds p_date: [start, end).
CREATE OR REPLACE FUNCTION public.weekly_off_shift_period(p_date date, p_months int)
RETURNS daterange
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT daterange(s, (s + make_interval(months => p_months))::date)
    FROM (SELECT (date_trunc('year', p_date)
                  + make_interval(months => ((extract(month FROM p_date)::int - 1) / p_months) * p_months)
                 )::date AS s) w
$function$;
REVOKE ALL ON FUNCTION public.weekly_off_shift_period(date, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.weekly_off_shift_period(date, int) TO authenticated, service_role;

-- How many shifts p_date's quarter and year already hold (pending and approved), and the limits.
-- Same result shape as before, plus late_join: true in a joining quarter that gets fewer free shifts.
CREATE OR REPLACE FUNCTION public.weekly_off_shift_usage(p_profile_id uuid, p_date date,
  p_exclude uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_joined date;
  v_settings jsonb;
  v_free int;
  v_cap int;
  v_q daterange;
  v_y daterange;
  v_late boolean;
  v_q_used int;
  v_y_used int;
BEGIN
  SELECT p.joined_on, coalesce(o.settings, '{}'::jsonb)
    INTO v_joined, v_settings
    FROM profiles p JOIN organisations o ON o.id = p.org_id
   WHERE p.id = p_profile_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_free := coalesce((v_settings->>'weekly_off_shift_free_per_quarter')::int, 2);
  v_cap := coalesce((v_settings->>'weekly_off_shift_per_year')::int, 8);
  v_q := weekly_off_shift_period(p_date, 3);
  v_y := weekly_off_shift_period(p_date, 12);

  -- joined in the last month of this quarter: half the free shifts, rounded up
  v_late := v_joined IS NOT NULL AND v_joined <@ v_q AND extract(month FROM v_joined)::int % 3 = 0;
  IF v_late THEN
    v_free := ceil(v_free / 2.0)::int;
  END IF;

  SELECT count(*) FILTER (WHERE off_date <@ v_q), count(*)
    INTO v_q_used, v_y_used
    FROM weekly_off_shifts
   WHERE profile_id = p_profile_id AND status IN ('pending', 'approved')
     AND off_date <@ v_y AND id IS DISTINCT FROM p_exclude;

  RETURN jsonb_build_object(
    'quarter_from', lower(v_q), 'quarter_to', upper(v_q) - 1, 'quarter_used', v_q_used,
    'free_per_quarter', v_free, 'free_left', greatest(v_free - v_q_used, 0), 'late_join', v_late,
    'year_from', lower(v_y), 'year_to', upper(v_y) - 1, 'year_used', v_y_used,
    'per_year', v_cap, 'year_left', greatest(v_cap - v_y_used, 0));
END $function$;
REVOKE ALL ON FUNCTION public.weekly_off_shift_usage(uuid, date, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_off_shift_usage(uuid, date, uuid) TO service_role;

-- The joining-date window is no longer used by anything.
DROP FUNCTION IF EXISTS public.weekly_off_shift_window(date, date, int);
