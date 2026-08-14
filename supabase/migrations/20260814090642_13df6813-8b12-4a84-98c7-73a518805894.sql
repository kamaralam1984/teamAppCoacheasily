ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS tracks_revenue boolean NOT NULL DEFAULT false;
ALTER TABLE public.goal_entries ADD COLUMN IF NOT EXISTS amount numeric;

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
END $function$;

CREATE OR REPLACE FUNCTION public.goal_progress(p_goal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_amount numeric := 0;
BEGIN
  SELECT * INTO g FROM goals WHERE id = p_goal_id;
  IF g.id IS NULL THEN RETURN NULL; END IF;
  IF NOT can_read_goal(p_goal_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  v_wk_start := v_today - (EXTRACT(isodow FROM v_today)::int - 1);
  v_prev_start := v_wk_start - 7;

  SELECT max(date), count(*) INTO v_last, v_count FROM goal_entries WHERE goal_id = g.id;
  SELECT coalesce(sum(coalesce(amount, 0)), 0) INTO v_amount FROM goal_entries WHERE goal_id = g.id;

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
    'tracks_revenue', g.tracks_revenue,
    'amount_total', v_amount,
    'logged_today', EXISTS (SELECT 1 FROM goal_entries WHERE goal_id = g.id AND date = v_today),
    'last_entry_date', v_last,
    'entries_count', coalesce(v_count, 0)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.revenue_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle record;
  v_rows jsonb := '[]'::jsonb;
  v_total numeric := 0;
BEGIN
  IF my_role() IS NULL OR my_role() NOT IN ('hr', 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT * INTO v_cycle FROM cycles
   WHERE org_id = my_org() AND status = 'open'
   ORDER BY start_date DESC LIMIT 1;
  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('cycle', NULL, 'total', 0, 'people', '[]'::jsonb);
  END IF;

  SELECT coalesce(sum(t.amount), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'profile_id', t.profile_id,
           'full_name', t.full_name,
           'amount', t.amount) ORDER BY t.amount DESC, t.full_name), '[]'::jsonb)
    INTO v_total, v_rows
  FROM (
    SELECT p.id AS profile_id, p.full_name,
           coalesce(sum(coalesce(e.amount, 0)), 0) AS amount
      FROM goals g
      JOIN profiles p ON p.id = g.profile_id
      LEFT JOIN goal_entries e ON e.goal_id = g.id
     WHERE g.org_id = my_org()
       AND g.cycle_id = v_cycle.id
       AND g.tracks_revenue
       AND NOT g.archived
     GROUP BY p.id, p.full_name
  ) t;

  RETURN jsonb_build_object(
    'cycle', jsonb_build_object('id', v_cycle.id, 'name', v_cycle.name,
      'start_date', v_cycle.start_date, 'end_date', v_cycle.end_date),
    'total', v_total,
    'people', v_rows
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.revenue_summary() FROM anon;