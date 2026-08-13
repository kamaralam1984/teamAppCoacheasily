-- ─────────── columns ───────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_manage_calendar boolean NOT NULL DEFAULT false;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS host_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_no integer,
  ADD COLUMN IF NOT EXISTS sequence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS cover_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS from_time time,
  ADD COLUMN IF NOT EXISTS to_time time,
  ADD COLUMN IF NOT EXISTS sequence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- ─────────── private subscription tokens ───────────
CREATE TABLE IF NOT EXISTS public.calendar_tokens (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.calendar_tokens TO authenticated;
GRANT ALL ON public.calendar_tokens TO service_role;
ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own calendar token" ON public.calendar_tokens
  FOR SELECT TO authenticated USING (profile_id = my_profile_id());
CREATE POLICY "create own calendar token" ON public.calendar_tokens
  FOR INSERT TO authenticated WITH CHECK (profile_id = my_profile_id() AND org_id = my_org());
CREATE POLICY "rotate own calendar token" ON public.calendar_tokens
  FOR UPDATE TO authenticated USING (profile_id = my_profile_id()) WITH CHECK (profile_id = my_profile_id());
CREATE TRIGGER calendar_tokens_touch BEFORE UPDATE ON public.calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

-- ─────────── attendees ───────────
CREATE TABLE IF NOT EXISTS public.calendar_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  kind text NOT NULL CHECK (kind IN ('event','program')),
  ref_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ref_id, profile_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_attendees TO authenticated;
GRANT ALL ON public.calendar_attendees TO service_role;
ALTER TABLE public.calendar_attendees ENABLE ROW LEVEL SECURITY;

-- ─────────── who may keep the calendar ───────────
CREATE OR REPLACE FUNCTION public.can_keep_calendar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE auth_user_id = auth.uid()
       AND (role IN ('hr','admin') OR can_manage_calendar = true)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_ordinary_event_type(p_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_type IN ('Meeting','Review','1:1','Standup','Training')
$$;

-- ─────────── rewrite calendar write rules ───────────
DROP POLICY IF EXISTS "schedulers insert events" ON public.events;
DROP POLICY IF EXISTS "schedulers update events" ON public.events;
DROP POLICY IF EXISTS "schedulers delete events" ON public.events;

CREATE POLICY "keepers insert any event" ON public.events
  FOR INSERT TO authenticated WITH CHECK (org_id = my_org() AND can_keep_calendar());
CREATE POLICY "keepers update any event" ON public.events
  FOR UPDATE TO authenticated USING (org_id = my_org() AND can_keep_calendar())
  WITH CHECK (org_id = my_org() AND can_keep_calendar());
CREATE POLICY "keepers delete any event" ON public.events
  FOR DELETE TO authenticated USING (org_id = my_org() AND can_keep_calendar());

CREATE POLICY "managers insert own ordinary events" ON public.events
  FOR INSERT TO authenticated WITH CHECK (
    org_id = my_org() AND my_role() = 'manager'
    AND created_by = my_profile_id() AND is_ordinary_event_type(type));
CREATE POLICY "managers update own ordinary events" ON public.events
  FOR UPDATE TO authenticated USING (
    org_id = my_org() AND my_role() = 'manager'
    AND created_by = my_profile_id() AND is_ordinary_event_type(type))
  WITH CHECK (
    org_id = my_org() AND created_by = my_profile_id() AND is_ordinary_event_type(type));
CREATE POLICY "managers delete own ordinary events" ON public.events
  FOR DELETE TO authenticated USING (
    org_id = my_org() AND my_role() = 'manager'
    AND created_by = my_profile_id() AND is_ordinary_event_type(type));

DROP POLICY IF EXISTS "schedulers insert programmes" ON public.programs;
DROP POLICY IF EXISTS "schedulers update programmes" ON public.programs;
DROP POLICY IF EXISTS "schedulers delete programmes" ON public.programs;
CREATE POLICY "keepers insert programmes" ON public.programs
  FOR INSERT TO authenticated WITH CHECK (org_id = my_org() AND can_keep_calendar());
CREATE POLICY "keepers update programmes" ON public.programs
  FOR UPDATE TO authenticated USING (org_id = my_org() AND can_keep_calendar())
  WITH CHECK (org_id = my_org() AND can_keep_calendar());
CREATE POLICY "keepers delete programmes" ON public.programs
  FOR DELETE TO authenticated USING (org_id = my_org() AND can_keep_calendar());

DROP POLICY IF EXISTS "schedulers insert holidays" ON public.holidays;
DROP POLICY IF EXISTS "schedulers update holidays" ON public.holidays;
DROP POLICY IF EXISTS "schedulers delete holidays" ON public.holidays;
CREATE POLICY "keepers insert holidays" ON public.holidays
  FOR INSERT TO authenticated WITH CHECK (org_id = my_org() AND can_keep_calendar());
CREATE POLICY "keepers update holidays" ON public.holidays
  FOR UPDATE TO authenticated USING (org_id = my_org() AND can_keep_calendar())
  WITH CHECK (org_id = my_org() AND can_keep_calendar());
CREATE POLICY "keepers delete holidays" ON public.holidays
  FOR DELETE TO authenticated USING (org_id = my_org() AND can_keep_calendar());

CREATE POLICY "read org attendees" ON public.calendar_attendees
  FOR SELECT TO authenticated USING (org_id = my_org());
CREATE POLICY "keepers manage attendees" ON public.calendar_attendees
  FOR ALL TO authenticated
  USING (org_id = my_org() AND (can_keep_calendar() OR my_role() = 'manager'))
  WITH CHECK (org_id = my_org() AND (can_keep_calendar() OR my_role() = 'manager'));

-- ─────────── bump SEQUENCE so subscribers see edits ───────────
CREATE OR REPLACE FUNCTION public.bump_sequence()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.sequence := COALESCE(OLD.sequence, 0) + 1;
  RETURN NEW;
END $$;
CREATE TRIGGER events_bump_sequence BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.bump_sequence();
CREATE TRIGGER programs_bump_sequence BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.bump_sequence();

-- ─────────── the live feed, token only ───────────
CREATE OR REPLACE FUNCTION public.calendar_feed(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile uuid; v_org uuid; v_from date; v_to date;
BEGIN
  SELECT profile_id, org_id INTO v_profile, v_org FROM calendar_tokens WHERE token = p_token;
  IF v_profile IS NULL THEN RETURN NULL; END IF;
  v_from := (now() AT TIME ZONE 'Asia/Kolkata')::date - 90;
  v_to := (now() AT TIME ZONE 'Asia/Kolkata')::date + 400;

  RETURN jsonb_build_object(
    'name', (SELECT full_name FROM profiles WHERE id = v_profile),
    'programs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'type', pr.type, 'language', pr.language,
        'from_date', pr.from_date, 'to_date', pr.to_date,
        'from_time', pr.from_time, 'to_time', pr.to_time,
        'location', pr.location, 'description', pr.description,
        'session_no', pr.session_no, 'sequence', pr.sequence, 'status', pr.status,
        'host', (SELECT full_name FROM profiles h WHERE h.id = pr.host_id),
        'cover', (SELECT full_name FROM profiles c WHERE c.id = pr.cover_id)))
      FROM programs pr WHERE pr.org_id = v_org AND pr.from_date <= v_to AND pr.to_date >= v_from), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', ev.id, 'name', ev.name, 'type', ev.type,
        'date', ev.date, 'end_date', ev.end_date,
        'from_time', ev.from_time, 'to_time', ev.to_time,
        'location', ev.location, 'description', ev.description,
        'sequence', ev.sequence, 'status', ev.status,
        'host', (SELECT full_name FROM profiles h WHERE h.id = ev.host_id)))
      FROM events ev WHERE ev.org_id = v_org AND ev.date <= v_to AND COALESCE(ev.end_date, ev.date) >= v_from), '[]'::jsonb),
    'holidays', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'date', h.date))
      FROM holidays h WHERE h.org_id = v_org AND h.date BETWEEN v_from AND v_to), '[]'::jsonb),
    'leave', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', lr.id, 'type', lr.type, 'from_date', lr.from_date, 'to_date', lr.to_date,
        'half_day', lr.half_day, 'sequence', 0))
      FROM leave_requests lr WHERE lr.profile_id = v_profile AND lr.status = 'approved'
        AND lr.from_date <= v_to AND lr.to_date >= v_from), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.calendar_feed(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.calendar_feed(uuid) TO anon, authenticated, service_role;

-- ─────────── clash check now covers required attendees ───────────
CREATE OR REPLACE FUNCTION public.leave_cover_conflicts(p_profile_id uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'from_date'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'kind','program','id',pr.id,'name',pr.name,'type',pr.type,
      'from_date',pr.from_date,'to_date',pr.to_date,
      'overlap_from',GREATEST(pr.from_date,p_from),'overlap_to',LEAST(pr.to_date,p_to),
      'role', CASE WHEN pr.host_id = p_profile_id THEN 'host' ELSE 'required attendee' END,
      'cover', (SELECT full_name FROM profiles c WHERE c.id = pr.cover_id)) AS x
      FROM programs pr
     WHERE pr.status = 'active' AND pr.from_date <= p_to AND pr.to_date >= p_from
       AND (pr.host_id = p_profile_id OR EXISTS (
            SELECT 1 FROM calendar_attendees a
             WHERE a.kind='program' AND a.ref_id = pr.id AND a.profile_id = p_profile_id AND a.required))
    UNION ALL
    SELECT jsonb_build_object(
      'kind','event','id',ev.id,'name',ev.name,'type',ev.type,
      'from_date',ev.date,'to_date',COALESCE(ev.end_date,ev.date),
      'overlap_from',GREATEST(ev.date,p_from),'overlap_to',LEAST(COALESCE(ev.end_date,ev.date),p_to),
      'role', CASE WHEN ev.host_id = p_profile_id THEN 'host' ELSE 'required attendee' END,
      'cover', NULL) AS x
      FROM events ev
     WHERE ev.status = 'active' AND ev.date <= p_to AND COALESCE(ev.end_date,ev.date) >= p_from
       AND (ev.host_id = p_profile_id OR EXISTS (
            SELECT 1 FROM calendar_attendees a
             WHERE a.kind='event' AND a.ref_id = ev.id AND a.profile_id = p_profile_id AND a.required))
  ) s;
$$;

-- ─────────── prep-ahead nudge, seven days before a CBA or Summit ───────────
CREATE OR REPLACE FUNCTION public.calendar_prep_nudges()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_title text; v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  FOR r IN
    SELECT pr.* FROM programs pr
     WHERE pr.org_id = my_org() AND pr.status = 'active'
       AND pr.type IN ('CBA','Summit')
       AND pr.from_date = v_today + 7
  LOOP
    v_title := 'Prep ahead: ' || r.name || ' starts in 7 days';
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT r.org_id, p.id, v_title,
           to_char(r.from_date,'DD Mon') || ' · ' || r.type || '. Confirm the plan, the room and the people now.',
           '/calendar'
      FROM profiles p
     WHERE p.org_id = r.org_id AND p.status = 'active'
       AND (p.id = r.host_id OR p.role IN ('admin','hr'))
       AND NOT EXISTS (SELECT 1 FROM notifications n
                        WHERE n.profile_id = p.id AND n.title = v_title);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END LOOP;
  RETURN v_n;
END $$;