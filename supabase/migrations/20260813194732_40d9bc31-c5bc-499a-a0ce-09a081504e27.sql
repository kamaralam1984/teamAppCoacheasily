
CREATE OR REPLACE FUNCTION public.calendar_leave(p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', lr.id,
    'profile_id', lr.profile_id,
    'full_name', p.full_name,
    'type', lr.type,
    'from_date', lr.from_date,
    'to_date', lr.to_date,
    'half_day', lr.half_day
  ) ORDER BY lr.from_date, p.full_name), '[]'::jsonb)
  FROM leave_requests lr
  JOIN profiles p ON p.id = lr.profile_id
  WHERE lr.org_id = my_org()
    AND lr.status = 'approved'
    AND lr.from_date <= p_to
    AND lr.to_date >= p_from;
$$;
