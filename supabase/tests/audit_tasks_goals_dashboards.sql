-- Audit trail, task lifecycle, goal status and dashboards: behaviour tests.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/audit_tasks_goals_dashboards.sql

BEGIN;

CREATE FUNCTION pg_temp.eq(label text, actual anyelement, expected anyelement) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL %: expected %, got %', label, expected, actual;
  END IF;
  RAISE NOTICE 'ok   %', label;
END $$;

CREATE FUNCTION pg_temp.fails(label text, stmt text, expect_text text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF NOT EXISTS (SELECT 1 FROM unnest(string_to_array(expect_text, '|')) alt WHERE position(alt IN SQLERRM) > 0) THEN
      RAISE EXCEPTION 'FAIL %: error was "%", expected to contain "%"', label, SQLERRM, expect_text;
    END IF;
    RAISE NOTICE 'ok   % (%)', label, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: expected an error containing "%"', label, expect_text;
END $$;

CREATE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', (SELECT auth_user_id::text FROM public.profiles WHERE id = p), true)
$$;

CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO PUBLIC;

-- ───────── fixtures: hr, boss(admin), mgr, a (under mgr), b (under hr) ─────────
DO $$
DECLARE
  o uuid; hr uuid; boss uuid; mgr uuid; a uuid; b uuid; cyc uuid;
  uids uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO organisations (name, settings) VALUES ('T2', '{}') RETURNING id INTO o;
  INSERT INTO auth.users (id, email) SELECT x, x::text || '@t.test' FROM unnest(uids) AS x;

  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, department)
  VALUES (o, 'Hema HR', 'hr', uids[1], date '2025-01-01', 'People') RETURNING id INTO hr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, department)
  VALUES (o, 'Bobby Boss', 'admin', uids[2], date '2025-01-01', 'Leadership') RETURNING id INTO boss;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id, department)
  VALUES (o, 'Mohan Mgr', 'manager', uids[3], date '2025-01-01', boss, 'Sales') RETURNING id INTO mgr;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id, department)
  VALUES (o, 'Asha Member', 'member', uids[4], today - 10, mgr, 'Sales') RETURNING id INTO a;
  INSERT INTO profiles (org_id, full_name, role, auth_user_id, joined_on, manager_id, department)
  VALUES (o, 'Bala Member', 'member', uids[5], date '2025-01-01', hr, 'People') RETURNING id INTO b;

  INSERT INTO cycles (org_id, no, name, start_date, end_date, status)
  VALUES (o, 1, 'Cycle', today - 30, today + 30, 'active') RETURNING id INTO cyc;

  INSERT INTO ids VALUES ('org', o), ('hr', hr), ('boss', boss), ('mgr', mgr), ('a', a), ('b', b), ('cyc', cyc);
END $$;

-- ═══════════ D. AUDIT TRAIL ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr');
  boss uuid := (SELECT v FROM ids WHERE k='boss'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
  a uuid := (SELECT v FROM ids WHERE k='a'); b uuid := (SELECT v FROM ids WHERE k='b');
  lr uuid; n int;
BEGIN
  PERFORM pg_temp.as_user(hr);
  PERFORM set_config('app.allow_profile_admin', 'on', true);   -- the supervised-maintenance switch
  UPDATE profiles SET role = 'manager' WHERE id = b;
  PERFORM pg_temp.eq('audit: role change logged', (SELECT actor_name || '|' || subject_name FROM audit_log
                      WHERE action = 'profile.role' AND subject_id = b), 'Hema HR|Bala Member');
  UPDATE profiles SET manager_id = mgr WHERE id = b;
  PERFORM pg_temp.eq('audit: manager change logged', (SELECT count(*) FROM audit_log WHERE action = 'profile.manager' AND subject_id = b)::int, 1);
  UPDATE profiles SET manager_id = hr WHERE id = b;            -- put Bala back under HR for the later tests
  UPDATE profiles SET opening_earned_leave = 7 WHERE id = b;
  PERFORM pg_temp.eq('audit: opening balance change logged', (SELECT count(*) FROM audit_log WHERE action = 'leave.opening_balance' AND subject_id = b)::int, 1);
  UPDATE profiles SET status = 'exited', exited_on = current_date WHERE id = b;
  PERFORM pg_temp.eq('audit: exit logged', (SELECT count(*) FROM audit_log WHERE action = 'profile.exit' AND subject_id = b)::int, 1);
  UPDATE profiles SET status = 'active', exited_on = NULL WHERE id = b;
  PERFORM pg_temp.eq('audit: one entry per real change, none for the rest',
    (SELECT count(*) FROM audit_log WHERE subject_id = b)::int, 7);   -- create, role, manager x2, opening, exit, rejoin
  PERFORM set_config('app.allow_profile_admin', 'off', true);

  -- leave: request then decision
  PERFORM pg_temp.as_user(a);
  INSERT INTO leave_requests (org_id, profile_id, type, from_date, to_date, days)
  VALUES (o, a, 'casual', current_date + 3, current_date + 4, 2) RETURNING id INTO lr;
  PERFORM pg_temp.eq('audit: leave request logged', (SELECT actor_name FROM audit_log WHERE action = 'leave.request' AND target_id = lr), 'Asha Member');
  PERFORM pg_temp.as_user(mgr);
  UPDATE leave_requests SET status = 'approved', decided_by = mgr, decided_at = now() WHERE id = lr;
  PERFORM pg_temp.eq('audit: leave decision logged with the decider', (SELECT actor_name FROM audit_log WHERE action = 'leave.approved' AND target_id = lr), 'Mohan Mgr');
  DELETE FROM leave_requests WHERE id = lr;
  PERFORM pg_temp.eq('audit: leave removal logged', (SELECT count(*) FROM audit_log WHERE action = 'leave.delete' AND target_id = lr)::int, 1);

  -- holidays and policy
  PERFORM pg_temp.as_user(hr);
  INSERT INTO holidays (org_id, date, name) VALUES (o, current_date + 40, 'Test Day');
  PERFORM pg_temp.eq('audit: holiday add logged', (SELECT count(*) FROM audit_log WHERE action = 'holiday.add')::int, 1);
  DELETE FROM holidays WHERE org_id = o AND name = 'Test Day';
  PERFORM pg_temp.eq('audit: holiday removal logged', (SELECT count(*) FROM audit_log WHERE action = 'holiday.remove')::int, 1);
  INSERT INTO el_policy (org_id) VALUES (o) ON CONFLICT DO NOTHING;
  UPDATE el_policy SET required_days = 22 WHERE org_id = o;
  PERFORM pg_temp.eq('audit: policy change shows what changed',
    (SELECT summary LIKE '%required_days: 20 → 22%' FROM audit_log WHERE action = 'el.policy' ORDER BY created_at DESC LIMIT 1), true);
  UPDATE el_policy SET required_days = 20 WHERE org_id = o;
END $$;

-- who can read it, and that nobody can change it
DO $$
DECLARE hr uuid := (SELECT v FROM ids WHERE k='hr'); a uuid := (SELECT v FROM ids WHERE k='a'); n int;
BEGIN
  PERFORM pg_temp.as_user(hr);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM audit_log;
  RESET ROLE;
  PERFORM pg_temp.eq('audit access: HR can read', n > 0, true);

  PERFORM pg_temp.as_user(a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM audit_log;
  RESET ROLE;
  PERFORM pg_temp.eq('audit access: a member sees nothing', n, 0);

  PERFORM pg_temp.as_user(hr);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.fails('audit access: nobody can write', $q$INSERT INTO audit_log (org_id, entity, action, summary) SELECT org_id, 'x', 'x', 'x' FROM profiles LIMIT 1$q$, 'permission denied|row-level security');
  -- either the privilege is missing (error) or row-level security hides every row (0 rows changed)
  BEGIN
    UPDATE audit_log SET summary = 'x';
    GET DIAGNOSTICS n = ROW_COUNT;
    RESET ROLE;
    PERFORM pg_temp.eq('audit access: nobody can edit (no rows changed)', n, 0);
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'ok   audit access: nobody can edit (permission denied)';
  END;
  SET LOCAL ROLE authenticated;
  BEGIN
    DELETE FROM audit_log;
    GET DIAGNOSTICS n = ROW_COUNT;
    RESET ROLE;
    PERFORM pg_temp.eq('audit access: nobody can delete (no rows removed)', n, 0);
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'ok   audit access: nobody can delete (permission denied)';
  END;
END $$;

-- ═══════════ E. TASK LIFECYCLE ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); hr uuid := (SELECT v FROM ids WHERE k='hr');
  mgr uuid := (SELECT v FROM ids WHERE k='mgr'); a uuid := (SELECT v FROM ids WHERE k='a'); b uuid := (SELECT v FROM ids WHERE k='b');
  t_self uuid; t_given uuid; s text;
BEGIN
  PERFORM pg_temp.as_user(a);
  INSERT INTO tasks (org_id, owner_id, created_by, title) VALUES (o, a, a, 'my own') RETURNING id INTO t_self;
  PERFORM pg_temp.eq('task: self-made starts accepted', (SELECT status FROM tasks WHERE id = t_self), 'accepted');
  UPDATE tasks SET done = true WHERE id = t_self;
  PERFORM pg_temp.eq('task: self-made can be completed straight away', (SELECT status FROM tasks WHERE id = t_self), 'completed');
  PERFORM pg_temp.eq('task: done flag follows status', (SELECT done AND done_at IS NOT NULL FROM tasks WHERE id = t_self), true);
  UPDATE tasks SET done = false WHERE id = t_self;
  PERFORM pg_temp.eq('task: unticking reopens it', (SELECT status FROM tasks WHERE id = t_self), 'in_progress');

  PERFORM pg_temp.as_user(mgr);
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date) VALUES (o, a, mgr, 'from the boss', current_date + 5) RETURNING id INTO t_given;
  PERFORM pg_temp.eq('task: given by someone else starts assigned', (SELECT status FROM tasks WHERE id = t_given), 'assigned');
  PERFORM pg_temp.eq('task: assignment logged', (SELECT count(*) FROM audit_log WHERE action = 'task.assign' AND target_id = t_given)::int, 1);
  INSERT INTO ids VALUES ('t_given', t_given);

  PERFORM pg_temp.as_user(a);
  UPDATE tasks SET status = 'accepted' WHERE id = t_given;
  PERFORM pg_temp.eq('task: accepting tells the assigner',
    (SELECT count(*) FROM notifications WHERE profile_id = mgr AND title LIKE '%accepted a task')::int, 1);
  UPDATE tasks SET status = 'in_progress' WHERE id = t_given;
  UPDATE tasks SET done = true WHERE id = t_given;     -- ticking the box on something somebody asked for
  PERFORM pg_temp.eq('task: finishing it sends it to review, not complete', (SELECT status FROM tasks WHERE id = t_given), 'review');
  PERFORM pg_temp.eq('task: review is not done', (SELECT done FROM tasks WHERE id = t_given), false);
  PERFORM pg_temp.eq('task: review tells the assigner',
    (SELECT count(*) FROM notifications WHERE profile_id = mgr AND title LIKE '%ready for your review')::int, 1);
  UPDATE tasks SET status = 'completed' WHERE id = t_given;
  PERFORM pg_temp.eq('task: the owner cannot approve their own review', (SELECT status FROM tasks WHERE id = t_given), 'review');

  PERFORM pg_temp.as_user(b);
  PERFORM pg_temp.fails('task: a stranger cannot move it', format('UPDATE tasks SET status = ''completed'' WHERE id = %L', t_given), 'can''t change');

  PERFORM pg_temp.as_user(mgr);
  UPDATE tasks SET status = 'in_progress' WHERE id = t_given;
  PERFORM pg_temp.eq('task: reviewer can send it back', (SELECT status FROM tasks WHERE id = t_given), 'in_progress');
  PERFORM pg_temp.eq('task: send-back tells the owner',
    (SELECT count(*) FROM notifications WHERE profile_id = a AND title LIKE '%sent back%')::int, 1);
  PERFORM pg_temp.as_user(a);
  UPDATE tasks SET status = 'review' WHERE id = t_given;
  PERFORM pg_temp.as_user(mgr);
  UPDATE tasks SET status = 'completed' WHERE id = t_given;
  PERFORM pg_temp.eq('task: reviewer completes it', (SELECT status || done::text FROM tasks WHERE id = t_given), 'completedtrue');
  PERFORM pg_temp.eq('task: completion tells the owner',
    (SELECT count(*) FROM notifications WHERE profile_id = a AND title LIKE '%marked complete')::int, 1);

  PERFORM pg_temp.as_user(a);
  PERFORM pg_temp.fails('task: no skipping backwards', format('UPDATE tasks SET status = ''assigned'' WHERE id = %L', t_given), 'can''t move');
  PERFORM pg_temp.eq('task: history has the moves', (SELECT count(*) FROM task_events WHERE task_id = t_given AND kind = 'status')::int >= 6, true);
  PERFORM pg_temp.eq('task: status moves are in the audit trail', (SELECT count(*) FROM audit_log WHERE action = 'task.status' AND target_id = t_given)::int >= 6, true);

  -- handing it to somebody else starts it over for them
  PERFORM pg_temp.as_user(mgr);
  UPDATE tasks SET owner_id = b WHERE id = t_given;
  PERFORM pg_temp.eq('task: reassigned starts again', (SELECT status || done::text FROM tasks WHERE id = t_given), 'assignedfalse');
  PERFORM pg_temp.eq('task: reassignment tells the new owner',
    (SELECT count(*) FROM notifications WHERE profile_id = b AND title = 'A task was handed to you')::int, 1);
  UPDATE tasks SET owner_id = a WHERE id = t_given;
END $$;

-- comments with evidence
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
  a uuid := (SELECT v FROM ids WHERE k='a'); b uuid := (SELECT v FROM ids WHERE k='b');
  t uuid := (SELECT v FROM ids WHERE k='t_given');
BEGIN
  PERFORM pg_temp.as_user(a);
  INSERT INTO task_comments (org_id, task_id, author_id, body, evidence_url)
  VALUES (o, t, a, 'Done, here is the proof', 'https://example.com/proof.pdf');
  PERFORM pg_temp.eq('comment: tells the other person',
    (SELECT count(*) FROM notifications WHERE profile_id = mgr AND title = 'Asha Member commented on a task')::int, 1);
  PERFORM pg_temp.eq('comment: lands in the history', (SELECT count(*) FROM task_events WHERE task_id = t AND kind = 'comment')::int, 1);
  PERFORM pg_temp.fails('comment: evidence must be a link',
    format('INSERT INTO task_comments (org_id, task_id, author_id, body, evidence_url) VALUES (%L, %L, %L, ''x'', ''javascript:alert(1)'')', o, t, a), 'check constraint');
  PERFORM pg_temp.fails('comment: not empty',
    format('INSERT INTO task_comments (org_id, task_id, author_id, body) VALUES (%L, %L, %L, ''   '')', o, t, a), 'check constraint');

  -- a stranger neither reads nor writes
  PERFORM pg_temp.as_user(b);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq('comment: a stranger sees none', (SELECT count(*) FROM task_comments WHERE task_id = t)::int, 0);
  PERFORM pg_temp.eq('history: a stranger sees none', (SELECT count(*) FROM task_events WHERE task_id = t)::int, 0);
  PERFORM pg_temp.fails('comment: a stranger cannot write',
    format('INSERT INTO task_comments (org_id, task_id, author_id, body) VALUES (%L, %L, %L, ''hi'')', o, t, b), 'row-level security');
  RESET ROLE;
  PERFORM pg_temp.as_user(mgr);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq('comment: the manager sees it', (SELECT count(*) FROM task_comments WHERE task_id = t)::int, 1);
  RESET ROLE;
END $$;

-- overdue and due-soon notices go out once
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); mgr uuid := (SELECT v FROM ids WHERE k='mgr'); a uuid := (SELECT v FROM ids WHERE k='a');
  t_late uuid; t_soon uuid; n int;
BEGIN
  PERFORM pg_temp.as_user(mgr);
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date) VALUES (o, a, mgr, 'late one', current_date - 2) RETURNING id INTO t_late;
  INSERT INTO tasks (org_id, owner_id, created_by, title, due_date) VALUES (o, a, mgr, 'soon one', current_date + 1) RETURNING id INTO t_soon;
  PERFORM pg_temp.eq('tick: first run notifies', tasks_due_tick() >= 2, true);
  PERFORM pg_temp.eq('tick: owner told it is overdue', (SELECT count(*) FROM notifications WHERE profile_id = a AND title = 'Overdue: late one')::int, 1);
  PERFORM pg_temp.eq('tick: assigner told too', (SELECT count(*) FROM notifications WHERE profile_id = mgr AND title LIKE '%task is overdue' AND body LIKE 'late one%')::int, 1);
  PERFORM pg_temp.eq('tick: due soon notice', (SELECT count(*) FROM notifications WHERE profile_id = a AND title = 'Due tomorrow: soon one')::int, 1);
  PERFORM pg_temp.eq('tick: second run adds nothing', tasks_due_tick(), 0);
  UPDATE tasks SET due_date = current_date - 1 WHERE id = t_late;
  PERFORM pg_temp.eq('tick: a new date earns a new notice', tasks_due_tick(), 1);
  PERFORM pg_temp.as_user(a);
  UPDATE tasks SET status = 'review' WHERE id = t_late;
  PERFORM pg_temp.as_user(mgr);
  UPDATE tasks SET status = 'completed' WHERE id = t_late;
  PERFORM pg_temp.eq('tick: completed tasks are never overdue', tasks_due_tick(), 0);
END $$;

-- ═══════════ E. GOALS ═══════════
DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); a uuid := (SELECT v FROM ids WHERE k='a'); cyc uuid := (SELECT v FROM ids WHERE k='cyc');
  g_low uuid; g_ok uuid; g_done uuid; g_flat uuid; g_funnel uuid;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  -- the cycle is 60 days long and 30 are gone: an even pace is 50%
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target) VALUES (o, a, cyc, 'number', 'behind', 0, 100) RETURNING id INTO g_low;
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target) VALUES (o, a, cyc, 'number', 'fine', 0, 100) RETURNING id INTO g_ok;
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target) VALUES (o, a, cyc, 'number', 'finished', 0, 100) RETURNING id INTO g_done;
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target) VALUES (o, a, cyc, 'number', 'no target', 5, 5) RETURNING id INTO g_flat;
  INSERT INTO goals (org_id, profile_id, cycle_id, kind, name, baseline, target, stages)
  VALUES (o, a, cyc, 'funnel', 'funnel', 0, 50, ARRAY['calls', 'sales']) RETURNING id INTO g_funnel;
  INSERT INTO goal_entries (org_id, goal_id, date, value) VALUES (o, g_low, today, 10), (o, g_ok, today, 45), (o, g_done, today, 120);
  INSERT INTO goal_entries (org_id, goal_id, date, counts) VALUES (o, g_funnel, today, ARRAY[200, 40]);
  INSERT INTO ids VALUES ('g_low', g_low), ('g_ok', g_ok), ('g_done', g_done), ('g_flat', g_flat), ('g_funnel', g_funnel);

  PERFORM pg_temp.eq('goal status: well behind pace is at risk', goal_status_info(g_low)->>'status', 'at_risk');
  PERFORM pg_temp.eq('goal status: near pace is on track', goal_status_info(g_ok)->>'status', 'on_track');
  PERFORM pg_temp.eq('goal status: 100% is completed', goal_status_info(g_done)->>'status', 'completed');
  PERFORM pg_temp.eq('goal status: no measurable target is on track', goal_status_info(g_flat)->>'status', 'on_track');
  PERFORM pg_temp.eq('goal status: funnel at 20% of a 50% target is on track', goal_status_info(g_funnel)->>'status', 'on_track');
  PERFORM pg_temp.eq('goal status: expected pace', (goal_status_info(g_low)->>'expected_pct')::numeric, 50.0);

  -- the shared percentage matches the one the goals screen shows
  PERFORM pg_temp.as_user(a);
  PERFORM pg_temp.eq('goal pct: number goal matches goal_progress', goal_pct_internal(g_ok), (goal_progress(g_ok)->>'pct')::numeric);
  PERFORM pg_temp.eq('goal pct: funnel goal matches goal_progress', goal_pct_internal(g_funnel), (goal_progress(g_funnel)->>'pct')::numeric);

  UPDATE cycles SET status = 'closed' WHERE id = cyc;
  PERFORM pg_temp.eq('goal status: closed cycle, unfinished goal is overdue', goal_status_info(g_ok)->>'status', 'overdue');
  PERFORM pg_temp.eq('goal status: closed cycle, finished goal stays completed', goal_status_info(g_done)->>'status', 'completed');
  UPDATE cycles SET status = 'active' WHERE id = cyc;
END $$;

DO $$
DECLARE
  o uuid := (SELECT v FROM ids WHERE k='org'); mgr uuid := (SELECT v FROM ids WHERE k='mgr'); a uuid := (SELECT v FROM ids WHERE k='a');
  b uuid := (SELECT v FROM ids WHERE k='b'); g uuid := (SELECT v FROM ids WHERE k='g_low'); r jsonb;
BEGIN
  PERFORM pg_temp.as_user(a);
  r := goals_status_for();
  PERFORM pg_temp.eq('goals_status_for: own goals', jsonb_array_length(r), 5);
  PERFORM pg_temp.as_user(mgr);
  PERFORM pg_temp.eq('goals_status_for: the manager can read a report''s goals', jsonb_array_length(goals_status_for(a)), 5);
  PERFORM pg_temp.as_user(b);
  PERFORM pg_temp.fails('goals_status_for: an unrelated person cannot', format('SELECT goals_status_for(%L)', a), 'Not allowed');

  -- milestones: the owner and the manager can add, a stranger cannot
  PERFORM pg_temp.as_user(a);
  INSERT INTO goal_milestones (org_id, goal_id, title) VALUES (o, g, 'First 20 sales');
  UPDATE goal_milestones SET done = true WHERE goal_id = g;
  PERFORM pg_temp.eq('milestone: done time is stamped', (SELECT done_at IS NOT NULL FROM goal_milestones WHERE goal_id = g), true);
  PERFORM pg_temp.as_user(mgr);
  INSERT INTO goal_milestones (org_id, goal_id, title, due_date) VALUES (o, g, 'Reach 50', current_date + 10);
  PERFORM pg_temp.eq('milestone: counted in the summary',
    (SELECT (e->>'milestones_done')::int || '/' || (e->>'milestones_total') FROM jsonb_array_elements(goals_status_for(a)) e WHERE e->>'goal_id' = g::text), '1/2');
  PERFORM pg_temp.as_user(b);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.eq('milestone: a stranger sees none', (SELECT count(*) FROM goal_milestones WHERE goal_id = g)::int, 0);
  PERFORM pg_temp.fails('milestone: a stranger cannot add', format('INSERT INTO goal_milestones (org_id, goal_id, title) VALUES (%L, %L, ''x'')', o, g), 'row-level security');
  RESET ROLE;

  -- comments tell the other side
  PERFORM pg_temp.as_user(mgr);
  INSERT INTO goal_comments (org_id, goal_id, author_id, body) VALUES (o, g, mgr, 'Let us talk about the pipeline');
  PERFORM pg_temp.eq('goal comment: the owner is told', (SELECT count(*) FROM notifications WHERE profile_id = a AND title = 'Mohan Mgr commented on your goal')::int, 1);
  PERFORM pg_temp.as_user(a);
  INSERT INTO goal_comments (org_id, goal_id, author_id, body) VALUES (o, g, a, 'Will do');
  PERFORM pg_temp.eq('goal comment: the manager hears back', (SELECT count(*) FROM notifications WHERE profile_id = mgr AND title = 'Asha Member replied on a goal')::int, 1);
  PERFORM pg_temp.as_user(b);
  PERFORM pg_temp.fails('goal comment: an unrelated person cannot read the goal',
    format('SELECT goals_status_for(%L)', a), 'Not allowed');
END $$;

-- the nightly goal alert fires once per goal and status
DO $$
DECLARE mgr uuid := (SELECT v FROM ids WHERE k='mgr'); a uuid := (SELECT v FROM ids WHERE k='a');
BEGIN
  PERFORM pg_temp.eq('goal tick: first run alerts', goals_status_tick() >= 1, true);
  PERFORM pg_temp.eq('goal tick: owner told', (SELECT count(*) FROM notifications WHERE profile_id = a AND title = 'A goal is at risk')::int, 1);
  PERFORM pg_temp.eq('goal tick: manager told', (SELECT count(*) FROM notifications WHERE profile_id = mgr AND title LIKE '%goal is at risk')::int, 1);
  PERFORM pg_temp.eq('goal tick: second run adds nothing', goals_status_tick(), 0);
END $$;

-- ═══════════ F. DASHBOARDS ═══════════
DO $$
DECLARE
  hr uuid := (SELECT v FROM ids WHERE k='hr'); boss uuid := (SELECT v FROM ids WHERE k='boss'); mgr uuid := (SELECT v FROM ids WHERE k='mgr');
  a uuid := (SELECT v FROM ids WHERE k='a'); b uuid := (SELECT v FROM ids WHERE k='b'); r jsonb; row_a jsonb; h jsonb;
BEGIN
  PERFORM pg_temp.as_user(a);
  PERFORM pg_temp.fails('dash_team: members have no team view', 'SELECT dash_team()', 'Not allowed');
  PERFORM pg_temp.fails('dash_hr: members are refused', 'SELECT dash_hr()', 'Not allowed');

  PERFORM pg_temp.as_user(mgr);
  r := dash_team();
  PERFORM pg_temp.eq('dash_team: a manager sees their line only (self + Asha)', jsonb_array_length(r->'rows'), 2);
  PERFORM pg_temp.eq('dash_team: scope label', r->>'scope', 'line');
  PERFORM pg_temp.fails('dash_hr: managers are refused', 'SELECT dash_hr()', 'Not allowed');

  SELECT e INTO row_a FROM jsonb_array_elements(r->'rows') e WHERE e->>'profile_id' = a::text;
  PERFORM pg_temp.eq('dash_team: manager name carried', row_a->>'manager_name', 'Mohan Mgr');
  PERFORM pg_temp.eq('dash_team: goals counted', (row_a->'goals'->>'total')::int, 5);
  PERFORM pg_temp.eq('dash_team: at-risk goal counted', (row_a->'goals'->>'at_risk')::int, 1);
  PERFORM pg_temp.eq('dash_team: tasks overdue counted', (row_a->'tasks'->>'overdue')::int, 0);
  PERFORM pg_temp.eq('dash_team: attendance kind for today', row_a->'today'->>'kind', 'not_marked');

  PERFORM pg_temp.as_user(boss);
  r := dash_team();
  PERFORM pg_temp.eq('dash_team: the boss sees everyone', jsonb_array_length(r->'rows'), 5);
  PERFORM pg_temp.eq('dash_team: organisation scope', r->>'scope', 'organisation');

  PERFORM pg_temp.as_user(hr);
  h := dash_hr();
  PERFORM pg_temp.eq('dash_hr: headcount', (h->'headcount'->>'active')::int, 5);
  PERFORM pg_temp.eq('dash_hr: new joiner shown', jsonb_array_length(h->'new_joiners'), 1);
  PERFORM pg_temp.eq('dash_hr: goal totals', (h->'goals'->>'total')::int, 5);
  PERFORM pg_temp.eq('dash_hr: task totals include review/overdue keys', h->'tasks' ? 'review', true);
  PERFORM pg_temp.eq('dash_hr: today has a count of people not yet marked', (h->'attendance'->'today'->>'not_marked')::int, 5);
  PERFORM pg_temp.eq('dash_hr: pending leave starts at zero', (h->'leave'->>'pending_count')::int, 0);
END $$;

ROLLBACK;
