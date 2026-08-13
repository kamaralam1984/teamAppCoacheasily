INSERT INTO public.recognitions (org_id, from_id, to_id, kind, text)
SELECT p.org_id, p.id, p.id, 'welcome',
  p.full_name
  || ' joined CoachEasily as ' || coalesce(p.title, 'a warrior')
  || coalesce(' in ' || nullif(p.department, p.title), '')
  || coalesce(', reporting to ' || (SELECT m.full_name FROM public.profiles m WHERE m.id = p.manager_id), '')
  || '. '
  || coalesce('Fun fact: ' || p.fun_fact, '')
FROM public.profiles p
WHERE p.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.recognitions r
    WHERE r.to_id = p.id AND r.kind = 'welcome'
  );