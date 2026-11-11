-- ═══ STRATEGIC MEETING GOALS: CHALLENGES AND LEARNINGS PER GOAL ═══
-- The optional Challenges / Learnings columns now hold one entry per goal, beside it, instead of
-- one box for the whole table. meeting_goal_notes stays as the record of who added the columns
-- (a non-NULL field = added). Nothing is deleted: any text already written in a whole-table box
-- is copied into the first goal of that table and also left where it was.

ALTER TABLE public.meeting_goals ADD COLUMN IF NOT EXISTS challenges text;
ALTER TABLE public.meeting_goals ADD COLUMN IF NOT EXISTS learnings text;

WITH first_goal AS (
  SELECT DISTINCT ON (g.meeting_id, g.profile_id, g.scope, g.week_start)
         g.id, n.challenges, n.learnings
    FROM public.meeting_goals g
    JOIN public.meeting_goal_notes n
      ON n.meeting_id = g.meeting_id AND n.profile_id = g.profile_id
     AND n.period = CASE WHEN g.scope = 'run' THEN 'run' ELSE g.week_start::text END
   WHERE coalesce(n.challenges, '') <> '' OR coalesce(n.learnings, '') <> ''
   ORDER BY g.meeting_id, g.profile_id, g.scope, g.week_start, g.position, g.created_at
)
UPDATE public.meeting_goals g
   SET challenges = coalesce(g.challenges, nullif(f.challenges, '')),
       learnings  = coalesce(g.learnings,  nullif(f.learnings,  ''))
  FROM first_goal f
 WHERE g.id = f.id;
