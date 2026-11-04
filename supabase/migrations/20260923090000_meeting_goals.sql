-- ═══ STRATEGIC MEETING GOALS (the "Goals for next 45 days" sheet, in the app) ═══
-- For each strategic meeting, each person keeps a table of goals: goal, measure, timeline and
-- outcome, plus one written update per week of the run-up to the meeting.
--   * Everyone in the organisation can read every table, like the shared sheet.
--   * A person writes their own, a manager writes for anyone under them, HR and admin for all.
--     Developers write through the service role from the Developer-gated page.

-- Can the signed-in person write this person's goals?
CREATE OR REPLACE FUNCTION public.can_write_meeting_goals(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_role() IN ('hr', 'admin') OR manages(p_profile_id)
$$;
REVOKE ALL ON FUNCTION public.can_write_meeting_goals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_meeting_goals(uuid) TO authenticated, service_role;

-- ───────── 1. GOALS ─────────
CREATE TABLE IF NOT EXISTS public.meeting_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.strategic_meetings(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 100,
  title text NOT NULL DEFAULT '',
  measure text,
  timeline date,
  outcome text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_goals_table ON public.meeting_goals (meeting_id, profile_id, position);

ALTER TABLE public.meeting_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meeting_goals_read ON public.meeting_goals;
CREATE POLICY meeting_goals_read ON public.meeting_goals FOR SELECT TO authenticated
  USING (org_id = my_org());
DROP POLICY IF EXISTS meeting_goals_write ON public.meeting_goals;
CREATE POLICY meeting_goals_write ON public.meeting_goals FOR ALL TO authenticated
  USING (org_id = my_org() AND can_write_meeting_goals(profile_id))
  WITH CHECK (org_id = my_org() AND can_write_meeting_goals(profile_id)
              AND EXISTS (SELECT 1 FROM strategic_meetings m WHERE m.id = meeting_id AND m.org_id = my_org())
              AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = profile_id AND p.org_id = my_org()));
REVOKE ALL ON public.meeting_goals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_goals TO authenticated;
GRANT ALL ON public.meeting_goals TO service_role;

-- ───────── 2. WEEKLY UPDATES ─────────
CREATE TABLE IF NOT EXISTS public.meeting_goal_updates (
  goal_id uuid NOT NULL REFERENCES public.meeting_goals(id) ON DELETE CASCADE,
  week_start date NOT NULL,          -- the Monday of that week
  note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, week_start)
);

ALTER TABLE public.meeting_goal_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meeting_goal_updates_read ON public.meeting_goal_updates;
CREATE POLICY meeting_goal_updates_read ON public.meeting_goal_updates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM meeting_goals g WHERE g.id = goal_id AND g.org_id = my_org()));
DROP POLICY IF EXISTS meeting_goal_updates_write ON public.meeting_goal_updates;
CREATE POLICY meeting_goal_updates_write ON public.meeting_goal_updates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM meeting_goals g
                  WHERE g.id = goal_id AND g.org_id = my_org() AND can_write_meeting_goals(g.profile_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM meeting_goals g
                       WHERE g.id = goal_id AND g.org_id = my_org() AND can_write_meeting_goals(g.profile_id)));
REVOKE ALL ON public.meeting_goal_updates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_goal_updates TO authenticated;
GRANT ALL ON public.meeting_goal_updates TO service_role;

-- ───────── 3. updated_at ─────────
CREATE OR REPLACE FUNCTION public.meeting_goals_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS meeting_goals_touch_trg ON public.meeting_goals;
CREATE TRIGGER meeting_goals_touch_trg BEFORE UPDATE ON public.meeting_goals
  FOR EACH ROW EXECUTE FUNCTION public.meeting_goals_touch();
DROP TRIGGER IF EXISTS meeting_goal_updates_touch_trg ON public.meeting_goal_updates;
CREATE TRIGGER meeting_goal_updates_touch_trg BEFORE UPDATE ON public.meeting_goal_updates
  FOR EACH ROW EXECUTE FUNCTION public.meeting_goals_touch();
