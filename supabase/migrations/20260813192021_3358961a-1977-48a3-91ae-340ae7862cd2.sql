CREATE OR REPLACE FUNCTION public.attendance_summary(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_opening int;
  v_days int;
  v_earned int;
  v_streak int := 0;
  v_marked boolean;
  v_comp int;
  v_last date;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = v_me OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT opening_earned_leave INTO v_opening FROM profiles WHERE id = v_target;
  IF v_opening IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_days FROM attendance WHERE profile_id = v_target AND date <= v_today;
  v_earned := least(v_opening + (v_days / 20), 30);

  SELECT EXISTS (SELECT 1 FROM attendance WHERE profile_id = v_target AND date = v_today)
    INTO v_marked;

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
    'profile_id', v_target,
    'today', v_today,
    'marked_today', v_marked,
    'days_marked', v_days,
    'opening_earned_leave', v_opening,
    'earned_available', v_earned,
    'to_next_leave', 20 - (v_days % 20),
    'streak', v_streak,
    'comp_off_available', v_comp
  );
END;
$$;