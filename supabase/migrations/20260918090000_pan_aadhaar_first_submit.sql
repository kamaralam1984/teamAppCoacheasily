-- ═══ PAN AND AADHAAR: THE PERSON SUBMITS ONCE, THEN HR, ADMIN AND DEVELOPERS ═══
-- An older guard, added to the live database by hand and never kept in a migration, stopped
-- everybody except HR and admin from ever writing PAN or Aadhaar — even the first time. So
-- "Submit PAN" on My profile failed with "PAN and Aadhaar details are kept by HR".
-- profile_private_guard_hr_fields (20260916090000) already does the right thing: a person fills
-- each one in once, after that only HR or admin; developers write through the server with the
-- service role. Drop the old guard so only that rule is left.
-- Idempotent.

DROP TRIGGER IF EXISTS profile_private_guard_trg ON public.profile_private;
DROP FUNCTION IF EXISTS public.profile_private_guard();
