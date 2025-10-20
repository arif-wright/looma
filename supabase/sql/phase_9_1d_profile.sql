-- Get a public profile by handle
drop function if exists public.get_profile_by_handle(text);
create or replace function public.get_profile_by_handle(p_handle text)
returns table (
  id uuid, handle text, display_name text, avatar_url text,
  level int, xp int, xp_next int, bonded_count bigint
) language sql stable security definer set search_path=public as $$
  with bc as (
    select owner_id, count(*)::bigint as bonded_count
    from public.creatures where bonded = true
    group by owner_id
  )
  select p.id, p.handle, p.display_name, p.avatar_url,
         p.level, p.xp, p.xp_next, coalesce(bc.bonded_count,0) as bonded_count
  from public.profiles p
  left join bc on bc.owner_id = p.id
  where p.handle = p_handle
  limit 1;
$$;

grant execute on function public.get_profile_by_handle(text) to anon, authenticated;

-- Recent public activity for a user (for their profile)
drop function if exists public.get_user_public_feed(uuid, int, timestamptz);
create or replace function public.get_user_public_feed(p_user uuid, p_limit int default 10, p_before timestamptz default now())
returns table(id uuid, created_at timestamptz, type text, message text, meta jsonb)
language sql stable security definer set search_path=public as $$
  select e.id, e.created_at, e.type, e.message, e.meta
  from public.events e
  where e.user_id = p_user and e.is_public = true and e.created_at <= p_before
  order by e.created_at desc
  limit greatest(1, coalesce(p_limit,10));
$$;

grant execute on function public.get_user_public_feed(uuid, int, timestamptz) to anon, authenticated;
