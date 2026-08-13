CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments readable in my org" ON public.departments
  FOR SELECT TO authenticated USING (org_id = my_org());

CREATE POLICY "hr and admin write departments" ON public.departments
  FOR ALL TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['hr','admin']))
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['hr','admin']));

CREATE TRIGGER departments_touch BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

CREATE INDEX idx_departments_org ON public.departments (org_id);

INSERT INTO public.departments (org_id, name, sort_order)
SELECT o.id, d.name, d.sort_order
  FROM public.organisations o
  CROSS JOIN (VALUES
    ('Leadership', 0),
    ('People & Culture', 10),
    ('Operations', 20),
    ('Coaching', 30),
    ('Community', 40),
    ('Customer Experience', 50),
    ('Sales', 60),
    ('Tele-calling', 70),
    ('Content', 80),
    ('Technology', 90),
    ('Finance', 100)
  ) AS d(name, sort_order)
ON CONFLICT (org_id, name) DO NOTHING;

INSERT INTO public.departments (org_id, name, sort_order)
SELECT DISTINCT p.org_id, p.department, 100
  FROM public.profiles p
 WHERE p.department IS NOT NULL AND btrim(p.department) <> ''
ON CONFLICT (org_id, name) DO NOTHING;

ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS handover_task_ids uuid[];

CREATE OR REPLACE FUNCTION public.leave_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_name text; v_label text; v_needed numeric; r record; v_moved int := 0; v_stamp text;
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
END $$;

CREATE OR REPLACE FUNCTION public.leave_balances(p_profile_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target uuid := coalesce(p_profile_id, my_profile_id());
  v_me uuid := my_profile_id();
  v_year int := extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int;
  v_earned int := 0;
  v_comp_total int := 0;
  v_comp_open int := 0;
  v_summary jsonb;
  v_settings jsonb;
  v_casual numeric;
  v_sick numeric;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_entitled numeric;
BEGIN
  IF v_target IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_target = v_me OR manages(v_target) OR my_role() = ANY (ARRAY['hr','admin'])) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT o.settings INTO v_settings
    FROM organisations o JOIN profiles p ON p.org_id = o.id WHERE p.id = v_target;
  v_casual := coalesce((v_settings->>'casual_quota')::numeric, 8);
  v_sick := coalesce((v_settings->>'sick_quota')::numeric, 6);

  v_summary := attendance_summary(v_target);
  v_earned := coalesce((v_summary->>'earned_available')::int, 0);

  SELECT count(*), count(*) FILTER (WHERE consumed = false)
    INTO v_comp_total, v_comp_open
    FROM comp_off_credits WHERE profile_id = v_target;

  FOR r IN SELECT unnest(ARRAY['casual','sick','earned','comp_off']) AS t LOOP
    v_entitled := CASE r.t
      WHEN 'casual' THEN v_casual
      WHEN 'sick' THEN v_sick
      WHEN 'earned' THEN v_earned
      ELSE v_comp_total END;

    v_out := v_out || jsonb_build_object(
      'type', r.t,
      'entitled', v_entitled,
      'used', coalesce((SELECT sum(days) FROM leave_requests
                         WHERE profile_id = v_target AND type = r.t AND status = 'approved'
                           AND extract(year FROM from_date) = v_year), 0),
      'pending', coalesce((SELECT sum(days) FROM leave_requests
                            WHERE profile_id = v_target AND type = r.t AND status = 'pending'
                              AND extract(year FROM from_date) = v_year), 0),
      'balance', 0
    );
  END LOOP;

  SELECT jsonb_agg(
    e || jsonb_build_object('balance', GREATEST(
      CASE WHEN e->>'type' = 'comp_off'
           THEN v_comp_open - (e->>'pending')::numeric
           ELSE (e->>'entitled')::numeric - (e->>'used')::numeric - (e->>'pending')::numeric
      END, 0))
  ) INTO v_out FROM jsonb_array_elements(v_out) e;

  RETURN v_out;
END $$;