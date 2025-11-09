-- Phase 12.6 — Followers & Following graph

-- Legacy compatibility: older builds used "followed_id" that referenced profiles.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'follows'
      and column_name = 'followed_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'follows'
      and column_name = 'followee_id'
  ) then
    execute 'alter table public.follows rename column followed_id to followee_id';
  end if;
end $$;

-- 1) Follow graph table
create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self_follow check (follower_id <> followee_id)
);

alter table if exists public.follows
  add column if not exists followee_id uuid;

-- Ensure foreign keys reference auth.users even if the table predated this migration.
do $$
declare
  follower_constraint text := 'follows_follower_id_fkey';
  followee_constraint text := 'follows_followee_id_fkey';
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'follows'
  ) then
    if exists (
      select 1
      from pg_constraint
      where conname = follower_constraint
        and conrelid = 'public.follows'::regclass
    ) then
      execute format('alter table public.follows drop constraint %I', follower_constraint);
    end if;

    if exists (
      select 1
      from pg_constraint
      where conname = 'follows_followed_id_fkey'
        and conrelid = 'public.follows'::regclass
    ) then
      execute 'alter table public.follows drop constraint follows_followed_id_fkey';
    end if;

    if exists (
      select 1
      from pg_constraint
      where conname = followee_constraint
        and conrelid = 'public.follows'::regclass
    ) then
      execute format('alter table public.follows drop constraint %I', followee_constraint);
    end if;

    execute 'alter table public.follows
      add constraint follows_follower_id_fkey
      foreign key (follower_id)
      references auth.users(id)
      on delete cascade';

    execute 'alter table public.follows
      add constraint follows_followee_id_fkey
      foreign key (followee_id)
      references auth.users(id)
      on delete cascade';
  end if;
end $$;

create index if not exists follows_followee_created_idx on public.follows(followee_id, created_at desc);
create index if not exists follows_follower_created_idx on public.follows(follower_id, created_at desc);

-- 2) Public counts view (safe)
create or replace view public.follow_counts as
select
  u.id as user_id,
  coalesce(f_followers.count, 0)::bigint as followers,
  coalesce(f_following.count, 0)::bigint as following
from auth.users u
left join lateral (
  select count(*) from public.follows f where f.followee_id = u.id
) as f_followers(count) on true
left join lateral (
  select count(*) from public.follows f where f.follower_id = u.id
) as f_following(count) on true;

-- 3) RLS policies
alter table public.follows enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'follows'
      and policyname = 'Select follows is public'
  ) then
    create policy "Select follows is public"
      on public.follows
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'follows'
      and policyname = 'Insert follows by self'
  ) then
    create policy "Insert follows by self"
      on public.follows
      for insert
      to authenticated
      with check (auth.uid() = follower_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'follows'
      and policyname = 'Delete follows by self'
  ) then
    create policy "Delete follows by self"
      on public.follows
      for delete
      to authenticated
      using (auth.uid() = follower_id);
  end if;
end $$;

-- 4) RPC helpers
create or replace function public.follow_user(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.follows (follower_id, followee_id)
  values (auth.uid(), target)
  on conflict do nothing;
$$;

create or replace function public.unfollow_user(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.follows
  where follower_id = auth.uid()
    and followee_id = target;
$$;

-- 5) Optional: notification trigger hook (disabled by default)
-- create or replace function public.notify_follow()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   insert into public.notifications(user_id, kind, payload)
--   values (new.followee_id, 'follow', jsonb_build_object('from', new.follower_id));
--   return new;
-- end;
-- $$;
-- drop trigger if exists trg_notify_follow on public.follows;
-- create trigger trg_notify_follow
--   after insert on public.follows
--   for each row
--   execute procedure public.notify_follow();
