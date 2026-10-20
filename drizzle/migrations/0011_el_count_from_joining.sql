-- ═══ EARNED LEAVE: COUNT FROM THE JOINING DATE ═══
-- Until now a day counted towards the 20 only if the person marked attendance that day.
-- This adds a second way to count, chosen in the earned leave policy (count_from):
--   punches       the days the person marked attendance (what the app did so far)
--   joining_date  every working day from the joining date, whether or not they marked in.
--                 Weekly offs and company holidays are skipped, and so are days on unpaid
--                 leave and (unless the policy counts them) days on approved leave.
--                 Only finished days count, so today is added tomorrow.
-- Switching is a deliberate act by HR: el_rebuild_preview() shows what changes for each person,
-- and el_rebuild_apply() switches the policy and rebuilds every ledger from the joining date.
-- The old ledger rows are moved to el_ledger_archive (never deleted), so the history is kept.
-- The ledger screen also shows the opening balance and the earned leave that was used, with a
-- running balance, so the account can be checked line by line.

-- ───────── 1. THE POLICY CHOICE ─────────
ALTER TABLE public.el_policy
  ADD COLUMN IF NOT EXISTS count_from text NOT NULL DEFAULT 'punches'
  CHECK (count_from IN ('punches', 'joining_date'));


-- count_from is changed only through el_rebuild_apply(), so a switch always comes with the rebuild.
CREATE OR REPLACE FUNCTION public.el_policy_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.count_from IS DISTINCT FROM OLD.count_from
     AND coalesce(current_setting('app.el_rebuild', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'How days are counted can only be changed with the rebuild (Settings, Earned leave).';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := my_profile_id();
  IF NEW.carry_forward_limit IS DISTINCT FROM OLD.carry_forward_limit
     OR NEW.year_start_month IS DISTINCT FROM OLD.year_start_month THEN
    NEW.carry_forward_since := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;
  INSERT INTO el_policy_log (org_id, changed_by, old_policy, new_policy)
  VALUES (NEW.org_id, NEW.updated_by, to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END $function$;

-- ───────── 2. WHERE REPLACED LEDGER ROWS GO ─────────
CREATE TABLE IF NOT EXISTS public.el_ledger_archive (LIKE public.el_ledger INCLUDING DEFAULTS);
ALTER TABLE public.el_ledger_archive
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_reason text;
DO $$ BEGIN
  ALTER TABLE public.el_ledger_archive ADD PRIMARY KEY (id);
EXCEPTION WHEN invalid_table_definition THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS el_ledger_archive_profile_idx ON public.el_ledger_archive (profile_id, period_end);
ALTER TABLE public.el_ledger_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.el_ledger_archive FROM anon, authenticated;
GRANT ALL ON public.el_ledger_archive TO service_role;

-- A rebuild writes its own summary, so the per-credit audit line stays quiet during it.
CREATE OR REPLACE FUNCTION public.audit_el_ledger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('app.skip_audit', true), 'off') = 'on' THEN RETURN NEW; END IF;
  PERFORM audit_write(NEW.org_id, 'leave', 'el.credit', NEW.profile_id, NEW.id,
    format('%s earned %s day(s) of earned leave (%s eligible days, balance %s → %s)',
           audit_name(NEW.profile_id), NEW.credited, NEW.eligible_days, NEW.previous_balance, NEW.new_balance),
    jsonb_build_object('balance', NEW.previous_balance),
    jsonb_build_object('balance', NEW.new_balance, 'period_start', NEW.period_start, 'period_end', NEW.period_end));
  RETURN NEW;
END $$;

-- ───────── 3. TWO WAYS TO LIST THE DAYS THAT COUNT ─────────
-- The existing function (days with attendance) keeps its code under a new name.
DO $$ BEGIN
  IF to_regprocedure('public.el_days_punches(uuid, date)') IS NULL THEN
    ALTER FUNCTION public.el_eligible_days(uuid, date) RENAME TO el_days_punches;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.el_days_joining(p_profile_id uuid, p_after date)
RETURNS SETOF date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT p.id, p.org_id, p.weekly_off, p.joined_on,
           coalesce(pol.exclude_weekly_off, true) AS ex_off,
           coalesce(pol.exclude_holidays, true) AS ex_hol,
           coalesce(pol.count_approved_leave, false) AS cnt_leave,
           coalesce(pol.count_half_day, false) AS cnt_half,
           coalesce(pol.count_during_probation, true) AS cnt_prob,
           pr.start_date AS pr_start,
           CASE WHEN pr.id IS NULL THEN NULL
                WHEN pr.status = 'confirmed' AND pr.decided_at IS NOT NULL
                  THEN least(pr.end_date, (pr.decided_at AT TIME ZONE 'Asia/Kolkata')::date)
                ELSE pr.end_date END AS pr_end
      FROM profiles p
      LEFT JOIN el_policy pol ON pol.org_id = p.org_id
      LEFT JOIN probations pr ON pr.profile_id = p.id
     WHERE p.id = p_profile_id AND p.joined_on IS NOT NULL
  ), days AS (
    SELECT g::date AS d
      FROM me,
           generate_series(greatest(me.joined_on, p_after + 1)::timestamp,
                           ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1)::timestamp, interval '1 day') g
  )
  SELECT days.d
    FROM days, me
   WHERE NOT (me.ex_off AND me.weekly_off IS NOT NULL AND trim(to_char(days.d, 'Day')) = me.weekly_off)
     AND NOT (me.ex_hol AND EXISTS (
           SELECT 1 FROM holidays h WHERE h.org_id = me.org_id AND h.date = days.d))
     AND NOT (NOT me.cnt_prob AND me.pr_start IS NOT NULL AND days.d >= me.pr_start AND days.d < me.pr_end)
     AND NOT EXISTS (
           SELECT 1 FROM leave_requests l
            WHERE l.profile_id = me.id AND l.status = 'approved'
              AND days.d BETWEEN l.from_date AND l.to_date
              AND (l.type = 'lwp' OR NOT me.cnt_leave OR (l.half_day AND NOT me.cnt_half)))
   ORDER BY days.d
$$;
REVOKE ALL ON FUNCTION public.el_days_joining(uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.el_days_joining(uuid, date) TO service_role;

-- The one the credit engine calls: it follows the policy.
CREATE OR REPLACE FUNCTION public.el_eligible_days(p_profile_id uuid, p_after date)
RETURNS SETOF date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Someone with no joining date on record keeps being counted by attendance until HR adds one.
  IF coalesce((SELECT pol.count_from FROM el_policy pol JOIN profiles p ON p.org_id = pol.org_id
                WHERE p.id = p_profile_id), 'punches') = 'joining_date'
     AND (SELECT joined_on FROM profiles WHERE id = p_profile_id) IS NOT NULL THEN
    RETURN QUERY SELECT d FROM el_days_joining(p_profile_id, p_after) d;
  ELSE
    RETURN QUERY SELECT d FROM el_days_punches(p_profile_id, p_after) d;
  END IF;
END $$;

-- ───────── 4. WHAT A REBUILD WOULD DO ─────────
-- The credits a person would have if every working day since joining were counted, in order,
-- with the same cap and the same opening balance the live engine uses.
CREATE OR REPLACE FUNCTION public.el_plan_credits(p_profile_id uuid)
RETURNS TABLE (k integer, period_start date, period_end date, credited integer,
               previous_balance integer, new_balance integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_pol el_policy%ROWTYPE;
  v_dates date[];
  v_bal integer;
  v_blocks integer;
  i integer;
  v_credit integer;
BEGIN
  SELECT org_id, coalesce(opening_earned_leave, 0) INTO v_org, v_bal FROM profiles WHERE id = p_profile_id;
  IF v_org IS NULL THEN RETURN; END IF;
  SELECT * INTO v_pol FROM el_policy WHERE org_id = v_org;
  IF NOT FOUND THEN v_pol.required_days := 20; v_pol.credit_amount := 1; v_pol.max_balance := 30; END IF;

  v_bal := v_bal - coalesce((SELECT sum(amount) FROM el_lapses WHERE profile_id = p_profile_id), 0)::integer;
  SELECT array_agg(d ORDER BY d) INTO v_dates FROM el_days_joining(p_profile_id, date '1900-01-01') d;
  v_blocks := coalesce(array_length(v_dates, 1), 0) / v_pol.required_days;

  FOR i IN 1..v_blocks LOOP
    v_credit := least(v_pol.credit_amount, greatest(v_pol.max_balance - v_bal, 0));
    k := i;
    period_start := v_dates[(i - 1) * v_pol.required_days + 1];
    period_end := v_dates[i * v_pol.required_days];
    credited := v_credit;
    previous_balance := v_bal;
    new_balance := v_bal + v_credit;
    v_bal := v_bal + v_credit;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.el_plan_credits(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.el_plan_credits(uuid) TO service_role;

-- HR / admin: for every active person, today's earned leave against what counting from the
-- joining date would give. Changes nothing.
CREATE OR REPLACE FUNCTION public.el_rebuild_preview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_rows jsonb;
  v_mode text;
BEGIN
  IF NOT (my_role() = ANY (ARRAY['hr', 'admin'])) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT coalesce(count_from, 'punches') INTO v_mode FROM el_policy WHERE org_id = my_org();

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY abs(x.change) DESC, x.full_name), '[]'::jsonb) INTO v_rows FROM (
    SELECT b.profile_id, b.full_name, b.joined_on, b.first_punch, b.opening, b.working_days,
           b.credits_now, b.credits_new, b.lapsed, b.used,
           b.opening + b.credits_now - b.lapsed AS balance_now,
           b.opening + b.credits_new - b.lapsed AS balance_new,
           b.opening + b.credits_now - b.lapsed - b.used AS available_now,
           b.opening + b.credits_new - b.lapsed - b.used AS available_new,
           b.credits_new - b.credits_now AS change,
           CASE WHEN b.joined_on IS NULL THEN 'No joining date: until one is set, this person is still counted by attendance'
                WHEN b.opening > 0 AND b.joined_on < coalesce(b.first_punch, v_today) - 30
                  THEN 'Has an opening balance and joined well before the first attendance: the opening may already include days that are now counted'
                ELSE NULL END AS note
      FROM (
        SELECT p.id AS profile_id, p.full_name, p.joined_on,
               (SELECT min(a.date) FROM attendance a WHERE a.profile_id = p.id) AS first_punch,
               coalesce(p.opening_earned_leave, 0)::integer AS opening,
               (SELECT count(*) FROM el_days_joining(p.id, date '1900-01-01'))::integer AS working_days,
               coalesce((SELECT sum(l.credited) FROM el_ledger l WHERE l.profile_id = p.id), 0)::integer AS credits_now,
               coalesce((SELECT sum(c.credited) FROM el_plan_credits(p.id) c), 0)::integer AS credits_new,
               coalesce((SELECT sum(z.amount) FROM el_lapses z WHERE z.profile_id = p.id), 0)::integer AS lapsed,
               coalesce((SELECT sum(r.days) FROM leave_requests r
                          WHERE r.profile_id = p.id AND r.type = 'earned' AND r.status = 'approved'), 0)::numeric AS used
          FROM profiles p
         WHERE p.org_id = my_org() AND p.status = 'active'
      ) b
  ) x;

  RETURN jsonb_build_object('mode_now', v_mode, 'today', v_today, 'people', v_rows);
END $$;
REVOKE ALL ON FUNCTION public.el_rebuild_preview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.el_rebuild_preview() TO authenticated;

-- HR / admin: switch to counting from the joining date and rebuild every ledger.
-- Old ledger rows are archived, each person is told once, and one audit line is written per person.
CREATE OR REPLACE FUNCTION public.el_rebuild_apply(p_confirm text DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := my_org();
  v_pol el_policy%ROWTYPE;
  p record;
  v_old_credits integer;
  v_old_balance integer;
  v_new_credits integer;
  v_new_balance integer;
  v_open integer;
  v_lapsed integer;
  v_same boolean;
  v_changed integer := 0;
BEGIN
  IF NOT (my_role() = ANY (ARRAY['hr', 'admin'])) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_confirm IS DISTINCT FROM 'REBUILD' THEN
    RAISE EXCEPTION 'Type REBUILD to confirm.';
  END IF;

  PERFORM set_config('app.skip_audit', 'on', true);
  PERFORM set_config('app.el_rebuild', 'on', true);
  INSERT INTO el_policy (org_id) VALUES (v_org) ON CONFLICT DO NOTHING;
  UPDATE el_policy SET count_from = 'joining_date' WHERE org_id = v_org;
  PERFORM set_config('app.el_rebuild', 'off', true);
  SELECT * INTO v_pol FROM el_policy WHERE org_id = v_org;

  FOR p IN SELECT id, full_name, joined_on, coalesce(opening_earned_leave, 0) AS opening
             FROM profiles WHERE org_id = v_org AND status = 'active' AND joined_on IS NOT NULL
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('el:' || p.id::text));

    SELECT coalesce(sum(credited), 0) INTO v_old_credits FROM el_ledger WHERE profile_id = p.id;
    SELECT coalesce(sum(amount), 0) INTO v_lapsed FROM el_lapses WHERE profile_id = p.id;
    v_open := p.opening;
    v_old_balance := v_open + v_old_credits - v_lapsed;

    -- already exactly what the rebuild would write (same periods, same credits)? then leave it alone
    SELECT coalesce((SELECT jsonb_agg(jsonb_build_array(l.period_end, l.credited) ORDER BY l.period_end)
                       FROM el_ledger l WHERE l.profile_id = p.id), '[]'::jsonb)
         = coalesce((SELECT jsonb_agg(jsonb_build_array(c.period_end, c.credited) ORDER BY c.period_end)
                       FROM el_plan_credits(p.id) c), '[]'::jsonb)
      INTO v_same;
    IF v_same THEN CONTINUE; END IF;

    INSERT INTO el_ledger_archive
      SELECT l.*, now(), 'rebuilt from the joining date' FROM el_ledger l WHERE l.profile_id = p.id;
    DELETE FROM el_ledger WHERE profile_id = p.id;

    INSERT INTO el_ledger (org_id, profile_id, period_start, period_end, eligible_days, amount, credited,
                           previous_balance, new_balance, policy, source)
    SELECT v_org, p.id, c.period_start, c.period_end, v_pol.required_days, v_pol.credit_amount, c.credited,
           c.previous_balance, c.new_balance, to_jsonb(v_pol) - 'updated_at' - 'updated_by', 'rebuild'
      FROM el_plan_credits(p.id) c;

    SELECT coalesce(sum(credited), 0) INTO v_new_credits FROM el_ledger WHERE profile_id = p.id;
    v_new_balance := v_open + v_new_credits - v_lapsed;

    PERFORM audit_write(v_org, 'leave', 'el.rebuild', p.id, p.id,
      format('%s rebuilt %s''s earned leave from the joining date (%s): credits %s → %s, balance %s → %s',
             audit_actor(), p.full_name, to_char(p.joined_on, 'FMDD Mon YYYY'),
             v_old_credits, v_new_credits, v_old_balance, v_new_balance),
      jsonb_build_object('credits', v_old_credits, 'balance', v_old_balance),
      jsonb_build_object('credits', v_new_credits, 'balance', v_new_balance, 'count_from', 'joining_date'));

    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (v_org, p.id, 'Your earned leave was recalculated',
            format('It is now counted from your joining date. Earned so far: %s day(s) (it was %s). The Leave page shows every line.',
                   v_new_credits + v_open, v_old_credits + v_open),
            '/leave');
    v_changed := v_changed + 1;
  END LOOP;

  PERFORM set_config('app.skip_audit', 'off', true);

  -- anyone who is now due a credit at the normal rate (should be none)
  FOR p IN SELECT id FROM profiles WHERE org_id = v_org AND status = 'active' LOOP
    PERFORM el_run_credits(p.id, false, 'rebuild');
  END LOOP;
  RETURN v_changed;
END $$;
REVOKE ALL ON FUNCTION public.el_rebuild_apply(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.el_rebuild_apply(text) TO authenticated;

-- ───────── 5. THE LEDGER AS AN ACCOUNT ─────────
-- Opening balance, each credit (on the day it was earned), lapses, and earned leave used,
-- with the balance after every line. Pending requests are listed without changing the balance.
CREATE OR REPLACE FUNCTION public.el_ledger_for(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_hr boolean := my_role() = ANY (ARRAY['hr', 'admin']);
  v_joined date;
  v_open integer;
BEGIN
  IF v_target IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF NOT (v_target = my_profile_id() OR manages(v_target) OR v_hr) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT coalesce(joined_on, created_at::date), coalesce(opening_earned_leave, 0) INTO v_joined, v_open
    FROM profiles WHERE id = v_target;

  RETURN coalesce((
    SELECT jsonb_agg(
             e.j || jsonb_build_object('available_after', e.running)
             ORDER BY e.sort_on DESC, e.ord DESC, e.created_at DESC) FROM (
      SELECT a.*, sum(a.delta) OVER (ORDER BY a.sort_on, a.ord, a.created_at
                                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
        FROM (
          SELECT v_joined AS sort_on, 0 AS ord, now() AS created_at, v_open AS delta,
                 jsonb_build_object('id', v_target, 'kind', 'opening', 'credited_on', v_joined,
                                    'amount', v_open, 'credited', v_open, 'delta', v_open,
                                    'previous_balance', NULL, 'new_balance', NULL) AS j
           WHERE v_open > 0
          UNION ALL
          SELECT l.period_end, 1, l.created_at, l.credited,
                 jsonb_build_object('id', l.id, 'kind', 'credit', 'credited_on', l.period_end,
                                    'amount', l.amount, 'credited', l.credited, 'delta', l.credited,
                                    'previous_balance', l.previous_balance, 'new_balance', l.new_balance)
                 || CASE WHEN v_hr THEN jsonb_build_object(
                      'period_start', l.period_start, 'period_end', l.period_end,
                      'eligible_days', l.eligible_days, 'policy', l.policy, 'source', l.source)
                    ELSE '{}'::jsonb END
            FROM el_ledger l WHERE l.profile_id = v_target
          UNION ALL
          SELECT z.lapse_on, 2, z.created_at, -z.amount,
                 jsonb_build_object('id', z.id, 'kind', 'lapse', 'credited_on', z.lapse_on,
                                    'amount', z.amount, 'credited', -z.amount, 'delta', -z.amount,
                                    'previous_balance', NULL, 'new_balance', NULL, 'carry_limit', z.carry_limit)
            FROM el_lapses z WHERE z.profile_id = v_target
          UNION ALL
          SELECT r.from_date, 3, r.created_at, -r.days,
                 jsonb_build_object('id', r.id, 'kind', 'used', 'credited_on', r.from_date,
                                    'amount', r.days, 'credited', -r.days, 'delta', -r.days,
                                    'previous_balance', NULL, 'new_balance', NULL,
                                    'to_date', r.to_date, 'half_day', r.half_day)
            FROM leave_requests r
           WHERE r.profile_id = v_target AND r.type = 'earned' AND r.status = 'approved'
          UNION ALL
          SELECT r.from_date, 4, r.created_at, 0,
                 jsonb_build_object('id', r.id, 'kind', 'pending', 'credited_on', r.from_date,
                                    'amount', r.days, 'credited', 0, 'delta', 0,
                                    'previous_balance', NULL, 'new_balance', NULL,
                                    'to_date', r.to_date, 'half_day', r.half_day)
            FROM leave_requests r
           WHERE r.profile_id = v_target AND r.type = 'earned' AND r.status = 'pending'
        ) a
    ) e), '[]'::jsonb);
END $$;

-- ───────── 6. THE SUMMARY: HOW MANY DAYS, AND FROM WHEN ─────────
CREATE OR REPLACE FUNCTION public.attendance_summary(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_opening int; v_days int; v_earned int; v_streak int := 0;
  v_marked boolean; v_comp int; v_last date;
  v_req int; v_after date; v_progress int; v_total int; v_mode text; v_joined date;
  v_today_row attendance%ROWTYPE;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = v_me OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT opening_earned_leave, joined_on INTO v_opening, v_joined FROM profiles WHERE id = v_target;
  IF v_opening IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_days FROM attendance WHERE profile_id = v_target AND date <= v_today;

  SELECT v_opening + coalesce(sum(credited), 0), coalesce(max(period_end), date '1900-01-01')
    INTO v_earned, v_after FROM el_ledger WHERE profile_id = v_target;
  v_earned := v_earned - coalesce((SELECT sum(amount) FROM el_lapses WHERE profile_id = v_target), 0)::int;

  SELECT coalesce((SELECT required_days FROM el_policy pol JOIN profiles p ON p.org_id = pol.org_id
                    WHERE p.id = v_target), 20) INTO v_req;
  SELECT coalesce((SELECT count_from FROM el_policy pol JOIN profiles p ON p.org_id = pol.org_id
                    WHERE p.id = v_target), 'punches') INTO v_mode;
  SELECT count(*) INTO v_progress FROM public.el_eligible_days(v_target, v_after);
  SELECT count(*) INTO v_total FROM public.el_eligible_days(v_target, date '1900-01-01');

  SELECT * INTO v_today_row FROM attendance WHERE profile_id = v_target AND date = v_today;
  v_marked := v_today_row.id IS NOT NULL;

  SELECT count(*) INTO v_comp
    FROM comp_off_credits WHERE profile_id = v_target AND consumed = false;

  SELECT max(date) INTO v_last FROM attendance WHERE profile_id = v_target AND date <= v_today;
  IF v_last = v_today THEN
    SELECT count(*) INTO v_streak FROM (
      SELECT date, row_number() OVER (ORDER BY date DESC) AS rn
        FROM attendance WHERE profile_id = v_target AND date <= v_today
    ) d WHERE d.date = v_today - ((d.rn - 1)::int);
  END IF;

  RETURN jsonb_build_object(
    'profile_id', v_target, 'today', v_today, 'marked_today', v_marked,
    'days_marked', v_days, 'opening_earned_leave', v_opening,
    'earned_available', v_earned,
    'to_next_leave', v_req - (v_progress % v_req),
    'el_required_days', v_req,
    'el_progress', v_progress % v_req,
    'el_days_total', v_total,
    'count_from', v_mode,
    'joined_on', v_joined,
    'streak', v_streak, 'comp_off_available', v_comp,
    'today_status', CASE WHEN v_marked THEN v_today_row.status ELSE NULL END,
    'checked_out', v_today_row.check_out_at IS NOT NULL,
    'check_out_at', v_today_row.check_out_at);
END $$;
