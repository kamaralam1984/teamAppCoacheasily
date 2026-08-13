-- FIX 1: cycling daily code
CREATE OR REPLACE FUNCTION public.daily_code_today()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := my_org();
  v_dept text;
  v_doy int := extract(doy FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int;
  v_n int;
  v_day int;
  v_row daily_codes;
BEGIN
  IF v_org IS NULL THEN RETURN NULL; END IF;
  SELECT department INTO v_dept FROM profiles WHERE id = my_profile_id();

  SELECT count(*) INTO v_n FROM daily_codes WHERE org_id = v_org AND department IS NULL;

  IF v_n > 0 THEN
    SELECT day_no INTO v_day
      FROM (
        SELECT day_no, row_number() OVER (ORDER BY day_no) AS rn
          FROM daily_codes WHERE org_id = v_org AND department IS NULL
      ) s
     WHERE s.rn = ((v_doy - 1) % v_n) + 1;

    IF v_dept IS NOT NULL THEN
      SELECT * INTO v_row FROM daily_codes
       WHERE org_id = v_org AND day_no = v_day AND department = v_dept LIMIT 1;
    END IF;

    IF v_row.id IS NULL THEN
      SELECT * INTO v_row FROM daily_codes
       WHERE org_id = v_org AND day_no = v_day AND department IS NULL LIMIT 1;
    END IF;
  END IF;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object(
      'id', gen_random_uuid(),
      'org_id', v_org,
      'day_no', v_doy,
      'value', 'Honesty',
      'title', 'Say it as it is',
      'body', 'Honesty is the first code. Report the real number, name the real blocker, and ask for the real help you need. Nothing at CoachEasily is built on a comfortable half-truth.',
      'pledge', 'Today I will say it as it is.',
      'department', NULL
    );
  END IF;

  RETURN to_jsonb(v_row);
END
$$;

-- FIX 2: let a person correct only today's focus line
CREATE OR REPLACE FUNCTION public.attendance_focus_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.org_id := OLD.org_id;
  NEW.profile_id := OLD.profile_id;
  NEW.date := OLD.date;
  NEW.marked_at := OLD.marked_at;
  NEW.on_time := OLD.on_time;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS attendance_focus_only_trg ON public.attendance;
CREATE TRIGGER attendance_focus_only_trg
BEFORE UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.attendance_focus_only();

GRANT UPDATE ON public.attendance TO authenticated;

DROP POLICY IF EXISTS "correct my own focus today" ON public.attendance;
CREATE POLICY "correct my own focus today" ON public.attendance
FOR UPDATE TO authenticated
USING (
  profile_id = my_profile_id()
  AND date = (now() AT TIME ZONE 'Asia/Kolkata')::date
)
WITH CHECK (
  profile_id = my_profile_id()
  AND date = (now() AT TIME ZONE 'Asia/Kolkata')::date
);

-- FIX 3 support: remember when an invite went out
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invited_at timestamptz;

-- AI-3 support: weekly cached coaching line for the weakest funnel step
CREATE TABLE IF NOT EXISTS public.goal_advice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  step_key text NOT NULL,
  advice text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, week_start)
);

GRANT SELECT ON public.goal_advice TO authenticated;
GRANT ALL ON public.goal_advice TO service_role;

ALTER TABLE public.goal_advice ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read advice for goals I can read" ON public.goal_advice
FOR SELECT TO authenticated
USING (org_id = my_org() AND can_read_goal(goal_id));