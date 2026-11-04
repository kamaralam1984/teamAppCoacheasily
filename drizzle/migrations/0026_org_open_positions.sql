-- ═══ ORG CHART: OPEN POSITIONS AND THE "NEW ROLE" TAG ═══
-- An open position is a post nobody holds yet ("To be hired"). It sits under the person it will
-- report to, and people can be drawn under it on the org chart while their real reporting line
-- (manager_id, used for approvals) still goes to someone who is here. When the post is filled,
-- HR points those people at the new hire and deletes the position.
-- new_role marks a person whose post is newly created; the chart shows a NEW ROLE tag.

-- ───────── 1. OPEN POSITIONS ─────────
CREATE TABLE IF NOT EXISTS public.open_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  department text,
  reports_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.open_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_positions_read ON public.open_positions;
CREATE POLICY open_positions_read ON public.open_positions FOR SELECT TO authenticated
  USING (org_id = my_org());
DROP POLICY IF EXISTS open_positions_hr_write ON public.open_positions;
CREATE POLICY open_positions_hr_write ON public.open_positions FOR ALL TO authenticated
  USING (org_id = my_org() AND my_role() IN ('hr', 'admin'))
  WITH CHECK (org_id = my_org() AND my_role() IN ('hr', 'admin'));
REVOKE ALL ON public.open_positions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_positions TO authenticated;
GRANT ALL ON public.open_positions TO service_role;

-- ───────── 2. ON THE PROFILE ─────────
-- Only HR and admin can change these: the self-edit guard allow-lists what a person may change.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chart_position_id uuid REFERENCES public.open_positions(id) ON DELETE SET NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS new_role boolean NOT NULL DEFAULT false;

-- ───────── 3. BUSINESS OPERATIONS (Nov 2026) ─────────
-- Founder → Manager – Business Operations (to be hired) → Pranjal (new role) → Sapana and Prachi.
-- Until the manager joins, Pranjal reports to the founder for approvals. Every name has to match
-- exactly one active person, or this stops and nothing changes.
DO $$
DECLARE
  v_org uuid;
  v_ceo uuid;
  v_pranjal uuid;
  v_sapana uuid;
  v_prachi uuid;
  v_pos uuid;
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM profiles WHERE status = 'active' AND full_name ILIKE 'Purushottam%';
  IF v_n = 0 THEN
    RAISE NOTICE 'org chart: no founder profile here, skipping the Business Operations change';
    RETURN;
  END IF;
  IF v_n > 1 THEN RAISE EXCEPTION 'org chart: % active people match Purushottam', v_n; END IF;
  SELECT id, org_id INTO v_ceo, v_org FROM profiles WHERE status = 'active' AND full_name ILIKE 'Purushottam%';

  SELECT count(*) INTO v_n FROM profiles WHERE org_id = v_org AND status = 'active' AND full_name ILIKE 'Pranjal%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'org chart: % active people match Pranjal, expected 1', v_n; END IF;
  SELECT id INTO v_pranjal FROM profiles WHERE org_id = v_org AND status = 'active' AND full_name ILIKE 'Pranjal%';

  SELECT count(*) INTO v_n FROM profiles WHERE org_id = v_org AND status = 'active' AND full_name ILIKE 'Sapana%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'org chart: % active people match Sapana, expected 1', v_n; END IF;
  SELECT id INTO v_sapana FROM profiles WHERE org_id = v_org AND status = 'active' AND full_name ILIKE 'Sapana%';

  SELECT count(*) INTO v_n FROM profiles WHERE org_id = v_org AND status = 'active' AND full_name ILIKE 'Prachi%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'org chart: % active people match Prachi, expected 1', v_n; END IF;
  SELECT id INTO v_prachi FROM profiles WHERE org_id = v_org AND status = 'active' AND full_name ILIKE 'Prachi%';

  SELECT id INTO v_pos FROM open_positions
   WHERE org_id = v_org AND title = 'Manager – Business Operations' LIMIT 1;
  IF v_pos IS NULL THEN
    INSERT INTO open_positions (org_id, title, department, reports_to, sort_order)
    VALUES (v_org, 'Manager – Business Operations', 'Business Operations', v_ceo, 25)
    RETURNING id INTO v_pos;
  END IF;

  -- supervised change of reporting lines (the identity guard allows it only with this set)
  PERFORM set_config('app.allow_profile_admin', 'on', true);

  UPDATE profiles
     SET title = 'Accountability Manager & Community Operations',
         role = CASE WHEN role IN ('hr', 'admin') THEN role ELSE 'manager' END,
         manager_id = v_ceo,
         chart_position_id = v_pos,
         new_role = true
   WHERE id = v_pranjal;
  UPDATE profiles SET manager_id = v_pranjal WHERE id IN (v_sapana, v_prachi);

  PERFORM set_config('app.allow_profile_admin', 'off', true);
  RAISE NOTICE 'org chart: Business Operations set up';
END $$;
