-- ═══ STRATEGIC MEETING GOALS: REMARKS PER GOAL ═══
-- A third optional column beside Challenges and Learnings, the same way: meeting_goals.remarks
-- holds each goal's own entry, and meeting_goal_notes.remarks (non-NULL = added) records that a
-- table has the column. Only adds columns; nothing is changed or deleted.

ALTER TABLE public.meeting_goals ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.meeting_goal_notes ADD COLUMN IF NOT EXISTS remarks text;
