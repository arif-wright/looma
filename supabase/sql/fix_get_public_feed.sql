-- Ensure a single canonical get_public_feed() exists matching the dashboard contract
DROP FUNCTION IF EXISTS public.get_public_feed();
DROP FUNCTION IF EXISTS public.get_public_feed(int);
DROP FUNCTION IF EXISTS public.get_public_feed(int, timestamptz);

CREATE OR REPLACE FUNCTION public.get_public_feed(
  p_limit int DEFAULT 10,
  p_before timestamptz DEFAULT now()
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  type text,
  message text,
  meta jsonb,
  user_id uuid,
  display_name text,
  handle text,
  avatar_url text,
  praise_count int,
  energy_count int,
  comment_count int,
  i_praised boolean,
  i_energized boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT e.id, e.created_at, e.type, e.message, e.meta, e.user_id,
           p.display_name, p.handle, p.avatar_url
    FROM public.events e
    LEFT JOIN public.profiles p ON p.id = e.user_id
    WHERE e.is_public = true
      AND e.created_at <= COALESCE(p_before, now())
    ORDER BY e.created_at DESC
    LIMIT GREATEST(1, COALESCE(p_limit, 10))
  ),
  rx AS (
    SELECT r.event_id,
           COUNT(*) FILTER (WHERE r.kind = 'praise') AS praise_count,
           COUNT(*) FILTER (WHERE r.kind = 'energy') AS energy_count,
           BOOL_OR(r.kind = 'praise' AND r.user_id = auth.uid()) AS i_praised,
           BOOL_OR(r.kind = 'energy' AND r.user_id = auth.uid()) AS i_energized
    FROM public.reactions r
    JOIN base b ON b.id = r.event_id
    GROUP BY r.event_id
  ),
  cx AS (
    SELECT c.event_id, COUNT(*) AS comment_count
    FROM public.comments c
    JOIN base b ON b.id = c.event_id
    GROUP BY c.event_id
  )
  SELECT b.id, b.created_at, b.type, b.message, b.meta, b.user_id,
         b.display_name, b.handle, b.avatar_url,
         COALESCE(rx.praise_count, 0) AS praise_count,
         COALESCE(rx.energy_count, 0) AS energy_count,
         COALESCE(cx.comment_count, 0) AS comment_count,
         COALESCE(rx.i_praised, false) AS i_praised,
         COALESCE(rx.i_energized, false) AS i_energized
  FROM base b
  LEFT JOIN rx ON rx.event_id = b.id
  LEFT JOIN cx ON cx.event_id = b.id
  ORDER BY b.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_feed(int, timestamptz) TO authenticated;
