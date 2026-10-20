-- ═══ WORKING ON A WEEKLY OFF ═══
-- Every person has one weekly off, and it is not the same day for everybody (one has Monday, another
-- Sunday, and so on). If someone marks attendance on their own weekly off:
--   * they must say why: the reason is saved with the day and shown to managers and HR, and the
--     manager is told;
--   * the day counts as a working day towards earned leave (policy: count_weekly_off_work, on by
--     default). A weekly off nobody worked is still not a working day.
--   * a holiday that was worked can be counted too (count_holiday_work, off by default).
-- The recount (preview, then apply) now works for either way of counting, so HR can catch up the
-- days that were left out before.

-- ───────── 1. THE POLICY AND THE REASON ─────────
ALTER TABLE public.el_policy
  ADD COLUMN IF NOT EXISTS count_weekly_off_work boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS count_holiday_work boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS off_day_reason text;

-- people may still edit their focus line today; the reason is locked like the other columns
CREATE OR REPLACE FUNCTION public.attendance_focus_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  NEW.off_day_reason := OLD.off_day_reason;
  RETURN NEW;
END
$function$;

-- ───────── 2. WHAT THE CALENDAR SAYS ABOUT SUCH A DAY ─────────
CREATE OR REPLACE FUNCTION public.attendance_day_info(p_profile_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_note := CASE WHEN a.off_day_reason IS NOT NULL
                   THEN 'Worked on a weekly off: ' || a.off_day_reason END;
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
    'note', v_note,
    'weekly_off_work', (a.id IS NOT NULL AND p.weekly_off IS NOT NULL
                        AND trim(to_char(p_date, 'Day')) = p.weekly_off));
END $function$;

-- ───────── 3. MARKING ATTENDANCE ASKS WHY ─────────
DROP FUNCTION IF EXISTS public.mark_attendance(text, text);
CREATE OR REPLACE FUNCTION public.mark_attendance(
  p_focus text DEFAULT NULL, p_status text DEFAULT 'present', p_off_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_org uuid;
  v_weekly_off text;
  v_manager uuid;
  v_name text;
  v_row attendance%ROWTYPE;
  v_reason text;
  v_summary jsonb;
  v_days int;
  v_credited int;
  v_off_reason text := nullif(btrim(coalesce(p_off_reason, '')), '');
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;
  IF p_status NOT IN ('present', 'wfh', 'half_day') THEN
    RAISE EXCEPTION 'Choose office, work from home or half day.';
  END IF;
  SELECT org_id, weekly_off, manager_id, full_name INTO v_org, v_weekly_off, v_manager, v_name
    FROM profiles WHERE id = v_me;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;

  -- Everybody has one weekly off, and it is not always the same day. Working on it is allowed,
  -- and the day counts, but the person has to say why.
  IF v_weekly_off IS NOT NULL AND trim(to_char(v_today, 'Day')) = v_weekly_off THEN
    IF v_off_reason IS NULL OR length(v_off_reason) < 3 THEN
      RAISE EXCEPTION 'Today is your weekly off (%). Tell us why you are working today.', v_weekly_off;
    END IF;
  ELSE
    v_off_reason := NULL;
  END IF;

  INSERT INTO attendance (profile_id, org_id, focus, status, off_day_reason)
  VALUES (v_me, v_org, nullif(btrim(coalesce(p_focus, '')), ''), p_status, left(v_off_reason, 200))
  RETURNING * INTO v_row;

  -- the manager hears why (the comp-off notice already tells them when comp-off is switched on)
  IF v_off_reason IS NOT NULL AND v_manager IS NOT NULL
     AND coalesce((SELECT (settings->>'comp_off_enabled')::boolean FROM organisations WHERE id = v_org), false) IS NOT TRUE THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (v_org, v_manager, v_name || ' is working on their weekly off (' || v_weekly_off || ')',
            'Reason: ' || left(v_off_reason, 200), '/attendance');
  END IF;

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
REVOKE ALL ON FUNCTION public.mark_attendance(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_attendance(text, text, text) TO authenticated;

-- HR adding a day on someone's weekly off gives the reason for it too
CREATE OR REPLACE FUNCTION public.attendance_correct(p_profile_id uuid, p_date date, p_action text, p_status text DEFAULT NULL::text, p_check_in text DEFAULT NULL::text, p_check_out text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_off boolean;
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

    -- a day added or kept on someone's weekly off carries the reason HR gave
    v_off := v_target.weekly_off IS NOT NULL AND trim(to_char(p_date, 'Day')) = v_target.weekly_off;
    IF a.id IS NULL THEN
      INSERT INTO attendance (profile_id, org_id, date, marked_at, status, check_out_at, focus, off_day_reason)
      VALUES (p_profile_id, v_target.org_id, p_date, v_in, v_status, v_out, 'Added by HR',
              CASE WHEN v_off THEN btrim(p_reason) END);
    ELSE
      UPDATE attendance SET marked_at = v_in, status = v_status, check_out_at = v_out,
             off_day_reason = coalesce(off_day_reason, CASE WHEN v_off THEN btrim(p_reason) END)
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
END $function$;

-- ───────── 4. WHICH DAYS COUNT ─────────
-- Counting attendance: a worked weekly off counts (unless the policy says otherwise); a worked
-- holiday counts only if the policy says so. Leave days on a weekly off or holiday never count.
CREATE OR REPLACE FUNCTION public.el_days_punches(p_profile_id uuid, p_after date)
RETURNS SETOF date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT p.id, p.org_id, p.weekly_off, p.joined_on,
           coalesce(pol.exclude_weekly_off, true) AS ex_off,
           coalesce(pol.exclude_holidays, true) AS ex_hol,
           coalesce(pol.count_approved_leave, false) AS cnt_leave,
           coalesce(pol.count_wfh, true) AS cnt_wfh,
           coalesce(pol.count_half_day, false) AS cnt_half,
           coalesce(pol.count_during_probation, true) AS cnt_prob,
           coalesce(pol.count_weekly_off_work, true) AS cnt_off_work,
           coalesce(pol.count_holiday_work, false) AS cnt_hol_work,
           pr.start_date AS pr_start,
           CASE WHEN pr.id IS NULL THEN NULL
                WHEN pr.status = 'confirmed' AND pr.decided_at IS NOT NULL
                  THEN least(pr.end_date, (pr.decided_at AT TIME ZONE 'Asia/Kolkata')::date)
                ELSE pr.end_date END AS pr_end
      FROM profiles p
      LEFT JOIN el_policy pol ON pol.org_id = p.org_id
      LEFT JOIN probations pr ON pr.profile_id = p.id
     WHERE p.id = p_profile_id
  ), raw AS (
    SELECT a.date AS d, true AS worked
      FROM attendance a, me
     WHERE a.profile_id = p_profile_id
       AND (a.status = 'present'
            OR (a.status = 'wfh' AND me.cnt_wfh)
            OR (a.status = 'half_day' AND me.cnt_half))
    UNION ALL
    SELECT g::date, false
      FROM me
      JOIN leave_requests l ON l.profile_id = me.id AND me.cnt_leave
       AND l.status = 'approved' AND l.type <> 'lwp' AND l.half_day = false
      CROSS JOIN LATERAL generate_series(l.from_date, l.to_date, interval '1 day') g
  ), days AS (
    SELECT d, bool_or(worked) AS worked FROM raw GROUP BY d
  )
  SELECT days.d
    FROM days, me
   WHERE days.d > p_after
     AND days.d <= (now() AT TIME ZONE 'Asia/Kolkata')::date
     AND (me.joined_on IS NULL OR days.d >= me.joined_on)
     AND NOT (NOT me.cnt_prob AND me.pr_start IS NOT NULL
              AND days.d >= me.pr_start AND days.d < me.pr_end)
     AND NOT (me.ex_off AND me.weekly_off IS NOT NULL AND trim(to_char(days.d, 'Day')) = me.weekly_off
              AND NOT (days.worked AND me.cnt_off_work))
     AND NOT (me.ex_hol AND EXISTS (
           SELECT 1 FROM holidays h WHERE h.org_id = me.org_id AND h.date = days.d)
              AND NOT (days.worked AND me.cnt_hol_work))
   ORDER BY days.d
$$;

-- Counting from the joining date: a weekly off or holiday counts only when the person worked it.
CREATE OR REPLACE FUNCTION public.el_days_joining(p_profile_id uuid, p_after date)
RETURNS SETOF date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT p.id, p.org_id, p.weekly_off, p.joined_on,
           coalesce(pol.exclude_weekly_off, true) AS ex_off,
           coalesce(pol.exclude_holidays, true) AS ex_hol,
           coalesce(pol.count_approved_leave, false) AS cnt_leave,
           coalesce(pol.count_wfh, true) AS cnt_wfh,
           coalesce(pol.count_half_day, false) AS cnt_half,
           coalesce(pol.count_during_probation, true) AS cnt_prob,
           coalesce(pol.count_weekly_off_work, true) AS cnt_off_work,
           coalesce(pol.count_holiday_work, false) AS cnt_hol_work,
           pr.start_date AS pr_start,
           CASE WHEN pr.id IS NULL THEN NULL
                WHEN pr.status = 'confirmed' AND pr.decided_at IS NOT NULL
                  THEN least(pr.end_date, (pr.decided_at AT TIME ZONE 'Asia/Kolkata')::date)
                ELSE pr.end_date END AS pr_end
      FROM profiles p
      LEFT JOIN el_policy pol ON pol.org_id = p.org_id
      LEFT JOIN probations pr ON pr.profile_id = p.id
     WHERE p.id = p_profile_id AND p.joined_on IS NOT NULL
  ), worked AS (
    SELECT a.date AS d
      FROM attendance a, me
     WHERE a.profile_id = me.id
       AND (a.status = 'present'
            OR (a.status = 'wfh' AND me.cnt_wfh)
            OR (a.status = 'half_day' AND me.cnt_half))
  ), days AS (
    SELECT g::date AS d
      FROM me,
           generate_series(greatest(me.joined_on, p_after + 1)::timestamp,
                           ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1)::timestamp, interval '1 day') g
  )
  SELECT days.d
    FROM days, me
   WHERE NOT (me.ex_off AND me.weekly_off IS NOT NULL AND trim(to_char(days.d, 'Day')) = me.weekly_off
              AND NOT (me.cnt_off_work AND days.d IN (SELECT d FROM worked)))
     AND NOT (me.ex_hol AND EXISTS (
           SELECT 1 FROM holidays h WHERE h.org_id = me.org_id AND h.date = days.d)
              AND NOT (me.cnt_hol_work AND days.d IN (SELECT d FROM worked)))
     AND NOT (NOT me.cnt_prob AND me.pr_start IS NOT NULL AND days.d >= me.pr_start AND days.d < me.pr_end)
     AND NOT EXISTS (
           SELECT 1 FROM leave_requests l
            WHERE l.profile_id = me.id AND l.status = 'approved'
              AND days.d BETWEEN l.from_date AND l.to_date
              AND (l.type = 'lwp' OR NOT me.cnt_leave OR (l.half_day AND NOT me.cnt_half)))
   ORDER BY days.d
$$;

-- ───────── 5. THE RECOUNT, FOR EITHER WAY OF COUNTING ─────────
DROP FUNCTION IF EXISTS public.el_plan_credits(uuid);
CREATE OR REPLACE FUNCTION public.el_plan_credits(p_profile_id uuid, p_mode text DEFAULT 'joining_date')
RETURNS TABLE (k integer, period_start date, period_end date, credited integer,
               previous_balance integer, new_balance integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_pol el_policy%ROWTYPE;
  v_dates date[];
  v_bal integer;
  v_blocks integer;
  i integer;
  v_credit integer;
BEGIN
  SELECT org_id, coalesce(opening_earned_leave, 0) INTO v_org, v_bal FROM profiles WHERE id = p_profile_id;
  IF v_org IS NULL THEN RETURN; END IF;
  SELECT * INTO v_pol FROM el_policy WHERE org_id = v_org;
  IF NOT FOUND THEN v_pol.required_days := 20; v_pol.credit_amount := 1; v_pol.max_balance := 30; END IF;

  v_bal := v_bal - coalesce((SELECT sum(amount) FROM el_lapses WHERE profile_id = p_profile_id), 0)::integer;
  IF p_mode = 'punches' THEN
    SELECT array_agg(d ORDER BY d) INTO v_dates FROM el_days_punches(p_profile_id, date '1900-01-01') d;
  ELSE
    SELECT array_agg(d ORDER BY d) INTO v_dates FROM el_days_joining(p_profile_id, date '1900-01-01') d;
  END IF;
  v_blocks := coalesce(array_length(v_dates, 1), 0) / v_pol.required_days;

  FOR i IN 1..v_blocks LOOP
    v_credit := least(v_pol.credit_amount, greatest(v_pol.max_balance - v_bal, 0));
    k := i;
    period_start := v_dates[(i - 1) * v_pol.required_days + 1];
    period_end := v_dates[i * v_pol.required_days];
    credited := v_credit;
    previous_balance := v_bal;
    new_balance := v_bal + v_credit;
    v_bal := v_bal + v_credit;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.el_plan_credits(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.el_plan_credits(uuid, text) TO service_role;

DROP FUNCTION IF EXISTS public.el_rebuild_preview();
CREATE OR REPLACE FUNCTION public.el_rebuild_preview(p_mode text DEFAULT 'joining_date') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_rows jsonb;
  v_mode text;
BEGIN
  IF NOT (my_role() = ANY (ARRAY['hr', 'admin'])) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_mode NOT IN ('punches', 'joining_date') THEN RAISE EXCEPTION 'Unknown way of counting.'; END IF;
  SELECT coalesce(count_from, 'punches') INTO v_mode FROM el_policy WHERE org_id = my_org();

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY abs(x.change) DESC, x.full_name), '[]'::jsonb) INTO v_rows FROM (
    SELECT b.profile_id, b.full_name, b.joined_on, b.first_punch, b.opening, b.working_days,
           b.credits_now, b.credits_new, b.lapsed, b.used,
           b.opening + b.credits_now - b.lapsed AS balance_now,
           b.opening + b.credits_new - b.lapsed AS balance_new,
           b.opening + b.credits_now - b.lapsed - b.used AS available_now,
           b.opening + b.credits_new - b.lapsed - b.used AS available_new,
           b.credits_new - b.credits_now AS change,
           CASE WHEN p_mode = 'joining_date' AND b.joined_on IS NULL
                  THEN 'No joining date: until one is set, this person is still counted by attendance'
                WHEN p_mode = 'joining_date' AND b.opening > 0
                     AND b.joined_on < coalesce(b.first_punch, v_today) - 30
                  THEN 'Has an opening balance and joined well before the first attendance: the opening may already include days that are now counted'
                ELSE NULL END AS note
      FROM (
        SELECT p.id AS profile_id, p.full_name, p.joined_on,
               (SELECT min(a.date) FROM attendance a WHERE a.profile_id = p.id) AS first_punch,
               coalesce(p.opening_earned_leave, 0)::integer AS opening,
               (CASE WHEN p_mode = 'punches'
                     THEN (SELECT count(*) FROM el_days_punches(p.id, date '1900-01-01'))
                     ELSE (SELECT count(*) FROM el_days_joining(p.id, date '1900-01-01')) END)::integer AS working_days,
               coalesce((SELECT sum(l.credited) FROM el_ledger l WHERE l.profile_id = p.id), 0)::integer AS credits_now,
               coalesce((SELECT sum(c.credited) FROM el_plan_credits(p.id, p_mode) c), 0)::integer AS credits_new,
               coalesce((SELECT sum(z.amount) FROM el_lapses z WHERE z.profile_id = p.id), 0)::integer AS lapsed,
               coalesce((SELECT sum(r.days) FROM leave_requests r
                          WHERE r.profile_id = p.id AND r.type = 'earned' AND r.status = 'approved'), 0)::numeric AS used
          FROM profiles p
         WHERE p.org_id = my_org() AND p.status = 'active'
      ) b
  ) x;

  RETURN jsonb_build_object('mode_now', v_mode, 'mode_preview', p_mode, 'today', v_today, 'people', v_rows);
END $$;
REVOKE ALL ON FUNCTION public.el_rebuild_preview(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.el_rebuild_preview(text) TO authenticated;

DROP FUNCTION IF EXISTS public.el_rebuild_apply(text);
CREATE OR REPLACE FUNCTION public.el_rebuild_apply(p_confirm text DEFAULT NULL, p_mode text DEFAULT 'joining_date')
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := my_org();
  v_pol el_policy%ROWTYPE;
  p record;
  v_old_credits integer;
  v_old_balance integer;
  v_new_credits integer;
  v_new_balance integer;
  v_open integer;
  v_lapsed integer;
  v_same boolean;
  v_changed integer := 0;
  v_how text;
BEGIN
  IF NOT (my_role() = ANY (ARRAY['hr', 'admin'])) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_confirm IS DISTINCT FROM 'REBUILD' THEN
    RAISE EXCEPTION 'Type REBUILD to confirm.';
  END IF;
  IF p_mode NOT IN ('punches', 'joining_date') THEN RAISE EXCEPTION 'Unknown way of counting.'; END IF;
  v_how := CASE WHEN p_mode = 'punches' THEN 'attendance' ELSE 'the joining date' END;

  PERFORM set_config('app.skip_audit', 'on', true);
  PERFORM set_config('app.el_rebuild', 'on', true);
  INSERT INTO el_policy (org_id) VALUES (v_org) ON CONFLICT DO NOTHING;
  UPDATE el_policy SET count_from = p_mode WHERE org_id = v_org;
  PERFORM set_config('app.el_rebuild', 'off', true);
  SELECT * INTO v_pol FROM el_policy WHERE org_id = v_org;

  FOR p IN SELECT id, full_name, joined_on, coalesce(opening_earned_leave, 0) AS opening
             FROM profiles
            WHERE org_id = v_org AND status = 'active'
              AND (p_mode = 'punches' OR joined_on IS NOT NULL)
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('el:' || p.id::text));

    SELECT coalesce(sum(credited), 0) INTO v_old_credits FROM el_ledger WHERE profile_id = p.id;
    SELECT coalesce(sum(amount), 0) INTO v_lapsed FROM el_lapses WHERE profile_id = p.id;
    v_open := p.opening;
    v_old_balance := v_open + v_old_credits - v_lapsed;

    -- already exactly what the recount would write (same periods, same credits)? then leave it alone
    SELECT coalesce((SELECT jsonb_agg(jsonb_build_array(l.period_end, l.credited) ORDER BY l.period_end)
                       FROM el_ledger l WHERE l.profile_id = p.id), '[]'::jsonb)
         = coalesce((SELECT jsonb_agg(jsonb_build_array(c.period_end, c.credited) ORDER BY c.period_end)
                       FROM el_plan_credits(p.id, p_mode) c), '[]'::jsonb)
      INTO v_same;
    IF v_same THEN CONTINUE; END IF;

    INSERT INTO el_ledger_archive
      SELECT l.*, now(), 'recounted from ' || v_how FROM el_ledger l WHERE l.profile_id = p.id;
    DELETE FROM el_ledger WHERE profile_id = p.id;

    INSERT INTO el_ledger (org_id, profile_id, period_start, period_end, eligible_days, amount, credited,
                           previous_balance, new_balance, policy, source)
    SELECT v_org, p.id, c.period_start, c.period_end, v_pol.required_days, v_pol.credit_amount, c.credited,
           c.previous_balance, c.new_balance, to_jsonb(v_pol) - 'updated_at' - 'updated_by', 'rebuild'
      FROM el_plan_credits(p.id, p_mode) c;

    SELECT coalesce(sum(credited), 0) INTO v_new_credits FROM el_ledger WHERE profile_id = p.id;
    v_new_balance := v_open + v_new_credits - v_lapsed;

    PERFORM audit_write(v_org, 'leave', 'el.rebuild', p.id, p.id,
      format('%s recounted %s''s earned leave from %s: credits %s → %s, balance %s → %s',
             audit_actor(), p.full_name, v_how, v_old_credits, v_new_credits, v_old_balance, v_new_balance),
      jsonb_build_object('credits', v_old_credits, 'balance', v_old_balance),
      jsonb_build_object('credits', v_new_credits, 'balance', v_new_balance, 'count_from', p_mode));

    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (v_org, p.id, 'Your earned leave was recalculated',
            format('It was counted again from %s. Earned so far: %s day(s) (it was %s). The Leave page shows every line.',
                   v_how, v_new_credits + v_open, v_old_credits + v_open),
            '/leave');
    v_changed := v_changed + 1;
  END LOOP;

  PERFORM set_config('app.skip_audit', 'off', true);

  -- anyone who is now due a credit at the normal rate (should be none)
  FOR p IN SELECT id FROM profiles WHERE org_id = v_org AND status = 'active' LOOP
    PERFORM el_run_credits(p.id, false, 'rebuild');
  END LOOP;
  RETURN v_changed;
END $$;
REVOKE ALL ON FUNCTION public.el_rebuild_apply(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.el_rebuild_apply(text, text) TO authenticated;
