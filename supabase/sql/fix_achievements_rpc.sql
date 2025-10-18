-- 1) Ensure the FK exists so PostgREST can discover relationships
alter table if exists public.user_achievements
  add constraint if not exists user_achievements_achievement_fk
  foreign key (achievement_id) references public.achievements(id);

-- 2) Create an RPC that returns joined achievements for the current user
--    Include descriptive fields for the dashboard card
DROP FUNCTION IF EXISTS public.get_my_achievements(int);
CREATE OR REPLACE FUNCTION public.get_my_achievements(p_limit int DEFAULT 12)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  earned_at timestamptz,
  achievement_id uuid,
  key text,
  title text,
  description text,
  tier text,
  points int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ua.id,
    ua.created_at,
    ua.created_at AS earned_at,
    a.id  AS achievement_id,
    a.key,
    COALESCE(a.name, a.key) AS title,
    COALESCE(a.description, '') AS description,
    a.tier::text,
    COALESCE(a.points, 0) AS points
  FROM public.user_achievements ua
  JOIN public.achievements a ON a.id = ua.achievement_id
  WHERE ua.user_id = auth.uid()
  ORDER BY ua.created_at DESC
  LIMIT greatest(1, COALESCE(p_limit, 12));
$$;

grant execute on function public.get_my_achievements(int) to authenticated;
