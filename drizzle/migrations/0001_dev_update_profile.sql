CREATE OR REPLACE FUNCTION public.dev_update_profile(p_id uuid, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_profile_admin', 'on', true);
  UPDATE public.profiles SET
    full_name = CASE WHEN p_patch ? 'full_name' THEN p_patch ->> 'full_name' ELSE full_name END,
    title = CASE WHEN p_patch ? 'title' THEN p_patch ->> 'title' ELSE title END,
    department = CASE WHEN p_patch ? 'department' THEN p_patch ->> 'department' ELSE department END,
    role = CASE WHEN p_patch ? 'role' THEN p_patch ->> 'role' ELSE role END,
    status = CASE WHEN p_patch ? 'status' THEN p_patch ->> 'status' ELSE status END,
    manager_id = CASE WHEN p_patch ? 'manager_id' THEN nullif(p_patch ->> 'manager_id', '')::uuid ELSE manager_id END,
    weekly_off = CASE WHEN p_patch ? 'weekly_off' THEN p_patch ->> 'weekly_off' ELSE weekly_off END,
    exited_on = CASE WHEN p_patch ? 'exited_on' THEN (p_patch ->> 'exited_on')::date ELSE exited_on END
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.dev_update_profile(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dev_update_profile(uuid, jsonb) TO service_role;