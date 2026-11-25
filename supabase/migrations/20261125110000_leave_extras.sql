-- ═══ LEAVE: EDIT, CANCEL, HALF OF THE DAY, REMINDER (behind a release switch) ═══
-- Until a developer approves the release, only HR (and developers) have these features.
-- Two fixes apply to everybody straight away:
--   * a handover with nothing ticked moves no task (it used to move every task in the dates);
--   * a person can no longer choose or change who approves their own leave.

-- ───────── 1. COLUMNS ─────────
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS half_part text CHECK (half_part IN ('first', 'second')),
  ADD COLUMN IF NOT EXISTS nudged_at timestamptz;
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

-- ───────── 2. THE RELEASE SWITCH ─────────
-- Written only by the server (service role) after the developer allowlist check. HR cannot flip it.
CREATE TABLE IF NOT EXISTS public.feature_releases (
  key text PRIMARY KEY,
  released boolean NOT NULL DEFAULT false,
  released_at timestamptz,
  released_by text,
  -- developers' own profiles, added by the server when they open the Leave page
  preview_profile_ids uuid[] NOT NULL DEFAULT '{}'
);
ALTER TABLE public.feature_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feature_releases FROM public, anon, authenticated;
GRANT ALL ON public.feature_releases TO service_role;
INSERT INTO public.feature_releases (key) VALUES ('leave_extras') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.leave_extras_on() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_profile_id() IS NOT NULL AND (
    coalesce(my_role() = 'hr', false)
    OR EXISTS (SELECT 1 FROM feature_releases f
                WHERE f.key = 'leave_extras'
                  AND (f.released OR my_profile_id() = ANY (f.preview_profile_ids))))
$$;
REVOKE ALL ON FUNCTION public.leave_extras_on() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_extras_on() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.leave_extras_preview(p_profile uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE feature_releases SET preview_profile_ids = array_append(preview_profile_ids, p_profile)
   WHERE key = 'leave_extras' AND NOT p_profile = ANY (preview_profile_ids)
$$;
REVOKE ALL ON FUNCTION public.leave_extras_preview(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_extras_preview(uuid) TO service_role;

-- ───────── 3. THE RULES, WITHOUT COUNTING THE REQUEST BEING EDITED ─────────
CREATE OR REPLACE FUNCTION public.leave_balance_without(p_balances jsonb, p_profile uuid, p_type text, p_exclude uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT greatest((e->>'entitled')::numeric - (e->>'used')::numeric - (e->>'pending')::numeric + l.days, 0)
    FROM jsonb_array_elements(p_balances) e
    JOIN leave_requests l ON l.id = p_exclude AND l.profile_id = p_profile AND l.status = 'pending'
     AND l.type = p_type
     AND (p_type = 'earned'
          OR extract(year FROM l.from_date) = extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata')))
   WHERE e->>'type' = p_type
$$;
REVOKE ALL ON FUNCTION public.leave_balance_without(jsonb, uuid, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_balance_without(jsonb, uuid, text, uuid) TO service_role;

-- one function with one more optional argument (two overloads would be ambiguous to the API)
DROP FUNCTION public.leave_check(text, date, date, boolean, uuid);
CREATE OR REPLACE FUNCTION public.leave_check(p_type text, p_from date, p_to date, p_half boolean DEFAULT false, p_profile_id uuid DEFAULT NULL::uuid, p_exclude uuid DEFAULT NULL::uuid)
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

  -- while a request is being edited, its own days must not count against it
  IF p_exclude IS NOT NULL THEN
    v_bal := coalesce(leave_balance_without(v_balances, v_target, p_type, p_exclude), v_bal);
  END IF;

  IF p_type = 'casual' THEN
    SELECT coalesce((o.settings->>'casual_quarter_cap')::numeric, 2) INTO v_cap
      FROM organisations o JOIN profiles p ON p.org_id = o.id WHERE p.id = v_target;
    v_quarter := extract(quarter FROM p_from)::int;
    SELECT coalesce(sum(days), 0) INTO v_qcount FROM leave_requests
      WHERE profile_id = v_target AND type = 'casual' AND status IN ('pending','approved')
        AND extract(year FROM from_date) = extract(year FROM p_from)
        AND (p_exclude IS NULL OR id <> p_exclude)
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

  IF p_type = 'flexi' THEN
    v_msg := flexi_holiday_problem(v_target, p_from, p_to, p_half, p_exclude);
    IF v_msg IS NOT NULL THEN
      v_errors := array_append(v_errors, v_msg);
    ELSIF v_notice < 7 THEN
      v_warnings := array_append(v_warnings, 'This is less than 7 days'' notice — let your manager know soon.');
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

  IF p_type NOT IN ('sick', 'flexi') THEN
    v_msg := leave_sandwich_conflict(v_target, p_from, p_to, p_exclude);
    IF v_msg IS NOT NULL THEN
      v_errors := array_append(v_errors, v_msg);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'days', v_days);
END $function$;
REVOKE ALL ON FUNCTION public.leave_check(text, date, date, boolean, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_check(text, date, date, boolean, uuid, uuid) TO authenticated, service_role;

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
  IF NOT NEW.half_day THEN NEW.half_part := NULL; END IF;

  IF TG_OP = 'INSERT' OR NEW.from_date <> OLD.from_date OR NEW.to_date <> OLD.to_date
     OR NEW.type <> OLD.type OR NEW.half_day <> OLD.half_day THEN

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
      IF TG_OP = 'UPDATE' THEN
        v_bal := coalesce(leave_balance_without(leave_balances(NEW.profile_id), NEW.profile_id, 'earned', NEW.id), v_bal);
      END IF;
      IF coalesce(v_bal, 0) <= 0 THEN
        RAISE EXCEPTION 'You have no earned leave yet — 1 is earned for every 20 days worked.';
      END IF;
    END IF;

    IF NEW.type = 'flexi' THEN
      v_msg := flexi_holiday_problem(NEW.profile_id, NEW.from_date, NEW.to_date, NEW.half_day, NEW.id);
      IF v_msg IS NOT NULL THEN RAISE EXCEPTION '%', v_msg; END IF;
    END IF;

    -- a flexi holiday is a holiday, not leave stretched around a break
    IF NEW.type NOT IN ('sick', 'flexi') THEN
      v_msg := leave_sandwich_conflict(NEW.profile_id, NEW.from_date, NEW.to_date, NEW.id);
      IF v_msg IS NOT NULL THEN RAISE EXCEPTION '%', v_msg; END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.approver_id IS NULL THEN
    NEW.approver_id := leave_approver_for(NEW.profile_id);
  END IF;

  RETURN NEW;
END $function$;

-- ───────── 4. FIX: A HANDOVER WITH NOTHING TICKED MOVES NOTHING ─────────
-- (NULL, only on requests older than the tick list, still means "everything in the dates".)
CREATE OR REPLACE FUNCTION public.leave_after_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text; v_label text; v_needed numeric; r record; v_moved int := 0; v_stamp text;
  v_auto boolean;
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
    v_auto := NEW.status = 'rejected' AND NEW.decided_by IS NULL AND NEW.decision_note IS NOT NULL;
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (NEW.org_id, NEW.profile_id,
      'Your ' || v_label || ' leave was ' || NEW.status || CASE WHEN v_auto THEN ' automatically' ELSE '' END,
      to_char(NEW.from_date, 'DD Mon') || ' → ' || to_char(NEW.to_date, 'DD Mon')
        || ' · ' || NEW.days || ' day(s)'
        || CASE WHEN v_auto THEN '. Nobody decided before the leave date, so it was closed. Please apply again if you still need it.' ELSE '' END,
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

    IF NEW.status = 'approved' AND NEW.handover_to IS NOT NULL THEN
      v_stamp := 'Handed over by ' || coalesce(v_name, 'a teammate') || ' ('
        || to_char(NEW.from_date, 'DD Mon') || ' → ' || to_char(NEW.to_date, 'DD Mon') || ')';

      UPDATE tasks
         SET owner_id = NEW.handover_to,
             description = CASE
               WHEN description IS NULL OR btrim(description) = '' THEN v_stamp
               ELSE description || E'\n' || v_stamp END,
             updated_at = now()
       WHERE owner_id = NEW.profile_id
         AND done = false
         AND CASE
               WHEN NEW.handover_task_ids IS NOT NULL THEN id = ANY (NEW.handover_task_ids)
               ELSE due_date IS NOT NULL AND due_date BETWEEN NEW.from_date AND NEW.to_date
             END;
      GET DIAGNOSTICS v_moved = ROW_COUNT;

      IF v_moved > 0 THEN
        INSERT INTO notifications (org_id, profile_id, title, body, link)
        VALUES (NEW.org_id, NEW.handover_to,
          v_name || ' is away ' || to_char(NEW.from_date, 'DD Mon') || ' → '
            || to_char(NEW.to_date, 'DD Mon'),
          v_moved || ' task(s) moved to you.', '/tasks');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.leave_decision_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'This request was cancelled by the person who sent it.';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Only a pending request can be cancelled.';
    END IF;
    -- only leave_cancel() gets here: it runs as the owner, a direct API write does not
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Only the person who sent a request can cancel it.';
    END IF;
  END IF;
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    IF OLD.status = 'rejected' AND OLD.decision_note IS NOT NULL AND OLD.decided_by IS NULL THEN
      RAISE EXCEPTION 'This request was closed automatically because nobody decided before the leave date. Ask for a new request.';
    END IF;
    IF OLD.status = 'pending' AND OLD.from_date <= v_today
       AND (OLD.created_at AT TIME ZONE 'Asia/Kolkata')::date < OLD.from_date THEN
      RAISE EXCEPTION 'The leave date has arrived and nobody decided in time, so this request can no longer be approved. Ask for a new request.';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- ───────── 5. FIX: NOBODY CHOOSES THEIR OWN APPROVER ─────────
-- A direct write by the person themselves is no longer possible: edits and cancellations go
-- through the functions below, which check the rules and tell the approver.
DROP POLICY IF EXISTS "amend own pending leave" ON public.leave_requests;
DROP POLICY IF EXISTS "withdraw own pending leave" ON public.leave_requests;

-- Runs before leave_before_write_trg (triggers fire in name order), which then fills in the approver.
CREATE OR REPLACE FUNCTION public.leave_clean_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    NEW.approver_id := NULL; NEW.decided_at := NULL; NEW.decided_by := NULL; NEW.decision_note := NULL;
    NEW.reminded_at := NULL; NEW.nudged_at := NULL; NEW.created_at := now();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.leave_clean_insert() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS leave_a_clean_insert_trg ON public.leave_requests;
CREATE TRIGGER leave_a_clean_insert_trg BEFORE INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.leave_clean_insert();

-- ───────── 6. EDIT, CANCEL, REMIND ─────────
CREATE OR REPLACE FUNCTION public.leave_own_pending(p_id uuid) RETURNS leave_requests
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r leave_requests%ROWTYPE;
BEGIN
  IF NOT leave_extras_on() THEN RAISE EXCEPTION 'This is not available yet.'; END IF;
  SELECT * INTO r FROM leave_requests WHERE id = p_id AND profile_id = my_profile_id() FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'That request was not found.'; END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is already %. Only a pending request can be changed.', r.status;
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.leave_own_pending(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_own_pending(uuid) TO service_role;

-- sent before its first day, and that day has come: the nightly job closes it
CREATE OR REPLACE FUNCTION public.leave_too_late(p_created timestamptz, p_from date) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
     AND (p_created AT TIME ZONE 'Asia/Kolkata')::date < p_from
$$;
REVOKE ALL ON FUNCTION public.leave_too_late(timestamptz, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_too_late(timestamptz, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.leave_edit(p_id uuid, p_type text, p_from date, p_to date,
  p_half_part text DEFAULT NULL, p_half boolean DEFAULT false, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r leave_requests%ROWTYPE; n leave_requests%ROWTYPE; v_errors jsonb;
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  r := leave_own_pending(p_id);
  IF p_type IS NULL OR p_from IS NULL OR p_to IS NULL THEN RAISE EXCEPTION 'Choose the type and the dates.'; END IF;
  IF leave_too_late(r.created_at, r.from_date) THEN
    RAISE EXCEPTION 'The leave date has arrived, so this request can no longer be changed.';
  END IF;
  IF leave_too_late(r.created_at, p_from) THEN
    RAISE EXCEPTION 'Choose a first day after today. For an earlier day, cancel this request and apply again.';
  END IF;
  IF p_half AND p_from <> p_to THEN RAISE EXCEPTION 'A half day is for one day only.'; END IF;
  IF p_half AND p_half_part IS NULL THEN RAISE EXCEPTION 'Choose the first or the second half.'; END IF;

  IF r.type = p_type AND r.from_date = p_from AND r.to_date = p_to AND r.half_day = coalesce(p_half, false)
     AND r.half_part IS NOT DISTINCT FROM (CASE WHEN p_half THEN p_half_part END)
     AND r.reason IS NOT DISTINCT FROM v_reason THEN
    RETURN jsonb_build_object('changed', false, 'approver_id', r.approver_id);
  END IF;

  IF r.type <> p_type OR r.from_date <> p_from OR r.to_date <> p_to OR r.half_day <> coalesce(p_half, false) THEN
    v_errors := leave_check(p_type, p_from, p_to, coalesce(p_half, false), NULL, p_id)->'errors';
    IF jsonb_array_length(v_errors) > 0 THEN RAISE EXCEPTION '%', v_errors->>0; END IF;
  END IF;

  UPDATE leave_requests
     SET type = p_type, from_date = p_from, to_date = p_to, half_day = coalesce(p_half, false),
         half_part = CASE WHEN p_half THEN p_half_part END, reason = v_reason
   WHERE id = p_id RETURNING * INTO n;

  IF n.approver_id IS NOT NULL THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (n.org_id, n.approver_id, audit_name(n.profile_id) || ' changed a leave request',
      initcap(replace(n.type, '_', '-')) || ' · ' || to_char(n.from_date, 'DD Mon') || ' → '
        || to_char(n.to_date, 'DD Mon') || ' · ' || n.days || ' day(s)', '/approvals');
  END IF;
  PERFORM audit_write(n.org_id, 'leave', 'leave.edit', n.profile_id, n.id,
    format('%s changed their pending leave request (%s, %s → %s)', audit_actor(), n.type,
           to_char(n.from_date, 'FMDD Mon'), to_char(n.to_date, 'FMDD Mon')),
    jsonb_build_object('type', r.type, 'from', r.from_date, 'to', r.to_date, 'days', r.days, 'half', r.half_part),
    jsonb_build_object('type', n.type, 'from', n.from_date, 'to', n.to_date, 'days', n.days, 'half', n.half_part));
  RETURN jsonb_build_object('changed', true, 'approver_id', n.approver_id);
END $$;

CREATE OR REPLACE FUNCTION public.leave_cancel(p_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r leave_requests%ROWTYPE;
BEGIN
  r := leave_own_pending(p_id);
  UPDATE leave_requests SET status = 'cancelled' WHERE id = p_id;
  IF r.approver_id IS NOT NULL THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (r.org_id, r.approver_id, audit_name(r.profile_id) || ' cancelled a leave request',
      to_char(r.from_date, 'DD Mon') || ' → ' || to_char(r.to_date, 'DD Mon') || '. Nothing to decide.', '/approvals');
  END IF;
  PERFORM audit_write(r.org_id, 'leave', 'leave.cancel', r.profile_id, r.id,
    format('%s cancelled their pending %s leave request (%s → %s)', audit_actor(), r.type,
           to_char(r.from_date, 'FMDD Mon'), to_char(r.to_date, 'FMDD Mon')),
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'cancelled'));
END $$;

-- one reminder per request in 24 hours
CREATE OR REPLACE FUNCTION public.leave_send_reminder(p_id uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r leave_requests%ROWTYPE;
BEGIN
  r := leave_own_pending(p_id);
  IF leave_too_late(r.created_at, r.from_date) THEN
    RAISE EXCEPTION 'The leave date has arrived, so this request can no longer be approved.';
  END IF;
  IF r.nudged_at > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'You have already sent a reminder. You can send another after 24 hours.';
  END IF;
  IF r.approver_id IS NULL THEN RAISE EXCEPTION 'Nobody is set to approve this yet. Please tell HR.'; END IF;
  UPDATE leave_requests SET nudged_at = now() WHERE id = p_id;
  INSERT INTO notifications (org_id, profile_id, title, body, link)
  VALUES (r.org_id, r.approver_id, 'Reminder: ' || audit_name(r.profile_id) || '''s leave request is waiting',
    to_char(r.from_date, 'DD Mon') || ' → ' || to_char(r.to_date, 'DD Mon') || ' · ' || r.days
      || ' day(s). Please approve or reject it.', '/approvals');
  RETURN r.approver_id;
END $$;

REVOKE ALL ON FUNCTION public.leave_edit(uuid, text, date, date, text, boolean, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.leave_cancel(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.leave_send_reminder(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_edit(uuid, text, date, date, text, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_cancel(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_send_reminder(uuid) TO authenticated, service_role;

-- ───────── 7. THE CALENDAR SAYS WHICH HALF ─────────
CREATE OR REPLACE FUNCTION public.calendar_leave(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', lr.id,
    'profile_id', lr.profile_id,
    'full_name', p.full_name,
    'type', lr.type,
    'from_date', lr.from_date,
    'to_date', lr.to_date,
    'half_day', lr.half_day,
    'half_part', lr.half_part
  ) ORDER BY lr.from_date, p.full_name), '[]'::jsonb)
  FROM leave_requests lr
  JOIN profiles p ON p.id = lr.profile_id
  WHERE lr.org_id = my_org()
    AND lr.status = 'approved'
    AND lr.from_date <= p_to
    AND lr.to_date >= p_from;
$function$;
