-- ═══ PROBATION: 90 DAYS, REMINDERS AT 15 / 10 / 5 / 2 DAYS AND ON THE LAST DAY ═══
-- Probation is 90 days from joining (it was 3 calendar months). HR, admin and the person's
-- manager are notified 15, 10, 5 and 2 days before it ends, on the day it ends, and once more
-- if it has ended with no decision. Each reminder goes once per end date, so an extension
-- starts a fresh set. The app also shows HR and admin a popup at each of these points.
--   * New probations end 90 days after joining.
--   * Probations still running and never extended move to 90 days after joining.
--   * The check also runs at 08:30 IST, so "ends today" arrives in the morning.
-- Idempotent.

-- ───────── 1. 90 DAYS FOR PROBATIONS STILL RUNNING ─────────
UPDATE public.probations pr
   SET end_date = pr.start_date + 90
 WHERE pr.status = 'on_probation'
   AND pr.end_date IS DISTINCT FROM pr.start_date + 90
   AND NOT EXISTS (SELECT 1 FROM public.probation_decisions d
                    WHERE d.profile_id = pr.profile_id AND d.decision = 'extend');

-- ───────── 2. THE DAILY CHECK ─────────
CREATE OR REPLACE FUNCTION public.probation_tick() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n integer := 0; v_rows integer; r record;
BEGIN
  -- Everyone with a joining date gets a probation row. People whose 90 days were over
  -- before this feature existed are recorded as already confirmed (no decision is invented).
  INSERT INTO probations (org_id, profile_id, start_date, duration_months, end_date, status)
  SELECT p.org_id, p.id, p.joined_on, 3, p.joined_on + 90,
         CASE WHEN p.joined_on + 90 <= v_today THEN 'confirmed' ELSE 'on_probation' END
    FROM profiles p
   WHERE p.status = 'active' AND p.joined_on IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM probations x WHERE x.profile_id = p.id)
  ON CONFLICT (profile_id) DO NOTHING;

  -- The latest reminder point reached. A day the check did not run is caught up the next day,
  -- with the real number of days left in the message.
  FOR r IN
    SELECT pr.id, pr.org_id, pr.profile_id, pr.end_date, p.full_name, p.manager_id,
           pr.end_date - v_today AS days_left,
           CASE WHEN pr.end_date < v_today THEN 'ended'
                WHEN pr.end_date = v_today THEN 'today'
                WHEN pr.end_date - v_today <= 2 THEN '2d'
                WHEN pr.end_date - v_today <= 5 THEN '5d'
                WHEN pr.end_date - v_today <= 10 THEN '10d'
                ELSE '15d' END AS kind
      FROM probations pr JOIN profiles p ON p.id = pr.profile_id
     WHERE pr.status = 'on_probation' AND p.status = 'active'
       AND pr.end_date <= v_today + 15
  LOOP
    INSERT INTO probation_reminders (probation_id, end_date, kind)
    VALUES (r.id, r.end_date, r.kind) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      SELECT r.org_id, t.id,
             CASE r.kind
               WHEN 'ended' THEN format('%s''s probation period has ended', r.full_name)
               WHEN 'today' THEN format('%s''s probation ends today', r.full_name)
               ELSE format('%s''s probation ends in %s day%s', r.full_name, r.days_left,
                           CASE WHEN r.days_left = 1 THEN '' ELSE 's' END) END,
             CASE WHEN r.kind = 'ended'
                  THEN format('It ended on %s. Confirm, extend or mark for review.',
                              to_char(r.end_date, 'FMDD Mon'))
                  ELSE format('Last day: %s. Confirm, extend or mark for review.',
                              to_char(r.end_date, 'FMDD Mon')) END,
             '/warriors'
        FROM profiles t
       WHERE t.org_id = r.org_id AND t.status = 'active' AND t.id <> r.profile_id
         AND (t.role = ANY (ARRAY['hr','admin']) OR t.id = r.manager_id);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.probation_tick() FROM PUBLIC, anon, authenticated;

-- ───────── 3. MORNING RUN ─────────
-- The nightly run (ce-probation-tick, 23:50 IST) stays. A job with this name is replaced, so
-- running this again is safe. pg_cron lives only in the live database, not in a rehearsal copy.
DO $$
BEGIN
  IF current_database() = 'postgres' THEN
    PERFORM cron.schedule('ce-probation-tick-am', '0 3 * * *', $c$SELECT public.probation_tick()$c$);
  END IF;
END $$;
