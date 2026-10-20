-- ═══ A LEAVE REQUEST NOBODY DECIDES IS REJECTED WHEN ITS DATE ARRIVES ═══
-- A request that was sent before the leave begins stays pending only until the first day of the
-- leave. When that day arrives with no decision, it is rejected automatically and cannot be
-- approved any more: the person is told, and so are the approver and HR, who must decide in time.
--   * Only requests sent BEFORE their first day are affected. A request sent on or after its first
--     day (a sick day reported late, say) never had a "before", so it waits for a decision as usual.
--   * It runs every night just after midnight (IST), and also whenever someone opens the Leave or
--     Approvals screen, so nobody ever sees an out-of-date "pending".
--   * The reason is kept in decision_note, and decided_by stays empty: that is how an automatic
--     rejection is told from a person's.

ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS decision_note text;

CREATE OR REPLACE FUNCTION public.leave_expire_pending() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  -- a person calling this only closes their own organisation's requests; the nightly job closes all
  v_org uuid := CASE WHEN my_profile_id() IS NULL THEN NULL ELSE my_org() END;
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT l.id, l.org_id, l.profile_id, l.type, l.from_date, l.approver_id, p.full_name
      FROM leave_requests l JOIN profiles p ON p.id = l.profile_id
     WHERE l.status = 'pending'
       AND l.from_date <= v_today
       AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date < l.from_date
       AND (v_org IS NULL OR l.org_id = v_org)
     ORDER BY l.created_at
       FOR UPDATE OF l SKIP LOCKED
  LOOP
    UPDATE leave_requests
       SET status = 'rejected', decided_by = NULL, decided_at = now(),
           decision_note = 'Nobody decided before the leave date, so it was closed automatically.'
     WHERE id = r.id;

    INSERT INTO notifications (org_id, profile_id, title, body, link)
    SELECT r.org_id, t.id,
           format('%s''s leave request was closed with no decision', r.full_name),
           format('%s leave from %s was not decided before it began, so it was rejected automatically.',
                  initcap(replace(r.type, '_', '-')), to_char(r.from_date, 'FMDD Mon')),
           '/approvals'
      FROM profiles t
     WHERE t.org_id = r.org_id AND t.status = 'active' AND t.id <> r.profile_id
       AND (t.id = r.approver_id OR t.role = ANY (ARRAY['hr', 'admin']));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.leave_expire_pending() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leave_expire_pending() TO authenticated, service_role;

-- Once the date has come, nobody can approve it, and a closed request cannot be reopened by approving it.
CREATE OR REPLACE FUNCTION public.leave_decision_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    IF OLD.status = 'rejected' AND OLD.decision_note IS NOT NULL AND OLD.decided_by IS NULL THEN
      RAISE EXCEPTION 'This request was closed automatically because nobody decided before the leave date. Ask for a new request.';
    END IF;
    IF OLD.status = 'pending' AND OLD.from_date <= v_today
       AND (OLD.created_at AT TIME ZONE 'Asia/Kolkata')::date < OLD.from_date THEN
      RAISE EXCEPTION 'The leave date has arrived and nobody decided in time, so this request can no longer be approved. Ask for a new request.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leave_decision_guard_trg ON public.leave_requests;
CREATE TRIGGER leave_decision_guard_trg BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.leave_decision_guard();

-- The notification to the person says what happened and what to do.
CREATE OR REPLACE FUNCTION public.leave_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_name text; v_label text; v_needed numeric; r record; v_moved int := 0; v_stamp text;
  v_auto boolean;
BEGIN
  SELECT full_name INTO v_name FROM profiles WHERE id = NEW.profile_id;
  v_label := initcap(replace(NEW.type, '_', '-'));

  IF TG_OP = 'INSERT' THEN
    IF NEW.approver_id IS NOT NULL THEN
      INSERT INTO notifications (org_id, profile_id, title, body, link)
      VALUES (NEW.org_id, NEW.approver_id,
        v_name || ' applied for ' || v_label || ' leave',
        to_char(NEW.from_date, 'DD Mon') || ' → ' || to_char(NEW.to_date, 'DD Mon')
          || ' · ' || NEW.days || ' day(s)',
        '/approvals');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status <> OLD.status AND NEW.status IN ('approved','rejected') THEN
    v_auto := NEW.status = 'rejected' AND NEW.decided_by IS NULL AND NEW.decision_note IS NOT NULL;
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (NEW.org_id, NEW.profile_id,
      'Your ' || v_label || ' leave was ' || NEW.status || CASE WHEN v_auto THEN ' automatically' ELSE '' END,
      to_char(NEW.from_date, 'DD Mon') || ' → ' || to_char(NEW.to_date, 'DD Mon')
        || ' · ' || NEW.days || ' day(s)'
        || CASE WHEN v_auto THEN '. Nobody decided before the leave date, so it was closed. Please apply again if you still need it.' ELSE '' END,
      '/leave');

    IF NEW.status = 'approved' AND NEW.type = 'comp_off' THEN
      v_needed := ceil(NEW.days);
      FOR r IN
        SELECT id FROM comp_off_credits
         WHERE profile_id = NEW.profile_id AND consumed = false
         ORDER BY earned_on ASC LIMIT v_needed::int
      LOOP
        UPDATE comp_off_credits
           SET consumed = true, consumed_by = NEW.profile_id
         WHERE id = r.id;
      END LOOP;
    END IF;

    IF NEW.status = 'approved' AND NEW.handover_to IS NOT NULL THEN
      v_stamp := 'Handed over by ' || coalesce(v_name, 'a teammate') || ' ('
        || to_char(NEW.from_date, 'DD Mon') || ' → ' || to_char(NEW.to_date, 'DD Mon') || ')';

      UPDATE tasks
         SET owner_id = NEW.handover_to,
             description = CASE
               WHEN description IS NULL OR btrim(description) = '' THEN v_stamp
               ELSE description || E'\n' || v_stamp END,
             updated_at = now()
       WHERE owner_id = NEW.profile_id
         AND done = false
         AND (
           (NEW.handover_task_ids IS NOT NULL AND array_length(NEW.handover_task_ids, 1) > 0
              AND id = ANY (NEW.handover_task_ids))
           OR ((NEW.handover_task_ids IS NULL OR array_length(NEW.handover_task_ids, 1) IS NULL)
              AND due_date IS NOT NULL
              AND due_date BETWEEN NEW.from_date AND NEW.to_date)
         );
      GET DIAGNOSTICS v_moved = ROW_COUNT;

      IF v_moved > 0 THEN
        INSERT INTO notifications (org_id, profile_id, title, body, link)
        VALUES (NEW.org_id, NEW.handover_to,
          v_name || ' is away ' || to_char(NEW.from_date, 'DD Mon') || ' → '
            || to_char(NEW.to_date, 'DD Mon'),
          v_moved || ' task(s) moved to you.', '/tasks');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

-- The audit trail says it was automatic.
CREATE OR REPLACE FUNCTION public.audit_leave() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r leave_requests%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM audit_write(NEW.org_id, 'leave', 'leave.request', NEW.profile_id, NEW.id,
      format('%s asked for %s day(s) of %s leave (%s → %s)', audit_name(NEW.profile_id),
             NEW.days, NEW.type, to_char(NEW.from_date, 'FMDD Mon'), to_char(NEW.to_date, 'FMDD Mon')),
      NULL, jsonb_build_object('type', NEW.type, 'days', NEW.days, 'from', NEW.from_date, 'to', NEW.to_date));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
      IF NEW.status = 'rejected' AND NEW.decided_by IS NULL AND NEW.decision_note IS NOT NULL THEN
        PERFORM audit_write(NEW.org_id, 'leave', 'leave.auto_rejected', NEW.profile_id, NEW.id,
          format('%s''s %s leave of %s day(s) (%s → %s) was rejected automatically: nobody decided before it began',
                 audit_name(NEW.profile_id), NEW.type, NEW.days,
                 to_char(NEW.from_date, 'FMDD Mon'), to_char(NEW.to_date, 'FMDD Mon')),
          jsonb_build_object('status', OLD.status),
          jsonb_build_object('status', NEW.status, 'note', NEW.decision_note));
      ELSE
        PERFORM audit_write(NEW.org_id, 'leave', 'leave.' || NEW.status, NEW.profile_id, NEW.id,
          format('%s %s %s''s %s leave of %s day(s) (%s → %s)', audit_actor(), NEW.status,
                 audit_name(NEW.profile_id), NEW.type, NEW.days,
                 to_char(NEW.from_date, 'FMDD Mon'), to_char(NEW.to_date, 'FMDD Mon')),
          jsonb_build_object('status', OLD.status),
          jsonb_build_object('status', NEW.status, 'type', NEW.type, 'days', NEW.days));
      END IF;
    END IF;
    RETURN NEW;
  ELSE
    r := OLD;
    PERFORM audit_write(r.org_id, 'leave', 'leave.delete', r.profile_id, r.id,
      format('%s removed %s''s %s leave request (%s, %s day(s))', audit_actor(), audit_name(r.profile_id),
             r.type, r.status, r.days),
      jsonb_build_object('status', r.status, 'type', r.type, 'days', r.days), NULL);
    RETURN OLD;
  END IF;
END $$;

-- every night at 00:05 IST (18:35 UTC)
SELECT cron.schedule('ce-leave-expire', '35 18 * * *', $$SELECT public.leave_expire_pending()$$);
