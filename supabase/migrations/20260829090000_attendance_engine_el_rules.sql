-- ═══ ATTENDANCE ENGINE + EARNED-LEAVE RULES ═══
-- 1. attendance: status (present / half_day / wfh) and check-out
-- 2. attendance_corrections: every HR correction keeps old value, new value and a reason
-- 3. attendance_day_info() is the one place that decides what a day was:
--    present, late, half_day, wfh, leave, holiday, weekly_off, absent, ...
-- 4. RPCs: check out, month calendar, team day, range report, HR correction
-- 5. Earned leave: WFH / half-day / probation rules, and a yearly carry-forward limit
--    (anything above the limit lapses when the leave year starts, written to el_lapses)

-- ───────── 1. ATTENDANCE COLUMNS ─────────
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'present',
  ADD COLUMN IF NOT EXISTS check_out_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.attendance
    ADD CONSTRAINT attendance_status_check CHECK (status IN ('present', 'half_day', 'wfh'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- People may still edit the focus line on their own row today; everything else is locked,
-- unless one of the functions below (which set app.attendance_write) is doing the write.
CREATE OR REPLACE FUNCTION public.attendance_focus_only()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF coalesce(current_setting('app.attendance_write', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.org_id := OLD.org_id;
  NEW.profile_id := OLD.profile_id;
  NEW.date := OLD.date;
  NEW.marked_at := OLD.marked_at;
  NEW.on_time := OLD.on_time;
  NEW.created_at := OLD.created_at;
  NEW.status := OLD.status;
  NEW.check_out_at := OLD.check_out_at;
  RETURN NEW;
END
$function$;

-- ───────── 2. CORRECTIONS ─────────
CREATE TABLE IF NOT EXISTS public.attendance_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text NOT NULL,
  corrected_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_corrections_profile_idx
  ON public.attendance_corrections (profile_id, date DESC);
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.attendance_corrections TO service_role;
-- Read only through attendance_corrections_for(); nobody writes directly.

-- ───────── 3. WHAT WAS THIS DAY? ─────────
-- Internal helper (callers do their own access check).
CREATE OR REPLACE FUNCTION public.attendance_day_info(p_profile_id uuid, p_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  p profiles%ROWTYPE;
  a attendance%ROWTYPE;
  l leave_requests%ROWTYPE;
  v_hol text;
  v_kind text;
  v_note text;
  v_late boolean := false;
BEGIN
  SELECT * INTO p FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO a FROM attendance WHERE profile_id = p_profile_id AND date = p_date;
  SELECT name INTO v_hol FROM holidays WHERE org_id = p.org_id AND date = p_date;
  SELECT * INTO l FROM leave_requests
   WHERE profile_id = p_profile_id AND status = 'approved'
     AND p_date BETWEEN from_date AND to_date
   ORDER BY half_day LIMIT 1;

  IF a.id IS NOT NULL THEN
    v_late := coalesce(a.on_time, true) = false;
    v_kind := CASE a.status
                WHEN 'wfh' THEN 'wfh'
                WHEN 'half_day' THEN 'half_day'
                WHEN 'present' THEN CASE WHEN v_late THEN 'late' ELSE 'present' END
              END;
  ELSIF p.joined_on IS NOT NULL AND p_date < p.joined_on THEN
    v_kind := 'not_joined';
  ELSIF p.status = 'exited' AND p.exited_on IS NOT NULL AND p_date > p.exited_on THEN
    v_kind := 'not_joined';
  ELSIF v_hol IS NOT NULL THEN
    v_kind := 'holiday'; v_note := v_hol;
  ELSIF p.weekly_off IS NOT NULL AND trim(to_char(p_date, 'Day')) = p.weekly_off THEN
    v_kind := 'weekly_off';
  ELSIF l.id IS NOT NULL THEN
    v_kind := 'leave';
    v_note := l.type || CASE WHEN l.half_day THEN ' (half day)' ELSE '' END;
  ELSIF p_date > v_today THEN
    v_kind := 'upcoming';
  ELSIF p_date = v_today THEN
    v_kind := 'not_marked';
  ELSE
    v_kind := 'absent';
  END IF;

  RETURN jsonb_build_object(
    'date', p_date,
    'kind', v_kind,
    'late', v_late,
    'check_in', CASE WHEN a.id IS NULL THEN NULL
                     ELSE to_char(a.marked_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') END,
    'check_out', CASE WHEN a.check_out_at IS NULL THEN NULL
                      ELSE to_char(a.check_out_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') END,
    'hours', CASE WHEN a.check_out_at IS NULL THEN NULL
                  ELSE round((extract(epoch FROM (a.check_out_at - a.marked_at)) / 3600)::numeric, 2) END,
    'note', v_note);
END $$;
REVOKE ALL ON FUNCTION public.attendance_day_info(uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_day_info(uuid, date) TO service_role;

-- ───────── 4. MARK, CHECK OUT ─────────
DROP FUNCTION IF EXISTS public.mark_attendance(text);

CREATE OR REPLACE FUNCTION public.mark_attendance(
  p_focus text DEFAULT NULL, p_status text DEFAULT 'present')
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_me uuid := my_profile_id();
  v_org uuid;
  v_row attendance%ROWTYPE;
  v_reason text;
  v_summary jsonb;
  v_days int;
  v_credited int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;
  IF p_status NOT IN ('present', 'wfh', 'half_day') THEN
    RAISE EXCEPTION 'Choose office, work from home or half day.';
  END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = v_me;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;

  INSERT INTO attendance (profile_id, org_id, focus, status)
  VALUES (v_me, v_org, nullif(btrim(coalesce(p_focus, '')), ''), p_status)
  RETURNING * INTO v_row;

  SELECT reason INTO v_reason
    FROM comp_off_credits WHERE profile_id = v_me AND earned_on = v_row.date LIMIT 1;

  v_credited := el_run_credits(v_me);
  v_summary := attendance_summary(v_me);
  v_days := coalesce((v_summary->>'days_marked')::int, 0);

  RETURN jsonb_build_object(
    'date', v_row.date,
    'at', to_char(v_row.marked_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI'),
    'onTime', coalesce(v_row.on_time, true),
    'status', v_row.status,
    'compOffReason', v_reason,
    'daysMarked', v_days,
    'milestone', v_credited > 0,
    'summary', v_summary);
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_attendance(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_attendance(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_out_attendance()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  a attendance%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;
  SELECT * INTO a FROM attendance WHERE profile_id = v_me AND date = v_today;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mark your attendance before you check out.'; END IF;
  IF a.check_out_at IS NOT NULL THEN RAISE EXCEPTION 'You have already checked out today.'; END IF;

  PERFORM set_config('app.attendance_write', 'on', true);
  UPDATE attendance SET check_out_at = now() WHERE id = a.id RETURNING * INTO a;
  PERFORM set_config('app.attendance_write', 'off', true);

  RETURN jsonb_build_object(
    'check_out', to_char(a.check_out_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI'),
    'hours', round((extract(epoch FROM (a.check_out_at - a.marked_at)) / 3600)::numeric, 2));
END $$;
REVOKE ALL ON FUNCTION public.check_out_attendance() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_out_attendance() TO authenticated;

-- ───────── 5. READ: MONTH, TEAM DAY, RANGE REPORT ─────────
CREATE OR REPLACE FUNCTION public.attendance_month(
  p_profile_id uuid DEFAULT NULL, p_month date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_first date := date_trunc('month', coalesce(p_month, (now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamp)::date;
  v_days jsonb;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = my_profile_id() OR manages(v_target)
          OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_target AND org_id = my_org()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT jsonb_agg(attendance_day_info(v_target, d::date) ORDER BY d)
    INTO v_days
    FROM generate_series(v_first::timestamp, (v_first + interval '1 month - 1 day')::timestamp, interval '1 day') d;

  RETURN jsonb_build_object('month', v_first, 'days', coalesce(v_days, '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.attendance_month(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attendance_month(uuid, date) TO authenticated;

-- Who is in scope for team views: HR/admin see everyone, a manager sees their line.
CREATE OR REPLACE FUNCTION public.attendance_team_day(p_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_date date := coalesce(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_hr boolean := my_role() = ANY (ARRAY['hr','admin']);
BEGIN
  IF NOT (v_hr OR my_role() = 'manager') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object('profile_id', p.id, 'full_name', p.full_name, 'department', p.department)
      || attendance_day_info(p.id, v_date)
      ORDER BY p.full_name)
      FROM profiles p
     WHERE p.org_id = my_org() AND p.status = 'active'
       AND (v_hr OR manages(p.id))), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.attendance_team_day(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attendance_team_day(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.attendance_range_report(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hr boolean := my_role() = ANY (ARRAY['hr','admin']);
BEGIN
  IF NOT (v_hr OR my_role() = 'manager') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Pick a valid date range.'; END IF;
  IF p_to - p_from > 92 THEN RAISE EXCEPTION 'Pick a range of at most 93 days.'; END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.full_name) FROM (
      SELECT p.id AS profile_id, p.full_name, p.department,
             count(*) FILTER (WHERE k.kind IN ('present','late','wfh','half_day','absent','leave')) AS working_days,
             count(*) FILTER (WHERE k.kind IN ('present','late')) AS present,
             count(*) FILTER (WHERE k.kind = 'late') AS late,
             count(*) FILTER (WHERE k.kind = 'wfh') AS wfh,
             count(*) FILTER (WHERE k.kind = 'half_day') AS half_day,
             count(*) FILTER (WHERE k.kind = 'leave') AS leave,
             count(*) FILTER (WHERE k.kind = 'absent') AS absent,
             count(*) FILTER (WHERE k.kind = 'holiday') AS holidays,
             count(*) FILTER (WHERE k.kind = 'weekly_off') AS weekly_offs
        FROM profiles p
        CROSS JOIN generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
        CROSS JOIN LATERAL (SELECT attendance_day_info(p.id, d::date)->>'kind' AS kind) k
       WHERE p.org_id = my_org() AND p.status = 'active' AND (v_hr OR manages(p.id))
       GROUP BY p.id, p.full_name, p.department
    ) t), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.attendance_range_report(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attendance_range_report(date, date) TO authenticated;

-- ───────── 6. HR CORRECTION ─────────
CREATE OR REPLACE FUNCTION public.attendance_correct(
  p_profile_id uuid, p_date date, p_action text,
  p_status text DEFAULT NULL, p_check_in text DEFAULT NULL, p_check_out text DEFAULT NULL,
  p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_target profiles%ROWTYPE;
  a attendance%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
  v_in timestamptz;
  v_out timestamptz;
  v_status text;
BEGIN
  IF NOT (my_role() = ANY (ARRAY['hr','admin'])) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_action NOT IN ('set', 'remove') THEN RAISE EXCEPTION 'Unknown action.'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Write a reason for the correction.'; END IF;
  IF p_date IS NULL OR p_date > v_today THEN RAISE EXCEPTION 'Pick a day that is not in the future.'; END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_profile_id AND org_id = my_org();
  IF NOT FOUND THEN RAISE EXCEPTION 'Warrior not found.'; END IF;

  SELECT * INTO a FROM attendance WHERE profile_id = p_profile_id AND date = p_date;
  IF FOUND THEN
    v_old := jsonb_build_object(
      'status', a.status,
      'check_in', to_char(a.marked_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI'),
      'check_out', CASE WHEN a.check_out_at IS NULL THEN NULL
                        ELSE to_char(a.check_out_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') END);
  END IF;

  PERFORM set_config('app.attendance_write', 'on', true);

  IF p_action = 'remove' THEN
    IF a.id IS NULL THEN RAISE EXCEPTION 'There is no attendance on that day.'; END IF;
    DELETE FROM attendance WHERE id = a.id;
    PERFORM set_config('app.attendance_write', 'off', true);
    v_new := NULL;
  ELSE
    v_status := coalesce(p_status, a.status, 'present');
    IF v_status NOT IN ('present', 'wfh', 'half_day') THEN RAISE EXCEPTION 'Unknown status.'; END IF;

    v_in := CASE WHEN p_check_in IS NOT NULL
                 THEN ((p_date::text || ' ' || p_check_in)::timestamp) AT TIME ZONE 'Asia/Kolkata'
                 WHEN a.id IS NOT NULL THEN a.marked_at
                 ELSE ((p_date::text || ' 10:00')::timestamp) AT TIME ZONE 'Asia/Kolkata' END;
    v_out := CASE WHEN p_check_out IS NOT NULL
                  THEN ((p_date::text || ' ' || p_check_out)::timestamp) AT TIME ZONE 'Asia/Kolkata'
                  WHEN a.id IS NOT NULL THEN a.check_out_at
                  ELSE NULL END;
    IF v_out IS NOT NULL AND v_out <= v_in THEN
      RAISE EXCEPTION 'Check-out must be after check-in.';
    END IF;

    IF a.id IS NULL THEN
      INSERT INTO attendance (profile_id, org_id, date, marked_at, status, check_out_at, focus)
      VALUES (p_profile_id, v_target.org_id, p_date, v_in, v_status, v_out, 'Added by HR');
    ELSE
      UPDATE attendance SET marked_at = v_in, status = v_status, check_out_at = v_out
       WHERE id = a.id;
    END IF;

    PERFORM set_config('app.attendance_write', 'off', true);
    SELECT * INTO a FROM attendance WHERE profile_id = p_profile_id AND date = p_date;
    v_new := jsonb_build_object(
      'status', a.status,
      'check_in', to_char(a.marked_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI'),
      'check_out', CASE WHEN a.check_out_at IS NULL THEN NULL
                        ELSE to_char(a.check_out_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') END);
  END IF;

  INSERT INTO attendance_corrections (org_id, profile_id, date, old_value, new_value, reason, corrected_by)
  VALUES (v_target.org_id, p_profile_id, p_date, v_old, v_new, btrim(p_reason), v_me);

  IF p_profile_id <> v_me THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (v_target.org_id, p_profile_id,
            format('Your attendance for %s was corrected', to_char(p_date, 'FMDD Mon')),
            btrim(p_reason), '/attendance');
  END IF;

  PERFORM el_run_credits(p_profile_id);
  RETURN attendance_day_info(p_profile_id, p_date);
END $$;
REVOKE ALL ON FUNCTION public.attendance_correct(uuid, date, text, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attendance_correct(uuid, date, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.attendance_corrections_for(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
BEGIN
  IF v_target IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF NOT (v_target = my_profile_id() OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', c.id, 'date', c.date, 'old_value', c.old_value, 'new_value', c.new_value,
             'reason', c.reason, 'corrected_by', c.corrected_by,
             'corrected_by_name', (SELECT full_name FROM profiles WHERE id = c.corrected_by),
             'created_at', c.created_at) ORDER BY c.created_at DESC)
      FROM (SELECT * FROM attendance_corrections
             WHERE profile_id = v_target AND org_id = my_org()
             ORDER BY created_at DESC LIMIT 100) c), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.attendance_corrections_for(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attendance_corrections_for(uuid) TO authenticated;

-- ───────── 7. EARNED LEAVE: MORE RULES ─────────
ALTER TABLE public.el_policy
  ADD COLUMN IF NOT EXISTS count_wfh boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS count_half_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS count_during_probation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS carry_forward_limit integer CHECK (carry_forward_limit BETWEEN 0 AND 365),
  ADD COLUMN IF NOT EXISTS year_start_month integer NOT NULL DEFAULT 1 CHECK (year_start_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS carry_forward_since date;

-- Anything above the limit lapses when a leave year starts. One row per person per year.
CREATE TABLE IF NOT EXISTS public.el_lapses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lapse_on date NOT NULL,
  carry_limit integer NOT NULL,
  balance_before integer NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT el_lapses_one_per_year UNIQUE (profile_id, lapse_on)
);
ALTER TABLE public.el_lapses ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.el_lapses TO service_role;

-- A new limit (or a new year start) only applies to leave years that start after today:
-- switching it on in October must not wipe last January's balance.
CREATE OR REPLACE FUNCTION public.el_policy_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := my_profile_id();
  IF NEW.carry_forward_limit IS DISTINCT FROM OLD.carry_forward_limit
     OR NEW.year_start_month IS DISTINCT FROM OLD.year_start_month THEN
    NEW.carry_forward_since := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;
  INSERT INTO el_policy_log (org_id, changed_by, old_policy, new_policy)
  VALUES (NEW.org_id, NEW.updated_by, to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.el_eligible_days(p_profile_id uuid, p_after date)
RETURNS SETOF date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT p.id, p.org_id, p.weekly_off, p.joined_on,
           coalesce(pol.exclude_weekly_off, true) AS ex_off,
           coalesce(pol.exclude_holidays, true) AS ex_hol,
           coalesce(pol.count_approved_leave, false) AS cnt_leave,
           coalesce(pol.count_wfh, true) AS cnt_wfh,
           coalesce(pol.count_half_day, false) AS cnt_half,
           coalesce(pol.count_during_probation, true) AS cnt_prob,
           pr.start_date AS pr_start,
           CASE WHEN pr.id IS NULL THEN NULL
                WHEN pr.status = 'confirmed' AND pr.decided_at IS NOT NULL
                  THEN least(pr.end_date, (pr.decided_at AT TIME ZONE 'Asia/Kolkata')::date)
                ELSE pr.end_date END AS pr_end
      FROM profiles p
      LEFT JOIN el_policy pol ON pol.org_id = p.org_id
      LEFT JOIN probations pr ON pr.profile_id = p.id
     WHERE p.id = p_profile_id
  ), days AS (
    SELECT a.date AS d
      FROM attendance a, me
     WHERE a.profile_id = p_profile_id
       AND (a.status = 'present'
            OR (a.status = 'wfh' AND me.cnt_wfh)
            OR (a.status = 'half_day' AND me.cnt_half))
    UNION
    SELECT g::date
      FROM me
      JOIN leave_requests l ON l.profile_id = me.id AND me.cnt_leave
       AND l.status = 'approved' AND l.type <> 'lwp' AND l.half_day = false
      CROSS JOIN LATERAL generate_series(l.from_date, l.to_date, interval '1 day') g
  )
  SELECT days.d
    FROM days, me
   WHERE days.d > p_after
     AND days.d <= (now() AT TIME ZONE 'Asia/Kolkata')::date
     AND (me.joined_on IS NULL OR days.d >= me.joined_on)
     AND NOT (NOT me.cnt_prob AND me.pr_start IS NOT NULL
              AND days.d >= me.pr_start AND days.d < me.pr_end)
     AND NOT (me.ex_off AND me.weekly_off IS NOT NULL AND trim(to_char(days.d, 'Day')) = me.weekly_off)
     AND NOT (me.ex_hol AND EXISTS (
           SELECT 1 FROM holidays h WHERE h.org_id = me.org_id AND h.date = days.d))
   ORDER BY days.d
$$;

CREATE OR REPLACE FUNCTION public.el_run_lapses(p_profile_id uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_org uuid; v_open integer; v_status text;
  v_pol el_policy%ROWTYPE;
  v_ys date; v_credits integer; v_lapsed integer; v_used numeric; v_net integer; v_amount integer;
BEGIN
  SELECT org_id, coalesce(opening_earned_leave, 0), status INTO v_org, v_open, v_status
    FROM profiles WHERE id = p_profile_id;
  IF v_org IS NULL OR v_status <> 'active' THEN RETURN 0; END IF;
  SELECT * INTO v_pol FROM el_policy WHERE org_id = v_org;
  IF NOT FOUND OR v_pol.carry_forward_limit IS NULL OR v_pol.carry_forward_since IS NULL THEN
    RETURN 0;
  END IF;

  -- the most recent leave-year start that is not in the future
  v_ys := make_date(extract(year FROM v_today)::int, v_pol.year_start_month, 1);
  IF v_ys > v_today THEN v_ys := (v_ys - interval '1 year')::date; END IF;
  IF v_ys <= v_pol.carry_forward_since THEN RETURN 0; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('el-lapse:' || p_profile_id::text));
  IF EXISTS (SELECT 1 FROM el_lapses WHERE profile_id = p_profile_id AND lapse_on = v_ys) THEN
    RETURN 0;
  END IF;

  -- balance as it stood the moment the leave year started
  SELECT coalesce(sum(credited), 0) INTO v_credits
    FROM el_ledger WHERE profile_id = p_profile_id AND period_end < v_ys;
  SELECT coalesce(sum(amount), 0) INTO v_lapsed
    FROM el_lapses WHERE profile_id = p_profile_id AND lapse_on < v_ys;
  SELECT coalesce(sum(days), 0) INTO v_used
    FROM leave_requests
   WHERE profile_id = p_profile_id AND type = 'earned' AND status = 'approved' AND from_date < v_ys;

  v_net := (v_open + v_credits - v_lapsed - v_used)::integer;
  IF v_net <= v_pol.carry_forward_limit THEN RETURN 0; END IF;
  v_amount := v_net - v_pol.carry_forward_limit;

  INSERT INTO el_lapses (org_id, profile_id, lapse_on, carry_limit, balance_before, amount, balance_after)
  VALUES (v_org, p_profile_id, v_ys, v_pol.carry_forward_limit, v_net, v_amount, v_pol.carry_forward_limit)
  ON CONFLICT (profile_id, lapse_on) DO NOTHING;

  IF FOUND THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (v_org, p_profile_id,
            format('%s earned leave day(s) lapsed', v_amount),
            format('Only %s day(s) carry into the new leave year. Your balance was %s.',
                   v_pol.carry_forward_limit, v_net),
            '/leave');
    RETURN 1;
  END IF;
  RETURN 0;
END $$;
REVOKE ALL ON FUNCTION public.el_run_lapses(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.el_run_lapses(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.el_run_credits(
  p_profile_id uuid, p_notify boolean DEFAULT true, p_source text DEFAULT 'system')
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid; v_open integer; v_status text;
  v_pol el_policy%ROWTYPE;
  v_after date; v_bal integer;
  v_dates date[]; v_blocks integer; v_k integer;
  v_start date; v_end date; v_credit integer; v_made integer := 0;
BEGIN
  SELECT org_id, opening_earned_leave, status INTO v_org, v_open, v_status
    FROM profiles WHERE id = p_profile_id;
  IF v_org IS NULL OR v_status <> 'active' THEN RETURN 0; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('el:' || p_profile_id::text));

  INSERT INTO el_policy (org_id) VALUES (v_org) ON CONFLICT DO NOTHING;
  SELECT * INTO v_pol FROM el_policy WHERE org_id = v_org;

  -- Counting resumes the day after the last credited period, so a policy change only
  -- affects days that haven't been credited yet; earlier credits stay as they were.
  SELECT coalesce(max(period_end), date '1900-01-01') INTO v_after
    FROM el_ledger WHERE profile_id = p_profile_id;
  SELECT coalesce(v_open, 0)
         + coalesce((SELECT sum(credited) FROM el_ledger WHERE profile_id = p_profile_id), 0)
         - coalesce((SELECT sum(amount) FROM el_lapses WHERE profile_id = p_profile_id), 0)
    INTO v_bal;

  SELECT array_agg(e ORDER BY e) INTO v_dates FROM public.el_eligible_days(p_profile_id, v_after) e;
  v_blocks := coalesce(array_length(v_dates, 1), 0) / v_pol.required_days;

  FOR v_k IN 1..v_blocks LOOP
    v_start := v_dates[(v_k - 1) * v_pol.required_days + 1];
    v_end := v_dates[v_k * v_pol.required_days];
    v_credit := least(v_pol.credit_amount, greatest(v_pol.max_balance - v_bal, 0));

    INSERT INTO el_ledger (org_id, profile_id, period_start, period_end, eligible_days,
                           amount, credited, previous_balance, new_balance, policy, source)
    VALUES (v_org, p_profile_id, v_start, v_end, v_pol.required_days,
            v_pol.credit_amount, v_credit, v_bal, v_bal + v_credit,
            to_jsonb(v_pol) - 'updated_at' - 'updated_by', p_source)
    ON CONFLICT (profile_id, period_end) DO NOTHING;

    IF FOUND THEN
      v_made := v_made + 1;
      v_bal := v_bal + v_credit;
      IF p_notify AND v_credit > 0 THEN
        INSERT INTO notifications (org_id, profile_id, title, body, link)
        VALUES (v_org, p_profile_id,
                format('+%s earned leave credited', v_credit),
                format('You completed %s working days. Your earned leave balance is now %s.',
                       v_pol.required_days, v_bal),
                '/leave');
      END IF;
    END IF;
  END LOOP;

  PERFORM el_run_lapses(p_profile_id);
  RETURN v_made;
END $$;

-- The ledger, as the viewer is allowed to see it: credits and yearly lapses together.
CREATE OR REPLACE FUNCTION public.el_ledger_for(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_hr boolean := my_role() = ANY (ARRAY['hr','admin']);
BEGIN
  IF v_target IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF NOT (v_target = my_profile_id() OR manages(v_target) OR v_hr) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x.j ORDER BY x.sort_on DESC, x.created_at DESC) FROM (
      SELECT l.period_end AS sort_on, l.created_at,
             jsonb_build_object(
               'id', l.id, 'kind', 'credit',
               'credited_on', (l.created_at AT TIME ZONE 'Asia/Kolkata')::date,
               'amount', l.amount, 'credited', l.credited,
               'previous_balance', l.previous_balance, 'new_balance', l.new_balance)
             || CASE WHEN v_hr THEN jsonb_build_object(
                  'period_start', l.period_start, 'period_end', l.period_end,
                  'eligible_days', l.eligible_days, 'policy', l.policy, 'source', l.source)
                ELSE '{}'::jsonb END AS j
        FROM el_ledger l WHERE l.profile_id = v_target
      UNION ALL
      SELECT z.lapse_on, z.created_at,
             jsonb_build_object(
               'id', z.id, 'kind', 'lapse', 'credited_on', z.lapse_on,
               'amount', z.amount, 'credited', -z.amount,
               'previous_balance', NULL, 'new_balance', NULL, 'carry_limit', z.carry_limit)
        FROM el_lapses z WHERE z.profile_id = v_target
    ) x), '[]'::jsonb);
END $$;

-- ───────── 8. SUMMARY: balance after lapses, plus today's check-out ─────────
CREATE OR REPLACE FUNCTION public.attendance_summary(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_opening int; v_days int; v_earned int; v_streak int := 0;
  v_marked boolean; v_comp int; v_last date;
  v_req int; v_after date; v_progress int;
  v_today_row attendance%ROWTYPE;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = v_me OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT opening_earned_leave INTO v_opening FROM profiles WHERE id = v_target;
  IF v_opening IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_days FROM attendance WHERE profile_id = v_target AND date <= v_today;

  SELECT v_opening + coalesce(sum(credited), 0), coalesce(max(period_end), date '1900-01-01')
    INTO v_earned, v_after FROM el_ledger WHERE profile_id = v_target;
  v_earned := v_earned - coalesce((SELECT sum(amount) FROM el_lapses WHERE profile_id = v_target), 0)::int;

  SELECT coalesce((SELECT required_days FROM el_policy pol JOIN profiles p ON p.org_id = pol.org_id
                    WHERE p.id = v_target), 20) INTO v_req;
  SELECT count(*) INTO v_progress FROM public.el_eligible_days(v_target, v_after);

  SELECT * INTO v_today_row FROM attendance WHERE profile_id = v_target AND date = v_today;
  v_marked := v_today_row.id IS NOT NULL;

  SELECT count(*) INTO v_comp
    FROM comp_off_credits WHERE profile_id = v_target AND consumed = false;

  SELECT max(date) INTO v_last FROM attendance WHERE profile_id = v_target AND date <= v_today;
  IF v_last = v_today THEN
    SELECT count(*) INTO v_streak FROM (
      SELECT date, row_number() OVER (ORDER BY date DESC) AS rn
        FROM attendance WHERE profile_id = v_target AND date <= v_today
    ) d WHERE d.date = v_today - ((d.rn - 1)::int);
  END IF;

  RETURN jsonb_build_object(
    'profile_id', v_target, 'today', v_today, 'marked_today', v_marked,
    'days_marked', v_days, 'opening_earned_leave', v_opening,
    'earned_available', v_earned,
    'to_next_leave', v_req - (v_progress % v_req),
    'el_required_days', v_req,
    'el_progress', v_progress % v_req,
    'streak', v_streak, 'comp_off_available', v_comp,
    'today_status', CASE WHEN v_marked THEN v_today_row.status ELSE NULL END,
    'checked_out', v_today_row.check_out_at IS NOT NULL,
    'check_out_at', v_today_row.check_out_at);
END $$;

-- Earned leave is a running balance, so what was taken in earlier years still counts
-- against it. (Casual / sick stay per calendar year.)
CREATE OR REPLACE FUNCTION public.leave_balances(p_profile_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_me uuid := my_profile_id();
  v_year int := extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int;
  v_earned int := 0;
  v_comp_total int := 0;
  v_comp_open int := 0;
  v_summary jsonb;
  v_settings jsonb;
  v_casual numeric;
  v_sick numeric;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_entitled numeric;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = v_me OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT o.settings INTO v_settings
    FROM organisations o JOIN profiles p ON p.org_id = o.id WHERE p.id = v_target;
  v_casual := quota_for(coalesce(v_settings,'{}'::jsonb), 'casual', v_year);
  v_sick := quota_for(coalesce(v_settings,'{}'::jsonb), 'sick', v_year);

  v_summary := attendance_summary(v_target);
  v_earned := coalesce((v_summary->>'earned_available')::int, 0);

  SELECT count(*), count(*) FILTER (WHERE consumed = false)
    INTO v_comp_total, v_comp_open
    FROM comp_off_credits WHERE profile_id = v_target;

  FOR r IN SELECT unnest(ARRAY['casual','sick','earned','comp_off']) AS t LOOP
    v_entitled := CASE r.t
      WHEN 'casual' THEN v_casual
      WHEN 'sick' THEN v_sick
      WHEN 'earned' THEN v_earned
      ELSE v_comp_total END;

    v_out := v_out || jsonb_build_object(
      'type', r.t,
      'entitled', v_entitled,
      'used', coalesce((SELECT sum(days) FROM leave_requests
                         WHERE profile_id = v_target AND type = r.t AND status = 'approved'
                           AND (r.t = 'earned' OR extract(year FROM from_date) = v_year)), 0),
      'pending', coalesce((SELECT sum(days) FROM leave_requests
                            WHERE profile_id = v_target AND type = r.t AND status = 'pending'
                              AND (r.t = 'earned' OR extract(year FROM from_date) = v_year)), 0),
      'balance', 0
    );
  END LOOP;

  SELECT jsonb_agg(
    e || jsonb_build_object('balance', GREATEST(
      CASE WHEN e->>'type' = 'comp_off'
           THEN v_comp_open - (e->>'pending')::numeric
           ELSE (e->>'entitled')::numeric - (e->>'used')::numeric - (e->>'pending')::numeric
      END, 0))
  ) INTO v_out FROM jsonb_array_elements(v_out) e;

  RETURN v_out;
END $function$;
