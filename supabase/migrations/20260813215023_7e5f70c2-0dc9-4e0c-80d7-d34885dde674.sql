-- ── 1. Indexes: every foreign key + every date column used in range filters ──
CREATE INDEX IF NOT EXISTS idx_attendance_org_date ON public.attendance (org_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance (date);
CREATE INDEX IF NOT EXISTS idx_calendar_attendees_org ON public.calendar_attendees (org_id);
CREATE INDEX IF NOT EXISTS idx_calendar_attendees_profile ON public.calendar_attendees (profile_id);
CREATE INDEX IF NOT EXISTS idx_calendar_tokens_org ON public.calendar_tokens (org_id);
CREATE INDEX IF NOT EXISTS idx_comp_off_consumed_by ON public.comp_off_credits (consumed_by);
CREATE INDEX IF NOT EXISTS idx_comp_off_org ON public.comp_off_credits (org_id);
CREATE INDEX IF NOT EXISTS idx_cycles_created_by ON public.cycles (created_by);
CREATE INDEX IF NOT EXISTS idx_cycles_org ON public.cycles (org_id);
CREATE INDEX IF NOT EXISTS idx_daily_reflections_org ON public.daily_reflections (org_id);
CREATE INDEX IF NOT EXISTS idx_energy_logs_org ON public.energy_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON public.events (created_by);
CREATE INDEX IF NOT EXISTS idx_events_cycle ON public.events (cycle_id);
CREATE INDEX IF NOT EXISTS idx_events_host ON public.events (host_id);
CREATE INDEX IF NOT EXISTS idx_goal_advice_org ON public.goal_advice (org_id);
CREATE INDEX IF NOT EXISTS idx_goal_entries_org ON public.goal_entries (org_id);
CREATE INDEX IF NOT EXISTS idx_goal_entries_date ON public.goal_entries (date);
CREATE INDEX IF NOT EXISTS idx_goals_cycle ON public.goals (cycle_id);
CREATE INDEX IF NOT EXISTS idx_goals_org ON public.goals (org_id);
CREATE INDEX IF NOT EXISTS idx_leave_approver ON public.leave_requests (approver_id);
CREATE INDEX IF NOT EXISTS idx_leave_decided_by ON public.leave_requests (decided_by);
CREATE INDEX IF NOT EXISTS idx_leave_handover_to ON public.leave_requests (handover_to);
CREATE INDEX IF NOT EXISTS idx_leave_org ON public.leave_requests (org_id);
CREATE INDEX IF NOT EXISTS idx_leave_from_date ON public.leave_requests (from_date);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON public.notifications (org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_inbox ON public.notifications (profile_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_programs_cover ON public.programs (cover_id);
CREATE INDEX IF NOT EXISTS idx_programs_created_by ON public.programs (created_by);
CREATE INDEX IF NOT EXISTS idx_programs_host ON public.programs (host_id);
CREATE INDEX IF NOT EXISTS idx_programs_from_date ON public.programs (from_date);
CREATE INDEX IF NOT EXISTS idx_recognitions_from ON public.recognitions (from_id);
CREATE INDEX IF NOT EXISTS idx_recognitions_to ON public.recognitions (to_id);
CREATE INDEX IF NOT EXISTS idx_recognitions_org ON public.recognitions (org_id);
CREATE INDEX IF NOT EXISTS idx_ritual_logs_org ON public.ritual_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_rituals_org ON public.rituals (org_id);
CREATE INDEX IF NOT EXISTS idx_rituals_profile ON public.rituals (profile_id);
CREATE INDEX IF NOT EXISTS idx_sop_items_org ON public.sop_items (org_id);
CREATE INDEX IF NOT EXISTS idx_sop_logs_org ON public.sop_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_sop_logs_item ON public.sop_logs (sop_item_id);
CREATE INDEX IF NOT EXISTS idx_tasks_blocked_by ON public.tasks (blocked_by);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON public.tasks (org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks (due_date);

-- ── 2. Digest builders. Read-only; service_role only (the digest job runs as it). ──
CREATE OR REPLACE FUNCTION public.digests_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT (settings->>'digests_enabled')::boolean FROM organisations LIMIT 1), false);
$$;

CREATE OR REPLACE FUNCTION public.digest_daily()
RETURNS TABLE (profile_id uuid, email text, full_name text, payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  RETURN QUERY
  SELECT p.id,
         u.email::text,
         p.full_name,
         jsonb_build_object(
           'date', v_today,
           'tasks', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('title', t.title, 'priority', t.priority) ORDER BY t.created_at)
               FROM tasks t
              WHERE t.owner_id = p.id AND t.done = false
                AND t.due_date IS NOT NULL AND t.due_date <= v_today
           ), '[]'::jsonb),
           'attendance_marked', EXISTS (
             SELECT 1 FROM attendance a WHERE a.profile_id = p.id AND a.date = v_today
           ),
           'numbers_logged', EXISTS (
             SELECT 1 FROM goal_entries e JOIN goals g ON g.id = e.goal_id
              WHERE g.profile_id = p.id AND e.date = v_today
           ),
           'calendar', COALESCE((
             SELECT jsonb_agg(x.label ORDER BY x.label) FROM (
               SELECT pr.name || ' · ' || to_char(pr.start_time, 'HH12:MI AM') AS label
                 FROM programs pr
                WHERE pr.org_id = p.org_id AND v_today BETWEEN pr.from_date AND pr.to_date
               UNION ALL
               SELECT ev.title FROM events ev
                WHERE ev.org_id = p.org_id AND ev.date = v_today
             ) x
           ), '[]'::jsonb),
           'on_leave', EXISTS (
             SELECT 1 FROM leave_requests l
              WHERE l.profile_id = p.id AND l.status = 'approved'
                AND v_today BETWEEN l.from_date AND l.to_date
           )
         )
    FROM profiles p
    JOIN auth.users u ON u.id = p.auth_user_id
   WHERE p.status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.digest_weekly_self()
RETURNS TABLE (profile_id uuid, email text, full_name text, payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start date := v_today - 7;
BEGIN
  RETURN QUERY
  SELECT p.id, u.email::text, p.full_name,
         jsonb_build_object(
           'from', v_start, 'to', v_today,
           'tasks_done', (SELECT count(*) FROM tasks t
                           WHERE t.owner_id = p.id AND t.done = true
                             AND t.updated_at >= v_start),
           'tasks_open', (SELECT count(*) FROM tasks t
                           WHERE t.owner_id = p.id AND t.done = false),
           'days_logged', (SELECT count(DISTINCT e.date) FROM goal_entries e
                             JOIN goals g ON g.id = e.goal_id
                            WHERE g.profile_id = p.id AND e.date >= v_start),
           'goals', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('name', g.name,
                      'progress', COALESCE((public.goal_progress(g.id)->>'pct')::numeric, 0)))
               FROM goals g
              WHERE g.profile_id = p.id AND g.archived = false
           ), '[]'::jsonb),
           'week_ahead', COALESCE((
             SELECT jsonb_agg(t.title ORDER BY t.due_date)
               FROM tasks t
              WHERE t.owner_id = p.id AND t.done = false
                AND t.due_date BETWEEN v_today AND v_today + 7
           ), '[]'::jsonb)
         )
    FROM profiles p
    JOIN auth.users u ON u.id = p.auth_user_id
   WHERE p.status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.digest_weekly_manager()
RETURNS TABLE (profile_id uuid, email text, full_name text, payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start date := v_today - 7;
BEGIN
  RETURN QUERY
  SELECT m.id, u.email::text, m.full_name,
         jsonb_build_object(
           'from', v_start, 'to', v_today,
           'team_size', (SELECT count(*) FROM profiles r
                          WHERE r.manager_id = m.id AND r.status = 'active'),
           'tasks_done', (SELECT count(*) FROM tasks t JOIN profiles r ON r.id = t.owner_id
                           WHERE r.manager_id = m.id AND t.done = true AND t.updated_at >= v_start),
           'tasks_open', (SELECT count(*) FROM tasks t JOIN profiles r ON r.id = t.owner_id
                           WHERE r.manager_id = m.id AND t.done = false),
           'no_numbers', COALESCE((
             SELECT jsonb_agg(r.full_name) FROM profiles r
              WHERE r.manager_id = m.id AND r.status = 'active'
                AND NOT EXISTS (
                  SELECT 1 FROM goal_entries e JOIN goals g ON g.id = e.goal_id
                   WHERE g.profile_id = r.id AND e.date >= v_start)
           ), '[]'::jsonb),
           'stale_goals', COALESCE((
             SELECT jsonb_agg(r.full_name) FROM profiles r
              WHERE r.manager_id = m.id AND r.status = 'active'
                AND NOT EXISTS (
                  SELECT 1 FROM goals g WHERE g.profile_id = r.id AND g.archived = false)
           ), '[]'::jsonb),
           'old_approvals', (
             SELECT count(*) FROM leave_requests l
              WHERE l.approver_id = m.id AND l.status = 'pending'
                AND l.created_at < now() - interval '24 hours')
         )
    FROM profiles m
    JOIN auth.users u ON u.id = m.auth_user_id
   WHERE m.status = 'active'
     AND EXISTS (SELECT 1 FROM profiles r WHERE r.manager_id = m.id AND r.status = 'active');
END;
$$;

REVOKE ALL ON FUNCTION public.digest_daily() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.digest_weekly_self() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.digest_weekly_manager() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.digest_daily() TO service_role;
GRANT EXECUTE ON FUNCTION public.digest_weekly_self() TO service_role;
GRANT EXECUTE ON FUNCTION public.digest_weekly_manager() TO service_role;
GRANT EXECUTE ON FUNCTION public.digests_enabled() TO service_role, authenticated;