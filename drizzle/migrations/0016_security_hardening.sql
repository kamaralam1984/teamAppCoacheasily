-- ═══ SECURITY HARDENING, AND THE REVENUE CARD ═══
-- 1. The revenue card always showed 0: revenue_summary() looked for a goal cycle with status 'open',
--    but a running cycle is 'active'. Fixed here.
-- 2. Signed-out visitors (the anon role) lose everything except the two things the app really does
--    before sign-in: checking an invite (claim_invite) and the calendar subscription feed
--    (calendar_feed, guarded by a private token). They lose direct table privileges and the right
--    to run any other function. Row-level security already refused them; this is a second lock.
-- 3. Policies written without a role applied to everybody, signed out included. They now apply to
--    signed-in users only.
-- 4. Helper functions that only other functions call can no longer be called by signed-in users.
-- 5. Two calendar helpers now only answer about people in the caller's own organisation.
-- 6. claim_invite() tells a signed-out visitor whether an email is an expected invitee. It now slows
--    that down: at most 30 checks an hour from one address.

-- ───────── 1. THE REVENUE CARD ─────────
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
   WHERE org_id = my_org() AND status = 'active'
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

-- ───────── 2. SIGNED-OUT VISITORS ─────────
-- What signed-in users may run today is kept exactly as it is (a snapshot, so the blanket revoke
-- below cannot undo any earlier, more careful revoke).
DO $$
DECLARE
  r record;
BEGIN
  CREATE TEMP TABLE _signed_in_functions ON COMMIT DROP AS
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prokind IN ('f', 'p')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

  FOR r IN SELECT sig FROM _signed_in_functions LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

-- the only two things a visitor may call
GRANT EXECUTE ON FUNCTION public.claim_invite(text) TO anon;
GRANT EXECUTE ON FUNCTION public.calendar_feed(uuid) TO anon;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- ───────── 3. POLICIES FOR SIGNED-IN USERS ONLY ─────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
            WHERE schemaname = 'public' AND roles = '{public}'
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ───────── 4. HELPERS FOR OTHER FUNCTIONS ONLY ─────────
-- Called by functions that run with the owner's rights (triggers, jobs, the server), never from the app.
REVOKE EXECUTE ON FUNCTION public.el_eligible_days(uuid, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_days_for(uuid, date, date, boolean, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_sandwich_conflict(uuid, date, date, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_approver_for(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.goal_pct(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.birthday_nudges() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_remind_approvers() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.digests_enabled() FROM authenticated;

-- ───────── 5. CALENDAR HELPERS STAY INSIDE THE ORGANISATION ─────────
CREATE OR REPLACE FUNCTION public.leave_cover_conflicts(p_profile_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'from_date'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'kind','program','id',pr.id,'name',pr.name,'type',pr.type,
      'from_date',pr.from_date,'to_date',pr.to_date,
      'overlap_from',GREATEST(pr.from_date,p_from),'overlap_to',LEAST(pr.to_date,p_to),
      'role', CASE WHEN pr.host_id = p_profile_id THEN 'host' ELSE 'required attendee' END,
      'cover', (SELECT full_name FROM profiles c WHERE c.id = pr.cover_id)) AS x
      FROM programs pr
     WHERE pr.status = 'active' AND pr.from_date <= p_to AND pr.to_date >= p_from
       AND EXISTS (SELECT 1 FROM profiles t WHERE t.id = p_profile_id AND t.org_id = my_org())
       AND (pr.host_id = p_profile_id OR EXISTS (
            SELECT 1 FROM calendar_attendees a
             WHERE a.kind='program' AND a.ref_id = pr.id AND a.profile_id = p_profile_id AND a.required))
    UNION ALL
    SELECT jsonb_build_object(
      'kind','event','id',ev.id,'name',ev.name,'type',ev.type,
      'from_date',ev.date,'to_date',COALESCE(ev.end_date,ev.date),
      'overlap_from',GREATEST(ev.date,p_from),'overlap_to',LEAST(COALESCE(ev.end_date,ev.date),p_to),
      'role', CASE WHEN ev.host_id = p_profile_id THEN 'host' ELSE 'required attendee' END,
      'cover', NULL) AS x
      FROM events ev
     WHERE ev.status = 'active' AND ev.date <= p_to AND COALESCE(ev.end_date,ev.date) >= p_from
       AND EXISTS (SELECT 1 FROM profiles t WHERE t.id = p_profile_id AND t.org_id = my_org())
       AND (ev.host_id = p_profile_id OR EXISTS (
            SELECT 1 FROM calendar_attendees a
             WHERE a.kind='event' AND a.ref_id = ev.id AND a.profile_id = p_profile_id AND a.required))
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.leave_host_conflicts(p_profile_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'program_id', pr.id,
    'name', pr.name,
    'type', pr.type,
    'from_date', pr.from_date,
    'to_date', pr.to_date,
    'overlap_from', GREATEST(pr.from_date, p_from),
    'overlap_to', LEAST(pr.to_date, p_to)
  ) ORDER BY pr.from_date), '[]'::jsonb)
  FROM programs pr
  WHERE pr.host_id = p_profile_id
    AND EXISTS (SELECT 1 FROM profiles t WHERE t.id = p_profile_id AND t.org_id = my_org())
    AND pr.from_date <= p_to
    AND pr.to_date >= p_from;
$function$;

-- ───────── 6. SLOWING DOWN INVITE CHECKS ─────────
CREATE TABLE IF NOT EXISTS public.invite_checks (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invite_checks_source_idx ON public.invite_checks (source, checked_at DESC);
ALTER TABLE public.invite_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invite_checks FROM anon, authenticated;
GRANT ALL ON public.invite_checks TO service_role;

CREATE OR REPLACE FUNCTION public.claim_invite(p_email text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_headers json;
  v_source text;
  v_recent integer;
  v_name text;
BEGIN
  -- Who is asking: the address the request came from, when the platform passes it on.
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;
  v_source := coalesce(nullif(btrim(split_part(coalesce(v_headers->>'cf-connecting-ip',
                                                         v_headers->>'x-forwarded-for', ''), ',', 1)), ''), 'unknown');

  DELETE FROM invite_checks WHERE checked_at < now() - interval '1 day';
  SELECT count(*) INTO v_recent FROM invite_checks
   WHERE source = v_source AND checked_at > now() - interval '1 hour';
  IF v_recent >= 30 THEN
    RETURN jsonb_build_object('expected', false, 'limited', true);
  END IF;
  INSERT INTO invite_checks (source) VALUES (v_source);

  SELECT full_name INTO v_name
    FROM public.profiles
   WHERE lower(email) = lower(trim(coalesce(p_email, '')))
     AND status = 'active'
     AND auth_user_id IS NULL
   LIMIT 1;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object('expected', false);
  END IF;

  RETURN jsonb_build_object('expected', true, 'first_name', split_part(btrim(v_name), ' ', 1));
END;
$$;
REVOKE ALL ON FUNCTION public.claim_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_invite(text) TO anon, authenticated, service_role;
