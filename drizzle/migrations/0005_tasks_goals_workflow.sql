-- ═══ TASK LIFECYCLE + GOAL STATUS ═══
-- Tasks:  Assigned → Accepted → In progress → Review → Completed
--   * Something you made for yourself skips "Assigned" and can go straight to Completed.
--   * Something somebody else asked you for goes to Review when you finish it; the person who
--     asked (or your manager / HR / admin) completes it or sends it back.
--   * Overdue is never stored: it is "not completed and past its date". A nightly job sends
--     one overdue notice and one "due soon" notice per task.
--   * Comments (with an optional evidence link) and a history of what changed are kept.
-- Goals:  milestones, a status worked out from progress against the cycle (On track /
--         At risk / Completed / Overdue), and comments from managers.

-- ───────── 1. TASKS ─────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS overdue_notified_on date,
  ADD COLUMN IF NOT EXISTS due_soon_notified_on date;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('assigned', 'accepted', 'in_progress', 'review', 'completed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing tasks are already being worked on.
UPDATE public.tasks SET status = CASE WHEN done THEN 'completed' ELSE 'accepted' END
 WHERE status = 'assigned';

CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks (owner_id, status);

CREATE TABLE IF NOT EXISTS public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL,
  from_value text,
  to_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_events_task_idx ON public.task_events (task_id, created_at);

CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  evidence_url text CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://[^\s]+$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_comments_task_idx ON public.task_comments (task_id, created_at);

-- Same people who can read the task can read its comments and history.
CREATE OR REPLACE FUNCTION public.can_read_task(p_task_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tasks t
     WHERE t.id = p_task_id AND t.org_id = my_org()
       AND (t.owner_id = my_profile_id() OR t.created_by = my_profile_id()
            OR manages(t.owner_id) OR my_role() = ANY (ARRAY['hr', 'admin']))) $$;
REVOKE ALL ON FUNCTION public.can_read_task(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_task(uuid) TO authenticated;

ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.task_events TO authenticated;
GRANT SELECT, INSERT ON public.task_comments TO authenticated;
GRANT ALL ON public.task_events, public.task_comments TO service_role;

DROP POLICY IF EXISTS "read task events" ON public.task_events;
CREATE POLICY "read task events" ON public.task_events FOR SELECT TO authenticated
  USING (can_read_task(task_id));
DROP POLICY IF EXISTS "read task comments" ON public.task_comments;
CREATE POLICY "read task comments" ON public.task_comments FOR SELECT TO authenticated
  USING (can_read_task(task_id));
DROP POLICY IF EXISTS "write own task comments" ON public.task_comments;
CREATE POLICY "write own task comments" ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND author_id = my_profile_id() AND can_read_task(task_id));

-- Who may move a task where. Runs before tasks_before_write (alphabetical), which then
-- derives done_at from the final value of done.
CREATE OR REPLACE FUNCTION public.tasks_aa_workflow() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_self_made boolean;
  v_is_owner boolean;
  v_is_reviewer boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.done THEN
      NEW.status := 'completed';
    ELSIF NEW.status = 'assigned' AND (NEW.created_by IS NULL OR NEW.created_by = NEW.owner_id) THEN
      NEW.status := 'accepted';
    END IF;
    NEW.done := (NEW.status = 'completed');
    RETURN NEW;
  END IF;

  -- Handed to somebody else: back to the start for them.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    NEW.status := CASE WHEN v_me IS NOT DISTINCT FROM NEW.owner_id OR NEW.created_by = NEW.owner_id
                       THEN 'accepted' ELSE 'assigned' END;
    NEW.done := false;
    NEW.overdue_notified_on := NULL;
    NEW.due_soon_notified_on := NULL;
    RETURN NEW;
  END IF;

  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    NEW.overdue_notified_on := NULL;
    NEW.due_soon_notified_on := NULL;
  END IF;

  -- The tick box (done) maps onto the lifecycle.
  IF NEW.done IS DISTINCT FROM OLD.done AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    NEW.status := CASE WHEN NEW.done THEN 'completed' ELSE 'in_progress' END;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND v_me IS NOT NULL THEN
    v_self_made := OLD.created_by IS NULL OR OLD.created_by = OLD.owner_id;
    v_is_owner := v_me = OLD.owner_id;
    v_is_reviewer := v_me <> OLD.owner_id
      AND (v_me = OLD.created_by OR manages(OLD.owner_id) OR my_role() = ANY (ARRAY['hr', 'admin']));

    IF v_is_owner THEN
      -- Something somebody else asked for is checked by them, not self-approved.
      IF NEW.status = 'completed' AND NOT v_self_made AND OLD.status <> 'completed' THEN
        NEW.status := 'review';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
           (OLD.status = 'assigned' AND NEW.status IN ('accepted', 'in_progress', 'review', 'completed'))
        OR (OLD.status = 'accepted' AND NEW.status IN ('in_progress', 'review', 'completed'))
        OR (OLD.status = 'in_progress' AND NEW.status IN ('review', 'completed'))
        OR (OLD.status = 'review' AND NEW.status = 'in_progress')
        OR (OLD.status = 'completed' AND NEW.status = 'in_progress' AND v_self_made)) THEN
        RAISE EXCEPTION 'This task can''t move from % to %.', OLD.status, NEW.status;
      END IF;
    ELSIF v_is_reviewer THEN
      IF NOT (
           (OLD.status = 'review' AND NEW.status IN ('completed', 'in_progress'))
        OR (OLD.status = 'completed' AND NEW.status = 'in_progress')
        OR (OLD.status IN ('assigned', 'accepted', 'in_progress') AND NEW.status = 'completed')) THEN
        RAISE EXCEPTION 'This task can''t move from % to %.', OLD.status, NEW.status;
      END IF;
    ELSE
      RAISE EXCEPTION 'You can''t change this task''s status.';
    END IF;
  END IF;

  NEW.done := (NEW.status = 'completed');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_aa_workflow ON public.tasks;
CREATE TRIGGER tasks_aa_workflow BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_aa_workflow();

-- History, notifications and the audit trail for what changed.
CREATE OR REPLACE FUNCTION public.tasks_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_label text;
  v_manager uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO task_events (org_id, task_id, actor_id, kind, to_value)
    VALUES (NEW.org_id, NEW.id, coalesce(v_me, NEW.created_by), 'created', NEW.status);
    IF NEW.created_by IS NOT NULL AND NEW.created_by <> NEW.owner_id THEN
      PERFORM audit_write(NEW.org_id, 'task', 'task.assign', NEW.owner_id, NEW.id,
        format('%s gave %s the task "%s"', audit_name(NEW.created_by), audit_name(NEW.owner_id), NEW.title),
        NULL, jsonb_build_object('due_date', NEW.due_date, 'priority', NEW.priority));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    INSERT INTO task_events (org_id, task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.org_id, NEW.id, v_me, 'reassigned', audit_name(OLD.owner_id), audit_name(NEW.owner_id));
    PERFORM audit_write(NEW.org_id, 'task', 'task.reassign', NEW.owner_id, NEW.id,
      format('%s moved the task "%s" from %s to %s', audit_actor(), NEW.title,
             audit_name(OLD.owner_id), audit_name(NEW.owner_id)),
      jsonb_build_object('owner_id', OLD.owner_id), jsonb_build_object('owner_id', NEW.owner_id));
    IF NEW.owner_id IS DISTINCT FROM v_me THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (NEW.org_id, NEW.owner_id, 'A task was handed to you', NEW.title, '/tasks');
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO task_events (org_id, task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.org_id, NEW.id, v_me, 'status', OLD.status, NEW.status);
    PERFORM audit_write(NEW.org_id, 'task', 'task.status', NEW.owner_id, NEW.id,
      format('%s moved "%s" (%s) from %s to %s', audit_actor(), NEW.title, audit_name(NEW.owner_id),
             replace(OLD.status, '_', ' '), replace(NEW.status, '_', ' ')),
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));

    SELECT manager_id INTO v_manager FROM profiles WHERE id = NEW.owner_id;
    v_label := audit_name(NEW.owner_id);

    IF NEW.status = 'accepted' AND NEW.created_by IS NOT NULL AND NEW.created_by <> NEW.owner_id THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (NEW.org_id, NEW.created_by, v_label || ' accepted a task', NEW.title, '/tasks');
    ELSIF NEW.status = 'review' THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      SELECT NEW.org_id, t, v_label || ' finished a task — ready for your review', NEW.title, '/tasks'
        FROM unnest(ARRAY[coalesce(NEW.created_by, v_manager)]) t
       WHERE t IS NOT NULL AND t <> NEW.owner_id;
    ELSIF NEW.status = 'completed' AND v_me IS DISTINCT FROM NEW.owner_id THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (NEW.org_id, NEW.owner_id, 'Your task was marked complete', NEW.title, '/tasks');
    ELSIF NEW.status = 'in_progress' AND OLD.status IN ('review', 'completed')
          AND v_me IS DISTINCT FROM NEW.owner_id THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (NEW.org_id, NEW.owner_id, 'A task was sent back to you', NEW.title, '/tasks');
    END IF;
  END IF;

  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO task_events (org_id, task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.org_id, NEW.id, v_me, 'due_changed', OLD.due_date::text, NEW.due_date::text);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO task_events (org_id, task_id, actor_id, kind, from_value, to_value)
    VALUES (NEW.org_id, NEW.id, v_me, 'priority_changed', OLD.priority, NEW.priority);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_history_ins ON public.tasks;
CREATE TRIGGER tasks_history_ins AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_history();
DROP TRIGGER IF EXISTS tasks_history_upd ON public.tasks;
CREATE TRIGGER tasks_history_upd AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_history();

CREATE OR REPLACE FUNCTION public.task_comment_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t tasks%ROWTYPE;
  v_other uuid;
BEGIN
  SELECT * INTO t FROM tasks WHERE id = NEW.task_id;
  INSERT INTO task_events (org_id, task_id, actor_id, kind, to_value)
  VALUES (NEW.org_id, NEW.task_id, NEW.author_id, 'comment', left(NEW.body, 120));

  v_other := CASE WHEN NEW.author_id = t.owner_id THEN t.created_by ELSE t.owner_id END;
  IF v_other IS NOT NULL AND v_other <> NEW.author_id THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (NEW.org_id, v_other, audit_name(NEW.author_id) || ' commented on a task',
            t.title || ': ' || left(NEW.body, 120), '/tasks');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS task_comment_after_ins ON public.task_comments;
CREATE TRIGGER task_comment_after_ins AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.task_comment_after();

-- Nightly: one overdue notice and one "due soon" notice per task.
CREATE OR REPLACE FUNCTION public.tasks_due_tick() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n integer := 0;
  r record;
BEGIN
  FOR r IN SELECT * FROM tasks
            WHERE status <> 'completed' AND due_date < v_today AND overdue_notified_on IS NULL
  LOOP
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (r.org_id, r.owner_id, 'Overdue: ' || r.title,
            'This was due ' || to_char(r.due_date, 'FMDD Mon') || '.', '/tasks');
    IF r.created_by IS NOT NULL AND r.created_by <> r.owner_id THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (r.org_id, r.created_by, audit_name(r.owner_id) || '''s task is overdue',
              r.title || ' was due ' || to_char(r.due_date, 'FMDD Mon') || '.', '/tasks');
    END IF;
    INSERT INTO task_events (org_id, task_id, kind, to_value) VALUES (r.org_id, r.id, 'overdue', r.due_date::text);
    UPDATE tasks SET overdue_notified_on = v_today WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;

  FOR r IN SELECT * FROM tasks
            WHERE status <> 'completed' AND due_date BETWEEN v_today AND v_today + 1
              AND due_soon_notified_on IS NULL
  LOOP
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (r.org_id, r.owner_id,
            CASE WHEN r.due_date = v_today THEN 'Due today: ' ELSE 'Due tomorrow: ' END || r.title,
            NULL, '/tasks');
    UPDATE tasks SET due_soon_notified_on = v_today WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.tasks_due_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tasks_due_tick() TO service_role;

-- ───────── 2. GOALS ─────────
CREATE TABLE IF NOT EXISTS public.goal_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  due_date date,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goal_milestones_goal_idx ON public.goal_milestones (goal_id, created_at);

CREATE TABLE IF NOT EXISTS public.goal_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goal_comments_goal_idx ON public.goal_comments (goal_id, created_at);

-- one alert per goal per status, so nobody is nagged twice about the same thing
CREATE TABLE IF NOT EXISTS public.goal_alerts (
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  status text NOT NULL,
  notified_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  PRIMARY KEY (goal_id, status)
);

ALTER TABLE public.goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_alerts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_milestones TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.goal_comments TO authenticated;
GRANT ALL ON public.goal_milestones, public.goal_comments, public.goal_alerts TO service_role;

DROP POLICY IF EXISTS "read goal milestones" ON public.goal_milestones;
CREATE POLICY "read goal milestones" ON public.goal_milestones FOR SELECT TO authenticated
  USING (can_read_goal(goal_id));
DROP POLICY IF EXISTS "write goal milestones" ON public.goal_milestones;
CREATE POLICY "write goal milestones" ON public.goal_milestones FOR ALL TO authenticated
  USING (can_read_goal(goal_id) AND (goal_owner(goal_id) = my_profile_id()
         OR manages(goal_owner(goal_id)) OR my_role() = ANY (ARRAY['hr', 'admin'])))
  WITH CHECK (org_id = my_org() AND can_read_goal(goal_id) AND (goal_owner(goal_id) = my_profile_id()
         OR manages(goal_owner(goal_id)) OR my_role() = ANY (ARRAY['hr', 'admin'])));

DROP POLICY IF EXISTS "read goal comments" ON public.goal_comments;
CREATE POLICY "read goal comments" ON public.goal_comments FOR SELECT TO authenticated
  USING (can_read_goal(goal_id));
DROP POLICY IF EXISTS "write own goal comments" ON public.goal_comments;
CREATE POLICY "write own goal comments" ON public.goal_comments FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND author_id = my_profile_id() AND can_read_goal(goal_id));
DROP POLICY IF EXISTS "delete own goal comments" ON public.goal_comments;
CREATE POLICY "delete own goal comments" ON public.goal_comments FOR DELETE TO authenticated
  USING (author_id = my_profile_id());

CREATE OR REPLACE FUNCTION public.goal_milestones_before() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.done AND (TG_OP = 'INSERT' OR NOT OLD.done) THEN NEW.done_at := now(); END IF;
  IF NOT NEW.done THEN NEW.done_at := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS goal_milestones_before_write ON public.goal_milestones;
CREATE TRIGGER goal_milestones_before_write BEFORE INSERT OR UPDATE ON public.goal_milestones
  FOR EACH ROW EXECUTE FUNCTION public.goal_milestones_before();

-- A comment tells the other side: the owner hears from their manager, and the manager hears back.
CREATE OR REPLACE FUNCTION public.goal_comment_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g goals%ROWTYPE;
  v_manager uuid;
BEGIN
  SELECT * INTO g FROM goals WHERE id = NEW.goal_id;
  IF NEW.author_id <> g.profile_id THEN
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (NEW.org_id, g.profile_id, audit_name(NEW.author_id) || ' commented on your goal',
            g.name || ': ' || left(NEW.body, 120), '/goals');
  ELSE
    SELECT manager_id INTO v_manager FROM profiles WHERE id = g.profile_id;
    IF v_manager IS NOT NULL THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (NEW.org_id, v_manager, audit_name(g.profile_id) || ' replied on a goal',
              g.name || ': ' || left(NEW.body, 120), '/team');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS goal_comment_after_ins ON public.goal_comments;
CREATE TRIGGER goal_comment_after_ins AFTER INSERT ON public.goal_comments
  FOR EACH ROW EXECUTE FUNCTION public.goal_comment_after();

-- Progress as a percentage of the way from baseline to target. Same rule as goal_progress(),
-- without the permission check, so the nightly job and the dashboards can use it.
CREATE OR REPLACE FUNCTION public.goal_pct_internal(p_goal_id uuid) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g goals%ROWTYPE;
  v_current numeric := 0;
  v_n int;
  v_first numeric;
  v_last numeric;
BEGIN
  SELECT * INTO g FROM goals WHERE id = p_goal_id;
  IF g.id IS NULL THEN RETURN NULL; END IF;

  IF g.kind = 'funnel' THEN
    v_n := coalesce(array_length(g.stages, 1), 0);
    IF v_n >= 2 THEN
      SELECT coalesce(sum(coalesce(counts[1], 0)), 0), coalesce(sum(coalesce(counts[v_n], 0)), 0)
        INTO v_first, v_last FROM goal_entries WHERE goal_id = g.id;
      v_current := CASE WHEN v_first > 0 THEN round(v_last / v_first * 100, 1) ELSE 0 END;
    END IF;
  ELSE
    SELECT value INTO v_current FROM goal_entries
     WHERE goal_id = g.id AND value IS NOT NULL ORDER BY date DESC LIMIT 1;
    v_current := coalesce(v_current, g.baseline);
  END IF;

  IF g.target IS DISTINCT FROM g.baseline THEN
    RETURN round(greatest(0, least(100, (v_current - g.baseline) / (g.target - g.baseline) * 100)), 1);
  END IF;
  RETURN 0;
END $$;
REVOKE ALL ON FUNCTION public.goal_pct_internal(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.goal_pct_internal(uuid) TO service_role;

-- On track / At risk / Completed / Overdue, worked out the same way for everyone:
--   Completed: 100%.   Overdue: the cycle has ended (or been closed) and it isn't 100%.
--   At risk:   at least a tenth of the cycle has gone and progress is 20 points or more
--              behind where an even pace would be.   Otherwise: On track.
CREATE OR REPLACE FUNCTION public.goal_status_info(p_goal_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g goals%ROWTYPE;
  c cycles%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_pct numeric;
  v_elapsed numeric;
  v_expected numeric;
  v_status text;
BEGIN
  SELECT * INTO g FROM goals WHERE id = p_goal_id;
  IF g.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO c FROM cycles WHERE id = g.cycle_id;

  v_pct := goal_pct_internal(p_goal_id);
  v_elapsed := least(1, greatest(0, (v_today - c.start_date)::numeric / greatest(c.end_date - c.start_date, 1)));
  v_expected := round(v_elapsed * 100, 1);

  v_status := CASE
    WHEN v_pct >= 100 THEN 'completed'
    WHEN v_today > c.end_date OR c.status = 'closed' THEN 'overdue'
    WHEN g.target IS DISTINCT FROM g.baseline AND v_elapsed >= 0.10 AND v_expected - v_pct >= 20 THEN 'at_risk'
    ELSE 'on_track' END;

  RETURN jsonb_build_object('goal_id', g.id, 'status', v_status, 'pct', v_pct, 'expected_pct', v_expected);
END $$;
REVOKE ALL ON FUNCTION public.goal_status_info(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.goal_status_info(uuid) TO service_role;

-- A person's goals in the active cycle with status, milestones and comment counts.
CREATE OR REPLACE FUNCTION public.goals_status_for(p_profile_id uuid DEFAULT NULL, p_cycle_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_cycle uuid := p_cycle_id;
BEGIN
  IF v_target IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF NOT (v_target = my_profile_id() OR manages(v_target) OR my_role() = ANY (ARRAY['hr', 'admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_target AND org_id = my_org()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_cycle IS NULL THEN
    SELECT id INTO v_cycle FROM cycles WHERE org_id = my_org() AND status = 'active'
     ORDER BY start_date DESC LIMIT 1;
  END IF;
  IF v_cycle IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'goal_id', g.id, 'name', g.name, 'kind', g.kind, 'unit', g.unit,
        'milestones_total', (SELECT count(*) FROM goal_milestones m WHERE m.goal_id = g.id),
        'milestones_done', (SELECT count(*) FROM goal_milestones m WHERE m.goal_id = g.id AND m.done),
        'comments', (SELECT count(*) FROM goal_comments k WHERE k.goal_id = g.id))
      || goal_status_info(g.id)
      ORDER BY g.created_at)
      FROM goals g
     WHERE g.profile_id = v_target AND g.cycle_id = v_cycle AND g.archived = false), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.goals_status_for(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.goals_status_for(uuid, uuid) TO authenticated;

-- Nightly: tell the owner and their manager the first time a goal slips to at risk / overdue.
CREATE OR REPLACE FUNCTION public.goals_status_tick() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_n integer := 0;
  r record;
  v_info jsonb;
  v_manager uuid;
  v_inserted integer;
BEGIN
  FOR r IN
    SELECT g.* FROM goals g JOIN cycles c ON c.id = g.cycle_id
     WHERE g.archived = false AND (c.status = 'active' OR c.end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 14)
  LOOP
    v_info := goal_status_info(r.id);
    IF v_info->>'status' IN ('at_risk', 'overdue') THEN
      INSERT INTO goal_alerts (goal_id, status) VALUES (r.id, v_info->>'status') ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      IF v_inserted = 1 THEN
        INSERT INTO notifications (org_id, profile_id, title, body, link)
        VALUES (r.org_id, r.profile_id,
                CASE WHEN v_info->>'status' = 'overdue' THEN 'A goal missed its cycle' ELSE 'A goal is at risk' END,
                format('%s: %s%% done, %s%% of the cycle has gone.', r.name, v_info->>'pct', v_info->>'expected_pct'),
                '/goals');
        SELECT manager_id INTO v_manager FROM profiles WHERE id = r.profile_id;
        IF v_manager IS NOT NULL THEN
          INSERT INTO notifications (org_id, profile_id, title, body, link)
          VALUES (r.org_id, v_manager,
                  audit_name(r.profile_id) || CASE WHEN v_info->>'status' = 'overdue' THEN '''s goal missed its cycle' ELSE '''s goal is at risk' END,
                  format('%s: %s%% done, %s%% of the cycle has gone.', r.name, v_info->>'pct', v_info->>'expected_pct'),
                  '/team');
        END IF;
        v_n := v_n + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.goals_status_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.goals_status_tick() TO service_role;

-- ───────── 3. NIGHTLY JOBS (09:10 and 09:20 IST) ─────────
SELECT cron.schedule('ce-task-tick', '40 3 * * *', $$SELECT public.tasks_due_tick()$$);
SELECT cron.schedule('ce-goal-tick', '50 3 * * *', $$SELECT public.goals_status_tick()$$);