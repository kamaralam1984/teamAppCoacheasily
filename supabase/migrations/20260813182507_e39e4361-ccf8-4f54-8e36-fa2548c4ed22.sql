
CREATE TABLE public.organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  title text,
  department text,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','manager','hr','admin')),
  weekly_off text,
  joined_on date,
  birthday text,
  wedding_anniversary text,
  fun_fact text,
  responsibilities text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','exited')),
  new_badge text NOT NULL DEFAULT 'auto' CHECK (new_badge IN ('auto','on','off')),
  opening_earned_leave int NOT NULL DEFAULT 0,
  avatar_url text,
  exited_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_org ON public.profiles(org_id);
CREATE INDEX idx_profiles_manager ON public.profiles(manager_id);
CREATE INDEX idx_notifications_profile ON public.notifications(profile_id);

GRANT SELECT ON public.organisations TO authenticated;
GRANT ALL ON public.organisations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE OR REPLACE FUNCTION public.my_profile_id() RETURNS uuid
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.my_role() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.my_org() RETURNS uuid
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT org_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.manages(target_id uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  WITH RECURSIVE line AS (
    SELECT id FROM profiles WHERE id = my_profile_id()
    UNION ALL
    SELECT p.id FROM profiles p JOIN line l ON p.manager_id = l.id
  ) SELECT EXISTS(SELECT 1 FROM line WHERE id = target_id) $$;

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own organisation" ON public.organisations
  FOR SELECT TO authenticated USING (id = public.my_org());

CREATE POLICY "read org directory" ON public.profiles
  FOR SELECT TO authenticated USING (org_id = public.my_org());

CREATE POLICY "update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = public.my_profile_id())
  WITH CHECK (id = public.my_profile_id());

CREATE POLICY "hr admin insert profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.my_role() IN ('hr','admin') AND org_id = public.my_org());

CREATE POLICY "hr admin update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.my_role() IN ('hr','admin') AND org_id = public.my_org())
  WITH CHECK (public.my_role() IN ('hr','admin') AND org_id = public.my_org());

CREATE POLICY "hr admin delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.my_role() IN ('hr','admin') AND org_id = public.my_org());

CREATE POLICY "read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (profile_id = public.my_profile_id());

CREATE POLICY "update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (profile_id = public.my_profile_id())
  WITH CHECK (profile_id = public.my_profile_id());

CREATE POLICY "hr admin insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.my_role() IN ('hr','admin') AND org_id = public.my_org());

INSERT INTO public.organisations (id, name, settings)
VALUES ('11111111-1111-4111-8111-111111111111', 'CoachEasily', '{}'::jsonb);

INSERT INTO public.profiles (id, org_id, full_name, title, department, role, status)
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        'Purushottam Hambarde', 'Founder & CEO', 'Leadership', 'admin', 'active');
