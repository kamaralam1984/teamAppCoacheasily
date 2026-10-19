-- Log and ledger tables are written only by triggers and SECURITY DEFINER functions.
-- Row-level security already refuses everybody else, but Supabase also grants new tables to
-- the anon and authenticated roles by default. Take those grants back so a second lock
-- stands behind RLS, and give back only what the app really reads directly.
REVOKE ALL ON public.audit_log, public.task_events, public.el_lapses, public.el_ledger,
              public.attendance_corrections, public.goal_alerts
  FROM anon, authenticated;

-- the audit screen and a task's history read these two directly (RLS decides who sees what)
GRANT SELECT ON public.audit_log, public.task_events TO authenticated;

-- comments are written by people, never edited or deleted
REVOKE UPDATE, DELETE ON public.task_comments FROM anon, authenticated;
REVOKE ALL ON public.task_comments, public.goal_comments, public.goal_milestones FROM anon;
REVOKE UPDATE ON public.goal_comments FROM authenticated;