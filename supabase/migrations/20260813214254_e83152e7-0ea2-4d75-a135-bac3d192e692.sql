CREATE TABLE public.themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '✨',
  greeting text NOT NULL DEFAULT '',
  dates text[] NOT NULL DEFAULT '{}',
  patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  particles text NOT NULL DEFAULT 'embers',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

-- Structural guarantee: a theme may only repaint surface + accent tokens.
-- ink, soft, white and mist can never be overridden, so text stays readable.
CREATE OR REPLACE FUNCTION public.theme_patch_is_safe(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(bool_and(k IN (
    'pearl','ivory','night','night2','line','gold','goldL','goldD','saff','saffBtn'
  )), true)
  FROM jsonb_object_keys(COALESCE(p, '{}'::jsonb)) AS k;
$$;

ALTER TABLE public.themes
  ADD CONSTRAINT themes_patch_tokens_only CHECK (public.theme_patch_is_safe(patch)),
  ADD CONSTRAINT themes_particles_check CHECK (particles IN ('embers','colour','sparkle','none'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.themes TO authenticated;
GRANT ALL ON public.themes TO service_role;

ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "themes_read_own_org" ON public.themes
  FOR SELECT TO authenticated USING (org_id = public.my_org());

CREATE POLICY "themes_write_hr_admin" ON public.themes
  FOR ALL TO authenticated
  USING (org_id = public.my_org() AND public.my_role() IN ('hr','admin'))
  WITH CHECK (org_id = public.my_org() AND public.my_role() IN ('hr','admin'));

CREATE TRIGGER themes_touch_updated_at
  BEFORE UPDATE ON public.themes
  FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at();

INSERT INTO public.themes (org_id, key, name, emoji, greeting, dates, patch, particles, sort_order)
SELECT o.id, v.key, v.name, v.emoji, v.greeting, v.dates, v.patch::jsonb, v.particles, v.sort_order
FROM public.organisations o
CROSS JOIN (VALUES
  ('everyday','Everyday','🪔','Show up, mark the day, move one number.', ARRAY[]::text[], '{}', 'embers', 0),
  ('freedom','Freedom','🇮🇳','Jai Hind. Freedom was won by people who refused to quit.', ARRAY['08-15','01-26'],
   '{"pearl":"#FFFAF2","night":"#0B1B3A","night2":"#16294F","line":"#F0E3D2","gold":"#E08A2B","goldL":"#FFB865","goldD":"#8A5210","saff":"#FF9933","saffBtn":"#C2560A"}','colour',1),
  ('diwali','Diwali','🪔','Light a diya, light a goal. May this be your brightest year.', ARRAY['11-08','11-09','11-10'],
   '{"pearl":"#FFF7E9","night":"#2A1206","night2":"#43210C","line":"#F2E2C6","gold":"#D9922A","goldL":"#FFC96B","goldD":"#8A5A08","saff":"#E8641A","saffBtn":"#B34209"}','embers',2),
  ('dussehra','Dussehra','🏹','Good defeats evil. Name the one habit you will defeat this cycle.', ARRAY['10-20','10-21'],
   '{"pearl":"#FFF8EC","night":"#2B1608","night2":"#432411","gold":"#C9942A","goldD":"#8A6207","saffBtn":"#B0450B"}','embers',3),
  ('ganesh','Ganesh','🐘','Ganpati Bappa Morya. Remover of obstacles — name yours today.', ARRAY['09-14','09-15'],
   '{"pearl":"#FFF6EE","night":"#3A1206","night2":"#54200D","gold":"#D18A2A","goldD":"#8A5008","saffBtn":"#B84509"}','embers',4),
  ('holi','Holi','🎨','Play, laugh, reset. Add colour to somebody''s day today.', ARRAY['03-04','03-05'],
   '{"pearl":"#FBF7FF","night":"#241640","night2":"#36225E","gold":"#B5399B","goldL":"#F09ADB","goldD":"#8A2B76","saffBtn":"#AD2A57"}','colour',5),
  ('gudi_padwa','Gudi Padwa','🌾','Nava varsha, nava sankalp. Raise your gudi and your target.', ARRAY['03-19','03-20'],
   '{"pearl":"#FFFCEC","night":"#2A2006","gold":"#C2A22A","goldD":"#7E6A06"}','embers',6),
  ('shiv_jayanti','Shiv Jayanti','⚔️','Jai Shivrai. Swarajya was built by warriors who thought bigger.', ARRAY['02-19'],
   '{"pearl":"#FFF9EA","night":"#171126","gold":"#C9A227","goldD":"#8A6307"}','embers',7),
  ('new_year','New Year','🎆','New page. Same warriors. Bigger numbers.', ARRAY['12-31','01-01'],
   '{"pearl":"#F8F6FF","night":"#17123A","night2":"#282059","gold":"#7C5AD6","goldL":"#BFA6F5","goldD":"#5B3AB0","saffBtn":"#A32B4F"}','sparkle',8)
) AS v(key,name,emoji,greeting,dates,patch,particles,sort_order);