-- ═══ STRATEGIC MEETING GOALS: MAIN GOAL / SUB GOAL LABEL ═══
-- A dropdown before each goal's number marks it Main Goal or Sub Goal. It is only a label: the
-- goal stays where it is, with its number, text, outcome, weekly updates and notes unchanged.
-- Every existing goal starts as 'main'. Only adds a column; no row is changed or deleted.

ALTER TABLE public.meeting_goals
  ADD COLUMN IF NOT EXISTS goal_type text NOT NULL DEFAULT 'main'
  CHECK (goal_type IN ('main', 'sub'));
