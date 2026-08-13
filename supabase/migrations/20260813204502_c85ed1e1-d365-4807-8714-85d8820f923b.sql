CREATE OR REPLACE FUNCTION public.profiles_protect_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.title IS DISTINCT FROM OLD.title
      OR NEW.department IS DISTINCT FROM OLD.department
      OR NEW.manager_id IS DISTINCT FROM OLD.manager_id)
     AND auth.uid() IS NULL
     AND coalesce(current_setting('app.allow_profile_admin', true), 'off') <> 'on'
  THEN
    RAISE EXCEPTION 'Title, department and reporting line can only be changed by a signed-in People & Culture or Admin person.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_protect_identity_trg ON public.profiles;
CREATE TRIGGER profiles_protect_identity_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_identity();