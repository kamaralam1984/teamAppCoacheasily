-- 1. Org settings defaults
UPDATE public.organisations
   SET settings = coalesce(settings, '{}'::jsonb)
     || jsonb_build_object(
          'daily_meeting_url', coalesce(settings->>'daily_meeting_url', 'https://us06web.zoom.us/j/84017415725?pwd=TB7NxLXmz19fOKgiG0E1c5IDyAUsZS.1'),
          'daily_meeting_time', coalesce(settings->>'daily_meeting_time', '11:00'),
          'timezone', coalesce(settings->>'timezone', 'Asia/Kolkata'));

CREATE OR REPLACE FUNCTION public.org_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(settings, '{}'::jsonb) FROM organisations WHERE id = my_org()
$$;

CREATE OR REPLACE FUNCTION public.update_org_settings(p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF my_role() NOT IN ('hr','admin') THEN
    RAISE EXCEPTION 'Only People & Culture or Admin may change company settings.';
  END IF;
  UPDATE organisations SET settings = coalesce(settings,'{}'::jsonb) || p_patch
   WHERE id = my_org() RETURNING settings INTO v;
  RETURN v;
END $$;

-- 2. The punch
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS on_time boolean;

CREATE OR REPLACE FUNCTION public.attendance_set_on_time()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_time time;
BEGIN
  SELECT coalesce(nullif(settings->>'daily_meeting_time',''), '11:00')::time
    INTO v_time FROM organisations WHERE id = NEW.org_id;
  NEW.on_time := ((NEW.marked_at AT TIME ZONE 'Asia/Kolkata')::time < coalesce(v_time, '11:00'::time));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_on_time_trg ON public.attendance;
CREATE TRIGGER attendance_on_time_trg
BEFORE INSERT OR UPDATE OF marked_at ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.attendance_set_on_time();

UPDATE public.attendance a
   SET on_time = ((a.marked_at AT TIME ZONE 'Asia/Kolkata')::time
                  < coalesce(nullif(o.settings->>'daily_meeting_time','')::time, '11:00'::time))
  FROM public.organisations o
 WHERE o.id = a.org_id AND a.on_time IS NULL;

-- 3. Punctuality
CREATE OR REPLACE FUNCTION public.punctuality_rows(p_month date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := my_org();
  v_role text := my_role();
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start date := date_trunc('month', coalesce(p_month, v_today))::date;
  v_end date := least((v_start + interval '1 month - 1 day')::date, v_today);
  v_out jsonb := '[]'::jsonb;
  p record;
  v_working int; v_marked int; v_early int; v_avg text;
BEGIN
  IF v_me IS NULL THEN RETURN v_out; END IF;

  FOR p IN
    SELECT * FROM profiles
     WHERE org_id = v_org AND status = 'active'
       AND (CASE WHEN v_role IN ('hr','admin') THEN true
                 WHEN v_role = 'manager' THEN manages(id)
                 ELSE id = v_me END)
     ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'hr' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
              sort_order, full_name
  LOOP
    WITH days AS (
      SELECT d::date AS d FROM generate_series(v_start, v_end, interval '1 day') d
    ), eligible AS (
      SELECT d FROM days
       WHERE (p.joined_on IS NULL OR d >= p.joined_on)
         AND (p.weekly_off IS NULL OR trim(to_char(d, 'Day')) <> p.weekly_off)
         AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.org_id = v_org AND h.date = d)
         AND NOT EXISTS (SELECT 1 FROM leave_requests lr
                          WHERE lr.profile_id = p.id AND lr.status = 'approved'
                            AND d BETWEEN lr.from_date AND lr.to_date)
    )
    SELECT count(*)::int,
           count(a.id)::int,
           count(*) FILTER (WHERE a.on_time)::int,
           to_char(avg((a.marked_at AT TIME ZONE 'Asia/Kolkata')::time), 'HH24:MI')
      INTO v_working, v_marked, v_early, v_avg
      FROM eligible e
      LEFT JOIN attendance a ON a.profile_id = p.id AND a.date = e.d;

    v_out := v_out || jsonb_build_object(
      'profile_id', p.id,
      'full_name', p.full_name,
      'title', p.title,
      'department', p.department,
      'role', p.role,
      'working_days', coalesce(v_working, 0),
      'marked', coalesce(v_marked, 0),
      'early', coalesce(v_early, 0),
      'pct_early', CASE WHEN coalesce(v_working,0) > 0
                        THEN round(coalesce(v_early,0)::numeric / v_working * 100, 1) ELSE 0 END,
      'avg_punch', v_avg);
  END LOOP;

  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.punctuality_me()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_org uuid := my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start date := date_trunc('month', v_today)::date;
  v_off text; v_joined date;
  v_working int; v_marked int; v_early int;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  SELECT weekly_off, joined_on INTO v_off, v_joined FROM profiles WHERE id = v_me;

  WITH days AS (SELECT d::date AS d FROM generate_series(v_start, v_today, interval '1 day') d),
  eligible AS (
    SELECT d FROM days
     WHERE (v_joined IS NULL OR d >= v_joined)
       AND (v_off IS NULL OR trim(to_char(d, 'Day')) <> v_off)
       AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.org_id = v_org AND h.date = d)
       AND NOT EXISTS (SELECT 1 FROM leave_requests lr
                        WHERE lr.profile_id = v_me AND lr.status = 'approved'
                          AND d BETWEEN lr.from_date AND lr.to_date)
  )
  SELECT count(*)::int, count(a.id)::int, count(*) FILTER (WHERE a.on_time)::int
    INTO v_working, v_marked, v_early
    FROM eligible e LEFT JOIN attendance a ON a.profile_id = v_me AND a.date = e.d;

  RETURN jsonb_build_object(
    'working_days', coalesce(v_working, 0),
    'marked', coalesce(v_marked, 0),
    'early', coalesce(v_early, 0),
    'today_on_time', (SELECT on_time FROM attendance WHERE profile_id = v_me AND date = v_today),
    'today_marked_at', (SELECT to_char(marked_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')
                          FROM attendance WHERE profile_id = v_me AND date = v_today));
END $$;