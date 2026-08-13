-- ============ ATTENDANCE ============
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  marked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, date)
);
CREATE INDEX attendance_profile_date_idx ON public.attendance (profile_id, date DESC);

GRANT SELECT, INSERT ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or downline attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    org_id = public.my_org()
    AND (
      profile_id = public.my_profile_id()
      OR public.manages(profile_id)
      OR public.my_role() = ANY (ARRAY['hr','admin'])
    )
  );

CREATE POLICY "mark own attendance" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.my_profile_id() AND org_id = public.my_org());

-- ============ COMP-OFF CREDITS ============
CREATE TABLE public.comp_off_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  earned_on date NOT NULL,
  reason text NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  consumed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, earned_on)
);

GRANT SELECT ON public.comp_off_credits TO authenticated;
GRANT ALL ON public.comp_off_credits TO service_role;
ALTER TABLE public.comp_off_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or downline comp offs" ON public.comp_off_credits
  FOR SELECT TO authenticated
  USING (
    org_id = public.my_org()
    AND (
      profile_id = public.my_profile_id()
      OR public.manages(profile_id)
      OR public.my_role() = ANY (ARRAY['hr','admin'])
    )
  );

CREATE POLICY "hr admin update comp offs" ON public.comp_off_credits
  FOR UPDATE TO authenticated
  USING (org_id = public.my_org() AND public.my_role() = ANY (ARRAY['hr','admin']))
  WITH CHECK (org_id = public.my_org() AND public.my_role() = ANY (ARRAY['hr','admin']));

GRANT UPDATE ON public.comp_off_credits TO authenticated;

-- ============ HOLIDAYS ============
CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  date date NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read org holidays" ON public.holidays
  FOR SELECT TO authenticated USING (org_id = public.my_org());

CREATE POLICY "hr admin insert holidays" ON public.holidays
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.my_org() AND public.my_role() = ANY (ARRAY['hr','admin']));

CREATE POLICY "hr admin update holidays" ON public.holidays
  FOR UPDATE TO authenticated
  USING (org_id = public.my_org() AND public.my_role() = ANY (ARRAY['hr','admin']))
  WITH CHECK (org_id = public.my_org() AND public.my_role() = ANY (ARRAY['hr','admin']));

CREATE POLICY "hr admin delete holidays" ON public.holidays
  FOR DELETE TO authenticated
  USING (org_id = public.my_org() AND public.my_role() = ANY (ARRAY['hr','admin']));

-- ============ COMP-OFF AUTOMATION ON THE ATTENDANCE WRITE ============
CREATE OR REPLACE FUNCTION public.attendance_comp_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_holiday text;
  v_weekly_off text;
  v_day_name text := trim(to_char(NEW.date, 'Day'));
  v_name text;
  v_manager uuid;
  v_reason text;
BEGIN
  SELECT name INTO v_holiday FROM holidays
   WHERE org_id = NEW.org_id AND date = NEW.date LIMIT 1;

  SELECT weekly_off, full_name, manager_id
    INTO v_weekly_off, v_name, v_manager
    FROM profiles WHERE id = NEW.profile_id;

  IF v_holiday IS NOT NULL AND v_weekly_off = v_day_name THEN
    v_reason := v_holiday || ' (also your weekly off)';
  ELSIF v_holiday IS NOT NULL THEN
    v_reason := v_holiday;
  ELSIF v_weekly_off = v_day_name THEN
    v_reason := 'your weekly off (' || v_day_name || ')';
  ELSE
    RETURN NEW;
  END IF;

  -- credited once per day, even when both reasons apply
  INSERT INTO comp_off_credits (org_id, profile_id, earned_on, reason)
  VALUES (NEW.org_id, NEW.profile_id, NEW.date, v_reason)
  ON CONFLICT (profile_id, earned_on) DO NOTHING;

  IF v_manager IS NOT NULL THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (
      NEW.org_id, v_manager,
      v_name || ' worked on ' || v_reason,
      v_name || ' marked attendance on ' || to_char(NEW.date, 'DD Mon') ||
      ' and has earned 1 comp-off.',
      '/dashboard'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_comp_off_trg
AFTER INSERT ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.attendance_comp_off();

-- ============ THE ONE BALANCE CALCULATION ============
-- earned_available = opening_earned_leave + floor(days_marked / 20), capped at 30.
CREATE OR REPLACE FUNCTION public.attendance_summary(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_opening int;
  v_days int;
  v_earned int;
  v_streak int := 0;
  v_marked boolean;
  v_comp int;
  v_last date;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = v_me OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT opening_earned_leave INTO v_opening FROM profiles WHERE id = v_target;
  IF v_opening IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_days FROM attendance WHERE profile_id = v_target AND date <= v_today;
  v_earned := least(v_opening + (v_days / 20), 30);

  SELECT EXISTS (SELECT 1 FROM attendance WHERE profile_id = v_target AND date = v_today)
    INTO v_marked;

  SELECT count(*) INTO v_comp
    FROM comp_off_credits WHERE profile_id = v_target AND consumed = false;

  SELECT max(date) INTO v_last FROM attendance WHERE profile_id = v_target AND date <= v_today;
  IF v_last = v_today THEN
    SELECT count(*) INTO v_streak FROM (
      SELECT date, row_number() OVER (ORDER BY date DESC) AS rn
        FROM attendance WHERE profile_id = v_target AND date <= v_today
    ) d WHERE d.date = v_today - (d.rn - 1);
  END IF;

  RETURN jsonb_build_object(
    'profile_id', v_target,
    'today', v_today,
    'marked_today', v_marked,
    'days_marked', v_days,
    'opening_earned_leave', v_opening,
    'earned_available', v_earned,
    'to_next_leave', 20 - (v_days % 20),
    'streak', v_streak,
    'comp_off_available', v_comp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_summary(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.attendance_summary(uuid) TO authenticated;

-- ============ SEED HOLIDAYS (ascending by date) ============
INSERT INTO public.holidays (org_id, date, name)
SELECT o.id, v.date::date, v.name
FROM public.organisations o
CROSS JOIN (VALUES
  ('2026-08-15','Independence Day'),
  ('2026-09-14','Ganesh Chaturthi'),
  ('2026-10-20','Dussehra'),
  ('2026-11-08','Diwali'),
  ('2026-12-25','Christmas'),
  ('2027-01-26','Republic Day'),
  ('2027-02-19','Shiv Jayanti')
) AS v(date, name)
WHERE o.name = 'CoachEasily'
ON CONFLICT (org_id, date) DO NOTHING;