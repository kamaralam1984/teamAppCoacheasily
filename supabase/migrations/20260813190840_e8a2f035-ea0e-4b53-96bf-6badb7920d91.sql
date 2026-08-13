ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

UPDATE public.profiles SET sort_order = v.so
FROM (VALUES
  ('Shubhangi Swaraj',10),('Kirti',20),('Prachi',30),('Saurabh Kumar',40),
  ('Kamar Alam',50),('Milan',60),('Mahadev',70),('Vitesh Kotian',80),
  ('Supriya',10),('Pranjal',10),('Sapana',20),
  ('Rajat Shudhakar Durai',10),('Simran',20),
  ('Nilesh',10),('Sushma Surve',20),('Sarika',30),('Sheetal',40)
) AS v(name, so)
WHERE public.profiles.full_name = v.name;