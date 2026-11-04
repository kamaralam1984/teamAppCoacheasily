-- ═══ STRATEGIC MEETING GOALS: 45-DAY OR WEEKLY ═══
-- A goal is either for the whole run-up to the meeting ('run', the 45-day table) or for one week
-- of it ('week', with the Monday of that week). The page has a toggle between the two.
ALTER TABLE public.meeting_goals
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'run';
ALTER TABLE public.meeting_goals
  ADD COLUMN IF NOT EXISTS week_start date;

ALTER TABLE public.meeting_goals DROP CONSTRAINT IF EXISTS meeting_goals_scope_check;
ALTER TABLE public.meeting_goals ADD CONSTRAINT meeting_goals_scope_check
  CHECK (scope IN ('run', 'week') AND ((scope = 'week') = (week_start IS NOT NULL)));

CREATE INDEX IF NOT EXISTS meeting_goals_week_table
  ON public.meeting_goals (meeting_id, profile_id, week_start) WHERE scope = 'week';
