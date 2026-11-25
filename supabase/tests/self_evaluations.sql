-- Annual Self-Evaluation: behaviour tests.
-- Run against a database with all migrations applied (it rolls everything back):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/self_evaluations.sql
-- Any failed check raises an exception and stops the run.

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
    IF position(expect_text IN SQLERRM) = 0 THEN
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

-- ───────── fixtures: an org with HR, admin, a manager, the person and a teammate ─────────
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO PUBLIC;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
BEGIN
  INSERT INTO organisations (id, name) VALUES (v_org, 'Self eval test org');
  INSERT INTO ids VALUES
    ('org', v_org), ('hr', gen_random_uuid()), ('admin', gen_random_uuid()),
    ('mgr', gen_random_uuid()), ('emp', gen_random_uuid()), ('peer', gen_random_uuid());
  INSERT INTO profiles (id, org_id, auth_user_id, full_name, role, manager_id, status, title, department, joined_on)
  SELECT (SELECT v FROM ids WHERE k = x.k), v_org, gen_random_uuid(), x.name, x.role,
         (SELECT v FROM ids WHERE k = x.mgr), 'active', x.title, 'Technology', x.joined
    FROM (VALUES ('hr', 'Test HR', 'hr', NULL, 'HR', NULL::date),
                 ('admin', 'Test Admin', 'admin', NULL, 'Founder', NULL),
                 ('mgr', 'Test Manager', 'manager', 'admin', 'Head', NULL),
                 ('emp', 'Test Person', 'member', 'mgr', 'Developer', DATE '2026-08-12'),
                 ('peer', 'Test Peer', 'member', 'admin', 'Sales', NULL)) AS x(k, name, role, mgr, title, joined);
END $$;

SET LOCAL ROLE authenticated;

-- ───────── the cycle ─────────
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp'));
SELECT pg_temp.fails('person cannot open the cycle',
  'SELECT self_eval_open_cycle(2026, DATE ''2027-01-15'')', 'Only HR or admin');
SELECT pg_temp.fails('person cannot fill before the cycle opens',
  format('SELECT self_eval_save(%L, 2026, ''reflection'', ARRAY[''proud''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'not open');

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'hr'));
SELECT self_eval_open_cycle(2026, DATE '2027-01-15');
SELECT pg_temp.eq('everyone active except HR and admin is told once',
  (SELECT count(*) FROM notifications WHERE link = '/self-evaluation?year=2026')::int, 3);
SELECT self_eval_open_cycle(2026, DATE '2027-01-20');
SELECT pg_temp.eq('opening again does not tell again',
  (SELECT count(*) FROM notifications WHERE link = '/self-evaluation?year=2026')::int, 3);

-- ───────── the person fills the form ─────────
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp'));
SELECT self_eval_start(2026);
SELECT pg_temp.eq('about you comes from the profile',
  (SELECT role_team || ' | ' || manager_name || ' | ' || review_period FROM self_evaluations
    WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp')),
  'Developer, Technology | Test Manager | 12 August 2026 (joining date) – 31 December 2026');

SELECT self_eval_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'goals', ARRAY['1', 'goal'], to_jsonb('Team App'::text));
SELECT self_eval_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'goals', ARRAY['1', 'rating'], to_jsonb('EE'::text));
SELECT pg_temp.eq('a goal box pads the list',
  (SELECT goals FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp')),
  '[{}, {"goal": "Team App", "rating": "EE"}]'::jsonb);
SELECT pg_temp.fails('unknown rating refused',
  format('SELECT self_eval_save(%L, 2026, ''goals'', ARRAY[''0'', ''rating''], to_jsonb(''Great''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'Unknown rating');
SELECT self_eval_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'values', ARRAY['ownership', 'example'], to_jsonb('No task pending'::text));
SELECT self_eval_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'values', ARRAY['ownership', 'rating'], to_jsonb('O'::text));
SELECT self_eval_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'potential', ARRAY['learn', 'rating'], to_jsonb('Moderate–High'::text));
SELECT self_eval_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'reflection', ARRAY['proud'], to_jsonb('Shipped'::text));
SELECT pg_temp.eq('values, potential and reflection saved',
  (SELECT value_answers -> 'ownership' || jsonb_build_object('p', potential -> 'learn' ->> 'rating', 'r', reflection ->> 'proud')
     FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp')),
  '{"example": "No task pending", "rating": "O", "p": "Moderate–High", "r": "Shipped"}'::jsonb);
SELECT pg_temp.fails('unknown value refused',
  format('SELECT self_eval_save(%L, 2026, ''values'', ARRAY[''bravery'', ''rating''], to_jsonb(''O''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'Unknown box');
-- an uploaded form fills a whole part
SELECT self_eval_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'goals', '{}',
  '[{"goal": "A", "rating": "FME"}, {"goal": "B", "target": "t", "result": "r", "evidence": "e", "rating": ""}]'::jsonb);
SELECT pg_temp.eq('whole part replaced',
  (SELECT jsonb_array_length(goals) FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp')), 2);
SELECT pg_temp.fails('whole part with a bad rating refused',
  format('SELECT self_eval_save(%L, 2026, ''goals'', ''{}'', ''[{"rating": "Top"}]''::jsonb)',
         (SELECT v FROM ids WHERE k = 'emp')), 'Part A');

-- ───────── who reads ─────────
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'peer'));
SELECT pg_temp.eq('a teammate cannot read the form',
  (SELECT count(*) FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp'))::int, 0);
SELECT pg_temp.fails('a teammate cannot write the form',
  format('SELECT self_eval_save(%L, 2026, ''reflection'', ARRAY[''proud''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'Not allowed');
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'mgr'));
SELECT pg_temp.eq('the manager reads the form',
  (SELECT count(*) FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp'))::int, 1);
SELECT pg_temp.fails('the manager cannot write the person''s answers',
  format('SELECT self_eval_save(%L, 2026, ''reflection'', ARRAY[''proud''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'Only the person');
SELECT pg_temp.fails('no rating before the person submits',
  format('SELECT self_eval_review_save(%L, 2026, ''manager'', ARRAY[''overall_rating''], to_jsonb(''EE''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'cannot rate');

-- ───────── files ─────────
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp'));
SELECT pg_temp.eq('the person may upload to their folder',
  self_eval_storage_ok((SELECT v FROM ids WHERE k = 'emp')::text || '/2026/a.pdf', true), true);
SELECT pg_temp.eq('nobody uploads to someone else''s folder',
  self_eval_storage_ok((SELECT v FROM ids WHERE k = 'peer')::text || '/2026/a.pdf', true), false);
SELECT pg_temp.eq('a bad path is refused', self_eval_storage_ok('../2026/a.pdf', false), false);
SELECT self_eval_file_add((SELECT v FROM ids WHERE k = 'emp'), 2026, 'evidence', 0,
  (SELECT v FROM ids WHERE k = 'emp')::text || '/2026/x-report.pdf', 'report.pdf', 'application/pdf', 1234);
SELECT pg_temp.fails('a file over 20MB is refused',
  format('SELECT self_eval_file_add(%L, 2026, ''form'', NULL, %L, ''big.pdf'', ''application/pdf'', 1000, 25000000, ''gzip'')',
         (SELECT v FROM ids WHERE k = 'emp'), (SELECT v FROM ids WHERE k = 'emp')::text || '/2026/big.pdf.gz'), 'over 20MB');
SELECT self_eval_file_add((SELECT v FROM ids WHERE k = 'emp'), 2026, 'form', NULL,
  (SELECT v FROM ids WHERE k = 'emp')::text || '/2026/y-form.pdf.gz', 'form.pdf', 'application/pdf', 150000, 200000, 'gzip');
SELECT pg_temp.eq('a compressed file keeps both sizes',
  (SELECT original_size || '/' || size_bytes || '/' || encoding FROM self_eval_files WHERE file_name = 'form.pdf'),
  '200000/150000/gzip');
SELECT pg_temp.fails('a file outside the folder is refused',
  format('SELECT self_eval_file_add(%L, 2026, ''form'', NULL, ''elsewhere/a.pdf'', ''a.pdf'', ''application/pdf'', 1)',
         (SELECT v FROM ids WHERE k = 'emp')), 'Wrong file location');
SELECT self_eval_file_remove((SELECT id FROM self_eval_files WHERE file_name = 'report.pdf'));
SELECT pg_temp.eq('a removed file is hidden, not deleted',
  (SELECT count(*) FROM self_eval_files WHERE removed_at IS NOT NULL)::int, 1);
SELECT pg_temp.fails('files cannot be deleted', 'DELETE FROM self_eval_files', 'permission denied');
SELECT pg_temp.fails('forms cannot be deleted', 'DELETE FROM self_evaluations', 'permission denied');

-- ───────── submit ─────────
SELECT pg_temp.fails('sign-off needs a name',
  format('SELECT self_eval_submit(%L, 2026, ''employee'', '''')', (SELECT v FROM ids WHERE k = 'emp')),
  'Type your name');
SELECT self_eval_submit((SELECT v FROM ids WHERE k = 'emp'), 2026, 'employee', 'Test Person');
SELECT pg_temp.eq('the manager is told',
  (SELECT count(*) FROM notifications WHERE profile_id = (SELECT v FROM ids WHERE k = 'mgr')
      AND title LIKE 'Test Person submitted%')::int, 1);
SELECT pg_temp.fails('no changes after submitting',
  format('SELECT self_eval_save(%L, 2026, ''reflection'', ARRAY[''proud''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'submitted');

-- ───────── the manager evaluation (only the direct manager; sign-off completes it) ─────────
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'mgr'));
SELECT self_eval_review_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'manager', ARRAY['goals', '0', 'rating'], to_jsonb('EE'::text));
SELECT self_eval_review_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'manager', ARRAY['goals', '0', 'comment'], to_jsonb('Strong result'::text));
SELECT self_eval_review_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'manager', ARRAY['values', 'ownership', 'rating'], to_jsonb('O'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp'), 2026, ARRAY['discussion_date'], to_jsonb('2026-12-20'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp'), 2026, ARRAY['goals_summary', 'rating'], to_jsonb('EE'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp'), 2026, ARRAY['overall', 'values', 'remarks'], to_jsonb('Lived the values'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp'), 2026, ARRAY['potential', 'learn', 'rating'], to_jsonb('High'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp'), 2026, ARRAY['feedback', 'strengths'], to_jsonb('Ownership'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp'), 2026, ARRAY['recommendation', 'choice'], to_jsonb('scope'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp'), 2026, ARRAY['recommendation', 'comments', 'scope'], to_jsonb('Lead the CRM'::text));
SELECT pg_temp.eq('the manager form is kept box by box',
  (SELECT (extra #>> '{potential,learn,rating}') || '/' || (extra #>> '{recommendation,choice}') || '/' || (extra ->> 'discussion_date')
     FROM self_eval_reviews WHERE kind = 'manager' AND profile_id = (SELECT v FROM ids WHERE k = 'emp')),
  'High/scope/2026-12-20');
SELECT pg_temp.fails('an unknown recommendation is refused',
  format('SELECT self_eval_manager_save(%L, 2026, ARRAY[''recommendation'', ''choice''], to_jsonb(''fire''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'Unknown box');
SELECT pg_temp.fails('an unknown box is refused',
  format('SELECT self_eval_manager_save(%L, 2026, ARRAY[''salary''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'Unknown box');
SELECT pg_temp.fails('the manager signs off only with the Part C ratings',
  format('SELECT self_eval_submit(%L, 2026, ''manager'', ''Test Manager'')', (SELECT v FROM ids WHERE k = 'emp')),
  'Part C');
SELECT pg_temp.fails('the manager rates potential Low / Moderate / High only',
  format('SELECT self_eval_manager_save(%L, 2026, ARRAY[''potential'', ''learn'', ''rating''], to_jsonb(''Moderate–High''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'Unknown box');
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp'), 2026, ARRAY['goals_summary', 'self_rating'], to_jsonb('EE'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp'), 2026, ARRAY['overall', 'goals', 'rating'], to_jsonb('O'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp'), 2026, ARRAY['overall', 'values', 'rating'], to_jsonb('EE'::text));
SELECT pg_temp.fails('the sign-off needs the manager''s name',
  format('SELECT self_eval_submit(%L, 2026, ''manager'', '''')', (SELECT v FROM ids WHERE k = 'emp')),
  'Type your name');

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'hr'));
SELECT pg_temp.fails('HR does not rate any more',
  format('SELECT self_eval_review_save(%L, 2026, ''hr'', ARRAY[''feedback''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'cannot rate');
SELECT pg_temp.fails('HR does not write the manager evaluation for someone who has a manager',
  format('SELECT self_eval_review_save(%L, 2026, ''manager'', ARRAY[''feedback''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'cannot rate');
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'admin'));
SELECT pg_temp.fails('admin does not rate any more',
  format('SELECT self_eval_review_save(%L, 2026, ''sir'', ARRAY[''overall_rating''], to_jsonb(''O''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'cannot rate');
SELECT pg_temp.fails('admin cannot sign off for the manager',
  format('SELECT self_eval_submit(%L, 2026, ''manager'', ''Admin'')', (SELECT v FROM ids WHERE k = 'emp')),
  'Only the manager');

-- the person sees nothing of it before the sign-off
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp'));
SELECT pg_temp.eq('the manager evaluation is hidden from the person until signed off',
  (SELECT count(*) FROM self_eval_reviews)::int, 0);
SELECT pg_temp.fails('the person cannot comment before the sign-off',
  'SELECT self_eval_member_comment(2026, ''x'')', 'once your manager');

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'mgr'));
SELECT self_eval_submit((SELECT v FROM ids WHERE k = 'emp'), 2026, 'manager', 'Test Manager');
SELECT pg_temp.eq('the sign-off completes it: A (O) and B (EE) at 50% each give O',
  (SELECT final_rating || '/' || (finalized_at IS NOT NULL)::text FROM self_evaluations
    WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp')), 'O/true');
SELECT pg_temp.fails('the manager evaluation locks once signed off',
  format('SELECT self_eval_manager_save(%L, 2026, ARRAY[''feedback'', ''training''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'cannot write');

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp'));
SELECT pg_temp.eq('the manager evaluation is shown to the person once signed off',
  (SELECT extra ->> 'signed_name' FROM self_eval_reviews WHERE kind = 'manager'), 'Test Manager');
SELECT pg_temp.eq('internal notes never shown to the person',
  (SELECT count(*) FROM self_eval_notes)::int, 0);
SELECT pg_temp.eq('the person is told it is complete',
  (SELECT count(*) FROM notifications WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp')
      AND title LIKE '%is complete')::int, 1);
SELECT self_eval_member_comment(2026, 'Thanks, agreed');
SELECT pg_temp.eq('the person adds their comments after the discussion',
  (SELECT member_comment FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp')), 'Thanks, agreed');
SELECT pg_temp.eq('no uploads once complete',
  self_eval_storage_ok((SELECT v FROM ids WHERE k = 'emp')::text || '/2026/b.pdf', true), false);

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'hr'));
SELECT pg_temp.eq('HR reads the history',
  (SELECT count(*) > 10 FROM self_eval_log WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp')), true);

-- ───────── developer (service role, after the server's allowlist check) ─────────
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
CREATE TEMP TABLE dev_ids AS SELECT gen_random_uuid() AS p;
INSERT INTO profiles (id, org_id, auth_user_id, full_name, role, status)
SELECT (SELECT p FROM dev_ids), (SELECT v FROM ids WHERE k = 'org'), gen_random_uuid(), 'Test Dev', 'member', 'active';
INSERT INTO ids VALUES ('dev', (SELECT p FROM dev_ids)), ('emp2', gen_random_uuid());
INSERT INTO profiles (id, org_id, auth_user_id, full_name, role, manager_id, status)
VALUES ((SELECT v FROM ids WHERE k = 'emp2'), (SELECT v FROM ids WHERE k = 'org'), gen_random_uuid(), 'Second Person', 'member',
        (SELECT v FROM ids WHERE k = 'mgr'), 'active');
SET LOCAL ROLE service_role;
SELECT self_eval_dev_close_cycle((SELECT v FROM ids WHERE k = 'dev'), (SELECT v FROM ids WHERE k = 'org'), 2026);
SELECT pg_temp.eq('developer closes the cycle',
  (SELECT closed_at IS NOT NULL FROM self_eval_cycles WHERE year = 2026), true);
SELECT self_eval_dev_open_cycle((SELECT v FROM ids WHERE k = 'dev'), (SELECT v FROM ids WHERE k = 'org'), 2026, DATE '2027-02-01');
SELECT pg_temp.eq('developer opens it again with a new date',
  (SELECT closed_at IS NULL AND due_date = DATE '2027-02-01' FROM self_eval_cycles WHERE year = 2026), true);
SELECT self_eval_dev_save((SELECT v FROM ids WHERE k = 'dev'), (SELECT v FROM ids WHERE k = 'emp2'), 2026, 'goals', ARRAY['0', 'goal'], to_jsonb('Fixed by dev'::text));
SELECT pg_temp.eq('developer fills anyone''s form',
  (SELECT goals -> 0 ->> 'goal' FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp2')), 'Fixed by dev');
SELECT pg_temp.eq('the history names the developer',
  (SELECT count(*) FROM self_eval_log WHERE action = 'dev_save' AND actor = (SELECT v FROM ids WHERE k = 'dev'))::int, 1);
SELECT self_eval_dev_file_add((SELECT v FROM ids WHERE k = 'dev'), (SELECT v FROM ids WHERE k = 'emp2'), 2026, 'form', NULL,
  (SELECT v FROM ids WHERE k = 'emp2')::text || '/2026/z-form.pdf', 'z-form.pdf', 'application/pdf', 1000);
SELECT self_eval_dev_file_remove((SELECT v FROM ids WHERE k = 'dev'), (SELECT id FROM self_eval_files WHERE file_name = 'z-form.pdf'));
SELECT pg_temp.eq('developer removes a file: hidden, kept',
  (SELECT removed_by = (SELECT v FROM ids WHERE k = 'dev') FROM self_eval_files WHERE file_name = 'z-form.pdf'), true);
SELECT pg_temp.fails('not even the developer changes a final form',
  format('SELECT self_eval_dev_save(%L, %L, 2026, ''reflection'', ARRAY[''proud''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'dev'), (SELECT v FROM ids WHERE k = 'emp')), 'final');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp'));
SELECT pg_temp.fails('a signed-in user cannot call the developer functions',
  format('SELECT self_eval_dev_save(%L, %L, 2026, ''reflection'', ARRAY[''proud''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp'), (SELECT v FROM ids WHERE k = 'emp2')), 'permission denied');

-- ───────── only the direct manager (migration 20261117170000) ─────────
RESET ROLE;
INSERT INTO ids VALUES ('boss', gen_random_uuid()), ('emp3', gen_random_uuid());
INSERT INTO profiles (id, org_id, auth_user_id, full_name, role, manager_id, status)
VALUES ((SELECT v FROM ids WHERE k = 'boss'), (SELECT v FROM ids WHERE k = 'org'), gen_random_uuid(), 'Senior Manager', 'manager', NULL, 'active');
UPDATE profiles SET manager_id = (SELECT v FROM ids WHERE k = 'boss') WHERE id = (SELECT v FROM ids WHERE k = 'mgr');
INSERT INTO profiles (id, org_id, auth_user_id, full_name, role, manager_id, status)
VALUES ((SELECT v FROM ids WHERE k = 'emp3'), (SELECT v FROM ids WHERE k = 'org'), gen_random_uuid(), 'Third Person', 'member',
        (SELECT v FROM ids WHERE k = 'mgr'), 'active');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp3'));
SELECT self_eval_start(2026);
SELECT self_eval_save((SELECT v FROM ids WHERE k = 'emp3'), 2026, 'reflection', ARRAY['proud'], to_jsonb('Mine'::text));
SELECT self_eval_submit((SELECT v FROM ids WHERE k = 'emp3'), 2026, 'employee', 'Third Person');
SELECT pg_temp.eq('a member sees only their own form',
  (SELECT count(*) FROM self_evaluations WHERE profile_id <> (SELECT v FROM ids WHERE k = 'emp3'))::int, 0);
SELECT pg_temp.eq('a member cannot upload to a teammate''s folder',
  self_eval_storage_ok((SELECT v FROM ids WHERE k = 'emp2')::text || '/2026/a.pdf', true), false);

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'boss'));
SELECT pg_temp.eq('the manager above the manager does not see the form',
  (SELECT count(*) FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp3'))::int, 0);
SELECT pg_temp.fails('the manager above the manager cannot rate',
  format('SELECT self_eval_review_save(%L, 2026, ''manager'', ARRAY[''overall_rating''], to_jsonb(''EE''::text))',
         (SELECT v FROM ids WHERE k = 'emp3')), 'cannot rate');
SELECT pg_temp.eq('...nor open the files',
  self_eval_storage_ok((SELECT v FROM ids WHERE k = 'emp3')::text || '/2026/a.pdf', false), false);

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'mgr'));
SELECT pg_temp.eq('the direct manager sees their team''s forms',
  (SELECT count(*) FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp3'))::int, 1);
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp3'), 2026, ARRAY['overall', 'goals', 'rating'], to_jsonb('FME'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp3'), 2026, ARRAY['overall', 'values', 'rating'], to_jsonb('PME'::text));
SELECT self_eval_submit((SELECT v FROM ids WHERE k = 'emp3'), 2026, 'manager', 'Test Manager');
SELECT pg_temp.eq('the direct manager rates and signs off',
  (SELECT finalized_at IS NOT NULL FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp3')), true);
SELECT pg_temp.eq('FME and PME at 50% each give FME (2.5 rounds up)',
  (SELECT final_rating FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp3')), 'FME');

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'hr'));
SELECT pg_temp.eq('HR still sees everyone',
  (SELECT count(DISTINCT profile_id) FROM self_evaluations)::int >= 3, true);

SELECT self_eval_reopen((SELECT v FROM ids WHERE k = 'emp3'), 2026, 'manager');
SELECT pg_temp.eq('HR reopens a completed manager evaluation',
  (SELECT (finalized_at IS NULL AND mgr_submitted_at IS NULL AND emp_submitted_at IS NOT NULL)
     FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp3')), true);

-- ───────── HR and admin have no form of their own (migration 20261125090000) ─────────
RESET ROLE;
INSERT INTO ids VALUES ('emp4', gen_random_uuid());
INSERT INTO profiles (id, org_id, auth_user_id, full_name, role, manager_id, status)
VALUES ((SELECT v FROM ids WHERE k = 'emp4'), (SELECT v FROM ids WHERE k = 'org'), gen_random_uuid(), 'Fourth Person', 'member',
        (SELECT v FROM ids WHERE k = 'hr'), 'active');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'hr'));
SELECT pg_temp.fails('HR cannot start their own form', 'SELECT self_eval_start(2026)', 'HR and admin do not fill');
SELECT pg_temp.fails('HR cannot fill their own form',
  format('SELECT self_eval_save(%L, 2026, ''reflection'', ARRAY[''proud''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'hr')), 'HR and admin do not fill');
SELECT pg_temp.fails('HR cannot fill an admin''s form',
  format('SELECT self_eval_save(%L, 2026, ''reflection'', ARRAY[''proud''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'admin')), 'HR and admin do not fill');
SELECT pg_temp.fails('HR cannot record a file on their own form',
  format('SELECT self_eval_file_add(%L, 2026, ''form'', NULL, %L, ''a.pdf'', ''application/pdf'', 1)',
         (SELECT v FROM ids WHERE k = 'hr'), (SELECT v FROM ids WHERE k = 'hr')::text || '/2026/a.pdf'), 'HR and admin do not fill');
SELECT pg_temp.eq('HR cannot upload to their own folder',
  self_eval_storage_ok((SELECT v FROM ids WHERE k = 'hr')::text || '/2026/a.pdf', true), false);
SELECT self_eval_save((SELECT v FROM ids WHERE k = 'emp4'), 2026, 'reflection', ARRAY['proud'], to_jsonb('By HR'::text));
SELECT pg_temp.eq('HR still fills for someone else',
  (SELECT reflection ->> 'proud' FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp4')), 'By HR');
SELECT pg_temp.eq('HR still uploads for someone else',
  self_eval_storage_ok((SELECT v FROM ids WHERE k = 'emp4')::text || '/2026/a.pdf', true), true);
SELECT self_eval_file_add((SELECT v FROM ids WHERE k = 'emp4'), 2026, 'form', NULL,
  (SELECT v FROM ids WHERE k = 'emp4')::text || '/2026/a.pdf', 'a.pdf', 'application/pdf', 1);
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'admin'));
SELECT pg_temp.fails('admin cannot start their own form', 'SELECT self_eval_start(2026)', 'HR and admin do not fill');
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp4'));
SELECT self_eval_submit((SELECT v FROM ids WHERE k = 'emp4'), 2026, 'employee', 'Fourth Person');
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'hr'));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp4'), 2026, ARRAY['overall', 'goals', 'rating'], to_jsonb('EE'::text));
SELECT self_eval_manager_save((SELECT v FROM ids WHERE k = 'emp4'), 2026, ARRAY['overall', 'values', 'rating'], to_jsonb('EE'::text));
SELECT self_eval_submit((SELECT v FROM ids WHERE k = 'emp4'), 2026, 'manager', 'Test HR');
SELECT pg_temp.eq('HR still evaluates someone who reports to them',
  (SELECT final_rating FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp4')), 'EE');
SELECT self_eval_reopen((SELECT v FROM ids WHERE k = 'emp4'), 2026, 'employee');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.fails('a developer cannot fill an admin''s form',
  format('SELECT self_eval_dev_save(%L, %L, 2026, ''reflection'', ARRAY[''proud''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'dev'), (SELECT v FROM ids WHERE k = 'admin')), 'HR and admin do not fill');
RESET ROLE;
-- someone who becomes HR: what they saved is kept, but cannot be changed or submitted
UPDATE profiles SET role = 'hr' WHERE id = (SELECT v FROM ids WHERE k = 'emp4');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp4'));
SELECT pg_temp.fails('a new HR cannot submit their earlier form',
  format('SELECT self_eval_submit(%L, 2026, ''employee'', ''Fourth Person'')', (SELECT v FROM ids WHERE k = 'emp4')), 'HR and admin do not fill');
SELECT pg_temp.eq('their earlier answers are kept',
  (SELECT reflection ->> 'proud' FROM self_evaluations WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp4')), 'By HR');

ROLLBACK;
