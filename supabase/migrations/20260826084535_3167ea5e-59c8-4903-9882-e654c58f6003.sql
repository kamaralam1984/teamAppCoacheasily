-- 1. Announce a release to every active warrior with a login, exactly once.
CREATE TABLE IF NOT EXISTS public.release_announced (
  release_id uuid PRIMARY KEY REFERENCES public.releases(id) ON DELETE CASCADE,
  announced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.release_announced TO authenticated;
GRANT ALL ON public.release_announced TO service_role;
ALTER TABLE public.release_announced ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "release_announced_read" ON public.release_announced;
CREATE POLICY "release_announced_read" ON public.release_announced
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.release_announce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.published IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.published IS TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.release_announced (release_id) VALUES (NEW.id)
  ON CONFLICT (release_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (org_id, profile_id, title, body, link)
  SELECT NEW.org_id, p.id,
         'New in the app: ' || NEW.title,
         NEW.summary,
         '/whats-new'
  FROM public.profiles p
  WHERE p.org_id = NEW.org_id
    AND p.status = 'active'
    AND p.auth_user_id IS NOT NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS releases_announce_trg ON public.releases;
CREATE TRIGGER releases_announce_trg
AFTER INSERT OR UPDATE OF published ON public.releases
FOR EACH ROW EXECUTE FUNCTION public.release_announce();

-- 2. Remember that somebody has seen the first-run walkthrough.
CREATE TABLE IF NOT EXISTS public.tour_seen (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tour_seen TO authenticated;
GRANT ALL ON public.tour_seen TO service_role;
ALTER TABLE public.tour_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tour_seen_read_own" ON public.tour_seen;
CREATE POLICY "tour_seen_read_own" ON public.tour_seen
  FOR SELECT TO authenticated USING (profile_id = public.my_profile_id());

DROP POLICY IF EXISTS "tour_seen_write_own" ON public.tour_seen;
CREATE POLICY "tour_seen_write_own" ON public.tour_seen
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.my_profile_id() AND org_id = public.my_org());

DROP POLICY IF EXISTS "tour_seen_update_own" ON public.tour_seen;
CREATE POLICY "tour_seen_update_own" ON public.tour_seen
  FOR UPDATE TO authenticated
  USING (profile_id = public.my_profile_id())
  WITH CHECK (profile_id = public.my_profile_id());