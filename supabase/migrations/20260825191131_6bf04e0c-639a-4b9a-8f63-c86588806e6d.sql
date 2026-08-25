ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_org_email_key
  ON public.profiles (org_id, lower(email)) WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_invite(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT full_name INTO v_name
  FROM public.profiles
  WHERE lower(email) = lower(trim(coalesce(p_email, '')))
    AND status = 'active'
    AND auth_user_id IS NULL
  LIMIT 1;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object('expected', false);
  END IF;

  RETURN jsonb_build_object('expected', true, 'first_name', split_part(btrim(v_name), ' ', 1));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_invite(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_claimed_profile()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.profiles
  SET auth_user_id = auth.uid(),
      invited_at = coalesce(invited_at, now())
  WHERE id = (
    SELECT id FROM public.profiles
    WHERE lower(email) = v_email
      AND status = 'active'
      AND auth_user_id IS NULL
    LIMIT 1
  )
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  RETURN jsonb_build_object('ok', true, 'profile_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.link_claimed_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_claimed_profile() TO authenticated;