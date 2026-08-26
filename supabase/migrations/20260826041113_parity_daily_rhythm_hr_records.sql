-- Migration parity: capture everything that exists only in the live database.
-- Every definition below was read out of the live database verbatim
-- (pg_get_functiondef, pg_policies, pg_constraint). Idempotent throughout.

-- ═══ COLUMNS ADDED TO EXISTING TABLES ═══
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS committed_on date;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS carried_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS goal_id uuid;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS repeats text NOT NULL DEFAULT 'none';

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_goal_id_fkey
    FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_repeats_check
    CHECK ((repeats = ANY (ARRAY['none'::text, 'daily'::text, 'weekdays'::text])));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ TABLES ═══

CREATE TABLE IF NOT EXISTS public.weekly_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  cycle_id uuid REFERENCES public.cycles(id),
  week_start date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_reviews_profile_id_week_start_key UNIQUE (profile_id, week_start)
);

CREATE TABLE IF NOT EXISTS public.day_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  day date NOT NULL,
  committed_at timestamptz,
  closed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT day_plans_profile_id_day_key UNIQUE (profile_id, day)
);

CREATE TABLE IF NOT EXISTS public.task_days (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  day date NOT NULL,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  CONSTRAINT task_days_task_id_day_key UNIQUE (task_id, day)
);

CREATE TABLE IF NOT EXISTS public.profile_private (
  profile_id uuid NOT NULL PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  gender text,
  marital_status text,
  address_permanent text,
  address_correspondence text,
  same_address boolean NOT NULL DEFAULT false,
  pan_number text,
  pan_doc_path text,
  aadhaar_last4 text,
  aadhaar_doc_path text,
  emergency_name text,
  emergency_relationship text,
  emergency_phone text,
  blood_group text,
  notes text,
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_private_marital_check CHECK (((marital_status IS NULL) OR (marital_status = ANY (ARRAY['single'::text, 'married'::text, 'divorced'::text, 'widowed'::text, 'prefer_not_to_say'::text])))),
  CONSTRAINT profile_private_aadhaar_check CHECK (((aadhaar_last4 IS NULL) OR (aadhaar_last4 ~ '^[0-9]{4}$'::text)))
);

CREATE TABLE IF NOT EXISTS public.profile_education (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution text NOT NULL,
  qualification text,
  field text,
  start_year integer,
  end_year integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_employment (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employer text NOT NULL,
  designation text,
  from_date date,
  to_date date,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  effective_on date NOT NULL,
  designation text,
  note text,
  recorded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_milestones_kind_check CHECK ((kind = ANY (ARRAY['joined'::text, 'confirmed'::text, 'promoted'::text, 'role_change'::text, 'exited'::text])))
);

-- ═══ GRANTS (as live) ═══
GRANT ALL ON public.weekly_reviews, public.day_plans, public.task_days,
  public.profile_private, public.profile_education, public.profile_employment,
  public.profile_milestones
  TO anon, authenticated, service_role;

-- ═══ ROW LEVEL SECURITY ═══
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_education ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_employment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_milestones ENABLE ROW LEVEL SECURITY;

-- ═══ POLICIES (verbatim from pg_policies) ═══
DROP POLICY IF EXISTS "read own, downline or hr" ON public.weekly_reviews;
CREATE POLICY "read own, downline or hr" ON public.weekly_reviews
  FOR SELECT USING (((org_id = my_org()) AND ((profile_id = my_profile_id()) OR manages(profile_id) OR (my_role() = ANY (ARRAY['hr'::text, 'admin'::text])))));
DROP POLICY IF EXISTS "write only your own" ON public.weekly_reviews;
CREATE POLICY "write only your own" ON public.weekly_reviews
  FOR ALL USING (((org_id = my_org()) AND (profile_id = my_profile_id())))
  WITH CHECK (((org_id = my_org()) AND (profile_id = my_profile_id())));

DROP POLICY IF EXISTS "read own, downline or hr" ON public.day_plans;
CREATE POLICY "read own, downline or hr" ON public.day_plans
  FOR SELECT USING (((org_id = my_org()) AND ((profile_id = my_profile_id()) OR manages(profile_id) OR (my_role() = ANY (ARRAY['hr'::text, 'admin'::text])))));
DROP POLICY IF EXISTS "write only your own" ON public.day_plans;
CREATE POLICY "write only your own" ON public.day_plans
  FOR ALL USING (((org_id = my_org()) AND (profile_id = my_profile_id())))
  WITH CHECK (((org_id = my_org()) AND (profile_id = my_profile_id())));

DROP POLICY IF EXISTS "read own, downline or hr" ON public.task_days;
CREATE POLICY "read own, downline or hr" ON public.task_days
  FOR SELECT USING (((org_id = my_org()) AND ((profile_id = my_profile_id()) OR manages(profile_id) OR (my_role() = ANY (ARRAY['hr'::text, 'admin'::text])))));
DROP POLICY IF EXISTS "write only your own" ON public.task_days;
CREATE POLICY "write only your own" ON public.task_days
  FOR ALL USING (((org_id = my_org()) AND (profile_id = my_profile_id())))
  WITH CHECK (((org_id = my_org()) AND (profile_id = my_profile_id())));

DROP POLICY IF EXISTS "hr admin or your own" ON public.profile_private;
CREATE POLICY "hr admin or your own" ON public.profile_private
  FOR SELECT USING (((org_id = my_org()) AND ((my_role() = ANY (ARRAY['hr'::text, 'admin'::text])) OR (profile_id = my_profile_id()))));
DROP POLICY IF EXISTS "hr admin write only" ON public.profile_private;
CREATE POLICY "hr admin write only" ON public.profile_private
  FOR ALL USING (((org_id = my_org()) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))))
  WITH CHECK (((org_id = my_org()) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))));

DROP POLICY IF EXISTS "hr admin or your own" ON public.profile_education;
CREATE POLICY "hr admin or your own" ON public.profile_education
  FOR SELECT USING (((org_id = my_org()) AND ((my_role() = ANY (ARRAY['hr'::text, 'admin'::text])) OR (profile_id = my_profile_id()))));
DROP POLICY IF EXISTS "hr admin write only" ON public.profile_education;
CREATE POLICY "hr admin write only" ON public.profile_education
  FOR ALL USING (((org_id = my_org()) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))))
  WITH CHECK (((org_id = my_org()) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))));

DROP POLICY IF EXISTS "hr admin or your own" ON public.profile_employment;
CREATE POLICY "hr admin or your own" ON public.profile_employment
  FOR SELECT USING (((org_id = my_org()) AND ((my_role() = ANY (ARRAY['hr'::text, 'admin'::text])) OR (profile_id = my_profile_id()))));
DROP POLICY IF EXISTS "hr admin write only" ON public.profile_employment;
CREATE POLICY "hr admin write only" ON public.profile_employment
  FOR ALL USING (((org_id = my_org()) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))))
  WITH CHECK (((org_id = my_org()) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))));

DROP POLICY IF EXISTS "hr admin or your own" ON public.profile_milestones;
CREATE POLICY "hr admin or your own" ON public.profile_milestones
  FOR SELECT USING (((org_id = my_org()) AND ((my_role() = ANY (ARRAY['hr'::text, 'admin'::text])) OR (profile_id = my_profile_id()))));
DROP POLICY IF EXISTS "hr admin write only" ON public.profile_milestones;
CREATE POLICY "hr admin write only" ON public.profile_milestones
  FOR ALL USING (((org_id = my_org()) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))))
  WITH CHECK (((org_id = my_org()) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))));

-- ═══ FUNCTIONS (verbatim pg_get_functiondef from live) ═══

CREATE OR REPLACE FUNCTION public.attendance_comp_off()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_holiday text;
  v_weekly_off text;
  v_day_name text := trim(to_char(NEW.date, 'Day'));
  v_name text;
  v_manager uuid;
  v_reason text;
BEGIN
  IF coalesce((SELECT (settings->>'comp_off_enabled')::boolean FROM organisations LIMIT 1), false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;
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
$function$
;

CREATE OR REPLACE FUNCTION public.close_day(p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id(); v_org uuid := my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_total int; v_done int; v_carried int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;

  -- record what actually happened
  UPDATE task_days d SET done = t.done, done_at = t.done_at
    FROM tasks t WHERE t.id = d.task_id AND d.profile_id = v_me AND d.day = v_today;

  SELECT count(*), count(*) FILTER (WHERE done) INTO v_total, v_done
    FROM task_days WHERE profile_id = v_me AND day = v_today;

  -- unfinished, non-repeating work carries to tomorrow
  UPDATE tasks SET committed_on = NULL, carried_count = carried_count + 1, updated_at = now()
   WHERE owner_id = v_me AND committed_on = v_today AND done = false AND repeats = 'none';
  GET DIAGNOSTICS v_carried = ROW_COUNT;

  -- repeating work resets so it comes back tomorrow, history already saved above
  UPDATE tasks SET committed_on = NULL, done = false, done_at = NULL, updated_at = now()
   WHERE owner_id = v_me AND committed_on = v_today AND repeats <> 'none';

  -- finished one-off work simply leaves the daily list
  UPDATE tasks SET committed_on = NULL, updated_at = now()
   WHERE owner_id = v_me AND committed_on = v_today AND done = true AND repeats = 'none';

  INSERT INTO day_plans (org_id, profile_id, day, closed_at, note)
  VALUES (v_org, v_me, v_today, now(), p_note)
  ON CONFLICT (profile_id, day)
  DO UPDATE SET closed_at = now(), note = coalesce(excluded.note, day_plans.note), updated_at = now();

  RETURN jsonb_build_object('total', v_total, 'done', v_done, 'carried', v_carried,
    'pct', CASE WHEN v_total = 0 THEN 0 ELSE round(v_done * 100.0 / v_total) END);
END $function$
;

CREATE OR REPLACE FUNCTION public.commit_day(p_task_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id(); v_org uuid := my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cap int; v_n int; v_bad int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT coalesce((settings->>'daily_priority_cap')::int, 3) INTO v_cap
    FROM organisations WHERE id = v_org;

  v_n := coalesce(array_length(p_task_ids, 1), 0);
  IF v_n = 0 THEN RAISE EXCEPTION 'Pick at least one thing to do today.'; END IF;
  IF v_n > v_cap THEN
    RAISE EXCEPTION 'Choose your % most important. A long list is not a plan.', v_cap;
  END IF;

  -- every task must be your own
  SELECT count(*) INTO v_bad FROM unnest(p_task_ids) t(id)
   WHERE NOT EXISTS (SELECT 1 FROM tasks k WHERE k.id = t.id AND k.owner_id = v_me);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Those are not all your tasks.'; END IF;

  UPDATE tasks SET committed_on = v_today, updated_at = now()
   WHERE id = ANY (p_task_ids) AND owner_id = v_me;

  INSERT INTO task_days (org_id, task_id, profile_id, day)
  SELECT v_org, t.id, v_me, v_today FROM unnest(p_task_ids) t(id)
  ON CONFLICT (task_id, day) DO NOTHING;

  INSERT INTO day_plans (org_id, profile_id, day, committed_at)
  VALUES (v_org, v_me, v_today, now())
  ON CONFLICT (profile_id, day)
  DO UPDATE SET committed_at = coalesce(day_plans.committed_at, now()), updated_at = now();

  RETURN jsonb_build_object('ok', true, 'committed', v_n, 'cap', v_cap);
END $function$
;

CREATE OR REPLACE FUNCTION public.day_report(p_profile_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_target uuid := coalesce(p_profile_id, my_profile_id()); v_out jsonb;
BEGIN
  IF my_profile_id() IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT (v_target = my_profile_id() OR manages(v_target)
          OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'day' DESC), '[]'::jsonb) INTO v_out FROM (
    SELECT jsonb_build_object(
      'day', d.day,
      'committed', count(*),
      'done', count(*) FILTER (WHERE d.done),
      'pct', CASE WHEN count(*) = 0 THEN 0 ELSE round(count(*) FILTER (WHERE d.done) * 100.0 / count(*)) END,
      'closed', bool_or(p.closed_at IS NOT NULL),
      'note', min(p.note)
    ) AS x
    FROM task_days d
    LEFT JOIN day_plans p ON p.profile_id = d.profile_id AND p.day = d.day
    WHERE d.profile_id = v_target AND d.day BETWEEN p_from AND p_to
    GROUP BY d.day
  ) s;
  RETURN v_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.leave_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bal numeric; v_q numeric; v_msg text; v_days numeric; v_cap numeric;
BEGIN
  IF NEW.to_date < NEW.from_date THEN
    RAISE EXCEPTION 'The last day cannot be before the first day.';
  END IF;

  NEW.days := leave_days_for(NEW.profile_id, NEW.from_date, NEW.to_date, NEW.half_day, NEW.type);
  v_days := NEW.days;

  IF TG_OP = 'INSERT' OR NEW.from_date <> OLD.from_date OR NEW.to_date <> OLD.to_date
     OR NEW.type <> OLD.type THEN

    IF NEW.type = 'casual' THEN
      SELECT coalesce((o.settings->>'casual_quarter_cap')::numeric, 2) INTO v_cap
        FROM organisations o JOIN profiles p ON p.org_id = o.id WHERE p.id = NEW.profile_id;
      v_cap := coalesce(v_cap, 2);
      SELECT coalesce(sum(days), 0) INTO v_q FROM leave_requests
        WHERE profile_id = NEW.profile_id AND type = 'casual' AND status IN ('pending','approved')
          AND id <> NEW.id
          AND extract(year FROM from_date) = extract(year FROM NEW.from_date)
          AND extract(quarter FROM from_date) = extract(quarter FROM NEW.from_date);
      IF v_q + v_days > v_cap THEN
        RAISE EXCEPTION 'Casual leave is capped at % per quarter. You already have % in Q%.',
          v_cap, v_q, extract(quarter FROM NEW.from_date)::int;
      END IF;
    END IF;

    IF NEW.type = 'earned' THEN
      SELECT (e->>'balance')::numeric INTO v_bal
        FROM jsonb_array_elements(leave_balances(NEW.profile_id)) e WHERE e->>'type' = 'earned';
      IF coalesce(v_bal, 0) <= 0 THEN
        RAISE EXCEPTION 'You have no earned leave yet — 1 is earned for every 20 days worked.';
      END IF;
    END IF;

    IF NEW.type <> 'sick' THEN
      v_msg := leave_sandwich_conflict(NEW.profile_id, NEW.from_date, NEW.to_date, NEW.id);
      IF v_msg IS NOT NULL THEN RAISE EXCEPTION '%', v_msg; END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.approver_id IS NULL THEN
    NEW.approver_id := leave_approver_for(NEW.profile_id);
  END IF;

  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.leave_check(p_type text, p_from date, p_to date, p_half boolean DEFAULT false, p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_days numeric;
  v_errors text[] := '{}';
  v_warnings text[] := '{}';
  v_balances jsonb;
  v_bal numeric;
  v_quarter int;
  v_qcount numeric;
  v_notice int;
  v_msg text;
  v_summary jsonb;
  v_cap numeric;
BEGIN
  IF v_target IS NULL THEN RETURN jsonb_build_object('errors','[]'::jsonb,'warnings','[]'::jsonb,'days',0); END IF;
  IF NOT (v_target = my_profile_id() OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- array_append everywhere: `arr || 'literal'` resolves as array||array and crashes.
  IF p_to < p_from THEN
    v_errors := array_append(v_errors, 'The last day cannot be before the first day.');
    RETURN jsonb_build_object('errors', to_jsonb(v_errors), 'warnings', to_jsonb(v_warnings), 'days', 0);
  END IF;

  v_days := leave_days_for(v_target, p_from, p_to, p_half, p_type);
  v_balances := leave_balances(v_target);
  v_notice := p_from - (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT (e->>'balance')::numeric INTO v_bal
    FROM jsonb_array_elements(v_balances) e WHERE e->>'type' = p_type;

  IF p_type = 'casual' THEN
    SELECT coalesce((o.settings->>'casual_quarter_cap')::numeric, 2) INTO v_cap
      FROM organisations o JOIN profiles p ON p.org_id = o.id WHERE p.id = v_target;
    v_quarter := extract(quarter FROM p_from)::int;
    SELECT coalesce(sum(days), 0) INTO v_qcount FROM leave_requests
      WHERE profile_id = v_target AND type = 'casual' AND status IN ('pending','approved')
        AND extract(year FROM from_date) = extract(year FROM p_from)
        AND extract(quarter FROM from_date) = v_quarter;
    IF v_qcount + v_days > coalesce(v_cap, 2) THEN
      v_errors := array_append(v_errors, format(
        'Casual leave is capped at %s per quarter. You already have %s in Q%s.',
        coalesce(v_cap, 2), v_qcount, v_quarter));
    END IF;
    IF v_notice < 7 THEN
      v_warnings := array_append(v_warnings, 'This is less than 7 days'' notice — please give your team a heads-up.');
    END IF;
  END IF;

  IF p_type = 'earned' THEN
    v_summary := attendance_summary(v_target);
    IF coalesce(v_bal, 0) <= 0 THEN
      v_errors := array_append(v_errors, format(
        'You have no earned leave yet — 1 is earned for every 20 days worked. You are at %s day(s) in the app.',
        coalesce((v_summary->>'days_marked')::int, 0)));
    END IF;
    IF v_notice < 30 THEN
      v_warnings := array_append(v_warnings, 'Earned leave usually needs 30 days'' notice so cover can be planned.');
    END IF;
  END IF;

  -- Illness must never carry friction: no balance warning, no blocker, no sandwich rule.
  IF p_type IN ('casual','earned','comp_off') AND coalesce(v_bal, 0) > 0 AND v_days > v_bal THEN
    v_warnings := array_append(v_warnings, format(
      'This is more than your balance of %s day(s) — the extra will be unpaid.', v_bal));
  END IF;

  IF p_type IN ('casual','comp_off') AND coalesce(v_bal, 0) <= 0 THEN
    v_errors := array_append(v_errors, format('You have no %s leave left this year.', replace(p_type, '_', '-')));
  END IF;

  IF p_type <> 'sick' THEN
    v_msg := leave_sandwich_conflict(v_target, p_from, p_to, NULL);
    IF v_msg IS NOT NULL THEN
      v_errors := array_append(v_errors, v_msg);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'days', v_days);
END $function$
;

CREATE OR REPLACE FUNCTION public.leave_days_for(p_profile_id uuid, p_from date, p_to date, p_half boolean, p_type text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_off text; v_org uuid; v_n numeric;
BEGIN
  IF p_half THEN RETURN 0.5; END IF;
  IF p_to < p_from THEN RETURN 0; END IF;

  -- Earned (annual) leave only: a weekly off or a public holiday inside the
  -- period is not a working day, so it is not consumed.
  IF p_type <> 'earned' THEN
    RETURN (p_to - p_from) + 1;
  END IF;

  SELECT org_id, weekly_off INTO v_org, v_off FROM profiles WHERE id = p_profile_id;

  SELECT count(*) INTO v_n
  FROM generate_series(p_from, p_to, INTERVAL '1 day') d
  WHERE (v_off IS NULL OR trim(to_char(d, 'Day')) <> v_off)
    AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.org_id = v_org AND h.date = d::date);

  RETURN greatest(coalesce(v_n, 0), 0);
END
$function$
;

CREATE OR REPLACE FUNCTION public.leave_sandwich_conflict(p_profile_id uuid, p_from date, p_to date, p_exclude uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid; v_off text; d date; d2 date; guard int; step int;
BEGIN
  SELECT org_id, weekly_off INTO v_org, v_off FROM profiles WHERE id = p_profile_id;

  FOR guard IN 1..2 LOOP
    step := CASE WHEN guard = 1 THEN -1 ELSE 1 END;
    d := CASE WHEN guard = 1 THEN p_from - 1 ELSE p_to + 1 END;

    -- a public holiday never counts as a break
    WHILE EXISTS (SELECT 1 FROM holidays WHERE org_id = v_org AND date = d) LOOP
      d := d + step;
    END LOOP;

    IF v_off IS NOT NULL AND trim(to_char(d, 'Day')) = v_off THEN
      -- Leave simply ending beside a weekly off is normal and allowed.
      -- It is only a sandwich if there is ALSO leave on the far side of it.
      d2 := d + step;
      WHILE EXISTS (SELECT 1 FROM holidays WHERE org_id = v_org AND date = d2)
            OR trim(to_char(d2, 'Day')) = v_off LOOP
        d2 := d2 + step;
      END LOOP;
      IF EXISTS (
        SELECT 1 FROM leave_requests r
         WHERE r.profile_id = p_profile_id
           AND r.status IN ('pending','approved')
           AND (p_exclude IS NULL OR r.id <> p_exclude)
           AND d2 BETWEEN r.from_date AND r.to_date
      ) THEN
        RETURN 'This would sandwich your weekly off (' || v_off ||
               ') between two leaves. Please apply for the whole period as one leave instead.';
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1 FROM leave_requests r
         WHERE r.profile_id = p_profile_id
           AND r.status IN ('pending','approved')
           AND (p_exclude IS NULL OR r.id <> p_exclude)
           AND d BETWEEN r.from_date AND r.to_date
      ) THEN
        RETURN 'This runs straight into another of your leaves. Please apply for the whole period as one leave instead.';
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END
$function$
;

CREATE OR REPLACE FUNCTION public.log_goal_entry(p_goal_id uuid, p_date date DEFAULT NULL::date, p_value numeric DEFAULT NULL::numeric, p_counts integer[] DEFAULT NULL::integer[], p_note text DEFAULT NULL::text, p_notify boolean DEFAULT true, p_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g record;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_date date := coalesce(p_date, v_today);
  v_cycle record;
  v_manager uuid;
  v_name text;
BEGIN
  SELECT * INTO g FROM goals WHERE id = p_goal_id;
  IF g.id IS NULL THEN RAISE EXCEPTION 'That goal no longer exists.'; END IF;
  IF my_profile_id() IS NULL OR g.profile_id <> my_profile_id() THEN
    RAISE EXCEPTION 'These are your own numbers to log.';
  END IF;
  IF v_date > v_today THEN
    RAISE EXCEPTION 'You cannot log numbers for a day that has not happened yet.';
  END IF;

  SELECT * INTO v_cycle FROM cycles WHERE id = g.cycle_id;
  IF v_date < v_cycle.start_date THEN
    RAISE EXCEPTION 'That date is before this cycle started on %.', to_char(v_cycle.start_date, 'DD Mon');
  END IF;

  INSERT INTO goal_entries (org_id, goal_id, date, value, counts, note, amount)
  VALUES (g.org_id, g.id, v_date, p_value, p_counts, nullif(p_note, ''), p_amount)
  ON CONFLICT (goal_id, date) DO UPDATE SET
    value = coalesce(excluded.value, goal_entries.value),
    counts = coalesce(excluded.counts, goal_entries.counts),
    note = coalesce(nullif(excluded.note, ''), goal_entries.note),
    amount = coalesce(excluded.amount, goal_entries.amount),
    updated_at = now();

  IF p_notify THEN
    SELECT manager_id, full_name INTO v_manager, v_name FROM profiles WHERE id = g.profile_id;
    IF v_manager IS NOT NULL THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (g.org_id, v_manager,
        v_name || ' logged numbers for ' || g.name,
        to_char(v_date, 'DD Mon') || ' · ' || coalesce(nullif(p_note, ''), 'No note added.'),
        '/team');
    END IF;
  END IF;

  RETURN goal_progress(g.id);
END $function$
;

CREATE OR REPLACE FUNCTION public.my_day(p_day date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id(); v_org uuid := my_org();
  v_day date := coalesce(p_day, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_cap int; v_plan record; v_tasks jsonb; v_avail jsonb;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce((settings->>'daily_priority_cap')::int, 3) INTO v_cap
    FROM organisations WHERE id = v_org;
  SELECT * INTO v_plan FROM day_plans WHERE profile_id = v_me AND day = v_day;

  -- what is committed for the day
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'title', t.title, 'slot', t.slot, 'done', t.done,
           'repeats', t.repeats, 'carried_count', t.carried_count,
           'goal_id', t.goal_id, 'goal_name', g.name
         ) ORDER BY t.slot, t.created_at), '[]'::jsonb)
    INTO v_tasks
    FROM tasks t LEFT JOIN goals g ON g.id = t.goal_id
   WHERE t.owner_id = v_me AND t.committed_on = v_day;

  -- what could be chosen this morning
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'title', t.title, 'slot', t.slot, 'repeats', t.repeats,
           'carried_count', t.carried_count, 'goal_id', t.goal_id, 'goal_name', g.name,
           'due_date', t.due_date
         ) ORDER BY (t.repeats <> 'none') DESC, t.carried_count DESC, t.due_date NULLS LAST, t.created_at), '[]'::jsonb)
    INTO v_avail
    FROM tasks t LEFT JOIN goals g ON g.id = t.goal_id
   WHERE t.owner_id = v_me AND t.done = false AND t.committed_on IS DISTINCT FROM v_day;

  RETURN jsonb_build_object(
    'day', v_day, 'cap', v_cap,
    'committed_at', v_plan.committed_at, 'closed_at', v_plan.closed_at, 'note', v_plan.note,
    'tasks', v_tasks, 'available', v_avail,
    'total', jsonb_array_length(v_tasks),
    'done', (SELECT count(*) FROM jsonb_array_elements(v_tasks) e WHERE (e->>'done')::boolean));
END $function$
;

CREATE OR REPLACE FUNCTION public.profiles_protect_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  -- Deliberate escape hatch for supervised SQL maintenance.
  IF coalesce(current_setting('app.allow_profile_admin', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    -- Raw SQL / seeding. Re-running a seed must never overwrite a real person.
    IF NEW.title              IS DISTINCT FROM OLD.title
    OR NEW.department         IS DISTINCT FROM OLD.department
    OR NEW.manager_id         IS DISTINCT FROM OLD.manager_id
    OR NEW.role               IS DISTINCT FROM OLD.role
    OR NEW.opening_earned_leave IS DISTINCT FROM OLD.opening_earned_leave
    THEN
      RAISE EXCEPTION 'Title, department, reporting line, access level and opening earned leave can only be changed by a signed-in HR or Admin person.';
    END IF;
    RETURN NEW;
  END IF;

  v_role := my_role();
  IF v_role = ANY (ARRAY['hr','admin']) THEN
    RETURN NEW;
  END IF;

  -- An ordinary signed-in warrior may change their photo and their human detail,
  -- and nothing else. Allow-list, so any column added later is protected by default.
  IF (to_jsonb(NEW) - 'avatar_url' - 'fun_fact')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'avatar_url' - 'fun_fact')
  THEN
    RAISE EXCEPTION 'Only HR can change that. You can update your own photo and your one human detail.';
  END IF;

  RETURN NEW;
END
$function$
;

CREATE OR REPLACE FUNCTION public.profiles_sync_birthday()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    NEW.birthday := to_char(NEW.date_of_birth, 'MM-DD');
  END IF;
  RETURN NEW;
END
$function$
;

CREATE OR REPLACE FUNCTION public.save_weekly_review(p_note text, p_week_start date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_me uuid := my_profile_id(); v_org uuid := my_org();
        v_cycle uuid; v_week date := coalesce(p_week_start, week_start_ist()); v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT id INTO v_cycle FROM cycles WHERE org_id = v_org AND status='active' LIMIT 1;
  INSERT INTO weekly_reviews (org_id, profile_id, cycle_id, week_start, note)
  VALUES (v_org, v_me, v_cycle, v_week, p_note)
  ON CONFLICT (profile_id, week_start)
  DO UPDATE SET note = excluded.note, updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.week_start_ist()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ SELECT (date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata'))::date) $function$

;

-- ═══ TRIGGERS ═══
DROP TRIGGER IF EXISTS profiles_sync_birthday_trg ON public.profiles;
CREATE TRIGGER profiles_sync_birthday_trg BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_birthday();

DROP TRIGGER IF EXISTS profiles_protect_identity_trg ON public.profiles;
CREATE TRIGGER profiles_protect_identity_trg BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_identity();

-- ═══ FUNCTION GRANTS ═══
-- New functions get EXECUTE for PUBLIC by default; close that off.
REVOKE ALL ON FUNCTION public.week_start_ist() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.week_start_ist() TO authenticated;
REVOKE ALL ON FUNCTION public.save_weekly_review(text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_weekly_review(text, date) TO authenticated;
REVOKE ALL ON FUNCTION public.commit_day(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_day(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.close_day(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_day(text) TO authenticated;
REVOKE ALL ON FUNCTION public.my_day(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_day(date) TO authenticated;
REVOKE ALL ON FUNCTION public.day_report(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.day_report(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.leave_days_for(uuid, date, date, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_days_for(uuid, date, date, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.leave_check(text, date, date, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_check(text, date, date, boolean, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.log_goal_entry(uuid, date, numeric, integer[], text, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_goal_entry(uuid, date, numeric, integer[], text, boolean, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.week_start_ist() TO service_role;
GRANT EXECUTE ON FUNCTION public.save_weekly_review(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_day(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_day(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_day(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.day_report(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.leave_days_for(uuid, date, date, boolean, text) TO service_role;

-- Only ONE overload of log_goal_entry may exist; a second made every save fail.
DROP FUNCTION IF EXISTS public.log_goal_entry(uuid, date, numeric, integer[], text, boolean);

-- ═══ STORAGE: private hr-documents bucket ═══
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hr-documents', 'hr-documents', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf'];

DROP POLICY IF EXISTS "hr admin read hr documents" ON storage.objects;
CREATE POLICY "hr admin read hr documents" ON storage.objects
  FOR SELECT USING (((bucket_id = 'hr-documents'::text) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))));

DROP POLICY IF EXISTS "hr admin write hr documents" ON storage.objects;
CREATE POLICY "hr admin write hr documents" ON storage.objects
  FOR INSERT WITH CHECK (((bucket_id = 'hr-documents'::text) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))));

DROP POLICY IF EXISTS "hr admin update hr documents" ON storage.objects;
CREATE POLICY "hr admin update hr documents" ON storage.objects
  FOR UPDATE USING (((bucket_id = 'hr-documents'::text) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))));

DROP POLICY IF EXISTS "hr admin delete hr documents" ON storage.objects;
CREATE POLICY "hr admin delete hr documents" ON storage.objects
  FOR DELETE USING (((bucket_id = 'hr-documents'::text) AND (my_role() = ANY (ARRAY['hr'::text, 'admin'::text]))));
