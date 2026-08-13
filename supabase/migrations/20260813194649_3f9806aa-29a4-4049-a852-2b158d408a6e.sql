
-- ============ PROGRAMMES ============
CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('CBA','MCA','Kickstart','Summit','Webinar')),
  language text,
  from_date date NOT NULL,
  to_date date NOT NULL,
  host_id uuid REFERENCES public.profiles(id),
  location text,
  series_id uuid,
  session_no int,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT ALL ON public.programs TO service_role;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read org programmes" ON public.programs
  FOR SELECT TO authenticated USING (org_id = my_org());
CREATE POLICY "schedulers insert programmes" ON public.programs
  FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']));
CREATE POLICY "schedulers update programmes" ON public.programs
  FOR UPDATE TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']))
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']));
CREATE POLICY "schedulers delete programmes" ON public.programs
  FOR DELETE TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']));

CREATE INDEX programs_org_dates_idx ON public.programs (org_id, from_date, to_date);
CREATE INDEX programs_series_idx ON public.programs (series_id);

CREATE TRIGGER programs_touch BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

-- ============ EVENTS ============
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'Meeting',
  date date NOT NULL,
  end_date date,
  from_time time,
  to_time time,
  location text,
  series_id uuid,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read org events" ON public.events
  FOR SELECT TO authenticated USING (org_id = my_org());
CREATE POLICY "schedulers insert events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']));
CREATE POLICY "schedulers update events" ON public.events
  FOR UPDATE TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']))
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']));
CREATE POLICY "schedulers delete events" ON public.events
  FOR DELETE TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']));

CREATE INDEX events_org_date_idx ON public.events (org_id, date);

CREATE TRIGGER events_touch BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

-- ============ HOLIDAYS: managers may curate, everyone is told ============
DROP POLICY IF EXISTS "hr admin insert holidays" ON public.holidays;
DROP POLICY IF EXISTS "hr admin update holidays" ON public.holidays;
DROP POLICY IF EXISTS "hr admin delete holidays" ON public.holidays;

CREATE POLICY "schedulers insert holidays" ON public.holidays
  FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']));
CREATE POLICY "schedulers update holidays" ON public.holidays
  FOR UPDATE TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']))
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']));
CREATE POLICY "schedulers delete holidays" ON public.holidays
  FOR DELETE TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['manager','hr','admin']));

CREATE OR REPLACE FUNCTION public.holiday_announce()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (org_id, profile_id, title, body, link)
  SELECT NEW.org_id, p.id,
         'Company holiday added: ' || NEW.name,
         to_char(NEW.date, 'DD Mon YYYY') || ' is now a company holiday.',
         '/calendar'
    FROM profiles p
   WHERE p.org_id = NEW.org_id AND p.status = 'active';
  RETURN NEW;
END $$;

CREATE TRIGGER holiday_announce_trg AFTER INSERT ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.holiday_announce();

-- ============ HOST-ON-LEAVE CONFLICT CHECK ============
CREATE OR REPLACE FUNCTION public.leave_host_conflicts(
  p_profile_id uuid, p_from date, p_to date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'program_id', pr.id,
    'name', pr.name,
    'type', pr.type,
    'from_date', pr.from_date,
    'to_date', pr.to_date,
    'overlap_from', GREATEST(pr.from_date, p_from),
    'overlap_to', LEAST(pr.to_date, p_to)
  ) ORDER BY pr.from_date), '[]'::jsonb)
  FROM programs pr
  WHERE pr.host_id = p_profile_id
    AND pr.from_date <= p_to
    AND pr.to_date >= p_from;
$$;

-- ============ SEED: announced programmes only ============
DO $$
DECLARE
  v_org uuid := '11111111-1111-4111-8111-111111111111';
  v_nilesh uuid := '33333333-0000-4000-8000-000000000010';
  v_kirti uuid := '33333333-0000-4000-8000-000000000003';
  v_saurabh uuid := '33333333-0000-4000-8000-000000000009';
  v_puru uuid := '22222222-2222-4222-8222-222222222222';
  v_sapana uuid := '33333333-0000-4000-8000-000000000005';
  v_pranjal uuid := '33333333-0000-4000-8000-000000000004';
  v_mar uuid := gen_random_uuid();
  v_eng uuid := gen_random_uuid();
  d date;
  n int;
BEGIN
  INSERT INTO programs (org_id, name, type, language, from_date, to_date, host_id, location) VALUES
    (v_org, 'CBA Hinglish', 'CBA', 'Hinglish', '2026-07-17', '2026-07-20', v_nilesh, 'Online'),
    (v_org, 'Kickstart', 'Kickstart', 'Hinglish', '2026-07-24', '2026-07-24', v_kirti, 'Online'),
    (v_org, 'CBA Hinglish', 'CBA', 'Hinglish', '2026-08-14', '2026-08-17', v_saurabh, 'Online'),
    (v_org, 'Kickstart', 'Kickstart', 'Hinglish', '2026-08-21', '2026-08-21', v_kirti, 'Online'),
    (v_org, 'CBA Hinglish', 'CBA', 'Hinglish', '2026-09-11', '2026-09-14', v_nilesh, 'Online'),
    (v_org, 'Kickstart', 'Kickstart', 'Hinglish', '2026-09-18', '2026-09-18', v_kirti, 'Online'),
    (v_org, 'Wealthy Coach Summit', 'Summit', 'Hinglish', '2026-10-03', '2026-10-04', v_puru, 'Mumbai · offline');

  n := 5;
  FOR d IN SELECT dd::date FROM generate_series('2026-07-01'::date, '2026-09-30'::date, '1 day') dd
           WHERE extract(dow FROM dd) = 2 ORDER BY dd
  LOOP
    INSERT INTO programs (org_id, name, type, language, from_date, to_date, host_id, location, series_id, session_no)
    VALUES (v_org, 'MCA Marathi', 'MCA', 'Marathi', d, d, v_sapana, 'Online', v_mar, n);
    n := n + 1;
  END LOOP;

  n := 5;
  FOR d IN SELECT dd::date FROM generate_series('2026-07-01'::date, '2026-09-30'::date, '1 day') dd
           WHERE extract(dow FROM dd) = 4 ORDER BY dd
  LOOP
    INSERT INTO programs (org_id, name, type, language, from_date, to_date, host_id, location, series_id, session_no)
    VALUES (v_org, 'MCA English', 'MCA', 'English', d, d, v_pranjal, 'Online', v_eng, n);
    n := n + 1;
  END LOOP;
END $$;
