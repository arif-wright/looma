-- Public profile lookup by handle
DROP FUNCTION IF EXISTS public.get_profile_by_handle(text);
CREATE OR REPLACE FUNCTION public.get_profile_by_handle(p_handle text)
RETURNS TABLE (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  level int,
  xp int,
  xp_next int,
  bonded_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bc AS (
    SELECT owner_id, COUNT(*)::bigint AS bonded_count
    FROM public.creatures
    WHERE bonded = true
    GROUP BY owner_id
  )
  SELECT
    p.id,
    p.handle,
    p.display_name,
    p.avatar_url,
    p.level,
    p.xp,
    p.xp_next,
    COALESCE(bc.bonded_count, 0) AS bonded_count
  FROM public.profiles p
  LEFT JOIN bc ON bc.owner_id = p.id
  WHERE p.handle = p_handle
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_by_handle(text) TO anon, authenticated;

-- Public feed for a user
DROP FUNCTION IF EXISTS public.get_user_public_feed(uuid, int, timestamptz);
CREATE OR REPLACE FUNCTION public.get_user_public_feed(
  p_user uuid,
  p_limit int DEFAULT 10,
  p_before timestamptz DEFAULT now()
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  type text,
  message text,
  meta jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.created_at, e.type, e.message, e.meta
  FROM public.events e
  WHERE e.user_id = p_user
    AND e.is_public = true
    AND e.created_at <= COALESCE(p_before, now())
  ORDER BY e.created_at DESC
  LIMIT GREATEST(1, COALESCE(p_limit, 10));
$$;

GRANT EXECUTE ON FUNCTION public.get_user_public_feed(uuid, int, timestamptz) TO anon, authenticated;
