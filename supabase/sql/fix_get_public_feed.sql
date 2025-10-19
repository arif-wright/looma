-- Phase 9.1A cleanup: ensure only one canonical get_public_feed() exists

-- Drop any overloaded versions that might still exist
drop function if exists public.get_public_feed();
drop function if exists public.get_public_feed(int);
drop function if exists public.get_public_feed(int, timestamptz);

-- Recreate a single security-definer RPC that matches the frontend contract
create or replace function public.get_public_feed(
  p_limit int default 20,
  p_before timestamptz default now()
)
returns table (
  id uuid,
  created_at timestamptz,
  type text,
  message text,
  meta jsonb,
  user_id uuid,
  display_name text,
  handle text,
  avatar_url text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id,
    e.created_at,
    e.type,
    e.message,
    e.meta,
    e.user_id,
    p.display_name,
    p.handle,
    p.avatar_url
  from public.events e
  left join public.profiles p on p.id = e.user_id
  where e.is_public = true
    and e.created_at <= coalesce(p_before, now())
  order by e.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;
