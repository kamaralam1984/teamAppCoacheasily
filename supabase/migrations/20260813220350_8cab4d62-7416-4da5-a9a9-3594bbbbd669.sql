CREATE OR REPLACE FUNCTION public.leave_check(
  p_type text, p_from date, p_to date, p_half boolean DEFAULT false,
  p_profile_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_days numeric;
  v_errors text[] := '{}';
  v_warnings text[] := '{}';
  v_balances jsonb;
  v_bal numeric;
  v_quarter int;
  v_qcount numeric;
  v_notice int;
  v_msg text;
  v_summary jsonb;
  v_cap numeric;
BEGIN
  IF v_target IS NULL THEN RETURN jsonb_build_object('errors','[]'::jsonb,'warnings','[]'::jsonb,'days',0); END IF;
  IF NOT (v_target = my_profile_id() OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_to < p_from THEN
    v_errors := v_errors || 'The last day cannot be before the first day.';
    RETURN jsonb_build_object('errors', to_jsonb(v_errors), 'warnings', to_jsonb(v_warnings), 'days', 0);
  END IF;

  v_days := CASE WHEN p_half THEN 0.5 ELSE (p_to - p_from) + 1 END;
  v_balances := leave_balances(v_target);
  v_notice := p_from - (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT (e->>'balance')::numeric INTO v_bal
    FROM jsonb_array_elements(v_balances) e WHERE e->>'type' = p_type;

  IF p_type = 'casual' THEN
    SELECT coalesce((o.settings->>'casual_quarter_cap')::numeric, 2) INTO v_cap
      FROM organisations o JOIN profiles p ON p.org_id = o.id WHERE p.id = v_target;
    v_quarter := extract(quarter FROM p_from)::int;
    SELECT coalesce(sum(days), 0) INTO v_qcount FROM leave_requests
      WHERE profile_id = v_target AND type = 'casual' AND status IN ('pending','approved')
        AND extract(year FROM from_date) = extract(year FROM p_from)
        AND extract(quarter FROM from_date) = v_quarter;
    IF v_qcount + v_days > coalesce(v_cap, 2) THEN
      v_errors := v_errors || format(
        'Casual leave is capped at %s per quarter. You already have %s in Q%s.',
        coalesce(v_cap, 2), v_qcount, v_quarter);
    END IF;
    IF v_notice < 7 THEN
      v_warnings := v_warnings || 'This is less than 7 days'' notice — please give your team a heads-up.';
    END IF;
  END IF;

  IF p_type = 'earned' THEN
    v_summary := attendance_summary(v_target);
    IF coalesce(v_bal, 0) <= 0 THEN
      v_errors := v_errors || format(
        'You have no earned leave yet — 1 is earned for every 20 days worked. You are at %s day(s) in the app.',
        coalesce((v_summary->>'days_marked')::int, 0));
    END IF;
    IF v_notice < 30 THEN
      v_warnings := v_warnings || 'Earned leave usually needs 30 days'' notice so cover can be planned.';
    END IF;
  END IF;

  IF p_type IN ('casual','sick','earned','comp_off') AND coalesce(v_bal, 0) > 0 AND v_days > v_bal THEN
    v_warnings := v_warnings || format(
      'This is more than your balance of %s day(s) — the extra will be unpaid.', v_bal);
  END IF;

  IF p_type IN ('casual','sick','earned','comp_off') AND coalesce(v_bal, 0) <= 0 AND p_type <> 'earned' THEN
    v_errors := v_errors || format('You have no %s leave left this year.', replace(p_type, '_', '-'));
  END IF;

  v_msg := leave_sandwich_conflict(v_target, p_from, p_to, NULL);
  IF v_msg IS NOT NULL THEN
    v_errors := v_errors || v_msg;
  END IF;

  RETURN jsonb_build_object(
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'days', v_days);
END $$;