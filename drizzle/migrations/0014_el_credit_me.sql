-- ═══ A CREDIT THAT IS DUE SHOULD NOT WAIT FOR THE NIGHT ═══
-- Earned leave is credited by a job every night and whenever someone marks attendance. If more days
-- have counted than the target (for example after the rules change, or after a recount), a credit
-- is due but the meter showed only the days left over ("19 more"). Now:
--   * attendance_summary says how many credits are already due (el_due);
--   * el_credit_me() lets a signed-in person bring their own account up to date, so the Leave page
--     can do it the moment it opens.

CREATE OR REPLACE FUNCTION public.attendance_summary(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_opening int; v_days int; v_earned int; v_streak int := 0;
  v_marked boolean; v_comp int; v_last date;
  v_req int; v_after date; v_progress int; v_total int; v_mode text; v_joined date; v_due int;
  v_today_row attendance%ROWTYPE;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = v_me OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT opening_earned_leave, joined_on INTO v_opening, v_joined FROM profiles WHERE id = v_target;
  IF v_opening IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_days FROM attendance WHERE profile_id = v_target AND date <= v_today;

  SELECT v_opening + coalesce(sum(credited), 0), coalesce(max(period_end), date '1900-01-01')
    INTO v_earned, v_after FROM el_ledger WHERE profile_id = v_target;
  v_earned := v_earned - coalesce((SELECT sum(amount) FROM el_lapses WHERE profile_id = v_target), 0)::int;

  SELECT coalesce((SELECT required_days FROM el_policy pol JOIN profiles p ON p.org_id = pol.org_id
                    WHERE p.id = v_target), 20) INTO v_req;
  SELECT coalesce((SELECT count_from FROM el_policy pol JOIN profiles p ON p.org_id = pol.org_id
                    WHERE p.id = v_target), 'punches') INTO v_mode;
  SELECT count(*) INTO v_progress FROM public.el_eligible_days(v_target, v_after);
  SELECT count(*) INTO v_total FROM public.el_eligible_days(v_target, date '1900-01-01');
  v_due := v_progress / v_req;

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
    'el_days_total', v_total,
    -- credits already earned by the days counted but not yet written to the ledger
    'el_due', v_due,
    'count_from', v_mode,
    'joined_on', v_joined,
    'streak', v_streak, 'comp_off_available', v_comp,
    'today_status', CASE WHEN v_marked THEN v_today_row.status ELSE NULL END,
    'checked_out', v_today_row.check_out_at IS NOT NULL,
    'check_out_at', v_today_row.check_out_at);
END $$;

CREATE OR REPLACE FUNCTION public.el_credit_me() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
BEGIN
  IF v_me IS NULL THEN RETURN 0; END IF;
  RETURN el_run_credits(v_me);
END $$;
REVOKE ALL ON FUNCTION public.el_credit_me() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.el_credit_me() TO authenticated;
