
REVOKE EXECUTE ON FUNCTION public.leave_balances(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.leave_check(text, date, date, boolean, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.leave_sandwich_conflict(uuid, date, date, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.leave_approver_for(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.leave_remind_approvers() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.leave_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_check(text, date, date, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_sandwich_conflict(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_approver_for(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_remind_approvers() TO service_role;
