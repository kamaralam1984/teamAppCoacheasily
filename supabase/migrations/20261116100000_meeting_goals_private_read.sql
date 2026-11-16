-- ═══ STRATEGIC MEETING GOALS: ONLY THE PERSON, THEIR MANAGERS AND HR/ADMIN CAN READ ═══
-- Until now anyone in the org could read everyone's goal tables. Reading now follows the same
-- rule as writing (can_write_meeting_goals): the person themselves, anyone above them in the
-- manager chain, and HR / admin. Developers read through the gated server function.
-- Only the SELECT policies change; no table, column or row is touched or deleted.

DROP POLICY IF EXISTS meeting_goals_read ON public.meeting_goals;
CREATE POLICY meeting_goals_read ON public.meeting_goals FOR SELECT TO authenticated
  USING (org_id = my_org() AND can_write_meeting_goals(profile_id));

DROP POLICY IF EXISTS meeting_goal_updates_read ON public.meeting_goal_updates;
CREATE POLICY meeting_goal_updates_read ON public.meeting_goal_updates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM meeting_goals g
                  WHERE g.id = goal_id AND g.org_id = my_org() AND can_write_meeting_goals(g.profile_id)));

DROP POLICY IF EXISTS meeting_goal_notes_read ON public.meeting_goal_notes;
CREATE POLICY meeting_goal_notes_read ON public.meeting_goal_notes FOR SELECT TO authenticated
  USING (org_id = my_org() AND can_write_meeting_goals(profile_id));
