-- ═══ STRATEGIC MEETINGS ═══
-- HR and admin (and developers, through the service role) keep a list of strategic meetings,
-- as many ahead as they like: "Strategic Meeting 5.0 – The Year-End Impact Summit", with a
-- tagline, date, time, place and agenda. Everyone reads them; they show on the calendar.
-- Everyone active is reminded 7 days and 1 day before.

-- ───────── 1. THE MEETINGS ─────────
CREATE TABLE IF NOT EXISTS public.strategic_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  edition text,                     -- "5.0"
  title text NOT NULL CHECK (length(trim(title)) > 0),
  tagline text,
  meeting_date date NOT NULL,
  from_time time,
  to_time time,
  location text,
  agenda text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_time IS NULL OR from_time IS NULL OR to_time > from_time)
);
CREATE INDEX IF NOT EXISTS strategic_meetings_org_date ON public.strategic_meetings (org_id, meeting_date);

ALTER TABLE public.strategic_meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS strategic_meetings_read ON public.strategic_meetings;
CREATE POLICY strategic_meetings_read ON public.strategic_meetings FOR SELECT TO authenticated
  USING (org_id = my_org());
DROP POLICY IF EXISTS strategic_meetings_hr_write ON public.strategic_meetings;
CREATE POLICY strategic_meetings_hr_write ON public.strategic_meetings FOR ALL TO authenticated
  USING (org_id = my_org() AND my_role() IN ('hr', 'admin'))
  WITH CHECK (org_id = my_org() AND my_role() IN ('hr', 'admin'));
REVOKE ALL ON public.strategic_meetings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategic_meetings TO authenticated;
GRANT ALL ON public.strategic_meetings TO service_role;

CREATE OR REPLACE FUNCTION public.strategic_meetings_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS strategic_meetings_touch_trg ON public.strategic_meetings;
CREATE TRIGGER strategic_meetings_touch_trg BEFORE UPDATE ON public.strategic_meetings
  FOR EACH ROW EXECUTE FUNCTION public.strategic_meetings_touch();

-- ───────── 2. REMINDERS, 7 DAYS AND 1 DAY BEFORE ─────────
-- One row per reminder sent. The date is part of the key, so moving a meeting reminds again.
CREATE TABLE IF NOT EXISTS public.strategic_meeting_reminders (
  meeting_id uuid NOT NULL REFERENCES public.strategic_meetings(id) ON DELETE CASCADE,
  meeting_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('7d', '1d')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, meeting_date, kind)
);
ALTER TABLE public.strategic_meeting_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.strategic_meeting_reminders FROM anon, authenticated;
GRANT ALL ON public.strategic_meeting_reminders TO service_role;

-- The latest reminder point reached: within 7 days → '7d', within 1 day → '1d'. A meeting added
-- 3 days ahead gets the 7-day reminder at once (with the real number of days), then the 1-day one.
CREATE OR REPLACE FUNCTION public.strategic_meetings_tick() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n integer := 0;
  v_rows integer;
  r record;
BEGIN
  FOR r IN
    SELECT m.id, m.org_id, m.meeting_date, m.from_time, m.location,
           m.meeting_date - v_today AS days_left,
           CASE WHEN m.meeting_date - v_today <= 1 THEN '1d' ELSE '7d' END AS kind,
           CASE WHEN coalesce(trim(m.edition), '') = '' THEN m.title
                ELSE format('Strategic Meeting %s – %s', trim(m.edition), m.title) END AS label
      FROM strategic_meetings m
     WHERE m.meeting_date >= v_today AND m.meeting_date <= v_today + 7
  LOOP
    INSERT INTO strategic_meeting_reminders (meeting_id, meeting_date, kind)
    VALUES (r.id, r.meeting_date, r.kind) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      SELECT r.org_id, p.id,
             CASE WHEN r.days_left = 0 THEN format('%s is today', r.label)
                  WHEN r.days_left = 1 THEN format('%s is tomorrow', r.label)
                  ELSE format('%s is in %s days', r.label, r.days_left) END,
             concat_ws(' · ',
               to_char(r.meeting_date, 'FMDay DD Mon'),
               CASE WHEN r.from_time IS NOT NULL THEN to_char(r.from_time, 'FMHH12:MI AM') END,
               nullif(trim(r.location), '')),
             '/calendar'
        FROM profiles p
       WHERE p.org_id = r.org_id AND p.status = 'active';
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.strategic_meetings_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.strategic_meetings_tick() TO service_role;

-- ───────── 3. EVERY MORNING, 9:00 IST ─────────
-- pg_cron lives only in the live database, not in a rehearsal copy. Same name replaces the job.
DO $$
BEGIN
  IF current_database() = 'postgres' THEN
    PERFORM cron.schedule('ce-strategic-meetings-tick', '30 3 * * *',
                          $c$SELECT public.strategic_meetings_tick()$c$);
  END IF;
END $$;
