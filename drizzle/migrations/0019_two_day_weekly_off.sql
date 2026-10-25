-- A weekly off can now be more than one day, e.g. "Saturday,Sunday".
--
-- profiles.weekly_off stays a text column. It holds one day name, several day names separated by
-- commas, or "Based on work" (which never matches a date, so nobody is treated as off that way).
-- Every place that used to compare the weekday with the column now asks is_weekly_off() instead.
-- The date argument is a timestamptz so that both a date and a generate_series() day can be passed.

CREATE OR REPLACE FUNCTION public.is_weekly_off(p_off text, p_date timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p_off IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM unnest(string_to_array(p_off, ',')) AS x
        WHERE btrim(x) = trim(to_char(p_date, 'Day'))
     )
$$;

REVOKE EXECUTE ON FUNCTION public.is_weekly_off(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_weekly_off(text, timestamptz) TO authenticated, service_role;

-- "Has a fixed weekly off" means at least one real weekday is listed ("Based on work" has none).
CREATE OR REPLACE FUNCTION public.has_fixed_weekly_off(p_off text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_off IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(string_to_array(p_off, ',')) AS x
     WHERE btrim(x) IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
  )
$$;

-- Re-point the existing functions. They all compare the weekday name with the profile's weekly off in
-- one of two shapes, so rewrite those two shapes (and the one trigger that keeps a day-name variable)
-- instead of copying every function body again. The block refuses to finish if a comparison is left.
DO $$
DECLARE
  r record;
  v_def text;
  v_new text;
  v_changed int := 0;
  v_left int;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proname <> 'is_weekly_off'
       AND p.prosrc ~ 'to_char\([A-Za-z_0-9.]+, ''Day''\)'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    -- some functions wrap the right-hand side in btrim(); the helper trims by itself
    v_new := regexp_replace(v_def, '(<>|=) btrim\(([A-Za-z_0-9.]+)\)', '\1 \2', 'g');
    v_new := regexp_replace(
               v_new,
               'trim\(to_char\(([A-Za-z_0-9.]+), ''Day''\)\) = ([A-Za-z_0-9.]+)',
               'public.is_weekly_off(\2, \1)', 'g');
    v_new := regexp_replace(
               v_new,
               'trim\(to_char\(([A-Za-z_0-9.]+), ''Day''\)\) <> ([A-Za-z_0-9.]+)',
               'NOT public.is_weekly_off(\2, \1)', 'g');
    v_new := replace(v_new, 'v_weekly_off = v_day_name', 'public.is_weekly_off(v_weekly_off, NEW.date)');

    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE v_new;
      v_changed := v_changed + 1;
      RAISE NOTICE 'weekly off now multi-day in %', r.proname;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_left
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND (p.prosrc ~ 'to_char\([A-Za-z_0-9.]+, ''Day''\)\) *(=|<>) *[A-Za-z_0-9.]*off'
          OR p.prosrc ~ 'v_weekly_off = v_day_name');

  IF v_changed = 0 OR v_left > 0 THEN
    RAISE EXCEPTION 'weekly off rewrite incomplete: % functions changed, % comparisons left', v_changed, v_left;
  END IF;
END $$;

-- The People & Culture team works Monday to Friday.
UPDATE public.profiles
   SET weekly_off = 'Saturday,Sunday'
 WHERE status <> 'exited'
   AND (role = 'hr' OR department = 'People & Culture')
   AND weekly_off IS DISTINCT FROM 'Saturday,Sunday';