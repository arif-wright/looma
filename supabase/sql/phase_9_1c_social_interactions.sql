-- Tables
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('praise','energy')),
  created_at timestamptz not null default now(),
  unique (user_id, event_id, kind)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists reactions_event_idx on public.reactions(event_id, kind);
create index if not exists reactions_user_event_idx on public.reactions(user_id, event_id);
create index if not exists comments_event_idx on public.comments(event_id, created_at desc);

-- RLS
alter table public.reactions enable row level security;
alter table public.comments  enable row level security;

-- Reactions policies
drop policy if exists "reactions: read public or own" on public.reactions;
create policy "reactions: read public or own"
  on public.reactions for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = reactions.event_id
        and (e.is_public = true or e.user_id = auth.uid())
    )
  );

drop policy if exists "reactions: insert self" on public.reactions;
create policy "reactions: insert self"
  on public.reactions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "reactions: delete own" on public.reactions;
create policy "reactions: delete own"
  on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- Comments policies
drop policy if exists "comments: read public or own" on public.comments;
create policy "comments: read public or own"
  on public.comments for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = comments.event_id
        and (e.is_public = true or e.user_id = auth.uid())
    )
  );

drop policy if exists "comments: insert self" on public.comments;
create policy "comments: insert self"
  on public.comments for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "comments: delete own" on public.comments;
create policy "comments: delete own"
  on public.comments for delete to authenticated
  using (user_id = auth.uid());

-- Keyset feed RPC with aggregates
drop function if exists public.get_public_feed(int, timestamptz);

create or replace function public.get_public_feed(
  p_limit int default 10,
  p_before timestamptz default now()
)
returns table(
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
language sql
security definer
set search_path = public
as $$
  with base as (
    select e.id, e.created_at, e.type, e.message, e.meta, e.user_id,
           p.display_name, p.handle, p.avatar_url
    from public.events e
    left join public.profiles p on p.id = e.user_id
    where e.is_public = true
      and e.created_at <= coalesce(p_before, now())
    order by e.created_at desc
    limit greatest(1, coalesce(p_limit, 10))
  ),
  rx as (
    select r.event_id,
           count(*) filter (where r.kind = 'praise') as praise_count,
           count(*) filter (where r.kind = 'energy') as energy_count,
           bool_or(r.kind = 'praise' and r.user_id = auth.uid()) as i_praised,
           bool_or(r.kind = 'energy' and r.user_id = auth.uid()) as i_energized
    from public.reactions r
    join base b on b.id = r.event_id
    group by r.event_id
  ),
  cx as (
    select c.event_id, count(*) as comment_count
    from public.comments c
    join base b on b.id = c.event_id
    group by c.event_id
  )
  select b.id, b.created_at, b.type, b.message, b.meta, b.user_id,
         b.display_name, b.handle, b.avatar_url,
         coalesce(rx.praise_count, 0) as praise_count,
         coalesce(rx.energy_count, 0) as energy_count,
         coalesce(cx.comment_count, 0) as comment_count,
         coalesce(rx.i_praised, false) as i_praised,
         coalesce(rx.i_energized, false) as i_energized
  from base b
  left join rx on rx.event_id = b.id
  left join cx on cx.event_id = b.id
  order by b.created_at desc;
$$;

grant execute on function public.get_public_feed(int, timestamptz) to authenticated;
