ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS screenshot_path text;

DROP POLICY IF EXISTS "idea screenshots insert" ON storage.objects;
CREATE POLICY "idea screenshots insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'idea-screenshots' AND public.my_profile_id() IS NOT NULL);

DROP POLICY IF EXISTS "idea screenshots read" ON storage.objects;
CREATE POLICY "idea screenshots read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'idea-screenshots' AND public.my_profile_id() IS NOT NULL);

DROP FUNCTION IF EXISTS public.submit_idea(text, text, text, boolean, text, text);

CREATE OR REPLACE FUNCTION public.submit_idea(p_kind text, p_title text, p_detail text DEFAULT NULL::text, p_anonymous boolean DEFAULT false, p_screen text DEFAULT NULL::text, p_device text DEFAULT NULL::text, p_screenshot_path text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.my_org();
  v_me uuid := public.my_profile_id();
  v_id uuid;
BEGIN
  IF v_org IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'Not part of an organisation';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Please give it a one-line title';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('broken','confusing','idea','praise') THEN
    RAISE EXCEPTION 'Unknown kind';
  END IF;

  INSERT INTO public.ideas (org_id, profile_id, is_anonymous, kind, title, detail, screen, device, screenshot_path)
  VALUES (
    v_org,
    CASE WHEN coalesce(p_anonymous, false) THEN NULL ELSE v_me END,
    coalesce(p_anonymous, false),
    p_kind,
    btrim(p_title),
    nullif(btrim(coalesce(p_detail, '')), ''),
    nullif(btrim(coalesce(p_screen, '')), ''),
    nullif(btrim(coalesce(p_device, '')), ''),
    nullif(btrim(coalesce(p_screenshot_path, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ideas_board()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.my_org();
  v_me uuid := public.my_profile_id();
  v_rows jsonb;
BEGIN
  IF v_org IS NULL OR v_me IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'votes')::int DESC, (r->>'created_at') DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', i.id,
      'kind', i.kind,
      'title', i.title,
      'detail', i.detail,
      'status', i.status,
      'status_note', i.status_note,
      'screen', i.screen,
      'device', i.device,
      'source', i.source,
      'screenshot_path', i.screenshot_path,
      'created_at', i.created_at,
      'decided_at', i.decided_at,
      'is_anonymous', i.is_anonymous,
      'is_mine', (i.profile_id IS NOT NULL AND i.profile_id = v_me),
      'author', CASE WHEN i.is_anonymous THEN 'Anonymous' ELSE coalesce(pr.full_name, 'Someone') END,
      'votes', (SELECT count(*)::int FROM public.idea_votes v WHERE v.idea_id = i.id),
      'voted', EXISTS (SELECT 1 FROM public.idea_votes v WHERE v.idea_id = i.id AND v.profile_id = v_me)
    ) AS r
    FROM public.ideas i
    LEFT JOIN public.profiles pr ON pr.id = i.profile_id
    WHERE i.org_id = v_org
  ) s;

  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_idea(text, text, text, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_idea(text, text, text, boolean, text, text, text) TO authenticated;