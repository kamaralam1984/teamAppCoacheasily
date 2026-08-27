CREATE OR REPLACE FUNCTION public.mark_attendance(p_focus text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id();
  v_org uuid;
  v_row attendance%ROWTYPE;
  v_reason text;
  v_summary jsonb;
  v_days int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = v_me;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;

  INSERT INTO attendance (profile_id, org_id, focus)
  VALUES (v_me, v_org, nullif(btrim(coalesce(p_focus, '')), ''))
  RETURNING * INTO v_row;

  SELECT reason INTO v_reason
    FROM comp_off_credits
   WHERE profile_id = v_me AND earned_on = v_row.date
   LIMIT 1;

  v_summary := attendance_summary(v_me);
  v_days := coalesce((v_summary->>'days_marked')::int, 0);

  RETURN jsonb_build_object(
    'date', v_row.date,
    'at', to_char(v_row.marked_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI'),
    'onTime', coalesce(v_row.on_time, true),
    'compOffReason', v_reason,
    'daysMarked', v_days,
    'milestone', (v_days > 0 AND v_days % 20 = 0),
    'summary', v_summary
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_attendance(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_attendance(text) TO authenticated;