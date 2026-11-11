-- ═══ STRATEGIC MEETING GOALS: OPTIONAL CHALLENGES AND LEARNINGS ═══
-- Beside a person's goals table they may add a Challenges box and a Learnings box, one each for
-- the whole table (like the merged columns of the shared sheet). Only people who want them add
-- them: a NULL column means "not added", an empty string means "added, nothing written yet".
-- `period` is 'run' for the 45-day table, or the Monday (YYYY-MM-DD) of a weekly table.
-- Read and write rights are the same as the goals themselves.

CREATE TABLE IF NOT EXISTS public.meeting_goal_notes (
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.strategic_meetings(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period text NOT NULL,
  challenges text,
  learnings text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, profile_id, period),
  CONSTRAINT meeting_goal_notes_period_check
    CHECK (period = 'run' OR period ~ '^\d{4}-\d{2}-\d{2}$')
);

ALTER TABLE public.meeting_goal_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meeting_goal_notes_read ON public.meeting_goal_notes;
CREATE POLICY meeting_goal_notes_read ON public.meeting_goal_notes FOR SELECT TO authenticated
  USING (org_id = my_org());
DROP POLICY IF EXISTS meeting_goal_notes_write ON public.meeting_goal_notes;
CREATE POLICY meeting_goal_notes_write ON public.meeting_goal_notes FOR ALL TO authenticated
  USING (org_id = my_org() AND can_write_meeting_goals(profile_id))
  WITH CHECK (org_id = my_org() AND can_write_meeting_goals(profile_id)
              AND EXISTS (SELECT 1 FROM strategic_meetings m WHERE m.id = meeting_id AND m.org_id = my_org())
              AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = profile_id AND p.org_id = my_org()));
REVOKE ALL ON public.meeting_goal_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_goal_notes TO authenticated;
GRANT ALL ON public.meeting_goal_notes TO service_role;

DROP TRIGGER IF EXISTS meeting_goal_notes_touch_trg ON public.meeting_goal_notes;
CREATE TRIGGER meeting_goal_notes_touch_trg BEFORE UPDATE ON public.meeting_goal_notes
  FOR EACH ROW EXECUTE FUNCTION public.meeting_goals_touch();
