-- ══ A1 · daily codes ══
CREATE TABLE public.daily_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  day_no int NOT NULL CHECK (day_no BETWEEN 1 AND 366),
  value text NOT NULL CHECK (value IN ('Honesty','Dedication','Genuine Care')),
  title text NOT NULL,
  body text NOT NULL,
  pledge text NOT NULL,
  department text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX daily_codes_slot ON public.daily_codes (org_id, day_no, coalesce(department, ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_codes TO authenticated;
GRANT ALL ON public.daily_codes TO service_role;
ALTER TABLE public.daily_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read org codes" ON public.daily_codes FOR SELECT TO authenticated
  USING (org_id = my_org());
CREATE POLICY "hr admin insert codes" ON public.daily_codes FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['hr','admin']));
CREATE POLICY "hr admin update codes" ON public.daily_codes FOR UPDATE TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['hr','admin']))
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['hr','admin']));
CREATE POLICY "hr admin delete codes" ON public.daily_codes FOR DELETE TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['hr','admin']));

CREATE TRIGGER daily_codes_touch BEFORE UPDATE ON public.daily_codes
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

INSERT INTO public.daily_codes (org_id, day_no, value, title, body, pledge, department)
SELECT o.id, v.day_no, v.value, v.title, v.body, v.pledge, v.department
FROM public.organisations o,
(VALUES
  (1,'Honesty','The day begins with the truth',
   'Nobody is watching, and that is exactly the point. We are trusted because we tell the truth about our work — the wins and the stuck parts alike. Say where you really are today, and the day gets easier.',
   'I''m here, and I''ll work honestly today', NULL),
  (2,'Dedication','Show up the way Shivaji Maharaj''s men did',
   'They were far from home, out of sight of any commander, and still they held the line. Dedication is what you do on the ordinary Tuesday, not the big day.',
   'I''m here, and I''ll give today my best', NULL),
  (3,'Genuine Care','A student on the other side',
   'Every call, every reply, every quiet fix — a real person is on the other end of it. Care is not a script. It is remembering that.',
   'I''m here, and I''ll care for every person I meet today', NULL),
  (3,'Genuine Care','Every ring is a person',
   'The number on your screen belongs to somebody weighing up a big decision. Slow down half a second before you speak — that is the whole job.',
   'I''m here, and I''ll listen before I speak today', 'Sales')
) AS v(day_no, value, title, body, pledge, department);

-- ══ A5 · what I'm on today ══
ALTER TABLE public.attendance ADD COLUMN focus text;

CREATE OR REPLACE FUNCTION public.presence_today()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'title', p.title,
    'department', p.department,
    'present', a.id IS NOT NULL,
    'focus', a.focus
  ) ORDER BY (a.id IS NULL), p.sort_order, p.full_name), '[]'::jsonb)
  FROM profiles p
  LEFT JOIN attendance a
    ON a.profile_id = p.id AND a.date = (now() AT TIME ZONE 'Asia/Kolkata')::date
  WHERE p.org_id = my_org() AND p.status = 'active';
$$;

-- ══ A3 · today's code for a person ══
CREATE OR REPLACE FUNCTION public.daily_code_today()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := my_org();
  v_dept text;
  v_day int := extract(doy FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int;
  v_row daily_codes;
BEGIN
  IF v_org IS NULL THEN RETURN NULL; END IF;
  SELECT department INTO v_dept FROM profiles WHERE id = my_profile_id();

  SELECT * INTO v_row FROM daily_codes
   WHERE org_id = v_org AND day_no = v_day AND department = v_dept LIMIT 1;
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM daily_codes
     WHERE org_id = v_org AND day_no = v_day AND department IS NULL LIMIT 1;
  END IF;
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM daily_codes
     WHERE org_id = v_org AND department IS NULL
     ORDER BY abs(day_no - v_day), day_no LIMIT 1;
  END IF;
  IF v_row.id IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END $$;

-- ══ B1 · tasks ══
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  title text NOT NULL,
  description text,
  due_date date,
  slot text NOT NULL DEFAULT 'Anytime' CHECK (slot IN ('Morning','Afternoon','Evening','Anytime')),
  priority text NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High','Urgent')),
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  blocked_by uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  blocked_notified_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_owner_idx ON public.tasks (owner_id, done, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or downline tasks" ON public.tasks FOR SELECT TO authenticated
  USING (org_id = my_org() AND (owner_id = my_profile_id() OR created_by = my_profile_id()
         OR manages(owner_id) OR my_role() = ANY (ARRAY['hr','admin'])));
CREATE POLICY "create own or downline tasks" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND created_by = my_profile_id()
    AND (owner_id = my_profile_id() OR manages(owner_id) OR my_role() = ANY (ARRAY['hr','admin'])));
CREATE POLICY "update own or downline tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (org_id = my_org() AND (owner_id = my_profile_id() OR created_by = my_profile_id()
         OR manages(owner_id) OR my_role() = ANY (ARRAY['hr','admin'])))
  WITH CHECK (org_id = my_org());
CREATE POLICY "delete own or created tasks" ON public.tasks FOR DELETE TO authenticated
  USING (org_id = my_org() AND (owner_id = my_profile_id() OR created_by = my_profile_id()
         OR my_role() = ANY (ARRAY['hr','admin'])));

CREATE OR REPLACE FUNCTION public.tasks_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.done AND NEW.done_at IS NULL THEN NEW.done_at := now(); END IF;
  IF NOT NEW.done THEN NEW.done_at := NULL; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tasks_before_write BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_before_write();

-- notify a warrior when someone else hands them a task
CREATE OR REPLACE FUNCTION public.tasks_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_from text;
BEGIN
  IF NEW.created_by IS NOT NULL AND NEW.created_by <> NEW.owner_id THEN
    SELECT full_name INTO v_from FROM profiles WHERE id = NEW.created_by;
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (NEW.org_id, NEW.owner_id,
      'New task from ' || coalesce(v_from, 'your manager'),
      NEW.title || CASE WHEN NEW.due_date IS NOT NULL
        THEN ' · due ' || to_char(NEW.due_date, 'DD Mon') ELSE '' END,
      '/tasks');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tasks_after_insert AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_after_insert();

-- ══ B8 · daily reflections ══
CREATE TABLE public.daily_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reflections TO authenticated;
GRANT ALL ON public.daily_reflections TO service_role;
ALTER TABLE public.daily_reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or downline reflections" ON public.daily_reflections FOR SELECT TO authenticated
  USING (org_id = my_org() AND (profile_id = my_profile_id() OR manages(profile_id)
         OR my_role() = ANY (ARRAY['hr','admin'])));
CREATE POLICY "write own reflections" ON public.daily_reflections FOR INSERT TO authenticated
  WITH CHECK (org_id = my_org() AND profile_id = my_profile_id());
CREATE POLICY "amend own reflections" ON public.daily_reflections FOR UPDATE TO authenticated
  USING (profile_id = my_profile_id()) WITH CHECK (profile_id = my_profile_id());
CREATE POLICY "remove own reflections" ON public.daily_reflections FOR DELETE TO authenticated
  USING (profile_id = my_profile_id());

CREATE TRIGGER daily_reflections_touch BEFORE UPDATE ON public.daily_reflections
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

-- ══ B6 · leave handover moves tasks ══
CREATE OR REPLACE FUNCTION public.leave_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_name text; v_label text; v_needed numeric; r record; v_moved int := 0;
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
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (NEW.org_id, NEW.profile_id,
      'Your ' || v_label || ' leave was ' || NEW.status,
      to_char(NEW.from_date, 'DD Mon') || ' → ' || to_char(NEW.to_date, 'DD Mon')
        || ' · ' || NEW.days || ' day(s)',
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

    -- hand the open work over
    IF NEW.status = 'approved' AND NEW.handover_to IS NOT NULL THEN
      UPDATE tasks
         SET owner_id = NEW.handover_to, updated_at = now()
       WHERE owner_id = NEW.profile_id
         AND done = false
         AND due_date IS NOT NULL
         AND due_date BETWEEN NEW.from_date AND NEW.to_date;
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
END $$;

-- ══ B7 · dependency nudge ══
CREATE OR REPLACE FUNCTION public.tasks_blocked_nudges()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_me uuid := my_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n int := 0; r record;
BEGIN
  IF v_me IS NULL THEN RETURN 0; END IF;
  FOR r IN
    SELECT t.id, t.org_id, t.title, b.title AS blocker, b.due_date,
           (SELECT full_name FROM profiles p WHERE p.id = b.owner_id) AS blocker_owner
      FROM tasks t JOIN tasks b ON b.id = t.blocked_by
     WHERE t.owner_id = v_me AND t.done = false
       AND b.done = false AND b.due_date IS NOT NULL AND b.due_date < v_today
       AND (t.blocked_notified_on IS NULL OR t.blocked_notified_on < v_today)
  LOOP
    INSERT INTO notifications (org_id, profile_id, title, body, link)
    VALUES (r.org_id, v_me,
      'You are still waiting on "' || r.blocker || '"',
      coalesce(r.blocker_owner, 'Someone') || '''s task was due '
        || to_char(r.due_date, 'DD Mon') || ' and "' || r.title || '" cannot move until it lands.',
      '/tasks');
    UPDATE tasks SET blocked_notified_on = v_today WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;