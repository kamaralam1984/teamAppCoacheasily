-- ═══ TODAY: ADD AFTER COMMITTING · A TASK WAITING FOR REVIEW IS NOT "MOVED" ═══
-- 1. commit_day can be called again after the morning commit to add more tasks to today.
--    The cap now counts the whole day (already committed + new), not just this call.
-- 2. close_day no longer counts a task waiting for its giver's review as carried forward:
--    the owner has finished it, so carried_count stays as it is and it leaves the daily list.
-- Nothing is deleted. Only these two functions are replaced.

CREATE OR REPLACE FUNCTION public.commit_day(p_task_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id(); v_org uuid := my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_cap int; v_n int; v_bad int; v_total int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT coalesce((settings->>'daily_priority_cap')::int, 3) INTO v_cap
    FROM organisations WHERE id = v_org;

  v_n := coalesce(array_length(p_task_ids, 1), 0);
  IF v_n = 0 THEN RAISE EXCEPTION 'Pick at least one thing to do today.'; END IF;

  -- every task must be your own
  SELECT count(*) INTO v_bad FROM unnest(p_task_ids) t(id)
   WHERE NOT EXISTS (SELECT 1 FROM tasks k WHERE k.id = t.id AND k.owner_id = v_me);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Those are not all your tasks.'; END IF;

  -- the cap is for the whole day: what is already on today plus what is being added
  SELECT count(*) INTO v_total FROM (
    SELECT id FROM tasks WHERE owner_id = v_me AND committed_on = v_today
    UNION
    SELECT t.id FROM unnest(p_task_ids) t(id)
  ) s;
  IF v_total > v_cap THEN
    RAISE EXCEPTION 'Choose your % most important. A long list is not a plan.', v_cap;
  END IF;

  UPDATE tasks SET committed_on = v_today, updated_at = now()
   WHERE id = ANY (p_task_ids) AND owner_id = v_me;

  INSERT INTO task_days (org_id, task_id, profile_id, day)
  SELECT v_org, t.id, v_me, v_today FROM unnest(p_task_ids) t(id)
  ON CONFLICT (task_id, day) DO NOTHING;

  INSERT INTO day_plans (org_id, profile_id, day, committed_at)
  VALUES (v_org, v_me, v_today, now())
  ON CONFLICT (profile_id, day)
  DO UPDATE SET committed_at = coalesce(day_plans.committed_at, now()), updated_at = now();

  RETURN jsonb_build_object('ok', true, 'committed', v_n, 'total', v_total, 'cap', v_cap);
END $function$;

CREATE OR REPLACE FUNCTION public.close_day(p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := my_profile_id(); v_org uuid := my_org();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_total int; v_done int; v_carried int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;

  -- record what actually happened
  UPDATE task_days d SET done = t.done, done_at = t.done_at
    FROM tasks t WHERE t.id = d.task_id AND d.profile_id = v_me AND d.day = v_today;

  SELECT count(*), count(*) FILTER (WHERE done) INTO v_total, v_done
    FROM task_days WHERE profile_id = v_me AND day = v_today;

  -- unfinished, non-repeating work carries to tomorrow
  -- (a task waiting for its giver's review is finished on the owner's side: not carried)
  UPDATE tasks SET committed_on = NULL, carried_count = carried_count + 1, updated_at = now()
   WHERE owner_id = v_me AND committed_on = v_today AND done = false AND repeats = 'none'
     AND status <> 'review';
  GET DIAGNOSTICS v_carried = ROW_COUNT;

  -- repeating work resets so it comes back tomorrow, history already saved above
  UPDATE tasks SET committed_on = NULL, done = false, done_at = NULL, updated_at = now()
   WHERE owner_id = v_me AND committed_on = v_today AND repeats <> 'none';

  -- finished one-off work, and work waiting for review, simply leaves the daily list
  UPDATE tasks SET committed_on = NULL, updated_at = now()
   WHERE owner_id = v_me AND committed_on = v_today AND repeats = 'none'
     AND (done = true OR status = 'review');

  INSERT INTO day_plans (org_id, profile_id, day, closed_at, note)
  VALUES (v_org, v_me, v_today, now(), p_note)
  ON CONFLICT (profile_id, day)
  DO UPDATE SET closed_at = now(), note = coalesce(excluded.note, day_plans.note), updated_at = now();

  RETURN jsonb_build_object('total', v_total, 'done', v_done, 'carried', v_carried,
    'pct', CASE WHEN v_total = 0 THEN 0 ELSE round(v_done * 100.0 / v_total) END);
END $function$;
