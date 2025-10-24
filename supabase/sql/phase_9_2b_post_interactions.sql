-- Phase 9.2B — Post interactions (likes + comments with realtime support)

-- === Reactions table upgrades =================================================

-- Ensure target_kind/target_id columns exist for polymorphic targets.
alter table if exists public.reactions
  add column if not exists target_kind text;

alter table if exists public.reactions
  add column if not exists target_id uuid;

-- Allow existing rows to default to event targets.
update public.reactions
   set target_kind = 'event'
 where target_kind is null;

update public.reactions
   set target_id = coalesce(target_id, event_id)
 where target_id is null;

-- Relax legacy event_id requirement so post reactions can store NULL.
alter table if exists public.reactions
  alter column event_id drop not null;

-- Ensure defaults + constraints.
alter table if exists public.reactions
  alter column target_kind set default 'event';

alter table if exists public.reactions
  alter column target_kind set not null;

alter table if exists public.reactions
  alter column target_id set not null;

-- Extend reaction kind check to cover post likes while keeping legacy kinds.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'reactions_kind_check'
      and conrelid = 'public.reactions'::regclass
  ) then
    alter table public.reactions
      drop constraint reactions_kind_check;
  end if;
  begin
    alter table public.reactions
      add constraint reactions_kind_check
      check (kind in ('like', 'praise', 'energy', 'support'));
  exception
    when duplicate_object then null;
  end;
end$$;

-- Target kind constraint (event vs post).
do $$
begin
  begin
    alter table public.reactions
      add constraint reactions_target_kind_check
      check (target_kind in ('event', 'post'));
  exception
    when duplicate_object then null;
  end;
end$$;

-- Ensure created_at column exists (older seeds may omit).
alter table if exists public.reactions
  add column if not exists created_at timestamptz not null default now();

-- Helpful indexes for feed/cursor queries.
create index if not exists reactions_target_idx
  on public.reactions (target_kind, target_id);

create index if not exists reactions_user_kind_idx
  on public.reactions (user_id, kind);

-- Maintain legacy uniqueness (per kind) while restricting posts to one like.
do $$
begin
  begin
    alter table public.reactions
      add constraint reactions_user_target_kind_unique
      unique (user_id, target_kind, target_id, kind);
  exception
    when duplicate_object then null;
  end;
end$$;

create unique index if not exists reactions_post_unique
  on public.reactions (user_id, target_id)
  where target_kind = 'post';

-- === Comments table upgrades ==================================================

alter table if exists public.comments
  add column if not exists target_kind text;

alter table if exists public.comments
  add column if not exists target_id uuid;

update public.comments
   set target_kind = 'event'
 where target_kind is null;

update public.comments
   set target_id = coalesce(target_id, event_id)
 where target_id is null;

alter table if exists public.comments
  alter column event_id drop not null;

alter table if exists public.comments
  alter column target_kind set default 'event';

alter table if exists public.comments
  alter column target_kind set not null;

alter table if exists public.comments
  alter column target_id set not null;

do $$
begin
  begin
    alter table public.comments
      add constraint comments_target_kind_check
      check (target_kind in ('post', 'event'));
  exception
    when duplicate_object then null;
  end;
end$$;

create index if not exists comments_target_idx
  on public.comments (target_kind, target_id, created_at desc);

-- === Data migration from legacy post_* tables =================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'post_reactions') then
    insert into public.reactions (user_id, target_kind, target_id, kind, created_at)
    select r.user_id, 'post', r.post_id, r.kind::text, r.created_at
    from public.post_reactions r
    on conflict (user_id, target_kind, target_id, kind) do nothing;
  end if;
end$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'post_comments') then
    insert into public.comments (id, user_id, target_kind, target_id, body, created_at)
    select c.id, c.user_id, 'post', c.post_id, c.body, c.created_at
    from public.post_comments c
    on conflict (id) do nothing;
  end if;
end$$;

-- === RLS adjustments to account for polymorphic targets ======================

alter table if exists public.reactions enable row level security;
alter table if exists public.comments  enable row level security;

drop policy if exists "reactions: read public or own" on public.reactions;
create policy "reactions: visibility"
on public.reactions for select
  using (
    (target_kind = 'post' and exists (
      select 1
      from public.posts p
      where p.id = public.reactions.target_id
        and (p.is_public = true or p.user_id = auth.uid())
    ))
    or
    (target_kind = 'event' and (
      public.reactions.user_id = auth.uid()
      or exists (
        select 1
        from public.events e
        where e.id = public.reactions.target_id
          and (e.is_public = true or e.user_id = auth.uid())
      )
    ))
    or public.reactions.user_id = auth.uid()
  );

drop policy if exists "reactions: insert self" on public.reactions;
create policy "reactions: insert self"
on public.reactions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "reactions: delete own" on public.reactions;
create policy "reactions: delete own"
on public.reactions for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "comments: read public or own" on public.comments;
create policy "comments: visibility"
on public.comments for select
  using (
    (target_kind = 'post' and exists (
      select 1 from public.posts p
      where p.id = public.comments.target_id
        and (p.is_public = true or p.user_id = auth.uid())
    ))
    or
    (target_kind = 'event' and (
      public.comments.user_id = auth.uid()
      or exists (
        select 1
        from public.events e
        where e.id = public.comments.target_id
          and (e.is_public = true or e.user_id = auth.uid())
      )
    ))
    or public.comments.user_id = auth.uid()
  );

drop policy if exists "comments: insert self" on public.comments;
create policy "comments: insert self"
on public.comments for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "comments: delete own" on public.comments;
create policy "comments: delete own"
on public.comments for delete to authenticated
  using (user_id = auth.uid());

-- === Helper RPCs for post interactions =======================================

drop function if exists public.get_post_reaction_counts(uuid);
create or replace function public.get_post_reaction_counts(p_post_id uuid)
returns table(likes int)
language sql
security definer
set search_path = public
as $$
  select count(*)::int as likes
  from public.reactions r
  where r.target_kind = 'post'
    and r.target_id = p_post_id
    and r.kind = 'like';
$$;

drop function if exists public.get_post_comments(uuid, int, timestamptz);
create or replace function public.get_post_comments(
  p_post_id uuid,
  p_limit int default 20,
  p_before timestamptz default now()
)
returns table(
  id uuid,
  user_id uuid,
  body text,
  created_at timestamptz,
  display_name text,
  handle text,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.user_id,
    c.body,
    c.created_at,
    prof.display_name,
    prof.handle,
    prof.avatar_url
  from public.comments c
  left join public.profiles prof on prof.id = c.user_id
  where c.target_kind = 'post'
    and c.target_id = p_post_id
    and c.created_at <= coalesce(p_before, now())
  order by c.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

drop function if exists public.has_user_liked_post(uuid, uuid);
create or replace function public.has_user_liked_post(p_post_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reactions r
    where r.target_kind = 'post'
      and r.target_id = p_post_id
      and r.user_id = p_user
      and r.kind = 'like'
  );
$$;

grant execute on function public.get_post_reaction_counts(uuid) to anon, authenticated;
grant execute on function public.get_post_comments(uuid, int, timestamptz) to anon, authenticated;
grant execute on function public.has_user_liked_post(uuid, uuid) to authenticated;

-- === Cleanup legacy tables now that data lives in polymorphic ones ===========

drop table if exists public.post_reactions cascade;
drop table if exists public.post_comments cascade;
