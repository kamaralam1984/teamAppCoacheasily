-- 1. Theme patch safety: identical token list to PATCH_KEYS in src/lib/theme.ts
CREATE OR REPLACE FUNCTION public.theme_patch_is_safe(p jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(bool_and(k IN (
    'pearl','ivory','cream','night','night2','line','gold','goldL','goldD','saff','saffBtn'
  )), true)
  FROM jsonb_object_keys(COALESCE(p, '{}'::jsonb)) AS k;
$function$;

-- 2. reconcile_roster: leadership only
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
  IF my_role() NOT IN ('hr','admin') THEN
    RAISE EXCEPTION 'Only People & Culture or Admin may reconcile the roster.';
  END IF;

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

-- 3. leave_check: commit the live array_append version
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

  v_days := CASE WHEN p_half THEN 0.5 ELSE (p_to - p_from) + 1 END;
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
END $function$;

-- 4. profiles_protect_identity: commit the live column guard
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
      RAISE EXCEPTION 'Title, department, reporting line, access level and opening earned leave can only be changed by a signed-in People & Culture or Admin person.';
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
    RAISE EXCEPTION 'Only People & Culture can change that. You can update your own photo and your one human detail.';
  END IF;

  RETURN NEW;
END
$function$;