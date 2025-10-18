-- 1) Ensure the FK exists so PostgREST can discover relationships
alter table if exists public.user_achievements
  add constraint if not exists user_achievements_achievement_fk
  foreign key (achievement_id) references public.achievements(id);

-- 2) Create an RPC that returns joined achievements for the current user
drop function if exists public.get_my_achievements(int);
create or replace function public.get_my_achievements(p_limit int default 12)
returns table(
  id uuid,
  created_at timestamptz,
  achievement_id uuid,
  key text,
  name text,
  tier text
)
language sql
security definer
set search_path = public
as $$
  select
    ua.id,
    ua.created_at,
    a.id  as achievement_id,
    a.key as key,
    a.name,
    a.tier::text
  from public.user_achievements ua
  join public.achievements a on a.id = ua.achievement_id
  where ua.user_id = auth.uid()
  order by ua.created_at desc
  limit greatest(1, coalesce(p_limit, 12));
$$;

grant execute on function public.get_my_achievements(int) to authenticated;
