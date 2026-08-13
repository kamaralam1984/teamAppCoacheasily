
-- Roster reconciliation ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_roster()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := my_org();
  v_root uuid;
  v_fixed text[] := '{}';
  r record;
BEGIN
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('fixed', '[]'::jsonb, 'count', 0);
  END IF;

  -- nobody may be their own manager
  FOR r IN
    SELECT id, full_name FROM profiles WHERE org_id = v_org AND manager_id = id
  LOOP
    UPDATE profiles SET manager_id = NULL WHERE id = r.id;
    v_fixed := v_fixed || (r.full_name || ' (self-manager cleared)');
  END LOOP;

  -- pick a root: an active admin/hr with no manager, else any active admin
  SELECT id INTO v_root FROM profiles
   WHERE org_id = v_org AND status = 'active' AND manager_id IS NULL
     AND role IN ('admin','hr')
   ORDER BY created_at LIMIT 1;

  IF v_root IS NULL THEN
    SELECT id INTO v_root FROM profiles
     WHERE org_id = v_org AND status = 'active' AND role IN ('admin','hr')
     ORDER BY created_at LIMIT 1;
    IF v_root IS NOT NULL THEN
      UPDATE profiles SET manager_id = NULL WHERE id = v_root;
      v_fixed := v_fixed || ((SELECT full_name FROM profiles WHERE id = v_root) || ' promoted to top of chart');
    END IF;
  END IF;

  -- re-parent anyone whose manager is missing, exited, or not a manager/hr/admin
  IF v_root IS NOT NULL THEN
    FOR r IN
      SELECT p.id, p.full_name
        FROM profiles p
        LEFT JOIN profiles m ON m.id = p.manager_id
       WHERE p.org_id = v_org
         AND p.status = 'active'
         AND p.manager_id IS NOT NULL
         AND p.id <> v_root
         AND (m.id IS NULL OR m.status <> 'active' OR m.role NOT IN ('manager','hr','admin'))
    LOOP
      UPDATE profiles SET manager_id = v_root WHERE id = r.id;
      v_fixed := v_fixed || r.full_name;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'fixed', to_jsonb(v_fixed),
    'count', coalesce(array_length(v_fixed, 1), 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_roster() TO authenticated, service_role;

-- Seed the real team ---------------------------------------------------------
UPDATE public.profiles
   SET full_name = 'Purushottam Hambarde',
       title = 'Founder & CEO',
       department = 'Leadership',
       role = 'admin',
       weekly_off = 'Sunday',
       manager_id = NULL,
       status = 'active'
 WHERE id = '22222222-2222-4222-8222-222222222222';

INSERT INTO public.profiles (id, org_id, full_name, title, department, manager_id, role, weekly_off, status)
VALUES
 ('33333333-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Shubhangi Swaraj','People & Culture (HR)','People & Culture','22222222-2222-4222-8222-222222222222','hr','Sunday','active'),
 ('33333333-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Supriya','HR Executive','People & Culture','33333333-0000-4000-8000-000000000001','member','Sunday','active'),
 ('33333333-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Kirti','Accountability Coaches Manager','Coaching','22222222-2222-4222-8222-222222222222','manager','Sunday','active'),
 ('33333333-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','Pranjal','Accountability Coach — MCA (English)','Coaching','33333333-0000-4000-8000-000000000003','member','Sunday','active'),
 ('33333333-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','Sapana','Accountability Coach — MCA (Marathi)','Coaching','33333333-0000-4000-8000-000000000003','member','Sunday','active'),
 ('33333333-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','Prachi','Community People Manager','Community','22222222-2222-4222-8222-222222222222','manager','Sunday','active'),
 ('33333333-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','Rajat Shudhakar Durai','Customer Experience Manager','Customer Experience','33333333-0000-4000-8000-000000000006','manager','Sunday','active'),
 ('33333333-0000-4000-8000-000000000008','11111111-1111-4111-8111-111111111111','Simran','Customer Experience Executive','Customer Experience','33333333-0000-4000-8000-000000000006','member','Sunday','active'),
 ('33333333-0000-4000-8000-000000000009','11111111-1111-4111-8111-111111111111','Saurabh Kumar','Manager — Sales','Sales','22222222-2222-4222-8222-222222222222','manager','Saturday','active'),
 ('33333333-0000-4000-8000-000000000010','11111111-1111-4111-8111-111111111111','Nilesh','Sales Executive + English Workshop Host','Sales','33333333-0000-4000-8000-000000000009','member','Sunday','active'),
 ('33333333-0000-4000-8000-000000000011','11111111-1111-4111-8111-111111111111','Sushma Surve','Sales Executive','Sales','33333333-0000-4000-8000-000000000009','member','Sunday','active'),
 ('33333333-0000-4000-8000-000000000012','11111111-1111-4111-8111-111111111111','Sarika','Tele-caller (part-time)','Tele-calling','33333333-0000-4000-8000-000000000009','member','Sunday','active'),
 ('33333333-0000-4000-8000-000000000013','11111111-1111-4111-8111-111111111111','Sheetal','Tele-caller','Tele-calling','33333333-0000-4000-8000-000000000009','member','Sunday','active'),
 ('33333333-0000-4000-8000-000000000014','11111111-1111-4111-8111-111111111111','Kamar Alam','Technology','Technology','22222222-2222-4222-8222-222222222222','member','Sunday','active'),
 ('33333333-0000-4000-8000-000000000015','11111111-1111-4111-8111-111111111111','Milan','Video Content Head','Content','22222222-2222-4222-8222-222222222222','member','Based on work','active'),
 ('33333333-0000-4000-8000-000000000016','11111111-1111-4111-8111-111111111111','Mahadev','Private Coach — MCA','Coaching','22222222-2222-4222-8222-222222222222','member','Based on work','active'),
 ('33333333-0000-4000-8000-000000000017','11111111-1111-4111-8111-111111111111','Vitesh Kotian','Private Coach — MCA','Coaching','22222222-2222-4222-8222-222222222222','member','Based on work','active')
ON CONFLICT (id) DO NOTHING;
