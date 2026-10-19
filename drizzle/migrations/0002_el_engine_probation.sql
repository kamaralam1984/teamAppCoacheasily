-- ═══ EARNED LEAVE ENGINE + PROBATION ═══
-- 1. el_policy / el_policy_log  — HR-configurable rule, every change logged
-- 2. el_ledger                  — one auditable row per automatic credit
-- 3. el_run_credits()           — idempotent credit engine; cron + mark_attendance call it
-- 4. attendance_summary()       — earned balance now comes from the ledger
-- 5. probations / decisions     — end date, 7-day reminder, confirm / extend / review

-- ───────── 1. POLICY ─────────
CREATE TABLE public.el_policy (
  org_id uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  required_days integer NOT NULL DEFAULT 20 CHECK (required_days BETWEEN 1 AND 365),
  credit_amount integer NOT NULL DEFAULT 1 CHECK (credit_amount BETWEEN 1 AND 30),
  exclude_weekly_off boolean NOT NULL DEFAULT true,
  exclude_holidays boolean NOT NULL DEFAULT true,
  count_approved_leave boolean NOT NULL DEFAULT false,
  max_balance integer NOT NULL DEFAULT 30 CHECK (max_balance BETWEEN 1 AND 365),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

CREATE TABLE public.el_policy_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_policy jsonb NOT NULL,
  new_policy jsonb NOT NULL
);

INSERT INTO public.el_policy (org_id) SELECT id FROM public.organisations ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.el_policy_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := my_profile_id();
  INSERT INTO el_policy_log (org_id, changed_by, old_policy, new_policy)
  VALUES (NEW.org_id, NEW.updated_by, to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END $$;

CREATE TRIGGER el_policy_audit BEFORE UPDATE ON public.el_policy
  FOR EACH ROW WHEN (to_jsonb(OLD) - 'updated_at' - 'updated_by' IS DISTINCT FROM to_jsonb(NEW) - 'updated_at' - 'updated_by')
  EXECUTE FUNCTION public.el_policy_audit();

ALTER TABLE public.el_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.el_policy_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.el_policy TO authenticated;
GRANT SELECT ON public.el_policy_log TO authenticated;
GRANT ALL ON public.el_policy, public.el_policy_log TO service_role;

CREATE POLICY "read org el policy" ON public.el_policy
  FOR SELECT TO authenticated USING (org_id = public.my_org());
CREATE POLICY "hr admin update el policy" ON public.el_policy
  FOR UPDATE TO authenticated
  USING (org_id = public.my_org() AND public.my_role() = ANY (ARRAY['hr','admin']))
  WITH CHECK (org_id = public.my_org() AND public.my_role() = ANY (ARRAY['hr','admin']));
CREATE POLICY "hr admin read el policy log" ON public.el_policy_log
  FOR SELECT TO authenticated
  USING (org_id = public.my_org() AND public.my_role() = ANY (ARRAY['hr','admin']));

-- ───────── 2. LEDGER (service-role only; read through el_ledger_for) ─────────
CREATE TABLE public.el_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  eligible_days integer NOT NULL,
  amount integer NOT NULL,
  credited integer NOT NULL,
  previous_balance integer NOT NULL,
  new_balance integer NOT NULL,
  policy jsonb NOT NULL,
  source text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  -- the same qualifying period can never be credited twice
  CONSTRAINT el_ledger_one_credit_per_period UNIQUE (profile_id, period_end)
);
CREATE INDEX el_ledger_profile_idx ON public.el_ledger (profile_id, period_end DESC);
ALTER TABLE public.el_ledger ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.el_ledger TO service_role;

-- ───────── 3. ENGINE ─────────
-- Days that count towards the next credit: attendance days (plus approved full-day leave
-- when the policy says so) after p_after, minus weekly offs / holidays per policy.
CREATE OR REPLACE FUNCTION public.el_eligible_days(p_profile_id uuid, p_after date)
RETURNS SETOF date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT p.id, p.org_id, p.weekly_off,
           coalesce(pol.exclude_weekly_off, true) AS ex_off,
           coalesce(pol.exclude_holidays, true) AS ex_hol,
           coalesce(pol.count_approved_leave, false) AS cnt_leave
      FROM profiles p LEFT JOIN el_policy pol ON pol.org_id = p.org_id
     WHERE p.id = p_profile_id
  ), days AS (
    SELECT a.date AS d FROM attendance a WHERE a.profile_id = p_profile_id
    UNION
    SELECT g::date
      FROM me
      JOIN leave_requests l ON l.profile_id = me.id AND me.cnt_leave
       AND l.status = 'approved' AND l.type <> 'lwp' AND l.half_day = false
      CROSS JOIN LATERAL generate_series(l.from_date, l.to_date, interval '1 day') g
  )
  SELECT days.d
    FROM days, me
   WHERE days.d > p_after
     AND days.d <= (now() AT TIME ZONE 'Asia/Kolkata')::date
     AND NOT (me.ex_off AND me.weekly_off IS NOT NULL AND trim(to_char(days.d, 'Day')) = me.weekly_off)
     AND NOT (me.ex_hol AND EXISTS (
           SELECT 1 FROM holidays h WHERE h.org_id = me.org_id AND h.date = days.d))
   ORDER BY days.d
$$;

CREATE OR REPLACE FUNCTION public.el_run_credits(
  p_profile_id uuid, p_notify boolean DEFAULT true, p_source text DEFAULT 'system')
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid; v_open integer; v_status text;
  v_pol el_policy%ROWTYPE;
  v_after date; v_bal integer;
  v_dates date[]; v_blocks integer; v_k integer;
  v_start date; v_end date; v_credit integer; v_made integer := 0;
BEGIN
  SELECT org_id, opening_earned_leave, status INTO v_org, v_open, v_status
    FROM profiles WHERE id = p_profile_id;
  IF v_org IS NULL OR v_status <> 'active' THEN RETURN 0; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('el:' || p_profile_id::text));

  INSERT INTO el_policy (org_id) VALUES (v_org) ON CONFLICT DO NOTHING;
  SELECT * INTO v_pol FROM el_policy WHERE org_id = v_org;

  -- Counting resumes the day after the last credited period, so a policy change only
  -- affects days that haven't been credited yet; earlier credits stay as they were.
  SELECT period_end, new_balance INTO v_after, v_bal
    FROM el_ledger WHERE profile_id = p_profile_id ORDER BY period_end DESC LIMIT 1;
  IF NOT FOUND THEN v_after := date '1900-01-01'; v_bal := coalesce(v_open, 0); END IF;

  SELECT array_agg(e ORDER BY e) INTO v_dates FROM public.el_eligible_days(p_profile_id, v_after) e;
  v_blocks := coalesce(array_length(v_dates, 1), 0) / v_pol.required_days;

  FOR v_k IN 1..v_blocks LOOP
    v_start := v_dates[(v_k - 1) * v_pol.required_days + 1];
    v_end := v_dates[v_k * v_pol.required_days];
    v_credit := least(v_pol.credit_amount, greatest(v_pol.max_balance - v_bal, 0));

    INSERT INTO el_ledger (org_id, profile_id, period_start, period_end, eligible_days,
                           amount, credited, previous_balance, new_balance, policy, source)
    VALUES (v_org, p_profile_id, v_start, v_end, v_pol.required_days,
            v_pol.credit_amount, v_credit, v_bal, v_bal + v_credit,
            to_jsonb(v_pol) - 'updated_at' - 'updated_by', p_source)
    ON CONFLICT (profile_id, period_end) DO NOTHING;

    IF FOUND THEN
      v_made := v_made + 1;
      v_bal := v_bal + v_credit;
      IF p_notify AND v_credit > 0 THEN
        INSERT INTO notifications (org_id, profile_id, title, body, link)
        VALUES (v_org, p_profile_id,
                format('+%s earned leave credited', v_credit),
                format('You completed %s working days. Your earned leave balance is now %s.',
                       v_pol.required_days, v_bal),
                '/leave');
      END IF;
    END IF;
  END LOOP;

  RETURN v_made;
END $$;

CREATE OR REPLACE FUNCTION public.el_run_all() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n integer := 0;
BEGIN
  FOR r IN SELECT id FROM profiles WHERE status = 'active' LOOP
    v_n := v_n + el_run_credits(r.id);
  END LOOP;
  RETURN v_n;
END $$;

-- HR/Admin "recalculate now" for their own organisation.
CREATE OR REPLACE FUNCTION public.el_recalculate() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n integer := 0;
BEGIN
  IF NOT (my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  FOR r IN SELECT id FROM profiles WHERE status = 'active' AND org_id = my_org() LOOP
    v_n := v_n + el_run_credits(r.id);
  END LOOP;
  RETURN v_n;
END $$;

-- The ledger, as the viewer is allowed to see it. HR/Admin also get the calculation.
CREATE OR REPLACE FUNCTION public.el_ledger_for(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_hr boolean := my_role() = ANY (ARRAY['hr','admin']);
BEGIN
  IF v_target IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF NOT (v_target = my_profile_id() OR manages(v_target) OR v_hr) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'credited_on', (l.created_at AT TIME ZONE 'Asia/Kolkata')::date,
        'amount', l.amount, 'credited', l.credited,
        'previous_balance', l.previous_balance, 'new_balance', l.new_balance)
      || CASE WHEN v_hr THEN jsonb_build_object(
           'period_start', l.period_start, 'period_end', l.period_end,
           'eligible_days', l.eligible_days, 'policy', l.policy, 'source', l.source)
         ELSE '{}'::jsonb END
      ORDER BY l.period_end DESC)
    FROM el_ledger l WHERE l.profile_id = v_target), '[]'::jsonb);
END $$;

-- ───────── 4. SUMMARY + MARK ATTENDANCE read the ledger ─────────
CREATE OR REPLACE FUNCTION public.attendance_summary(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_opening int; v_days int; v_earned int; v_streak int := 0;
  v_marked boolean; v_comp int; v_last date;
  v_req int; v_after date; v_progress int;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = v_me OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT opening_earned_leave INTO v_opening FROM profiles WHERE id = v_target;
  IF v_opening IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_days FROM attendance WHERE profile_id = v_target AND date <= v_today;

  SELECT v_opening + coalesce(sum(credited), 0), coalesce(max(period_end), date '1900-01-01')
    INTO v_earned, v_after FROM el_ledger WHERE profile_id = v_target;
  SELECT coalesce((SELECT required_days FROM el_policy pol JOIN profiles p ON p.org_id = pol.org_id
                    WHERE p.id = v_target), 20) INTO v_req;
  SELECT count(*) INTO v_progress FROM public.el_eligible_days(v_target, v_after);

  SELECT EXISTS (SELECT 1 FROM attendance WHERE profile_id = v_target AND date = v_today)
    INTO v_marked;
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
    'streak', v_streak, 'comp_off_available', v_comp);
END $$;

CREATE OR REPLACE FUNCTION public.mark_attendance(p_focus text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_me uuid := my_profile_id();
  v_org uuid;
  v_row attendance%ROWTYPE;
  v_reason text;
  v_summary jsonb;
  v_days int;
  v_credited int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = v_me;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Your profile isn''t set up yet.'; END IF;

  INSERT INTO attendance (profile_id, org_id, focus)
  VALUES (v_me, v_org, nullif(btrim(coalesce(p_focus, '')), ''))
  RETURNING * INTO v_row;

  SELECT reason INTO v_reason
    FROM comp_off_credits WHERE profile_id = v_me AND earned_on = v_row.date LIMIT 1;

  v_credited := el_run_credits(v_me);
  v_summary := attendance_summary(v_me);
  v_days := coalesce((v_summary->>'days_marked')::int, 0);

  RETURN jsonb_build_object(
    'date', v_row.date,
    'at', to_char(v_row.marked_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI'),
    'onTime', coalesce(v_row.on_time, true),
    'compOffReason', v_reason,
    'daysMarked', v_days,
    'milestone', v_credited > 0,
    'summary', v_summary);
END;
$function$;

-- ───────── 5. PROBATION ─────────
CREATE TABLE public.probations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  duration_months integer NOT NULL DEFAULT 3 CHECK (duration_months BETWEEN 1 AND 36),
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'on_probation'
    CHECK (status IN ('on_probation','under_review','confirmed')),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.probation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('confirm','extend','review')),
  previous_end date,
  new_end date,
  extension_months integer,
  note text,
  decided_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- one reminder per (probation, end date, kind): an extension gets its own fresh reminder
CREATE TABLE public.probation_reminders (
  probation_id uuid NOT NULL REFERENCES public.probations(id) ON DELETE CASCADE,
  end_date date NOT NULL,
  kind text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (probation_id, end_date, kind)
);

ALTER TABLE public.probations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probation_reminders ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.probations, public.probation_decisions, public.probation_reminders TO service_role;

CREATE OR REPLACE FUNCTION public.probation_tick() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n integer := 0; v_rows integer; r record;
BEGIN
  -- Everyone with a joining date gets a probation row. People whose 3 months were over
  -- before this feature existed are recorded as already confirmed (no decision is invented).
  INSERT INTO probations (org_id, profile_id, start_date, duration_months, end_date, status)
  SELECT p.org_id, p.id, p.joined_on, 3, (p.joined_on + interval '3 months')::date,
         CASE WHEN (p.joined_on + interval '3 months')::date <= v_today
              THEN 'confirmed' ELSE 'on_probation' END
    FROM profiles p
   WHERE p.status = 'active' AND p.joined_on IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM probations x WHERE x.profile_id = p.id)
  ON CONFLICT (profile_id) DO NOTHING;

  FOR r IN
    SELECT pr.id, pr.org_id, pr.profile_id, pr.end_date, p.full_name, p.manager_id,
           CASE WHEN pr.end_date < v_today THEN 'ended' ELSE '7d' END AS kind
      FROM probations pr JOIN profiles p ON p.id = pr.profile_id
     WHERE pr.status = 'on_probation' AND p.status = 'active'
       AND pr.end_date <= v_today + 7
  LOOP
    INSERT INTO probation_reminders (probation_id, end_date, kind)
    VALUES (r.id, r.end_date, r.kind) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 1 THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      SELECT r.org_id, t.id,
             CASE WHEN r.kind = 'ended'
                  THEN format('%s''s probation period has ended', r.full_name)
                  ELSE format('%s''s probation ends on %s', r.full_name, to_char(r.end_date, 'FMDD Mon')) END,
             'Confirm, extend or mark for review.', '/warriors'
        FROM profiles t
       WHERE t.org_id = r.org_id AND t.status = 'active' AND t.id <> r.profile_id
         AND (t.role = ANY (ARRAY['hr','admin']) OR t.id = r.manager_id);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.probation_overview() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF v_me IS NULL THEN RETURN '[]'::jsonb; END IF;
  PERFORM probation_tick();
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
        'profile_id', pr.profile_id, 'full_name', p.full_name, 'department', p.department,
        'manager_id', p.manager_id, 'start_date', pr.start_date, 'end_date', pr.end_date,
        'duration_months', pr.duration_months, 'status', pr.status,
        'days_left', pr.end_date - v_today) ORDER BY pr.end_date)
      FROM probations pr JOIN profiles p ON p.id = pr.profile_id
     WHERE pr.org_id = my_org() AND p.status = 'active'
       AND (pr.profile_id = v_me OR manages(pr.profile_id)
            OR my_role() = ANY (ARRAY['hr','admin']))), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.probation_history(p_profile_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (p_profile_id = my_profile_id() OR manages(p_profile_id)
          OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'decision', d.decision, 'previous_end', d.previous_end,
        'new_end', d.new_end, 'extension_months', d.extension_months, 'note', d.note,
        'decided_by', b.full_name, 'created_at', d.created_at) ORDER BY d.created_at DESC)
      FROM probation_decisions d LEFT JOIN profiles b ON b.id = d.decided_by
     WHERE d.profile_id = p_profile_id), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.probation_decide(
  p_profile_id uuid, p_decision text, p_months integer DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_pr probations%ROWTYPE;
  v_new_end date;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_profile_id = v_me THEN RAISE EXCEPTION 'You cannot decide your own probation.'; END IF;
  IF NOT (manages(p_profile_id) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_decision NOT IN ('confirm','extend','review') THEN RAISE EXCEPTION 'Unknown decision.'; END IF;

  PERFORM probation_tick();
  SELECT * INTO v_pr FROM probations WHERE profile_id = p_profile_id AND org_id = my_org() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This person has no probation record.'; END IF;
  IF v_pr.status = 'confirmed' THEN RAISE EXCEPTION 'Already confirmed.'; END IF;

  v_new_end := v_pr.end_date;
  IF p_decision = 'extend' THEN
    IF p_months IS NULL OR p_months < 1 OR p_months > 12 THEN
      RAISE EXCEPTION 'Choose an extension of 1 to 12 months.';
    END IF;
    v_new_end := (v_pr.end_date + make_interval(months => p_months))::date;
    UPDATE probations SET end_date = v_new_end, duration_months = duration_months + p_months,
           status = 'on_probation' WHERE id = v_pr.id;
  ELSIF p_decision = 'confirm' THEN
    UPDATE probations SET status = 'confirmed', decided_at = now() WHERE id = v_pr.id;
    INSERT INTO profile_milestones (org_id, profile_id, kind, effective_on, note, recorded_by)
    VALUES (v_pr.org_id, p_profile_id, 'confirmed', v_today, nullif(btrim(coalesce(p_note, '')), ''), v_me);
  ELSE
    UPDATE probations SET status = 'under_review' WHERE id = v_pr.id;
  END IF;

  INSERT INTO probation_decisions (org_id, profile_id, decision, previous_end, new_end,
                                   extension_months, note, decided_by)
  VALUES (v_pr.org_id, p_profile_id, p_decision, v_pr.end_date, v_new_end,
          CASE WHEN p_decision = 'extend' THEN p_months END,
          nullif(btrim(coalesce(p_note, '')), ''), v_me);

  INSERT INTO notifications (org_id, profile_id, title, body, link)
  VALUES (v_pr.org_id, p_profile_id,
          CASE p_decision WHEN 'confirm' THEN 'Your probation is confirmed'
                          WHEN 'extend' THEN 'Your probation has been extended'
                          ELSE 'Your probation is under review' END,
          CASE p_decision WHEN 'extend'
               THEN format('New probation end date: %s.', to_char(v_new_end, 'FMDD Mon YYYY'))
               ELSE NULL END,
          '/profile');

  RETURN jsonb_build_object('status', (SELECT status FROM probations WHERE id = v_pr.id),
                            'end_date', v_new_end);
END $$;

-- ───────── GRANTS ─────────
REVOKE ALL ON FUNCTION public.el_eligible_days(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.el_run_credits(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.el_run_all() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.probation_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.el_recalculate() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.el_ledger_for(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.probation_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.probation_history(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.probation_decide(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.el_recalculate() TO authenticated;
GRANT EXECUTE ON FUNCTION public.el_ledger_for(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.probation_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.probation_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.probation_decide(uuid, text, integer, text) TO authenticated;

-- ───────── BACKFILL (quiet: no notifications for historic credits) + SCHEDULE ─────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE status = 'active' LOOP
    PERFORM public.el_run_credits(r.id, false, 'backfill');
  END LOOP;
  PERFORM public.probation_tick();
END $$;

SELECT cron.schedule('ce-el-credits', '10 18 * * *', $$SELECT public.el_run_all()$$);
SELECT cron.schedule('ce-probation-tick', '20 18 * * *', $$SELECT public.probation_tick()$$);
