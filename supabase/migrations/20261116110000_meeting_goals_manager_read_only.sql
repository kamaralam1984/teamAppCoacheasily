-- ═══ STRATEGIC MEETING GOALS: MANAGERS READ THEIR TEAM'S TABLES BUT DO NOT EDIT THEM ═══
-- Read:  the person, anyone above them in the manager chain, HR / admin.
-- Write: the person themselves and HR / admin only (developers write through the audited
--        Developer route). Managers can no longer change their team's tables.
-- Only functions and policies change; no table, column or row is touched or deleted.

CREATE OR REPLACE FUNCTION public.can_read_meeting_goals(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_role() IN ('hr', 'admin') OR manages(p_profile_id)
$$;
REVOKE ALL ON FUNCTION public.can_read_meeting_goals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_meeting_goals(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_write_meeting_goals(p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_role() IN ('hr', 'admin') OR p_profile_id = my_profile_id()
$$;

DROP POLICY IF EXISTS meeting_goals_read ON public.meeting_goals;
CREATE POLICY meeting_goals_read ON public.meeting_goals FOR SELECT TO authenticated
  USING (org_id = my_org() AND can_read_meeting_goals(profile_id));

DROP POLICY IF EXISTS meeting_goal_updates_read ON public.meeting_goal_updates;
CREATE POLICY meeting_goal_updates_read ON public.meeting_goal_updates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM meeting_goals g
                  WHERE g.id = goal_id AND g.org_id = my_org() AND can_read_meeting_goals(g.profile_id)));

DROP POLICY IF EXISTS meeting_goal_notes_read ON public.meeting_goal_notes;
CREATE POLICY meeting_goal_notes_read ON public.meeting_goal_notes FOR SELECT TO authenticated
  USING (org_id = my_org() AND can_read_meeting_goals(profile_id));
