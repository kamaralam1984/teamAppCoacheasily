
REVOKE ALL ON FUNCTION public.my_profile_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_org() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_org() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manages(uuid) TO authenticated, service_role;
