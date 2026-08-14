ALTER TABLE public.themes DROP CONSTRAINT IF EXISTS themes_particles_check;
ALTER TABLE public.themes ADD CONSTRAINT themes_particles_check
  CHECK (particles IN ('none','embers','colour','sparkle','diya','tricolour','petals','marigold','grain','sparks'));