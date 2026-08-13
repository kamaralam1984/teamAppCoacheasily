-- ══════════════════════════════════════════════════════════════
-- CYCLES
-- ══════════════════════════════════════════════════════════════
CREATE TABLE public.cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  no int NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cycles TO authenticated;
GRANT ALL ON public.cycles TO service_role;
ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read org cycles" ON public.cycles FOR SELECT TO authenticated
  USING (org_id = my_org());
CREATE POLICY "hr admin insert cycles" ON public.cycles FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['hr','admin']));
CREATE POLICY "hr admin update cycles" ON public.cycles FOR UPDATE TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['hr','admin']))
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['hr','admin']));
CREATE POLICY "hr admin delete cycles" ON public.cycles FOR DELETE TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['hr','admin']));

-- the strategic meeting lives on the company calendar
ALTER TABLE public.events ADD COLUMN cycle_id uuid REFERENCES public.cycles(id) ON DELETE CASCADE;

-- ══════════════════════════════════════════════════════════════
-- GOALS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'number' CHECK (kind IN ('number','funnel')),
  name text NOT NULL,
  metric text,
  unit text,
  baseline numeric NOT NULL DEFAULT 0,
  target numeric NOT NULL DEFAULT 0,
  stages text[],
  learnings text,
  plan text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goals_profile_cycle_idx ON public.goals (profile_id, cycle_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or downline goals" ON public.goals FOR SELECT TO authenticated
  USING (org_id = my_org() AND (profile_id = my_profile_id() OR manages(profile_id)
         OR my_role() = ANY (ARRAY['hr','admin'])));
CREATE POLICY "write own goals" ON public.goals FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND (profile_id = my_profile_id()
         OR my_role() = ANY (ARRAY['hr','admin'])));
CREATE POLICY "update own goals" ON public.goals FOR UPDATE TO authenticated
  USING (org_id = my_org() AND (profile_id = my_profile_id() OR my_role() = ANY (ARRAY['hr','admin'])))
  WITH CHECK (org_id = my_org() AND (profile_id = my_profile_id() OR my_role() = ANY (ARRAY['hr','admin'])));
CREATE POLICY "delete own goals" ON public.goals FOR DELETE TO authenticated
  USING (org_id = my_org() AND (profile_id = my_profile_id() OR my_role() = ANY (ARRAY['hr','admin'])));

-- ══════════════════════════════════════════════════════════════
-- GOAL ENTRIES  (counts[] aligns index-for-index with goals.stages[])
-- ══════════════════════════════════════════════════════════════
CREATE TABLE public.goal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  value numeric,
  counts int[],
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, date)
);
CREATE INDEX goal_entries_goal_date_idx ON public.goal_entries (goal_id, date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_entries TO authenticated;
GRANT ALL ON public.goal_entries TO service_role;
ALTER TABLE public.goal_entries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.goal_owner(p_goal_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT profile_id FROM goals WHERE id = p_goal_id $$;

CREATE OR REPLACE FUNCTION public.can_read_goal(p_goal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM goals g
     WHERE g.id = p_goal_id
       AND g.org_id = my_org()
       AND (g.profile_id = my_profile_id() OR manages(g.profile_id)
            OR my_role() = ANY (ARRAY['hr','admin']))
  ) $$;

CREATE POLICY "read readable goal entries" ON public.goal_entries FOR SELECT TO authenticated
  USING (can_read_goal(goal_id));
CREATE POLICY "write own goal entries" ON public.goal_entries FOR INSERT TO authenticated
  WITH CHECK (goal_owner(goal_id) = my_profile_id() AND org_id = my_org());
CREATE POLICY "update own goal entries" ON public.goal_entries FOR UPDATE TO authenticated
  USING (goal_owner(goal_id) = my_profile_id())
  WITH CHECK (goal_owner(goal_id) = my_profile_id());
CREATE POLICY "delete own goal entries" ON public.goal_entries FOR DELETE TO authenticated
  USING (goal_owner(goal_id) = my_profile_id());

CREATE TRIGGER goals_touch BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();
CREATE TRIGGER goal_entries_touch BEFORE UPDATE ON public.goal_entries
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();
CREATE TRIGGER cycles_touch BEFORE UPDATE ON public.cycles
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

-- ══════════════════════════════════════════════════════════════
-- ONE PLACE THAT COMPUTES PERCENTAGES
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.goal_progress(p_goal_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g record;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_wk_start date;
  v_prev_start date;
  v_n int;
  i int;
  v_x numeric;
  v_totals numeric[] := '{}';
  v_week numeric[] := '{}';
  v_prev numeric[] := '{}';
  v_steps jsonb := '[]'::jsonb;
  v_weakest jsonb := NULL;
  v_worst numeric := NULL;
  v_rate numeric;
  v_current numeric := 0;
  v_pct numeric := 0;
  v_week_rate numeric;
  v_prev_rate numeric;
  v_week_sum numeric := 0;
  v_prev_sum numeric := 0;
  v_last date;
  v_count int;
BEGIN
  SELECT * INTO g FROM goals WHERE id = p_goal_id;
  IF g.id IS NULL THEN RETURN NULL; END IF;
  IF NOT can_read_goal(p_goal_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  v_wk_start := v_today - (EXTRACT(isodow FROM v_today)::int - 1);
  v_prev_start := v_wk_start - 7;

  SELECT max(date), count(*) INTO v_last, v_count FROM goal_entries WHERE goal_id = g.id;

  IF g.kind = 'funnel' THEN
    v_n := coalesce(array_length(g.stages, 1), 0);
    FOR i IN 1..greatest(v_n, 1) LOOP
      SELECT coalesce(sum(coalesce(counts[i], 0)), 0) INTO v_x
        FROM goal_entries WHERE goal_id = g.id;
      v_totals := array_append(v_totals, v_x);
      SELECT coalesce(sum(coalesce(counts[i], 0)), 0) INTO v_x
        FROM goal_entries WHERE goal_id = g.id AND date >= v_wk_start AND date <= v_today;
      v_week := array_append(v_week, v_x);
      SELECT coalesce(sum(coalesce(counts[i], 0)), 0) INTO v_x
        FROM goal_entries WHERE goal_id = g.id AND date >= v_prev_start AND date < v_wk_start;
      v_prev := array_append(v_prev, v_x);
    END LOOP;

    IF v_n >= 2 THEN
      FOR i IN 1..(v_n - 1) LOOP
        v_rate := CASE WHEN v_totals[i] > 0 THEN v_totals[i + 1] / v_totals[i] * 100 ELSE NULL END;
        v_steps := v_steps || jsonb_build_object(
          'index', i,
          'from', g.stages[i], 'to', g.stages[i + 1],
          'from_count', v_totals[i], 'to_count', v_totals[i + 1],
          'rate', round(coalesce(v_rate, 0), 1));
        IF v_rate IS NOT NULL AND (v_worst IS NULL OR v_rate < v_worst) THEN
          v_worst := v_rate;
          v_weakest := jsonb_build_object(
            'index', i,
            'from', g.stages[i], 'to', g.stages[i + 1],
            'from_count', v_totals[i], 'to_count', v_totals[i + 1],
            'rate', round(v_rate, 1));
        END IF;
      END LOOP;
      v_current := CASE WHEN v_totals[1] > 0 THEN round(v_totals[v_n] / v_totals[1] * 100, 1) ELSE 0 END;
      v_week_rate := CASE WHEN v_week[1] > 0 THEN round(v_week[v_n] / v_week[1] * 100, 1) ELSE NULL END;
      v_prev_rate := CASE WHEN v_prev[1] > 0 THEN round(v_prev[v_n] / v_prev[1] * 100, 1) ELSE NULL END;
    END IF;
  ELSE
    SELECT value INTO v_current FROM goal_entries
      WHERE goal_id = g.id AND value IS NOT NULL ORDER BY date DESC LIMIT 1;
    v_current := coalesce(v_current, g.baseline);
    SELECT coalesce(sum(value), 0) INTO v_week_sum FROM goal_entries
      WHERE goal_id = g.id AND date >= v_wk_start AND date <= v_today;
    SELECT coalesce(sum(value), 0) INTO v_prev_sum FROM goal_entries
      WHERE goal_id = g.id AND date >= v_prev_start AND date < v_wk_start;
    v_week := ARRAY[v_week_sum];
    v_prev := ARRAY[v_prev_sum];
  END IF;

  -- measured from the baseline, never from zero; works downward too
  IF g.target IS DISTINCT FROM g.baseline THEN
    v_pct := greatest(0, least(100, (v_current - g.baseline) / (g.target - g.baseline) * 100));
  ELSE
    v_pct := 0;
  END IF;

  RETURN jsonb_build_object(
    'goal_id', g.id,
    'kind', g.kind,
    'current_value', round(v_current, 1),
    'pct', round(v_pct, 1),
    'totals', to_jsonb(v_totals),
    'week_totals', to_jsonb(v_week),
    'prev_week_totals', to_jsonb(v_prev),
    'week_sum', v_week_sum,
    'prev_week_sum', v_prev_sum,
    'week_rate', v_week_rate,
    'prev_week_rate', v_prev_rate,
    'step_rates', v_steps,
    'weakest_step', v_weakest,
    'logged_today', EXISTS (SELECT 1 FROM goal_entries WHERE goal_id = g.id AND date = v_today),
    'last_entry_date', v_last,
    'entries_count', coalesce(v_count, 0)
  );
END $$;

-- goals + progress for one person in one cycle, oldest goal first
CREATE OR REPLACE FUNCTION public.goals_for(p_profile_id uuid DEFAULT NULL, p_cycle_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_cycle uuid := p_cycle_id;
  v_out jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF v_target IS NULL THEN RETURN v_out; END IF;
  IF NOT (v_target = my_profile_id() OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_cycle IS NULL THEN
    SELECT id INTO v_cycle FROM cycles WHERE org_id = my_org() AND status = 'active'
      ORDER BY start_date DESC LIMIT 1;
  END IF;
  IF v_cycle IS NULL THEN RETURN v_out; END IF;

  FOR r IN
    SELECT * FROM goals
     WHERE profile_id = v_target AND cycle_id = v_cycle AND archived = false
     ORDER BY created_at ASC
  LOOP
    v_out := v_out || jsonb_build_object(
      'goal', to_jsonb(r),
      'progress', goal_progress(r.id));
  END LOOP;
  RETURN v_out;
END $$;

-- ══════════════════════════════════════════════════════════════
-- LOGGING — always an upsert, never a duplicate-key failure
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.log_goal_entry(
  p_goal_id uuid,
  p_date date DEFAULT NULL,
  p_value numeric DEFAULT NULL,
  p_counts int[] DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_notify boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF g.profile_id <> my_profile_id() THEN
    RAISE EXCEPTION 'These are your own numbers to log.';
  END IF;
  IF v_date > v_today THEN
    RAISE EXCEPTION 'You cannot log numbers for a day that has not happened yet.';
  END IF;

  SELECT * INTO v_cycle FROM cycles WHERE id = g.cycle_id;
  IF v_date < v_cycle.start_date THEN
    RAISE EXCEPTION 'That date is before this cycle started on %.', to_char(v_cycle.start_date, 'DD Mon');
  END IF;

  INSERT INTO goal_entries (org_id, goal_id, date, value, counts, note)
  VALUES (g.org_id, g.id, v_date, p_value, p_counts, nullif(p_note, ''))
  ON CONFLICT (goal_id, date) DO UPDATE SET
    value = coalesce(excluded.value, goal_entries.value),
    counts = coalesce(excluded.counts, goal_entries.counts),
    note = coalesce(nullif(excluded.note, ''), goal_entries.note),
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
END $$;

-- ══════════════════════════════════════════════════════════════
-- CYCLES — opening the next one
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cycles_sync_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM events WHERE cycle_id = NEW.id;
  INSERT INTO events (org_id, cycle_id, name, type, date, location, created_by)
  VALUES (NEW.org_id, NEW.id, NEW.name || ' — strategic meeting', 'Meeting',
          NEW.end_date, 'Strategic meeting', NEW.created_by);
  RETURN NEW;
END $$;

CREATE TRIGGER cycles_sync_event_trg AFTER INSERT ON public.cycles
  FOR EACH ROW EXECUTE FUNCTION public.cycles_sync_event();
CREATE TRIGGER cycles_sync_event_upd_trg AFTER UPDATE OF end_date, name ON public.cycles
  FOR EACH ROW WHEN (OLD.end_date IS DISTINCT FROM NEW.end_date OR OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION public.cycles_sync_event();

CREATE OR REPLACE FUNCTION public.open_cycle(p_end_date date, p_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := my_org();
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_prev record;
  v_no int;
  v_name text;
  v_id uuid;
  r record;
BEGIN
  IF my_role() NOT IN ('hr','admin') THEN
    RAISE EXCEPTION 'Only People & Culture or Admin may open a cycle.';
  END IF;
  IF p_end_date <= v_today THEN
    RAISE EXCEPTION 'The next strategic meeting must be in the future.';
  END IF;

  SELECT * INTO v_prev FROM cycles WHERE org_id = v_org AND status = 'active'
    ORDER BY start_date DESC LIMIT 1;
  SELECT coalesce(max(no), 0) + 1 INTO v_no FROM cycles WHERE org_id = v_org;
  v_name := coalesce(nullif(p_name, ''), 'Strategic Meeting ' || v_no);

  UPDATE cycles SET status = 'closed' WHERE org_id = v_org AND status = 'active';

  INSERT INTO cycles (org_id, no, name, start_date, end_date, status, created_by)
  VALUES (v_org, v_no, v_name, v_today, p_end_date, 'active', v_me)
  RETURNING id INTO v_id;

  FOR r IN SELECT id FROM profiles WHERE org_id = v_org AND status = 'active' LOOP
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (v_org, r.id,
      'A new cycle has opened — ' || v_name,
      'It runs to ' || to_char(p_end_date, 'DD Mon') ||
      '. Write your fresh goals and start logging your numbers.',
      '/goals');
  END LOOP;

  RETURN jsonb_build_object('id', v_id, 'name', v_name, 'no', v_no,
    'start_date', v_today, 'end_date', p_end_date,
    'closed', CASE WHEN v_prev.id IS NULL THEN NULL ELSE v_prev.name END);
END $$;

-- ══════════════════════════════════════════════════════════════
-- TEAM PANEL — managers see their line, hr/admin see everyone
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.team_goals(p_cycle_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := my_org();
  v_me uuid := my_profile_id();
  v_role text := my_role();
  v_cycle uuid := p_cycle_id;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_out jsonb := '[]'::jsonb;
  v_goals jsonb;
  v_sum numeric;
  v_n int;
  v_last date;
  p record;
  r record;
BEGIN
  IF v_me IS NULL THEN RETURN v_out; END IF;
  IF v_role NOT IN ('manager','hr','admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;

  IF v_cycle IS NULL THEN
    SELECT id INTO v_cycle FROM cycles WHERE org_id = v_org AND status = 'active'
      ORDER BY start_date DESC LIMIT 1;
  END IF;
  IF v_cycle IS NULL THEN RETURN v_out; END IF;

  FOR p IN
    SELECT * FROM profiles
     WHERE org_id = v_org AND status = 'active'
       AND (CASE WHEN v_role IN ('hr','admin') THEN true ELSE manages(id) AND id <> v_me END)
     ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'hr' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
              sort_order, full_name
  LOOP
    v_goals := '[]'::jsonb;
    v_sum := 0; v_n := 0;
    FOR r IN SELECT * FROM goals WHERE profile_id = p.id AND cycle_id = v_cycle AND archived = false
             ORDER BY created_at ASC
    LOOP
      v_goals := v_goals || jsonb_build_object('goal', to_jsonb(r), 'progress', goal_progress(r.id));
      v_sum := v_sum + coalesce((goal_progress(r.id)->>'pct')::numeric, 0);
      v_n := v_n + 1;
    END LOOP;

    SELECT max(e.date) INTO v_last FROM goal_entries e
      JOIN goals g ON g.id = e.goal_id
     WHERE g.profile_id = p.id AND g.cycle_id = v_cycle;

    v_out := v_out || jsonb_build_object(
      'profile', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'title', p.title,
                 'department', p.department, 'role', p.role, 'manager_id', p.manager_id),
      'goals', v_goals,
      'goal_count', v_n,
      'avg_pct', CASE WHEN v_n > 0 THEN round(v_sum / v_n, 1) ELSE 0 END,
      'last_entry_date', v_last,
      'logged_today', v_last = v_today,
      'days_since_log', CASE WHEN v_last IS NULL THEN NULL ELSE (v_today - v_last) END
    );
  END LOOP;

  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.goals_remind_pending(p_cycle_id uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := my_org();
  v_me uuid := my_profile_id();
  v_role text := my_role();
  v_cycle uuid := p_cycle_id;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n int := 0;
  v_has_goals boolean;
  v_logged boolean;
  p record;
BEGIN
  IF v_role NOT IN ('manager','hr','admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF v_cycle IS NULL THEN
    SELECT id INTO v_cycle FROM cycles WHERE org_id = v_org AND status = 'active'
      ORDER BY start_date DESC LIMIT 1;
  END IF;
  IF v_cycle IS NULL THEN RETURN 0; END IF;

  FOR p IN
    SELECT * FROM profiles
     WHERE org_id = v_org AND status = 'active'
       AND (CASE WHEN v_role IN ('hr','admin') THEN id <> v_me ELSE manages(id) AND id <> v_me END)
  LOOP
    SELECT EXISTS (SELECT 1 FROM goals WHERE profile_id = p.id AND cycle_id = v_cycle AND archived = false)
      INTO v_has_goals;
    SELECT EXISTS (SELECT 1 FROM goal_entries e JOIN goals g ON g.id = e.goal_id
                    WHERE g.profile_id = p.id AND g.cycle_id = v_cycle AND e.date = v_today)
      INTO v_logged;

    IF NOT v_has_goals THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (v_org, p.id, 'You have no goals this cycle',
        'Write them today so your numbers start counting.', '/goals');
      v_n := v_n + 1;
    ELSIF NOT v_logged THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (v_org, p.id, 'Today''s numbers are still blank',
        'It takes twenty seconds. Log them before you close the laptop.', '/dashboard');
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END $$;

-- gentle self nudge: worked today, numbers not logged, told once a day
CREATE OR REPLACE FUNCTION public.goal_nudge_me()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_org uuid := my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cycle uuid;
BEGIN
  IF v_me IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM attendance WHERE profile_id = v_me AND date = v_today) THEN
    RETURN false;
  END IF;
  SELECT id INTO v_cycle FROM cycles WHERE org_id = v_org AND status = 'active'
    ORDER BY start_date DESC LIMIT 1;
  IF v_cycle IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM goals WHERE profile_id = v_me AND cycle_id = v_cycle AND archived = false) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM goal_entries e JOIN goals g ON g.id = e.goal_id
              WHERE g.profile_id = v_me AND g.cycle_id = v_cycle AND e.date = v_today) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM notifications
              WHERE profile_id = v_me AND title = 'Your numbers are still waiting'
                AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today) THEN
    RETURN false;
  END IF;

  INSERT INTO notifications (org_id, profile_id, title, body, link)
  VALUES (v_org, v_me, 'Your numbers are still waiting',
    'You worked today. Log the day''s numbers before you sign off — it takes twenty seconds.',
    '/dashboard');
  RETURN true;
END $$;

-- ══════════════════════════════════════════════════════════════
-- SEED: one active cycle
-- ══════════════════════════════════════════════════════════════
INSERT INTO public.cycles (org_id, no, name, start_date, end_date, status, created_by)
SELECT o.id, 2, 'Strategic Meeting 2', DATE '2026-07-08', DATE '2026-08-26', 'active',
       (SELECT id FROM public.profiles WHERE org_id = o.id AND role = 'admin' ORDER BY created_at LIMIT 1)
  FROM public.organisations o
 ORDER BY o.created_at LIMIT 1;