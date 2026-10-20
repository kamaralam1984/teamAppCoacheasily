-- ═══ A HAND-SET ORDER FOR THE TEAM LIST ═══
-- The team list on the Culture page follows a rule (founder, People & Culture, then by post). When HR or an admin
-- arranges the list by hand, each person's place is kept here. Empty means "no place chosen: use the rule", so
-- somebody who joins later lands after everybody who has been placed. It is separate from sort_order, which
-- orders the organisation chart.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_order integer;
