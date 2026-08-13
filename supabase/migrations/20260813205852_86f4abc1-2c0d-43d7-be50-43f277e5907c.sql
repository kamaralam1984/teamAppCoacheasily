-- ═══ 1. FAIRNESS: people with no fixed weekly off ═══
CREATE OR REPLACE FUNCTION public.has_fixed_weekly_off(p_off text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_off IS NOT NULL AND btrim(p_off) IN
    ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
$$;

CREATE OR REPLACE FUNCTION public.punctuality_me()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_me uuid := my_profile_id();
  v_org uuid := my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start date := date_trunc('month', v_today)::date;
  v_off text; v_joined date; v_fixed boolean;
  v_working int; v_marked int; v_early int;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  SELECT weekly_off, joined_on INTO v_off, v_joined FROM profiles WHERE id = v_me;
  v_fixed := has_fixed_weekly_off(v_off);

  WITH days AS (SELECT d::date AS d FROM generate_series(v_start, v_today, interval '1 day') d),
  eligible AS (
    SELECT d FROM days
     WHERE (v_joined IS NULL OR d >= v_joined)
       AND (CASE WHEN v_fixed THEN trim(to_char(d, 'Day')) <> btrim(v_off)
                 ELSE EXISTS (SELECT 1 FROM attendance a
                               WHERE a.profile_id = v_me AND a.date = d) END)
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
    'flexible', NOT v_fixed,
    'today_on_time', (SELECT on_time FROM attendance WHERE profile_id = v_me AND date = v_today),
    'today_marked_at', (SELECT to_char(marked_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')
                          FROM attendance WHERE profile_id = v_me AND date = v_today));
END $function$;

CREATE OR REPLACE FUNCTION public.punctuality_rows(p_month date DEFAULT NULL::date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_org uuid := my_org();
  v_role text := my_role();
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start date := date_trunc('month', coalesce(p_month, v_today))::date;
  v_end date := least((v_start + interval '1 month - 1 day')::date, v_today);
  v_out jsonb := '[]'::jsonb;
  p record;
  v_fixed boolean;
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
    v_fixed := has_fixed_weekly_off(p.weekly_off);

    WITH days AS (
      SELECT d::date AS d FROM generate_series(v_start, v_end, interval '1 day') d
    ), eligible AS (
      SELECT d FROM days
       WHERE (p.joined_on IS NULL OR d >= p.joined_on)
         AND (CASE WHEN v_fixed THEN trim(to_char(d, 'Day')) <> btrim(p.weekly_off)
                   ELSE EXISTS (SELECT 1 FROM attendance a
                                 WHERE a.profile_id = p.id AND a.date = d) END)
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
      'flexible', NOT v_fixed,
      'working_days', coalesce(v_working, 0),
      'marked', coalesce(v_marked, 0),
      'early', coalesce(v_early, 0),
      'pct_early', CASE WHEN coalesce(v_working,0) > 0
                        THEN round(coalesce(v_early,0)::numeric / v_working * 100, 1) ELSE 0 END,
      'avg_punch', v_avg);
  END LOOP;

  RETURN v_out;
END $function$;

-- ═══ 2. RECOGNITION ═══
CREATE TABLE public.recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  from_id uuid REFERENCES public.profiles(id),
  to_id uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL CHECK (kind IN ('praise','badge','welcome')),
  badge_name text,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recognitions TO authenticated;
GRANT ALL ON public.recognitions TO service_role;
ALTER TABLE public.recognitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recognitions read own org" ON public.recognitions
  FOR SELECT TO authenticated USING (org_id = my_org());
CREATE POLICY "anyone may appreciate" ON public.recognitions
  FOR INSERT TO authenticated WITH CHECK (
    org_id = my_org() AND from_id = my_profile_id()
    AND (kind = 'praise' OR (kind = 'badge' AND my_role() IN ('manager','hr','admin'))));
CREATE POLICY "remove your own words" ON public.recognitions
  FOR DELETE TO authenticated USING (from_id = my_profile_id() OR my_role() IN ('hr','admin'));

CREATE OR REPLACE FUNCTION public.recognition_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_from text; v_to text;
BEGIN
  SELECT full_name INTO v_from FROM profiles WHERE id = NEW.from_id;
  SELECT full_name INTO v_to FROM profiles WHERE id = NEW.to_id;

  IF NEW.kind = 'praise' THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (NEW.org_id, NEW.to_id,
      coalesce(v_from, 'Someone') || ' appreciated you', NEW.text, '/culture');
  ELSE
    -- a badge and a welcome belong to the whole company
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT NEW.org_id, p.id,
      CASE WHEN NEW.kind = 'badge'
           THEN v_to || ' earned ' || coalesce(NEW.badge_name, 'a badge')
           ELSE 'Welcome to the team, ' || v_to END,
      NEW.text, '/culture'
      FROM profiles p WHERE p.org_id = NEW.org_id AND p.status = 'active';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER recognition_notify_trg AFTER INSERT ON public.recognitions
  FOR EACH ROW EXECUTE FUNCTION public.recognition_notify();

-- ═══ 3. ENERGY — private, always ═══
CREATE TABLE public.energy_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  score int NOT NULL CHECK (score BETWEEN 1 AND 5),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.energy_logs TO authenticated;
GRANT ALL ON public.energy_logs TO service_role;
ALTER TABLE public.energy_logs ENABLE ROW LEVEL SECURITY;
-- no manager, no HR, no admin override. Ever.
CREATE POLICY "only you may read your energy" ON public.energy_logs
  FOR SELECT TO authenticated USING (profile_id = my_profile_id());
CREATE POLICY "only you may log your energy" ON public.energy_logs
  FOR INSERT TO authenticated WITH CHECK (profile_id = my_profile_id() AND org_id = my_org());
CREATE POLICY "only you may change your energy" ON public.energy_logs
  FOR UPDATE TO authenticated USING (profile_id = my_profile_id())
  WITH CHECK (profile_id = my_profile_id());
CREATE POLICY "only you may delete your energy" ON public.energy_logs
  FOR DELETE TO authenticated USING (profile_id = my_profile_id());
CREATE TRIGGER energy_logs_touch BEFORE UPDATE ON public.energy_logs
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

-- one number, and only when it cannot point at a person
CREATE OR REPLACE FUNCTION public.team_energy_today()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_org uuid := my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n int; v_avg numeric;
BEGIN
  IF v_org IS NULL THEN RETURN NULL; END IF;
  SELECT count(*)::int, round(avg(score), 2) INTO v_n, v_avg
    FROM energy_logs WHERE org_id = v_org AND date = v_today;

  -- hard floor: with fewer than three, the average IS somebody's private score
  IF coalesce(v_n, 0) < 3 THEN
    RETURN jsonb_build_object('enough', false, 'checked_in', coalesce(v_n, 0), 'average', NULL);
  END IF;
  RETURN jsonb_build_object('enough', true, 'checked_in', v_n, 'average', v_avg);
END $function$;

-- ═══ 4. RITUALS ═══
CREATE TABLE public.rituals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  text text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rituals TO authenticated;
GRANT ALL ON public.rituals TO service_role;
ALTER TABLE public.rituals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "your rituals are yours" ON public.rituals
  FOR ALL TO authenticated USING (profile_id = my_profile_id())
  WITH CHECK (profile_id = my_profile_id() AND org_id = my_org());

CREATE TABLE public.ritual_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  ritual_id uuid NOT NULL REFERENCES public.rituals(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  done boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ritual_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ritual_logs TO authenticated;
GRANT ALL ON public.ritual_logs TO service_role;
ALTER TABLE public.ritual_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "your ritual ticks are yours" ON public.ritual_logs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM rituals r WHERE r.id = ritual_id AND r.profile_id = my_profile_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM rituals r WHERE r.id = ritual_id AND r.profile_id = my_profile_id()));

-- ═══ 5. THE DAILY PLAYBOOK ═══
CREATE TABLE public.sop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  department text NOT NULL,
  text text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_items TO authenticated;
GRANT ALL ON public.sop_items TO service_role;
ALTER TABLE public.sop_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "playbook is open to the company" ON public.sop_items
  FOR SELECT TO authenticated USING (org_id = my_org());
CREATE POLICY "people and culture keep the playbook" ON public.sop_items
  FOR ALL TO authenticated
  USING (org_id = my_org() AND my_role() IN ('hr','admin'))
  WITH CHECK (org_id = my_org() AND my_role() IN ('hr','admin'));
CREATE TRIGGER sop_items_touch BEFORE UPDATE ON public.sop_items
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

CREATE TABLE public.sop_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  sop_item_id uuid NOT NULL REFERENCES public.sop_items(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  done boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, sop_item_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_logs TO authenticated;
GRANT ALL ON public.sop_logs TO service_role;
ALTER TABLE public.sop_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "your playbook ticks are yours" ON public.sop_logs
  FOR ALL TO authenticated USING (profile_id = my_profile_id())
  WITH CHECK (profile_id = my_profile_id() AND org_id = my_org());

-- ═══ 6. WELCOME WALL ═══
CREATE OR REPLACE FUNCTION public.profile_welcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_mgr text; v_body text;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  SELECT full_name INTO v_mgr FROM profiles WHERE id = NEW.manager_id;

  v_body := coalesce(NEW.title, 'Warrior')
         || coalesce(' · ' || NEW.department, '')
         || coalesce(' · reports to ' || v_mgr, '')
         || coalesce(E'\n' || NEW.fun_fact, '');

  INSERT INTO recognitions (org_id, from_id, to_id, kind, badge_name, text)
  VALUES (NEW.org_id, NULL, NEW.id, 'welcome', NULL, v_body);

  INSERT INTO rituals (org_id, profile_id, text, sort_order)
  SELECT NEW.org_id, NEW.id, t.text, t.ord
    FROM (VALUES ('Reviewed my goals',1), ('Planned my top 3',2), ('Learned something new',3),
                 ('Grateful for one thing',4), ('Moved my body',5)) AS t(text, ord);
  RETURN NEW;
END $function$;
CREATE TRIGGER profile_welcome_trg AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profile_welcome();

-- ═══ 7. SEED ═══
INSERT INTO public.rituals (org_id, profile_id, text, sort_order)
SELECT p.org_id, p.id, t.text, t.ord
  FROM public.profiles p
  CROSS JOIN (VALUES ('Reviewed my goals',1), ('Planned my top 3',2), ('Learned something new',3),
                     ('Grateful for one thing',4), ('Moved my body',5)) AS t(text, ord)
 WHERE p.status = 'active';

INSERT INTO public.sop_items (org_id, department, text, sort_order)
SELECT o.id, s.dept, s.text, s.ord
  FROM public.organisations o
  CROSS JOIN (VALUES
    ('Sales','Follow up yesterday''s hot leads',1),
    ('Sales','Hit today''s call target',2),
    ('Sales','Log every call outcome',3),
    ('Sales','Move one stuck lead forward',4),
    ('Tele-calling','Work through today''s call list',1),
    ('Tele-calling','Log every call outcome',2),
    ('Tele-calling','Pass hot leads to sales',3),
    ('Tele-calling','Re-try yesterday''s no-answers',4),
    ('Coaching','Check today''s batch attendance',1),
    ('Coaching','Follow up every absentee',2),
    ('Coaching','Clear pending student queries',3),
    ('Coaching','Update the accountability sheet',4),
    ('Community','Post today''s prompt',1),
    ('Community','Reply to every unanswered message',2),
    ('Community','Push tomorrow''s session promo',3),
    ('Community','Flag members going quiet',4),
    ('Customer Experience','Clear every query older than 24h',1),
    ('Customer Experience','Reply to today''s messages',2),
    ('Customer Experience','Call one unhappy member back',3),
    ('Customer Experience','Log what caused each complaint',4),
    ('Technology','Check nothing is broken',1),
    ('Technology','Ship one thing the team asked for',2),
    ('Technology','Clear the highest-priority bug',3),
    ('Content','Ship today''s edit',1),
    ('Content','Review yesterday''s ad performance',2),
    ('Content','Plan tomorrow''s shoot',3),
    ('People & Culture','Check who hasn''t marked attendance',1),
    ('People & Culture','Move every open hire one step',2),
    ('People & Culture','Have one real check-in conversation',3),
    ('Leadership','Look at the numbers that matter',1),
    ('Leadership','Unblock one person',2),
    ('Leadership','Think about the next 90 days',3)
  ) AS s(dept, text, ord);