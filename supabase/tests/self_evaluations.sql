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
SELECT pg_temp.eq('everyone active is told once',
  (SELECT count(*) FROM notifications WHERE link = '/self-evaluation?year=2026')::int, 5);
SELECT self_eval_open_cycle(2026, DATE '2027-01-20');
SELECT pg_temp.eq('opening again does not tell again',
  (SELECT count(*) FROM notifications WHERE link = '/self-evaluation?year=2026')::int, 5);

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

-- ───────── ratings by manager, HR and admin ─────────
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'mgr'));
SELECT self_eval_review_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'manager', ARRAY['goals', '0', 'rating'], to_jsonb('EE'::text));
SELECT self_eval_review_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'manager', ARRAY['values', 'ownership', 'comment'], to_jsonb('Agreed'::text));
SELECT self_eval_review_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'manager', ARRAY['feedback'], to_jsonb('Good year'::text));
SELECT self_eval_note_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'manager', 'Promote next year');
SELECT pg_temp.fails('the manager cannot write HR''s ratings',
  format('SELECT self_eval_review_save(%L, 2026, ''hr'', ARRAY[''feedback''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'cannot rate');
SELECT pg_temp.fails('the manager submits only with an overall rating',
  format('SELECT self_eval_submit(%L, 2026, ''manager'')', (SELECT v FROM ids WHERE k = 'emp')),
  'overall rating');
SELECT self_eval_review_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'manager', ARRAY['overall_rating'], to_jsonb('EE'::text));
SELECT self_eval_submit((SELECT v FROM ids WHERE k = 'emp'), 2026, 'manager');
SELECT pg_temp.fails('the manager''s ratings lock once submitted',
  format('SELECT self_eval_review_save(%L, 2026, ''manager'', ARRAY[''feedback''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'cannot rate');

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'hr'));
SELECT self_eval_review_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'hr', ARRAY['goals', '1', 'rating'], to_jsonb('FME'::text));
SELECT self_eval_review_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'hr', ARRAY['feedback'], to_jsonb('Keep it up'::text));
SELECT pg_temp.fails('HR cannot write admin''s ratings',
  format('SELECT self_eval_review_save(%L, 2026, ''sir'', ARRAY[''feedback''], to_jsonb(''x''::text))',
         (SELECT v FROM ids WHERE k = 'emp')), 'cannot rate');
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'admin'));
SELECT self_eval_review_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'sir', ARRAY['overall_rating'], to_jsonb('O'::text));
SELECT self_eval_note_save((SELECT v FROM ids WHERE k = 'emp'), 2026, 'sir', 'Raise');

-- the person sees nothing of it before final
SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp'));
SELECT pg_temp.eq('ratings hidden from the person before final',
  (SELECT count(*) FROM self_eval_reviews)::int, 0);
SELECT pg_temp.fails('the person cannot finalize',
  format('SELECT self_eval_finalize(%L, 2026, ''O'')', (SELECT v FROM ids WHERE k = 'emp')), 'Only HR or admin');

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'admin'));
SELECT self_eval_finalize((SELECT v FROM ids WHERE k = 'emp'), 2026, 'EE');

SELECT pg_temp.as_user((SELECT v FROM ids WHERE k = 'emp'));
SELECT pg_temp.eq('ratings shown to the person once final',
  (SELECT count(*) FROM self_eval_reviews)::int, 3);
SELECT pg_temp.eq('internal notes never shown to the person',
  (SELECT count(*) FROM self_eval_notes)::int, 0);
SELECT pg_temp.eq('the person is told it is final',
  (SELECT count(*) FROM notifications WHERE profile_id = (SELECT v FROM ids WHERE k = 'emp')
      AND title LIKE '%is final')::int, 1);
SELECT pg_temp.eq('no uploads once final',
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

ROLLBACK;
