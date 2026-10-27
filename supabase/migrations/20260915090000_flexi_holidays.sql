-- ═══ FLEXI HOLIDAYS + THE 2027 HOLIDAY LIST ═══
-- Flexi holidays:
--   * A flexi holiday is an approved 'optional' entry on the holiday calendar. It is not a day off
--     for everyone; each person picks a few of them in the year.
--   * Taking one is a leave request of type 'flexi': one full day, on a flexi date, asked for ahead
--     of time, approved by the manager like any other leave.
--   * At most flexi_holidays_per_year (default 2) per calendar year, counting pending and approved.
--   * Only from flexi_holidays_from (default 2027). Earlier years have no flexi holidays.
-- The 2027 list: the fixed public holidays become approved days off, the flexi list becomes
--   approved optional holidays.

-- ───────── 1. A NEW LEAVE TYPE ─────────
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_type_check;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_type_check
  CHECK (type IN ('casual','sick','earned','comp_off','maternity','lwp','flexi'));

-- ───────── 2. THE FLEXI RULES ─────────
-- Why a flexi request cannot be made, or null when it can. Shared by the live check and the write.
CREATE OR REPLACE FUNCTION public.flexi_holiday_problem(p_profile_id uuid, p_from date, p_to date,
  p_half boolean, p_exclude uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid; v_settings jsonb; v_start int; v_quota int; v_taken int;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT o.id, coalesce(o.settings, '{}'::jsonb) INTO v_org, v_settings
    FROM organisations o JOIN profiles p ON p.org_id = o.id WHERE p.id = p_profile_id;
  v_start := coalesce((v_settings->>'flexi_holidays_from')::int, 2027);
  v_quota := coalesce((v_settings->>'flexi_holidays_per_year')::int, 2);

  IF p_half OR p_to <> p_from THEN
    RETURN 'A flexi holiday is one full day.';
  END IF;
  IF extract(year FROM p_from) < v_start THEN
    RETURN format('Flexi holidays start in %s.', v_start);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM holiday_calendar
                  WHERE org_id = v_org AND date = p_from AND kind = 'optional' AND status = 'approved') THEN
    RETURN 'Pick a date from the flexi holiday list.';
  END IF;
  IF p_from <= v_today THEN
    RETURN 'Flexi holidays are planned in advance — pick one that is still ahead.';
  END IF;
  IF EXISTS (SELECT 1 FROM leave_requests
              WHERE profile_id = p_profile_id AND type = 'flexi' AND status IN ('pending','approved')
                AND from_date = p_from AND id IS DISTINCT FROM p_exclude) THEN
    RETURN 'You have already asked for this flexi holiday.';
  END IF;

  SELECT count(*) INTO v_taken FROM leave_requests
   WHERE profile_id = p_profile_id AND type = 'flexi' AND status IN ('pending','approved')
     AND extract(year FROM from_date) = extract(year FROM p_from)
     AND id IS DISTINCT FROM p_exclude;
  IF v_taken >= v_quota THEN
    RETURN format('You can take %s flexi holidays a year and already have %s in %s.',
      v_quota, v_taken, extract(year FROM p_from)::int);
  END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.flexi_holiday_problem(uuid, date, date, boolean, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flexi_holiday_problem(uuid, date, date, boolean, uuid) TO service_role;

-- My flexi holidays for a year: the list to pick from, how many I may take, and what I have asked for.
CREATE OR REPLACE FUNCTION public.flexi_holidays(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id();
  v_org uuid := my_org();
  v_settings jsonb;
BEGIN
  IF v_me IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(settings, '{}'::jsonb) INTO v_settings FROM organisations WHERE id = v_org;
  RETURN jsonb_build_object(
    'year', p_year,
    'starts_from', coalesce((v_settings->>'flexi_holidays_from')::int, 2027),
    'per_year', coalesce((v_settings->>'flexi_holidays_per_year')::int, 2),
    'options', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'date', c.date, 'name', c.name) ORDER BY c.date)
        FROM holiday_calendar c
       WHERE c.org_id = v_org AND c.kind = 'optional' AND c.status = 'approved'
         AND extract(year FROM c.date) = p_year), '[]'::jsonb),
    'requests', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', l.id, 'date', l.from_date, 'status', l.status) ORDER BY l.from_date)
        FROM leave_requests l
       WHERE l.profile_id = v_me AND l.type = 'flexi' AND l.status IN ('pending','approved')
         AND extract(year FROM l.from_date) = p_year), '[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.flexi_holidays(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.flexi_holidays(integer) TO authenticated, service_role;

-- ───────── 3. THE WRITE ENFORCES THEM ─────────
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
END $function$
;

-- ───────── 4. ...AND SO DOES THE LIVE CHECK ─────────
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

  IF p_type = 'flexi' THEN
    v_msg := flexi_holiday_problem(v_target, p_from, p_to, p_half, NULL);
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

-- ───────── 5. THE 2027 LIST ─────────
-- Approved straight away; the calendar trigger turns the fixed ones into days off.
INSERT INTO public.holiday_calendar (org_id, date, name, kind, status, source)
SELECT o.id, h.date, h.name, h.kind, 'approved', 'manual'
  FROM public.organisations o
 CROSS JOIN (VALUES
    (DATE '2027-01-01', 'New Year Day', 'company'),
    (DATE '2027-01-26', 'Republic Day', 'national'),
    (DATE '2027-03-10', 'Eid', 'company'),
    (DATE '2027-03-22', 'Holi', 'company'),
    (DATE '2027-08-15', 'Independence Day', 'national'),
    (DATE '2027-08-17', 'Raksha Bandhan', 'company'),
    (DATE '2027-09-04', 'Ganesh Chaturthi', 'company'),
    (DATE '2027-10-02', 'Gandhi Jayanti', 'national'),
    (DATE '2027-10-09', 'Dussehra', 'company'),
    (DATE '2027-10-29', 'Diwali', 'company'),
    (DATE '2027-10-31', 'Bhai Dooj', 'company'),
    (DATE '2027-12-25', 'Christmas', 'company'),
    (DATE '2027-12-31', 'New Year''s Eve', 'company'),
    (DATE '2027-01-14', 'Pongal', 'optional'),
    (DATE '2027-02-19', 'Shivaji Jayanti', 'optional'),
    (DATE '2027-03-06', 'Mahashivratri', 'optional'),
    (DATE '2027-03-26', 'Good Friday', 'optional'),
    (DATE '2027-04-07', 'Gudi Padwa', 'optional'),
    (DATE '2027-04-15', 'Ram Navami', 'optional'),
    (DATE '2027-05-01', 'Maharashtra Day', 'optional'),
    (DATE '2027-05-17', 'Bakrid', 'optional'),
    (DATE '2027-08-25', 'Janmashtami', 'optional')
 ) AS h(date, name, kind)
ON CONFLICT (org_id, date, name) DO NOTHING;
