-- ═══ HOLIDAY CALENDAR + BIRTHDAY REMINDERS ═══
-- Holidays:
--   * holiday_calendar holds every holiday with a type (national / regional / company /
--     optional / restricted) and a status (proposed / approved).
--   * The existing holidays table keeps its meaning, "days off for everyone", and is kept in sync:
--     a row is there exactly when a calendar entry is approved AND is a national, regional or
--     company holiday. So leave, comp-off, attendance and earned leave need no change.
--   * Optional and restricted holidays are listed on the calendar but are not days off for all.
--   * Suggestions (from the app) arrive as proposed entries; HR reviews, edits and approves them.
-- Birthdays: HR and admin get a notice 7, 3 and 1 days before (configurable in the organisation's
--   settings: birthday_reminder_days, birthday_reminders_enabled).

-- ───────── 1. THE CALENDAR ─────────
CREATE TABLE IF NOT EXISTS public.holiday_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  kind text NOT NULL DEFAULT 'company'
    CHECK (kind IN ('national', 'regional', 'company', 'optional', 'restricted')),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('proposed', 'approved')),
  region text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'suggested', 'legacy')),
  proposed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT holiday_calendar_one_per_name UNIQUE (org_id, date, name)
);
CREATE INDEX IF NOT EXISTS holiday_calendar_org_date_idx ON public.holiday_calendar (org_id, date);

ALTER TABLE public.holidays
  ADD COLUMN IF NOT EXISTS calendar_id uuid REFERENCES public.holiday_calendar(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS holidays_calendar_idx ON public.holidays (calendar_id);

ALTER TABLE public.holiday_calendar ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holiday_calendar TO authenticated;
GRANT ALL ON public.holiday_calendar TO service_role;
REVOKE ALL ON public.holiday_calendar FROM anon;

DROP POLICY IF EXISTS "read the holiday calendar" ON public.holiday_calendar;
CREATE POLICY "read the holiday calendar" ON public.holiday_calendar FOR SELECT TO authenticated
  USING (org_id = my_org() AND (status = 'approved' OR my_role() = ANY (ARRAY['hr', 'admin'])));
DROP POLICY IF EXISTS "hr writes the holiday calendar" ON public.holiday_calendar;
CREATE POLICY "hr writes the holiday calendar" ON public.holiday_calendar FOR ALL TO authenticated
  USING (org_id = my_org() AND my_role() = ANY (ARRAY['hr', 'admin']))
  WITH CHECK (org_id = my_org() AND my_role() = ANY (ARRAY['hr', 'admin']));

-- who approved it, and when
CREATE OR REPLACE FUNCTION public.holiday_calendar_before() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'proposed' AND NEW.proposed_by IS NULL THEN NEW.proposed_by := my_profile_id(); END IF;
    IF NEW.status = 'approved' AND NEW.approved_at IS NULL AND NEW.source <> 'legacy' THEN
      NEW.approved_by := coalesce(NEW.approved_by, my_profile_id());
      NEW.approved_at := now();
    END IF;
  ELSIF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    NEW.approved_by := my_profile_id();
    NEW.approved_at := now();
  ELSIF NEW.status = 'proposed' THEN
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS holiday_calendar_before_write ON public.holiday_calendar;
CREATE TRIGGER holiday_calendar_before_write BEFORE INSERT OR UPDATE ON public.holiday_calendar
  FOR EACH ROW EXECUTE FUNCTION public.holiday_calendar_before();

-- Keep holidays (the days off) in step with the calendar.
CREATE OR REPLACE FUNCTION public.holiday_calendar_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- removing the day-off row here must not take its calendar entry with it
  PERFORM set_config('app.holiday_sync', 'on', true);
  DELETE FROM holidays WHERE calendar_id = NEW.id;
  PERFORM set_config('app.holiday_sync', 'off', true);
  IF NEW.status = 'approved' AND NEW.kind IN ('national', 'regional', 'company') THEN
    -- one day off per date; if another entry already holds that date, it keeps it
    INSERT INTO holidays (org_id, date, name, calendar_id)
    VALUES (NEW.org_id, NEW.date, NEW.name, NEW.id)
    ON CONFLICT (org_id, date) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS holiday_calendar_sync_trg ON public.holiday_calendar;
CREATE TRIGGER holiday_calendar_sync_trg AFTER INSERT OR UPDATE ON public.holiday_calendar
  FOR EACH ROW EXECUTE FUNCTION public.holiday_calendar_sync();

-- A holiday written straight into the old table (the developer panel, old scripts) still appears
-- on the calendar; removing it removes its calendar entry.
CREATE OR REPLACE FUNCTION public.holidays_link_calendar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NEW.calendar_id IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO holiday_calendar (org_id, date, name, kind, status, source)
  VALUES (NEW.org_id, NEW.date, NEW.name, 'company', 'approved', 'legacy')
  ON CONFLICT (org_id, date, name) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM holiday_calendar
     WHERE org_id = NEW.org_id AND date = NEW.date AND name = NEW.name;
  END IF;
  UPDATE holidays SET calendar_id = v_id WHERE id = NEW.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS holidays_link_calendar_ins ON public.holidays;
CREATE TRIGGER holidays_link_calendar_ins AFTER INSERT ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.holidays_link_calendar();

CREATE OR REPLACE FUNCTION public.holidays_unlink_calendar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('app.holiday_sync', true), 'off') = 'on' THEN RETURN OLD; END IF;
  IF OLD.calendar_id IS NOT NULL THEN
    DELETE FROM holiday_calendar WHERE id = OLD.calendar_id;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS holidays_unlink_calendar_del ON public.holidays;
CREATE TRIGGER holidays_unlink_calendar_del AFTER DELETE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.holidays_unlink_calendar();

-- Audit: the calendar is where the story is told. The old per-row trigger now only speaks for
-- rows that are not linked to a calendar entry.
CREATE OR REPLACE FUNCTION public.audit_holiday() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.calendar_id IS NOT NULL THEN RETURN NEW; END IF;
    PERFORM audit_write(NEW.org_id, 'holiday', 'holiday.add', NULL, NEW.id,
      format('%s added the holiday "%s" on %s', audit_actor(), NEW.name, to_char(NEW.date, 'FMDD Mon YYYY')),
      NULL, jsonb_build_object('name', NEW.name, 'date', NEW.date));
    RETURN NEW;
  END IF;
  RETURN OLD;     -- removals are audited from the calendar entry
END $$;

CREATE OR REPLACE FUNCTION public.audit_holiday_calendar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_label text;
BEGIN
  IF coalesce(current_setting('app.skip_audit', true), 'off') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'legacy' THEN RETURN NEW; END IF;
    PERFORM audit_write(NEW.org_id, 'holiday',
      CASE WHEN NEW.status = 'proposed' THEN 'holiday.propose' ELSE 'holiday.add' END, NULL, NEW.id,
      format('%s %s the %s holiday "%s" on %s', audit_actor(),
             CASE WHEN NEW.status = 'proposed' THEN 'proposed' ELSE 'added' END,
             NEW.kind, NEW.name, to_char(NEW.date, 'FMDD Mon YYYY')),
      NULL, jsonb_build_object('name', NEW.name, 'date', NEW.date, 'kind', NEW.kind, 'status', NEW.status));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM audit_write(NEW.org_id, 'holiday', 'holiday.approve', NULL, NEW.id,
        format('%s %s the holiday "%s" on %s', audit_actor(),
               CASE WHEN NEW.status = 'approved' THEN 'approved' ELSE 'moved back to proposed' END,
               NEW.name, to_char(NEW.date, 'FMDD Mon YYYY')),
        jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name OR NEW.date IS DISTINCT FROM OLD.date OR NEW.kind IS DISTINCT FROM OLD.kind THEN
      v_label := format('%s (%s, %s)', OLD.name, OLD.kind, to_char(OLD.date, 'FMDD Mon YYYY'));
      PERFORM audit_write(NEW.org_id, 'holiday', 'holiday.edit', NULL, NEW.id,
        format('%s changed the holiday %s to "%s" (%s, %s)', audit_actor(), v_label, NEW.name, NEW.kind,
               to_char(NEW.date, 'FMDD Mon YYYY')),
        jsonb_build_object('name', OLD.name, 'date', OLD.date, 'kind', OLD.kind),
        jsonb_build_object('name', NEW.name, 'date', NEW.date, 'kind', NEW.kind));
    END IF;
    RETURN NEW;
  END IF;

  PERFORM audit_write(OLD.org_id, 'holiday', 'holiday.remove', NULL, OLD.id,
    format('%s removed the %s holiday "%s" on %s', audit_actor(), OLD.kind, OLD.name, to_char(OLD.date, 'FMDD Mon YYYY')),
    jsonb_build_object('name', OLD.name, 'date', OLD.date, 'kind', OLD.kind, 'status', OLD.status), NULL);
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS audit_holiday_calendar_ins ON public.holiday_calendar;
CREATE TRIGGER audit_holiday_calendar_ins AFTER INSERT ON public.holiday_calendar
  FOR EACH ROW EXECUTE FUNCTION public.audit_holiday_calendar();
DROP TRIGGER IF EXISTS audit_holiday_calendar_upd ON public.holiday_calendar;
CREATE TRIGGER audit_holiday_calendar_upd AFTER UPDATE ON public.holiday_calendar
  FOR EACH ROW EXECUTE FUNCTION public.audit_holiday_calendar();
DROP TRIGGER IF EXISTS audit_holiday_calendar_del ON public.holiday_calendar;
CREATE TRIGGER audit_holiday_calendar_del AFTER DELETE ON public.holiday_calendar
  FOR EACH ROW EXECUTE FUNCTION public.audit_holiday_calendar();

-- Today's holidays become calendar entries (already approved company holidays). Quietly.
DO $$
BEGIN
  PERFORM set_config('app.skip_audit', 'on', true);
  INSERT INTO public.holiday_calendar (org_id, date, name, kind, status, source, approved_at, created_at)
  SELECT h.org_id, h.date, h.name, 'company', 'approved', 'legacy', h.created_at, h.created_at
    FROM public.holidays h WHERE h.calendar_id IS NULL
  ON CONFLICT (org_id, date, name) DO NOTHING;
  UPDATE public.holidays h SET calendar_id = c.id
    FROM public.holiday_calendar c
   WHERE h.calendar_id IS NULL AND c.org_id = h.org_id AND c.date = h.date AND c.name = h.name;
  PERFORM set_config('app.skip_audit', 'off', true);
END $$;

-- ───────── 2. BIRTHDAY REMINDERS ─────────
-- The next time an MM-DD birthday falls, on or after a date. 29 Feb is kept on 28 Feb in
-- years without one. Anything that is not a real MM-DD gives null.
CREATE OR REPLACE FUNCTION public.birthday_next(p_mmdd text, p_from date) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  y integer;
  d date;
BEGIN
  IF p_mmdd IS NULL OR p_mmdd !~ '^\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  FOR y IN extract(year FROM p_from)::integer .. extract(year FROM p_from)::integer + 1 LOOP
    BEGIN
      d := make_date(y, left(p_mmdd, 2)::integer, right(p_mmdd, 2)::integer);
    EXCEPTION WHEN OTHERS THEN
      IF p_mmdd = '02-29' THEN d := make_date(y, 2, 28); ELSE RETURN NULL; END IF;
    END;
    IF d >= p_from THEN RETURN d; END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.birthday_reminders_sent (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  birthday_on date NOT NULL,
  days_before integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, birthday_on, days_before)
);
ALTER TABLE public.birthday_reminders_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.birthday_reminders_sent FROM anon, authenticated;
GRANT ALL ON public.birthday_reminders_sent TO service_role;

-- Nightly: tell HR and admin when a birthday is 7, 3 or 1 days away (or whatever the organisation
-- chose). One notice per person per birthday per lead time.
CREATE OR REPLACE FUNCTION public.birthday_reminders() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_n integer := 0;
  v_rows integer;
  o record;
  b record;
  v_days integer[];
  v_next date;
  v_gap integer;
BEGIN
  FOR o IN SELECT id, settings FROM organisations LOOP
    IF coalesce(o.settings->>'birthday_reminders_enabled', 'true') = 'false' THEN CONTINUE; END IF;
    v_days := CASE WHEN jsonb_typeof(o.settings->'birthday_reminder_days') = 'array'
                   THEN ARRAY(SELECT x::integer FROM jsonb_array_elements_text(o.settings->'birthday_reminder_days') x)
                   ELSE ARRAY[7, 3, 1] END;

    FOR b IN SELECT id, full_name, department, birthday FROM profiles
              WHERE org_id = o.id AND status = 'active' AND birthday IS NOT NULL LOOP
      v_next := birthday_next(b.birthday, v_today);
      CONTINUE WHEN v_next IS NULL;
      v_gap := v_next - v_today;
      CONTINUE WHEN NOT (v_gap = ANY (v_days));

      INSERT INTO birthday_reminders_sent (profile_id, birthday_on, days_before)
      VALUES (b.id, v_next, v_gap) ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      CONTINUE WHEN v_rows = 0;

      INSERT INTO notifications (org_id, profile_id, title, body, link)
      SELECT o.id, p.id,
             format('%s''s birthday is %s', b.full_name,
                    CASE v_gap WHEN 0 THEN 'today' WHEN 1 THEN 'tomorrow'
                               ELSE format('in %s days (%s)', v_gap, to_char(v_next, 'FMDD Mon')) END),
             coalesce(b.department, 'Plan something small.'), '/overview'
        FROM profiles p
       WHERE p.org_id = o.id AND p.status = 'active' AND p.role = ANY (ARRAY['hr', 'admin'])
         AND p.id <> b.id;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.birthday_reminders() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.birthday_reminders() TO service_role;

SELECT cron.schedule('ce-birthday-tick', '30 3 * * *', $$SELECT public.birthday_reminders()$$);