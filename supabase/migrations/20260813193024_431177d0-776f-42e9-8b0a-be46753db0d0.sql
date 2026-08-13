
-- ─────────────────────────────────────────────── table
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  type text NOT NULL CHECK (type IN ('casual','sick','earned','comp_off','maternity','lwp')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  days numeric NOT NULL DEFAULT 1,
  half_day boolean NOT NULL DEFAULT false,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approver_id uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.profiles(id),
  handover_to uuid REFERENCES public.profiles(id),
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leave_requests_profile_idx ON public.leave_requests (profile_id, from_date DESC);
CREATE INDEX leave_requests_pending_idx ON public.leave_requests (status, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or downline leave" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (org_id = my_org() AND (
    profile_id = my_profile_id()
    OR approver_id = my_profile_id()
    OR manages(profile_id)
    OR my_role() = ANY (ARRAY['hr','admin'])
  ));

CREATE POLICY "apply for own leave" ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND profile_id = my_profile_id() AND status = 'pending');

CREATE POLICY "decide or amend leave" ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (org_id = my_org() AND (
    approver_id = my_profile_id()
    OR manages(profile_id)
    OR my_role() = ANY (ARRAY['hr','admin'])
    OR (profile_id = my_profile_id() AND status = 'pending')
  ))
  WITH CHECK (org_id = my_org());

CREATE POLICY "withdraw own pending leave" ON public.leave_requests
  FOR DELETE TO authenticated
  USING (org_id = my_org() AND profile_id = my_profile_id() AND status = 'pending');

CREATE OR REPLACE FUNCTION public.leave_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER leave_requests_touch
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

-- ─────────────────────────────────────────── approver routing
CREATE OR REPLACE FUNCTION public.leave_approver_for(p_profile_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mgr uuid; v_org uuid;
BEGIN
  SELECT manager_id, org_id INTO v_mgr, v_org FROM profiles WHERE id = p_profile_id;
  IF v_mgr IS NOT NULL THEN
    PERFORM 1 FROM profiles WHERE id = v_mgr AND status = 'active';
    IF FOUND THEN RETURN v_mgr; END IF;
  END IF;
  SELECT id INTO v_mgr FROM profiles
   WHERE org_id = v_org AND status = 'active' AND role IN ('hr','admin') AND id <> p_profile_id
   ORDER BY CASE role WHEN 'hr' THEN 0 ELSE 1 END, created_at LIMIT 1;
  RETURN v_mgr;
END $$;

-- ─────────────────────────────────────────── the sandwich rule
-- returns a human message when the request touches a weekly off or another leave
CREATE OR REPLACE FUNCTION public.leave_sandwich_conflict(
  p_profile_id uuid, p_from date, p_to date, p_exclude uuid DEFAULT NULL
) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid; v_off text; d date; guard int;
BEGIN
  SELECT org_id, weekly_off INTO v_org, v_off FROM profiles WHERE id = p_profile_id;

  -- walk backwards then forwards, skipping public holidays
  FOR guard IN 1..2 LOOP
    d := CASE WHEN guard = 1 THEN p_from - 1 ELSE p_to + 1 END;
    WHILE EXISTS (SELECT 1 FROM holidays WHERE org_id = v_org AND date = d) LOOP
      d := CASE WHEN guard = 1 THEN d - 1 ELSE d + 1 END;
    END LOOP;

    IF v_off IS NOT NULL AND trim(to_char(d, 'Day')) = v_off THEN
      RETURN 'Sandwich leave isn''t allowed — this sits right next to your weekly off ('
             || v_off || '). Only a public holiday may sit between.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM leave_requests r
       WHERE r.profile_id = p_profile_id
         AND r.status IN ('pending','approved')
         AND (p_exclude IS NULL OR r.id <> p_exclude)
         AND d BETWEEN r.from_date AND r.to_date
    ) THEN
      RETURN 'Sandwich leave isn''t allowed — this sits right next to another of your leaves. Only a public holiday may sit between.';
    END IF;
  END LOOP;

  RETURN NULL;
END $$;

-- ─────────────────────────────────────────── one source of truth
CREATE OR REPLACE FUNCTION public.leave_balances(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_me uuid := my_profile_id();
  v_year int := extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int;
  v_earned int := 0;
  v_comp_total int := 0;
  v_comp_open int := 0;
  v_summary jsonb;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_entitled numeric;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = v_me OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_summary := attendance_summary(v_target);
  v_earned := coalesce((v_summary->>'earned_available')::int, 0);

  SELECT count(*), count(*) FILTER (WHERE consumed = false)
    INTO v_comp_total, v_comp_open
    FROM comp_off_credits WHERE profile_id = v_target;

  FOR r IN SELECT unnest(ARRAY['casual','sick','earned','comp_off']) AS t LOOP
    v_entitled := CASE r.t
      WHEN 'casual' THEN 8
      WHEN 'sick' THEN 6
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

  -- balance pass
  SELECT jsonb_agg(
    e || jsonb_build_object('balance', GREATEST(
      CASE WHEN e->>'type' = 'comp_off'
           THEN v_comp_open - (e->>'pending')::numeric
           ELSE (e->>'entitled')::numeric - (e->>'used')::numeric - (e->>'pending')::numeric
      END, 0))
  ) INTO v_out FROM jsonb_array_elements(v_out) e;

  RETURN v_out;
END $$;

-- ─────────────────────────────────────────── live validation for the form
CREATE OR REPLACE FUNCTION public.leave_check(
  p_type text, p_from date, p_to date, p_half boolean DEFAULT false,
  p_profile_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
BEGIN
  IF v_target IS NULL THEN RETURN jsonb_build_object('errors','[]'::jsonb,'warnings','[]'::jsonb,'days',0); END IF;
  IF NOT (v_target = my_profile_id() OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_to < p_from THEN
    v_errors := v_errors || 'The last day cannot be before the first day.';
    RETURN jsonb_build_object('errors', to_jsonb(v_errors), 'warnings', to_jsonb(v_warnings), 'days', 0);
  END IF;

  v_days := CASE WHEN p_half THEN 0.5 ELSE (p_to - p_from) + 1 END;
  v_balances := leave_balances(v_target);
  v_notice := p_from - (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT (e->>'balance')::numeric INTO v_bal
    FROM jsonb_array_elements(v_balances) e WHERE e->>'type' = p_type;

  IF p_type = 'casual' THEN
    v_quarter := extract(quarter FROM p_from)::int;
    SELECT coalesce(sum(days), 0) INTO v_qcount FROM leave_requests
      WHERE profile_id = v_target AND type = 'casual' AND status IN ('pending','approved')
        AND extract(year FROM from_date) = extract(year FROM p_from)
        AND extract(quarter FROM from_date) = v_quarter;
    IF v_qcount + v_days > 2 THEN
      v_errors := v_errors || format(
        'Casual leave is capped at 2 per quarter. You already have %s in Q%s.', v_qcount, v_quarter);
    END IF;
    IF v_notice < 7 THEN
      v_warnings := v_warnings || 'This is less than 7 days'' notice — please give your team a heads-up.';
    END IF;
  END IF;

  IF p_type = 'earned' THEN
    v_summary := attendance_summary(v_target);
    IF coalesce(v_bal, 0) <= 0 THEN
      v_errors := v_errors || format(
        'You have no earned leave yet — 1 is earned for every 20 days worked. You are at %s day(s) in the app.',
        coalesce((v_summary->>'days_marked')::int, 0));
    END IF;
    IF v_notice < 30 THEN
      v_warnings := v_warnings || 'Earned leave usually needs 30 days'' notice so cover can be planned.';
    END IF;
  END IF;

  IF p_type IN ('casual','sick','earned','comp_off') AND coalesce(v_bal, 0) > 0 AND v_days > v_bal THEN
    v_warnings := v_warnings || format(
      'Only %s %s left — the extra %s day(s) will be Leave Without Pay.',
      v_bal, replace(p_type, '_', '-'), v_days - v_bal);
  END IF;

  IF p_type = 'comp_off' AND coalesce(v_bal, 0) <= 0 THEN
    v_errors := v_errors || 'You have no comp-offs in hand yet.';
  END IF;

  -- sick leave never carries friction
  IF p_type <> 'sick' THEN
    v_msg := leave_sandwich_conflict(v_target, p_from, p_to, NULL);
    IF v_msg IS NOT NULL THEN v_errors := v_errors || v_msg; END IF;
  ELSE
    v_warnings := '{}';
  END IF;

  RETURN jsonb_build_object(
    'errors', to_jsonb(v_errors), 'warnings', to_jsonb(v_warnings), 'days', v_days);
END $$;

-- ─────────────────────────────────────────── enforce on write
CREATE OR REPLACE FUNCTION public.leave_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bal numeric; v_q numeric; v_msg text; v_days numeric;
BEGIN
  IF NEW.to_date < NEW.from_date THEN
    RAISE EXCEPTION 'The last day cannot be before the first day.';
  END IF;

  NEW.days := CASE WHEN NEW.half_day THEN 0.5 ELSE (NEW.to_date - NEW.from_date) + 1 END;
  v_days := NEW.days;

  IF TG_OP = 'INSERT' OR NEW.from_date <> OLD.from_date OR NEW.to_date <> OLD.to_date
     OR NEW.type <> OLD.type THEN

    IF NEW.type = 'casual' THEN
      SELECT coalesce(sum(days), 0) INTO v_q FROM leave_requests
        WHERE profile_id = NEW.profile_id AND type = 'casual' AND status IN ('pending','approved')
          AND id <> NEW.id
          AND extract(year FROM from_date) = extract(year FROM NEW.from_date)
          AND extract(quarter FROM from_date) = extract(quarter FROM NEW.from_date);
      IF v_q + v_days > 2 THEN
        RAISE EXCEPTION 'Casual leave is capped at 2 per quarter. You already have % in Q%.',
          v_q, extract(quarter FROM NEW.from_date)::int;
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
END $$;

CREATE TRIGGER leave_before_write_trg
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.leave_before_write();

-- ─────────────────────────────────────────── notifications + comp-off consumption
CREATE OR REPLACE FUNCTION public.leave_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text; v_label text; v_needed numeric; r record;
BEGIN
  SELECT full_name INTO v_name FROM profiles WHERE id = NEW.profile_id;
  v_label := initcap(replace(NEW.type, '_', '-'));

  IF TG_OP = 'INSERT' THEN
    IF NEW.approver_id IS NOT NULL THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (NEW.org_id, NEW.approver_id,
        v_name || ' applied for ' || v_label || ' leave',
        to_char(NEW.from_date, 'DD Mon') || ' → ' || to_char(NEW.to_date, 'DD Mon')
          || ' · ' || NEW.days || ' day(s)',
        '/approvals');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status <> OLD.status AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (NEW.org_id, NEW.profile_id,
      'Your ' || v_label || ' leave was ' || NEW.status,
      to_char(NEW.from_date, 'DD Mon') || ' → ' || to_char(NEW.to_date, 'DD Mon')
        || ' · ' || NEW.days || ' day(s)',
      '/leave');

    IF NEW.status = 'approved' AND NEW.type = 'comp_off' THEN
      v_needed := ceil(NEW.days);
      FOR r IN
        SELECT id FROM comp_off_credits
         WHERE profile_id = NEW.profile_id AND consumed = false
         ORDER BY earned_on ASC LIMIT v_needed::int
      LOOP
        UPDATE comp_off_credits
           SET consumed = true, consumed_by = NEW.profile_id
         WHERE id = r.id;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER leave_after_write_trg
  AFTER INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.leave_after_write();

-- ─────────────────────────────────────────── 24h reminder for approvers
CREATE OR REPLACE FUNCTION public.leave_remind_approvers()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN
    SELECT lr.*, p.full_name FROM leave_requests lr
      JOIN profiles p ON p.id = lr.profile_id
     WHERE lr.status = 'pending'
       AND lr.approver_id IS NOT NULL
       AND lr.created_at < now() - interval '24 hours'
       AND (lr.reminded_at IS NULL OR lr.reminded_at < now() - interval '24 hours')
  LOOP
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (r.org_id, r.approver_id,
      'Still waiting: ' || r.full_name || '''s leave request',
      'Applied ' || to_char(r.created_at, 'DD Mon') || ' and still pending your call.',
      '/approvals');
    UPDATE leave_requests SET reminded_at = now() WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

-- ─────────────────────────────────────────── re-route on roster changes
CREATE OR REPLACE FUNCTION public.reconcile_roster()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := my_org();
  v_root uuid;
  v_fixed text[] := '{}';
  v_rerouted int := 0;
  r record;
BEGIN
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('fixed', '[]'::jsonb, 'count', 0, 'rerouted', 0);
  END IF;

  FOR r IN
    SELECT id, full_name FROM profiles WHERE org_id = v_org AND manager_id = id
  LOOP
    UPDATE profiles SET manager_id = NULL WHERE id = r.id;
    v_fixed := v_fixed || (r.full_name || ' (self-manager cleared)');
  END LOOP;

  SELECT id INTO v_root FROM profiles
   WHERE org_id = v_org AND status = 'active' AND manager_id IS NULL
     AND role IN ('admin','hr')
   ORDER BY created_at LIMIT 1;

  IF v_root IS NULL THEN
    SELECT id INTO v_root FROM profiles
     WHERE org_id = v_org AND status = 'active' AND role IN ('admin','hr')
     ORDER BY created_at LIMIT 1;
    IF v_root IS NOT NULL THEN
      UPDATE profiles SET manager_id = NULL WHERE id = v_root;
      v_fixed := v_fixed || ((SELECT full_name FROM profiles WHERE id = v_root) || ' promoted to top of chart');
    END IF;
  END IF;

  IF v_root IS NOT NULL THEN
    FOR r IN
      SELECT p.id, p.full_name
        FROM profiles p
        LEFT JOIN profiles m ON m.id = p.manager_id
       WHERE p.org_id = v_org
         AND p.status = 'active'
         AND p.manager_id IS NOT NULL
         AND p.id <> v_root
         AND (m.id IS NULL OR m.status <> 'active' OR m.role NOT IN ('manager','hr','admin'))
    LOOP
      UPDATE profiles SET manager_id = v_root WHERE id = r.id;
      v_fixed := v_fixed || r.full_name;
    END LOOP;
  END IF;

  -- pending leave follows the current manager
  FOR r IN
    SELECT lr.id, lr.approver_id, lr.org_id, lr.profile_id,
           leave_approver_for(lr.profile_id) AS correct,
           p.full_name
      FROM leave_requests lr JOIN profiles p ON p.id = lr.profile_id
     WHERE lr.org_id = v_org AND lr.status = 'pending'
  LOOP
    IF r.correct IS NOT NULL AND r.correct IS DISTINCT FROM r.approver_id THEN
      UPDATE leave_requests SET approver_id = r.correct WHERE id = r.id;
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (r.org_id, r.correct,
        r.full_name || '''s leave request is now yours to review',
        'It moved to you after a reporting change.', '/approvals');
      v_rerouted := v_rerouted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'fixed', to_jsonb(v_fixed),
    'count', coalesce(array_length(v_fixed, 1), 0),
    'rerouted', v_rerouted
  );
END;
$function$;
