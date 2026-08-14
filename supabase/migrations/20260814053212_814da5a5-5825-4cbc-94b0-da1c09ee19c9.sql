-- ═══ 1. remove the mood tracker entirely ═══
DROP FUNCTION IF EXISTS public.team_energy_today();
DROP TABLE IF EXISTS public.energy_logs CASCADE;

-- ═══ the doorbell ═══
CREATE TABLE public.checkin_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  actioned_at timestamptz,
  actioned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX checkin_requests_open_idx
  ON public.checkin_requests (org_id, profile_id, actioned_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkin_requests TO authenticated;
GRANT ALL ON public.checkin_requests TO service_role;

ALTER TABLE public.checkin_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "See only your own, your reports', or as People & Culture"
  ON public.checkin_requests FOR SELECT TO authenticated
  USING (
    org_id = public.my_org()
    AND (
      profile_id = public.my_profile_id()
      OR public.manages(profile_id)
      OR public.my_role() = ANY (ARRAY['hr','admin'])
    )
  );

CREATE POLICY "Ask for yourself only"
  ON public.checkin_requests FOR INSERT TO authenticated
  WITH CHECK (org_id = public.my_org() AND profile_id = public.my_profile_id());

CREATE POLICY "Cancel your own before it is actioned"
  ON public.checkin_requests FOR DELETE TO authenticated
  USING (profile_id = public.my_profile_id() AND actioned_at IS NULL);

CREATE POLICY "Manager chain and People & Culture may close it"
  ON public.checkin_requests FOR UPDATE TO authenticated
  USING (
    org_id = public.my_org()
    AND (public.manages(profile_id) OR public.my_role() = ANY (ARRAY['hr','admin']))
  )
  WITH CHECK (org_id = public.my_org());

-- Ask. The optional line travels in the notification only; it is never a column.
CREATE OR REPLACE FUNCTION public.request_checkin(p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_org uuid := my_org();
  v_name text;
  v_mgr uuid;
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
  r record;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Your profile is not set up yet.'; END IF;

  SELECT full_name, manager_id INTO v_name, v_mgr FROM profiles WHERE id = v_me;

  SELECT id INTO v_id FROM checkin_requests
   WHERE profile_id = v_me AND actioned_at IS NULL LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO checkin_requests (org_id, profile_id)
  VALUES (v_org, v_me) RETURNING id INTO v_id;

  FOR r IN
    SELECT DISTINCT p.id FROM profiles p
     WHERE p.org_id = v_org AND p.status = 'active'
       AND (p.id = v_mgr OR p.role IN ('hr','admin'))
       AND p.id <> v_me
  LOOP
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (v_org, r.id,
            format('%s would like a check-in this week.', v_name),
            v_note, '/culture');
  END LOOP;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.checkin_talked(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := my_profile_id(); v_owner uuid;
BEGIN
  SELECT profile_id INTO v_owner FROM checkin_requests WHERE id = p_id;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF NOT (manages(v_owner) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE checkin_requests
     SET actioned_at = now(), actioned_by = v_me
   WHERE id = p_id AND actioned_at IS NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.request_checkin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.checkin_talked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_checkin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkin_talked(uuid) TO authenticated;

-- ═══ 2. birthdays ═══
UPDATE public.organisations SET settings = coalesce(settings,'{}'::jsonb) || '{"team_birthdays": true}'::jsonb;

CREATE OR REPLACE FUNCTION public.birthday_nudges()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_target date := v_today + 2;
  v_mmdd text := to_char(v_target, 'MM-DD');
  v_n int := 0;
  b record;
BEGIN
  FOR b IN
    SELECT id, org_id, full_name FROM profiles
     WHERE status = 'active' AND birthday = v_mmdd
  LOOP
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT b.org_id, p.id,
           format('%s''s birthday is on %s — plan something.',
                  b.full_name, to_char(v_target, 'FMDD Mon')),
           NULL, '/dashboard'
      FROM profiles p
     WHERE p.org_id = b.org_id AND p.status = 'active' AND p.id <> b.id
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
          WHERE n.profile_id = p.id
            AND n.title = format('%s''s birthday is on %s — plan something.',
                                 b.full_name, to_char(v_target, 'FMDD Mon'))
            AND n.created_at > now() - interval '5 days');
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.birthday_nudges() FROM PUBLIC;

SELECT cron.schedule('ce-birthday-nudges', '30 1 * * *', $$SELECT public.birthday_nudges()$$);

-- ═══ 3. leave quotas with an effective date ═══
CREATE OR REPLACE FUNCTION public.quota_for(p_settings jsonb, p_type text, p_year int)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(
    (SELECT (e->>p_type)::numeric
       FROM jsonb_array_elements(coalesce(p_settings->'leave_quotas','[]'::jsonb)) e
      WHERE (e->>'from')::date <= LEAST(current_date, make_date(p_year,12,31))
      ORDER BY (e->>'from')::date DESC
      LIMIT 1),
    (p_settings->>(p_type || '_quota'))::numeric,
    CASE p_type WHEN 'casual' THEN 8 ELSE 6 END)
$$;

CREATE OR REPLACE FUNCTION public.set_leave_quotas(
  p_casual numeric, p_sick numeric, p_effective_from date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from date := coalesce(p_effective_from, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_list jsonb;
  v_out jsonb;
BEGIN
  IF my_role() NOT IN ('hr','admin') THEN
    RAISE EXCEPTION 'Only People & Culture or Admin may change entitlements.';
  END IF;

  SELECT coalesce(settings->'leave_quotas','[]'::jsonb) INTO v_list
    FROM organisations WHERE id = my_org();

  SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO v_list
    FROM jsonb_array_elements(v_list) e WHERE (e->>'from')::date <> v_from;

  v_list := v_list || jsonb_build_array(jsonb_build_object(
    'from', v_from, 'casual', p_casual, 'sick', p_sick));

  UPDATE organisations
     SET settings = coalesce(settings,'{}'::jsonb)
       || jsonb_build_object('leave_quotas', v_list,
                             'casual_quota', p_casual,
                             'sick_quota', p_sick,
                             'quota_effective_from', v_from)
   WHERE id = my_org() RETURNING settings INTO v_out;
  RETURN v_out;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_leave_quotas(numeric, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_leave_quotas(numeric, numeric, date) TO authenticated;

-- seed today's quotas as the current effective entry (history-safe)
UPDATE public.organisations
   SET settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object(
     'leave_quotas', jsonb_build_array(jsonb_build_object(
        'from', '2000-01-01',
        'casual', coalesce((settings->>'casual_quota')::numeric, 8),
        'sick', coalesce((settings->>'sick_quota')::numeric, 6))),
     'quota_effective_from', '2000-01-01')
 WHERE settings->'leave_quotas' IS NULL;

-- leave_balances now reads the effective quota for the year
CREATE OR REPLACE FUNCTION public.leave_balances(p_profile_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_me uuid := my_profile_id();
  v_year int := extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int;
  v_earned int := 0;
  v_comp_total int := 0;
  v_comp_open int := 0;
  v_summary jsonb;
  v_settings jsonb;
  v_casual numeric;
  v_sick numeric;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_entitled numeric;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = v_me OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT o.settings INTO v_settings
    FROM organisations o JOIN profiles p ON p.org_id = o.id WHERE p.id = v_target;
  v_casual := quota_for(coalesce(v_settings,'{}'::jsonb), 'casual', v_year);
  v_sick := quota_for(coalesce(v_settings,'{}'::jsonb), 'sick', v_year);

  v_summary := attendance_summary(v_target);
  v_earned := coalesce((v_summary->>'earned_available')::int, 0);

  SELECT count(*), count(*) FILTER (WHERE consumed = false)
    INTO v_comp_total, v_comp_open
    FROM comp_off_credits WHERE profile_id = v_target;

  FOR r IN SELECT unnest(ARRAY['casual','sick','earned','comp_off']) AS t LOOP
    v_entitled := CASE r.t
      WHEN 'casual' THEN v_casual
      WHEN 'sick' THEN v_sick
      WHEN 'earned' THEN v_earned
      ELSE v_comp_total END;

    v_out := v_out || jsonb_build_object(
      'type', r.t,
      'entitled', v_entitled,
      'used', coalesce((SELECT sum(days) FROM leave_requests
                         WHERE profile_id = v_target AND type = r.t AND status = 'approved'
                           AND extract(year FROM from_date) = v_year), 0),
      'pending', coalesce((SELECT sum(days) FROM leave_requests
                            WHERE profile_id = v_target AND type = r.t AND status = 'pending'
                              AND extract(year FROM from_date) = v_year), 0),
      'balance', 0
    );
  END LOOP;

  SELECT jsonb_agg(
    e || jsonb_build_object('balance', GREATEST(
      CASE WHEN e->>'type' = 'comp_off'
           THEN v_comp_open - (e->>'pending')::numeric
           ELSE (e->>'entitled')::numeric - (e->>'used')::numeric - (e->>'pending')::numeric
      END, 0))
  ) INTO v_out FROM jsonb_array_elements(v_out) e;

  RETURN v_out;
END $$;