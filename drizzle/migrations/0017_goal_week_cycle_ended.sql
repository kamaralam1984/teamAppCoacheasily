-- ═══ GOALS: THE WEEK'S MOVEMENT, AND A CYCLE THAT HAS ENDED ═══
-- 1. A number goal's "this week" used to ADD UP the figures logged in the week. But the figure logged is where
--    the person is now (a running total or a level), so 3, 5, 8 showed as 16 for a week that moved by 8. It is now
--    the distance the figure travelled in the week (week_sum) and in the week before (prev_week_sum).
--    Funnel goals are untouched: they log each day's counts, which do add up.
-- 2. A cycle stayed "current" for ever once its end date had passed, until HR opened the next one. HR and admin
--    are now told three days before it ends and again the day after it has ended, once each.

-- ───────── 1. THE WEEK'S MOVEMENT ─────────
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
  v_lvl_wk numeric;
  v_lvl_prev numeric;
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
    -- The figure logged is where the person IS (a running total or a level), so a week's movement is how
    -- far that figure travelled in the week, not the sum of the figures.
    SELECT coalesce((SELECT value FROM goal_entries
                      WHERE goal_id = g.id AND value IS NOT NULL AND date < v_wk_start
                      ORDER BY date DESC LIMIT 1), g.baseline) INTO v_lvl_wk;
    SELECT coalesce((SELECT value FROM goal_entries
                      WHERE goal_id = g.id AND value IS NOT NULL AND date < v_prev_start
                      ORDER BY date DESC LIMIT 1), g.baseline) INTO v_lvl_prev;
    v_week_sum := v_current - v_lvl_wk;
    v_prev_sum := v_lvl_wk - v_lvl_prev;
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

-- ───────── 2. A CYCLE THAT HAS ENDED ─────────
CREATE TABLE IF NOT EXISTS public.cycle_notices (
  cycle_id uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ending', 'ended')),
  sent_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  PRIMARY KEY (cycle_id, kind)
);
ALTER TABLE public.cycle_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cycle_notices FROM anon, authenticated;
GRANT ALL ON public.cycle_notices TO service_role;

CREATE OR REPLACE FUNCTION public.cycles_tick() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n integer := 0;
  v_inserted integer;
  v_kind text;
  r record;
BEGIN
  FOR r IN SELECT * FROM cycles WHERE status = 'active' AND end_date <= v_today + 3 LOOP
    v_kind := CASE WHEN r.end_date < v_today THEN 'ended' ELSE 'ending' END;
    INSERT INTO cycle_notices (cycle_id, kind) VALUES (r.id, v_kind) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    CONTINUE WHEN v_inserted = 0;

    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT r.org_id, p.id,
           CASE WHEN v_kind = 'ended' THEN r.name || ' has ended' ELSE r.name || ' ends soon' END,
           CASE WHEN v_kind = 'ended'
                THEN 'It ended on ' || to_char(r.end_date, 'FMDD Mon') || '. Open the next cycle so everyone can write new goals.'
                ELSE 'It ends on ' || to_char(r.end_date, 'FMDD Mon') || '. Ask people for their closing numbers, then open the next cycle.' END,
           '/goals'
      FROM profiles p
     WHERE p.org_id = r.org_id AND p.status = 'active' AND p.role IN ('hr', 'admin');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.cycles_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cycles_tick() TO service_role;

-- 09:25 India time (03:55 UTC). A job with this name is replaced, so running this again is safe.
SELECT cron.schedule('ce-cycle-tick', '55 3 * * *', $$SELECT public.cycles_tick()$$);
