-- 1.1 Ensure RLS and policies on events
alter table if exists public.events enable row level security;

drop policy if exists "events: owner read" on public.events;
create policy "events: owner read"
  on public.events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "events: owner insert" on public.events;
create policy "events: owner insert"
  on public.events for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "events: public read" on public.events;
create policy "events: public read"
  on public.events for select
  to authenticated
  using (is_public = true);

-- 1.2 Keyset paginated public feed with profile joins
drop function if exists public.get_public_feed(int, timestamptz);

create or replace function public.get_public_feed(
  p_limit int default 20,
  p_before timestamptz default now()
) returns table (
  id uuid,
  created_at timestamptz,
  type text,
  message text,
  meta jsonb,
  user_id uuid,
  author_name text,
  author_handle text,
  author_avatar text
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.created_at,
    e.type,
    e.message,
    e.meta,
    e.user_id,
    coalesce(p.display_name, '@' || p.handle, 'Someone') as author_name,
    p.handle as author_handle,
    p.avatar_url as author_avatar
  from public.events e
  left join public.profiles p on p.id = e.user_id
  where e.is_public = true
    and e.created_at < coalesce(p_before, now())
  order by e.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

grant execute on function public.get_public_feed(int, timestamptz) to authenticated;
