-- ═══ MY PROFILE: PEOPLE FILL IN THEIR OWN DETAILS ═══
-- The My profile page lets a person keep their own personal details, PAN and Aadhaar, education
-- and past employment. Until now only HR and admin could write these tables, so saving from that
-- page failed for everybody else.
--   * Anybody may now write their own row in profile_private, profile_education and
--     profile_employment (same org, their own profile_id).
--   * PAN number, PAN document, Aadhaar last 4 and Aadhaar document: a person fills each one in
--     once. After that only HR or admin can change it. HR notes stay HR-only.
--   * A person may upload into their own folder of the hr-documents bucket and open what is in
--     it, but never overwrite or delete a file there.
-- Idempotent throughout.

-- ───────── 1. PERSONAL DETAILS ─────────
DROP POLICY IF EXISTS "write your own" ON public.profile_private;
CREATE POLICY "write your own" ON public.profile_private
  FOR INSERT WITH CHECK (((org_id = my_org()) AND (profile_id = my_profile_id())));
DROP POLICY IF EXISTS "update your own" ON public.profile_private;
CREATE POLICY "update your own" ON public.profile_private
  FOR UPDATE USING (((org_id = my_org()) AND (profile_id = my_profile_id())))
  WITH CHECK (((org_id = my_org()) AND (profile_id = my_profile_id())));

-- Applies only to a person editing their own row without the HR or admin role; HR, admin and
-- the service role are untouched.
CREATE OR REPLACE FUNCTION public.profile_private_guard_hr_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.profile_id IS DISTINCT FROM my_profile_id()
     OR coalesce(my_role(), '') IN ('hr', 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.notes IS NOT NULL THEN
      RAISE EXCEPTION 'HR notes are kept by HR.';
    END IF;
  ELSE
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'HR notes are kept by HR.';
    END IF;
    -- Once filled in, PAN and Aadhaar are HR's to change.
    IF (OLD.pan_number IS NOT NULL AND NEW.pan_number IS DISTINCT FROM OLD.pan_number)
       OR (OLD.pan_doc_path IS NOT NULL AND NEW.pan_doc_path IS DISTINCT FROM OLD.pan_doc_path) THEN
      RAISE EXCEPTION 'Your PAN is already submitted. Ask HR to change it.';
    END IF;
    IF (OLD.aadhaar_last4 IS NOT NULL AND NEW.aadhaar_last4 IS DISTINCT FROM OLD.aadhaar_last4)
       OR (OLD.aadhaar_doc_path IS NOT NULL AND NEW.aadhaar_doc_path IS DISTINCT FROM OLD.aadhaar_doc_path) THEN
      RAISE EXCEPTION 'Your Aadhaar is already submitted. Ask HR to change it.';
    END IF;
  END IF;

  -- A document must be one this person uploaded into their own folder.
  IF (NEW.pan_doc_path IS NOT NULL AND NEW.pan_doc_path NOT LIKE NEW.profile_id::text || '/%')
     OR (NEW.aadhaar_doc_path IS NOT NULL AND NEW.aadhaar_doc_path NOT LIKE NEW.profile_id::text || '/%') THEN
    RAISE EXCEPTION 'That document is not yours.';
  END IF;

  NEW.updated_by := my_profile_id();
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.profile_private_guard_hr_fields() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS profile_private_guard_hr_fields ON public.profile_private;
CREATE TRIGGER profile_private_guard_hr_fields
  BEFORE INSERT OR UPDATE ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION public.profile_private_guard_hr_fields();

-- ───────── 2. PAN AND AADHAAR FILES ─────────
-- Files live at <profile_id>/<kind>-<timestamp>.<ext>. Upload and read your own folder only; no
-- update or delete, so a submitted file cannot be swapped out from under HR.
DROP POLICY IF EXISTS "upload your own hr documents" ON storage.objects;
CREATE POLICY "upload your own hr documents" ON storage.objects
  FOR INSERT WITH CHECK (((bucket_id = 'hr-documents'::text)
    AND ((storage.foldername(name))[1] = (my_profile_id())::text)));
DROP POLICY IF EXISTS "read your own hr documents" ON storage.objects;
CREATE POLICY "read your own hr documents" ON storage.objects
  FOR SELECT USING (((bucket_id = 'hr-documents'::text)
    AND ((storage.foldername(name))[1] = (my_profile_id())::text)));

-- ───────── 3. EDUCATION ─────────
DROP POLICY IF EXISTS "write your own" ON public.profile_education;
CREATE POLICY "write your own" ON public.profile_education
  FOR INSERT WITH CHECK (((org_id = my_org()) AND (profile_id = my_profile_id())));
DROP POLICY IF EXISTS "update your own" ON public.profile_education;
CREATE POLICY "update your own" ON public.profile_education
  FOR UPDATE USING (((org_id = my_org()) AND (profile_id = my_profile_id())))
  WITH CHECK (((org_id = my_org()) AND (profile_id = my_profile_id())));
DROP POLICY IF EXISTS "delete your own" ON public.profile_education;
CREATE POLICY "delete your own" ON public.profile_education
  FOR DELETE USING (((org_id = my_org()) AND (profile_id = my_profile_id())));

-- ───────── 4. PAST EMPLOYMENT ─────────
DROP POLICY IF EXISTS "write your own" ON public.profile_employment;
CREATE POLICY "write your own" ON public.profile_employment
  FOR INSERT WITH CHECK (((org_id = my_org()) AND (profile_id = my_profile_id())));
DROP POLICY IF EXISTS "update your own" ON public.profile_employment;
CREATE POLICY "update your own" ON public.profile_employment
  FOR UPDATE USING (((org_id = my_org()) AND (profile_id = my_profile_id())))
  WITH CHECK (((org_id = my_org()) AND (profile_id = my_profile_id())));
DROP POLICY IF EXISTS "delete your own" ON public.profile_employment;
CREATE POLICY "delete your own" ON public.profile_employment
  FOR DELETE USING (((org_id = my_org()) AND (profile_id = my_profile_id())));
