-- ═══ DIWALI 2026 (SUNDAY 8 NOVEMBER) AS A PUBLIC HOLIDAY ═══
-- A day off for everyone, like the other fixed holidays (kind 'company', approved). If Diwali is
-- already on the 2026 calendar for that date in any form (for example as a flexi holiday), it is
-- turned into the day off instead of being added twice. The calendar trigger writes the day off.
DO $$
DECLARE
  v_org uuid;
  v_n int;
BEGIN
  FOR v_org IN SELECT id FROM organisations WHERE name = 'CoachEasily' LOOP
    UPDATE holiday_calendar
       SET kind = 'company', status = 'approved'
     WHERE org_id = v_org AND date = DATE '2026-11-08' AND name ILIKE 'diwali%'
       AND (kind NOT IN ('national', 'regional', 'company') OR status <> 'approved');
    GET DIAGNOSTICS v_n = ROW_COUNT;

    IF NOT EXISTS (SELECT 1 FROM holiday_calendar
                    WHERE org_id = v_org AND date = DATE '2026-11-08' AND name ILIKE 'diwali%') THEN
      INSERT INTO holiday_calendar (org_id, date, name, kind, status, source)
      VALUES (v_org, DATE '2026-11-08', 'Diwali', 'company', 'approved', 'manual');
      RAISE NOTICE 'diwali 2026: added';
    ELSIF v_n > 0 THEN
      RAISE NOTICE 'diwali 2026: made a day off';
    ELSE
      RAISE NOTICE 'diwali 2026: already a day off';
    END IF;

    -- the day off itself must now exist; otherwise another holiday holds that date
    IF NOT EXISTS (SELECT 1 FROM holidays WHERE org_id = v_org AND date = DATE '2026-11-08') THEN
      RAISE EXCEPTION 'diwali 2026: 8 Nov is not a day off after the change';
    END IF;
  END LOOP;
END $$;
