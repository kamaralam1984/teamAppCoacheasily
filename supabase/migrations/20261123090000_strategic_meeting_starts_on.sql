-- Strategic meetings: HR / admin / developers can set the day a meeting's goals start.
-- Empty (the default for every existing meeting) keeps today's rule: the day after the previous
-- meeting, or 45 days before. Additive only: no rows or columns are changed or removed.
ALTER TABLE public.strategic_meetings ADD COLUMN IF NOT EXISTS starts_on date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'strategic_meetings_starts_on_before_meeting'
  ) THEN
    ALTER TABLE public.strategic_meetings
      ADD CONSTRAINT strategic_meetings_starts_on_before_meeting
      CHECK (starts_on IS NULL OR starts_on <= meeting_date);
  END IF;
END $$;
