-- ═══ STRATEGIC MEETING GOALS: MAIN GOALS AND SUB-GOALS ═══
-- A goal can sit under another goal of the same table as its sub-goal (one level only), and be
-- turned back into a main goal, from the Type dropdown beside it. Only the new parent_id column
-- changes; the goal's text, outcome, weekly updates and notes stay as they are.
-- Every existing goal stays a main goal (parent_id NULL). Removing a main goal never removes its
-- sub-goals: they become main goals (ON DELETE SET NULL).
-- Only adds a column, an index and triggers; no row is changed or deleted.

ALTER TABLE public.meeting_goals
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.meeting_goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS meeting_goals_parent_idx ON public.meeting_goals (parent_id);

-- a sub-goal sits under a main goal of the same table (same person, meeting, 45 days / week)
CREATE OR REPLACE FUNCTION public.meeting_goals_parent_check() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  p meeting_goals%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN RAISE EXCEPTION 'A goal cannot be its own sub-goal.'; END IF;
  SELECT * INTO p FROM meeting_goals WHERE id = NEW.parent_id;
  IF NOT FOUND OR p.meeting_id <> NEW.meeting_id OR p.profile_id <> NEW.profile_id
     OR p.scope <> NEW.scope OR p.week_start IS DISTINCT FROM NEW.week_start THEN
    RAISE EXCEPTION 'A sub-goal must sit under a goal in the same table.';
  END IF;
  IF p.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Choose a main goal: a sub-goal cannot have sub-goals of its own.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS meeting_goals_parent_check_trg ON public.meeting_goals;
CREATE TRIGGER meeting_goals_parent_check_trg BEFORE INSERT OR UPDATE OF parent_id
  ON public.meeting_goals FOR EACH ROW EXECUTE FUNCTION public.meeting_goals_parent_check();

-- a main goal that becomes a sub-goal takes its own sub-goals along to its new main goal,
-- so there is only ever one level and nothing is left behind
CREATE OR REPLACE FUNCTION public.meeting_goals_move_children() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND OLD.parent_id IS NULL THEN
    UPDATE meeting_goals SET parent_id = NEW.parent_id WHERE parent_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS meeting_goals_move_children_trg ON public.meeting_goals;
CREATE TRIGGER meeting_goals_move_children_trg AFTER UPDATE OF parent_id
  ON public.meeting_goals FOR EACH ROW EXECUTE FUNCTION public.meeting_goals_move_children();
