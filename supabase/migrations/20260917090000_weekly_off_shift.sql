-- ═══ SHIFTING A WEEKLY OFF ═══
-- Somebody can move one week's weekly off to another day of the same week, e.g. this Sunday's off
-- is taken on Wednesday instead. The weekly off on the profile does not change.
--   * Quarters and years are counted from the person's joining date (months 1–3 are the first
--     quarter, months 1–12 the first year). With no joining date on record, from the day the
--     profile was made.
--   * The first 2 shifts in a quarter go through straight away. The 3rd, 4th, 5th… in that same
--     quarter wait for HR to approve. Unused shifts do not carry into the next quarter.
--   * At most 8 shifts a year, counting the ones waiting for HR.
--   * Org settings weekly_off_shift_free_per_quarter (2) and weekly_off_shift_per_year (8).
-- Once a shift is approved, the moved day is a working day and the new day is the weekly off,
-- everywhere the old weekly off counted: attendance, earned leave, leave days, the sandwich rule,
-- punctuality and the 6 pm task reminder.

-- ───────── 1. THE SHIFTS ─────────
CREATE TABLE IF NOT EXISTS public.weekly_off_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  off_date date NOT NULL,          -- the weekly off that becomes a working day
  new_date date NOT NULL,          -- the day taken off instead
  reason text,
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  needs_hr boolean NOT NULL DEFAULT false,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (off_date <> new_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_off_shifts_off_once
  ON public.weekly_off_shifts (profile_id, off_date) WHERE status IN ('pending', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS weekly_off_shifts_new_once
  ON public.weekly_off_shifts (profile_id, new_date) WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS weekly_off_shifts_pending
  ON public.weekly_off_shifts (org_id) WHERE status = 'pending';

-- read your own, HR and admin read the org; every write goes through the functions below
ALTER TABLE public.weekly_off_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_off_shifts_read ON public.weekly_off_shifts;
CREATE POLICY weekly_off_shifts_read ON public.weekly_off_shifts FOR SELECT TO authenticated
  USING (profile_id = my_profile_id() OR (org_id = my_org() AND my_role() IN ('hr', 'admin')));
REVOKE ALL ON public.weekly_off_shifts FROM anon, authenticated;
GRANT SELECT ON public.weekly_off_shifts TO authenticated;
GRANT ALL ON public.weekly_off_shifts TO service_role;

-- ───────── 2. IS THIS PERSON OFF ON THIS DAY ─────────
-- The weekly off on the profile, unless an approved shift moved it.
CREATE OR REPLACE FUNCTION public.is_off_day(p_profile_id uuid, p_off text, p_date timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM weekly_off_shifts s
                  WHERE s.profile_id = p_profile_id AND s.status = 'approved'
                    AND s.new_date = p_date::date) THEN true
    WHEN EXISTS (SELECT 1 FROM weekly_off_shifts s
                  WHERE s.profile_id = p_profile_id AND s.status = 'approved'
                    AND s.off_date = p_date::date) THEN false
    ELSE public.is_weekly_off(p_off, p_date)
  END
$$;
REVOKE EXECUTE ON FUNCTION public.is_off_day(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_off_day(uuid, text, timestamptz) TO authenticated, service_role;

-- Re-point every function that asks is_weekly_off() for a person, the same way the two-day weekly
-- off was brought in. A profile row (or a CTE carrying the profile's id) becomes row.id; a few
-- functions keep the weekly off in a variable, and the variable holding that person's id is named
-- here. The block refuses to finish if any function still asks is_weekly_off().
DO $$
DECLARE
  r record;
  k text;
  v_def text;
  v_new text;
  v_changed int := 0;
  v_left text;
  v_vars jsonb := '{
    "mark_attendance":         {"v_weekly_off": "v_me"},
    "attendance_comp_off":     {"v_weekly_off": "NEW.profile_id"},
    "leave_days_for":          {"v_off": "p_profile_id"},
    "leave_sandwich_conflict": {"v_off": "p_profile_id"},
    "punctuality_me":          {"v_off": "v_me"}
  }';
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proname NOT IN ('is_weekly_off', 'is_off_day')
       AND p.prosrc LIKE '%is_weekly_off(%'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(
               v_def,
               'public\.is_weekly_off\(([A-Za-z_][A-Za-z_0-9]*)\.weekly_off,',
               'public.is_off_day(\1.id, \1.weekly_off,', 'g');
    FOR k IN SELECT jsonb_object_keys(coalesce(v_vars->r.proname::text, '{}'::jsonb)) LOOP
      v_new := replace(v_new, 'public.is_weekly_off(' || k || ',',
                       'public.is_off_day(' || (v_vars->r.proname::text->>k) || ', ' || k || ',');
    END LOOP;
    -- after a shift today's day name is no longer the weekly off on the profile
    v_new := replace(v_new,
      '''Today is your weekly off (%). Tell us why you are working today.'', v_weekly_off',
      '''Today is your weekly off. Tell us why you are working today.''');

    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE v_new;
      v_changed := v_changed + 1;
      RAISE NOTICE 'weekly off shift now counted in %', r.proname;
    END IF;
  END LOOP;

  SELECT string_agg(p.proname, ', ') INTO v_left
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.proname NOT IN ('is_weekly_off', 'is_off_day')
     AND p.prosrc ~ 'is_weekly_off\(';

  IF v_changed = 0 OR v_left IS NOT NULL THEN
    RAISE EXCEPTION 'weekly off shift rewrite incomplete: % functions changed, still asking is_weekly_off: %',
      v_changed, v_left;
  END IF;
END $$;

-- ───────── 3. THE QUARTER AND THE YEAR ─────────
-- The window of p_months that holds p_date, counted from joining: [start, end).
CREATE OR REPLACE FUNCTION public.weekly_off_shift_window(p_anchor date, p_date date, p_months int)
RETURNS daterange
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_age interval := age(p_date, p_anchor);
  v_k int := floor((extract(year FROM v_age) * 12 + extract(month FROM v_age)) / p_months)::int;
BEGIN
  -- month ends (joined on the 31st) can put the guess one window out either way
  WHILE (p_anchor + make_interval(months => v_k * p_months))::date > p_date LOOP
    v_k := v_k - 1;
  END LOOP;
  WHILE (p_anchor + make_interval(months => (v_k + 1) * p_months))::date <= p_date LOOP
    v_k := v_k + 1;
  END LOOP;
  RETURN daterange((p_anchor + make_interval(months => v_k * p_months))::date,
                   (p_anchor + make_interval(months => (v_k + 1) * p_months))::date);
END $function$;

-- How many shifts p_date's quarter and year already hold (pending and approved), and the limits.
CREATE OR REPLACE FUNCTION public.weekly_off_shift_usage(p_profile_id uuid, p_date date,
  p_exclude uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_anchor date;
  v_settings jsonb;
  v_free int;
  v_cap int;
  v_q daterange;
  v_y daterange;
  v_q_used int;
  v_y_used int;
BEGIN
  SELECT coalesce(p.joined_on, p.created_at::date), coalesce(o.settings, '{}'::jsonb)
    INTO v_anchor, v_settings
    FROM profiles p JOIN organisations o ON o.id = p.org_id
   WHERE p.id = p_profile_id;
  IF v_anchor IS NULL THEN RETURN NULL; END IF;

  v_free := coalesce((v_settings->>'weekly_off_shift_free_per_quarter')::int, 2);
  v_cap := coalesce((v_settings->>'weekly_off_shift_per_year')::int, 8);
  v_q := weekly_off_shift_window(v_anchor, greatest(p_date, v_anchor), 3);
  v_y := weekly_off_shift_window(v_anchor, greatest(p_date, v_anchor), 12);

  SELECT count(*) FILTER (WHERE off_date <@ v_q), count(*)
    INTO v_q_used, v_y_used
    FROM weekly_off_shifts
   WHERE profile_id = p_profile_id AND status IN ('pending', 'approved')
     AND off_date <@ v_y AND id IS DISTINCT FROM p_exclude;

  RETURN jsonb_build_object(
    'quarter_from', lower(v_q), 'quarter_to', upper(v_q) - 1, 'quarter_used', v_q_used,
    'free_per_quarter', v_free, 'free_left', greatest(v_free - v_q_used, 0),
    'year_from', lower(v_y), 'year_to', upper(v_y) - 1, 'year_used', v_y_used,
    'per_year', v_cap, 'year_left', greatest(v_cap - v_y_used, 0));
END $function$;
REVOKE ALL ON FUNCTION public.weekly_off_shift_usage(uuid, date, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_off_shift_usage(uuid, date, uuid) TO service_role;

-- ───────── 4. THE RULES ─────────
-- Why this shift cannot be made, or null when it can. Shared by the live check and the write.
CREATE OR REPLACE FUNCTION public.weekly_off_shift_problem(p_profile_id uuid, p_off date, p_new date)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  p profiles%ROWTYPE;
  v_usage jsonb;
BEGIN
  SELECT * INTO p FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RETURN 'Your profile isn''t set up yet.'; END IF;
  IF p_off IS NULL OR p_new IS NULL THEN RETURN 'Pick both days.'; END IF;
  IF NOT has_fixed_weekly_off(p.weekly_off) THEN
    RETURN 'You don''t have a fixed weekly off, so there is nothing to shift.';
  END IF;
  IF NOT public.is_weekly_off(p.weekly_off, p_off) THEN
    RETURN format('%s is not your weekly off.', to_char(p_off, 'FMDay DD Mon'));
  END IF;
  IF public.is_weekly_off(p.weekly_off, p_new) THEN
    RETURN format('%s is already your weekly off — pick a working day.', to_char(p_new, 'FMDay DD Mon'));
  END IF;
  IF date_trunc('week', p_off) <> date_trunc('week', p_new) THEN
    RETURN 'Both days have to be in the same week (Monday to Sunday).';
  END IF;
  IF least(p_off, p_new) < v_today THEN
    RETURN 'Both days have to be today or later.';
  END IF;
  IF p.joined_on IS NOT NULL AND least(p_off, p_new) < p.joined_on THEN
    RETURN 'Both days have to be on or after your joining date.';
  END IF;
  IF EXISTS (SELECT 1 FROM holidays WHERE org_id = p.org_id AND date IN (p_off, p_new)) THEN
    RETURN 'One of those days is a holiday — pick another week or day.';
  END IF;
  IF EXISTS (SELECT 1 FROM attendance WHERE profile_id = p_profile_id AND date = p_new) THEN
    RETURN 'You have already marked attendance on that day.';
  END IF;
  IF EXISTS (SELECT 1 FROM weekly_off_shifts
              WHERE profile_id = p_profile_id AND status IN ('pending', 'approved')
                AND (off_date = p_off OR new_date = p_new)) THEN
    RETURN 'You have already shifted that weekly off, or already moved one to that day.';
  END IF;

  v_usage := weekly_off_shift_usage(p_profile_id, p_off);
  IF (v_usage->>'year_left')::int <= 0 THEN
    RETURN format('You can shift your weekly off %s times a year and have used all of them (%s to %s).',
      v_usage->>'per_year', to_char((v_usage->>'year_from')::date, 'DD Mon YYYY'),
      to_char((v_usage->>'year_to')::date, 'DD Mon YYYY'));
  END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.weekly_off_shift_problem(uuid, date, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_off_shift_problem(uuid, date, date) TO service_role;

-- The live check for the form: what is wrong, or whether HR has to approve it.
CREATE OR REPLACE FUNCTION public.weekly_off_shift_check(p_off date, p_new date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id();
  v_usage jsonb;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  v_usage := weekly_off_shift_usage(v_me, coalesce(p_off, (now() AT TIME ZONE 'Asia/Kolkata')::date));
  RETURN jsonb_build_object(
    'problem', weekly_off_shift_problem(v_me, p_off, p_new),
    'needs_hr', coalesce((v_usage->>'free_left')::int, 0) <= 0,
    'usage', v_usage);
END $function$;
REVOKE ALL ON FUNCTION public.weekly_off_shift_check(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.weekly_off_shift_check(date, date) TO authenticated, service_role;

-- A request nobody decided before its first day is rejected that day.
CREATE OR REPLACE FUNCTION public.weekly_off_shifts_expire()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n int;
BEGIN
  UPDATE weekly_off_shifts
     SET status = 'rejected', decided_at = now(),
         decision_note = 'Nobody decided before the day came.'
   WHERE status = 'pending'
     AND least(off_date, new_date) < (now() AT TIME ZONE 'Asia/Kolkata')::date;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;
REVOKE ALL ON FUNCTION public.weekly_off_shifts_expire() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.weekly_off_shifts_expire() TO authenticated, service_role;

-- ───────── 5. ASKING, CANCELLING, DECIDING ─────────
CREATE OR REPLACE FUNCTION public.weekly_off_shift_request(p_off date, p_new date, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id();
  p profiles%ROWTYPE;
  v_problem text;
  v_usage jsonb;
  v_needs_hr boolean;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row weekly_off_shifts%ROWTYPE;
  v_days text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;
  -- two quick taps must not both count as a free shift
  PERFORM pg_advisory_xact_lock(hashtext('weekly_off_shift:' || v_me::text));

  v_problem := weekly_off_shift_problem(v_me, p_off, p_new);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION '%', v_problem; END IF;

  SELECT * INTO p FROM profiles WHERE id = v_me;
  v_usage := weekly_off_shift_usage(v_me, p_off);
  v_needs_hr := (v_usage->>'free_left')::int <= 0;
  IF v_needs_hr AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'You have used your % free shifts this quarter, so HR has to approve this one. Tell HR why.',
      v_usage->>'free_per_quarter';
  END IF;

  INSERT INTO weekly_off_shifts (org_id, profile_id, off_date, new_date, reason, status, needs_hr, decided_at)
  VALUES (p.org_id, v_me, p_off, p_new, left(v_reason, 300),
          CASE WHEN v_needs_hr THEN 'pending' ELSE 'approved' END, v_needs_hr,
          CASE WHEN v_needs_hr THEN NULL ELSE now() END)
  RETURNING * INTO v_row;

  v_days := to_char(p_off, 'FMDy DD Mon') || ' → ' || to_char(p_new, 'FMDy DD Mon');
  IF v_needs_hr THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT p.org_id, h.id, p.full_name || ' wants to shift their weekly off',
           v_days || coalesce(' · ' || left(v_reason, 200), ''), '/approvals'
      FROM profiles h
     WHERE h.org_id = p.org_id AND h.role IN ('hr', 'admin') AND h.status <> 'exited' AND h.id <> v_me;
  ELSIF p.manager_id IS NOT NULL THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (p.org_id, p.manager_id, p.full_name || ' shifted their weekly off',
            v_days || coalesce(' · ' || left(v_reason, 200), ''), '/attendance');
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'needs_hr', v_needs_hr,
                            'usage', weekly_off_shift_usage(v_me, p_off));
END $function$;
REVOKE ALL ON FUNCTION public.weekly_off_shift_request(date, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.weekly_off_shift_request(date, date, text) TO authenticated, service_role;

-- Take a shift back while it is still ahead (a pending one any time before HR decides).
CREATE OR REPLACE FUNCTION public.weekly_off_shift_cancel(p_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id();
  s weekly_off_shifts%ROWTYPE;
BEGIN
  SELECT * INTO s FROM weekly_off_shifts WHERE id = p_id AND profile_id = v_me FOR UPDATE;
  IF NOT FOUND OR s.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'That shift can''t be cancelled.';
  END IF;
  IF s.status = 'approved' AND least(s.off_date, s.new_date) <= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'That shift has already started, so it stays.';
  END IF;
  UPDATE weekly_off_shifts SET status = 'cancelled', decided_at = now() WHERE id = p_id;
END $function$;
REVOKE ALL ON FUNCTION public.weekly_off_shift_cancel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.weekly_off_shift_cancel(uuid) TO authenticated, service_role;

-- HR (or admin) decides a shift beyond the free ones. Nobody decides their own.
CREATE OR REPLACE FUNCTION public.weekly_off_shift_decide(p_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id();
  s weekly_off_shifts%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF my_role() NOT IN ('hr', 'admin') THEN
    RAISE EXCEPTION 'Only HR can decide a weekly off shift.';
  END IF;
  PERFORM weekly_off_shifts_expire();
  SELECT * INTO s FROM weekly_off_shifts WHERE id = p_id AND org_id = my_org() FOR UPDATE;
  IF NOT FOUND OR s.status <> 'pending' THEN
    RAISE EXCEPTION 'That request is no longer waiting for a decision.';
  END IF;
  IF s.profile_id = v_me THEN
    RAISE EXCEPTION 'Somebody else has to decide your own request.';
  END IF;
  IF p_approve AND EXISTS (SELECT 1 FROM attendance WHERE profile_id = s.profile_id AND date = s.new_date) THEN
    RAISE EXCEPTION 'They have already marked attendance on %, so it can''t become their weekly off.',
      to_char(s.new_date, 'FMDy DD Mon');
  END IF;

  UPDATE weekly_off_shifts
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = v_me, decided_at = now(), decision_note = left(v_note, 300)
   WHERE id = p_id;

  INSERT INTO notifications (org_id, profile_id, title, body, link)
  VALUES (s.org_id, s.profile_id,
          CASE WHEN p_approve THEN 'Your weekly off shift is approved'
               ELSE 'Your weekly off shift was not approved' END,
          to_char(s.off_date, 'FMDy DD Mon') || ' → ' || to_char(s.new_date, 'FMDy DD Mon')
            || coalesce(' · ' || v_note, ''),
          '/leave');
END $function$;
REVOKE ALL ON FUNCTION public.weekly_off_shift_decide(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.weekly_off_shift_decide(uuid, boolean, text) TO authenticated, service_role;

-- ───────── 6. WHAT THE SCREENS READ ─────────
-- Mine: today's quarter and year, and my shifts of the last few months and ahead.
CREATE OR REPLACE FUNCTION public.weekly_off_shifts_mine()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  PERFORM weekly_off_shifts_expire();
  RETURN jsonb_build_object(
    'today', v_today,
    'off_today', public.is_off_day(v_me, (SELECT weekly_off FROM profiles WHERE id = v_me), v_today),
    'usage', weekly_off_shift_usage(v_me, v_today),
    'shifts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id, 'off_date', s.off_date, 'new_date', s.new_date, 'reason', s.reason,
               'status', s.status, 'needs_hr', s.needs_hr, 'decision_note', s.decision_note,
               'created_at', s.created_at) ORDER BY s.off_date DESC)
        FROM weekly_off_shifts s
       WHERE s.profile_id = v_me AND s.off_date >= v_today - 120), '[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.weekly_off_shifts_mine() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.weekly_off_shifts_mine() TO authenticated, service_role;

-- HR: what is waiting, oldest first, with the person's quarter so far.
CREATE OR REPLACE FUNCTION public.weekly_off_shifts_pending()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF my_role() NOT IN ('hr', 'admin') THEN RETURN '[]'::jsonb; END IF;
  PERFORM weekly_off_shifts_expire();
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', s.id, 'profile_id', s.profile_id, 'full_name', p.full_name, 'title', p.title,
             'department', p.department, 'weekly_off', p.weekly_off,
             'off_date', s.off_date, 'new_date', s.new_date, 'reason', s.reason,
             'created_at', s.created_at,
             'usage', weekly_off_shift_usage(s.profile_id, s.off_date, s.id)) ORDER BY s.created_at)
      FROM weekly_off_shifts s
      JOIN profiles p ON p.id = s.profile_id
     WHERE s.org_id = my_org() AND s.status = 'pending'), '[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.weekly_off_shifts_pending() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.weekly_off_shifts_pending() TO authenticated, service_role;
