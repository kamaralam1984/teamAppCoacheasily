-- remove the row created while testing the Mark attendance button
DELETE FROM public.attendance a
USING public.profiles p
WHERE a.profile_id = p.id AND p.full_name = 'Purushottam Hambarde';

-- self-check: Saturday 15 Aug 2026 is both Independence Day and Saurabh's weekly off
DO $$
DECLARE
  v_p uuid; v_org uuid; v_count int; v_reason text;
BEGIN
  SELECT id, org_id INTO v_p, v_org FROM profiles WHERE full_name = 'Saurabh Kumar';
  IF v_p IS NULL THEN RAISE EXCEPTION 'test profile missing'; END IF;

  INSERT INTO attendance (org_id, profile_id, date) VALUES (v_org, v_p, DATE '2026-08-15');

  SELECT count(*), max(reason) INTO v_count, v_reason
    FROM comp_off_credits WHERE profile_id = v_p AND earned_on = DATE '2026-08-15';

  IF v_count <> 1 THEN RAISE EXCEPTION 'expected exactly 1 comp-off, got %', v_count; END IF;
  IF v_reason NOT LIKE 'Independence Day%' THEN RAISE EXCEPTION 'reason wrong: %', v_reason; END IF;
  RAISE NOTICE 'comp-off check passed: %', v_reason;

  DELETE FROM notifications
   WHERE title LIKE 'Saurabh Kumar worked on Independence Day%';
  DELETE FROM comp_off_credits WHERE profile_id = v_p AND earned_on = DATE '2026-08-15';
  DELETE FROM attendance WHERE profile_id = v_p AND date = DATE '2026-08-15';
END $$;