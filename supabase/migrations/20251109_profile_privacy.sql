-- Phase 12.8a — Privacy foundations

-- Extend profiles with privacy/visibility flags
alter table if exists public.profiles
  add column if not exists account_private boolean not null default false,
  add column if not exists show_level boolean not null default true,
  add column if not exists show_shards boolean not null default true,
  add column if not exists show_location boolean not null default true,
  add column if not exists show_achievements boolean not null default true,
  add column if not exists show_feed boolean not null default true;

-- Follow requests table
create table if not exists public.follow_requests (
  requester_id uuid not null references auth.users(id) on delete cascade,
  target_id    uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (requester_id, target_id),
  constraint no_self_request check (requester_id <> target_id)
);

alter table public.follow_requests enable row level security;

-- Policies for follow_requests
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'follow_requests'
      and policyname = 'select own inbound/outbound'
  ) then
    create policy "select own inbound/outbound"
      on public.follow_requests
      for select
      to authenticated
      using (auth.uid() = requester_id or auth.uid() = target_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'follow_requests'
      and policyname = 'insert by requester'
  ) then
    create policy "insert by requester"
      on public.follow_requests
      for insert
      to authenticated
      with check (auth.uid() = requester_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'follow_requests'
      and policyname = 'delete by requester'
  ) then
    create policy "delete by requester"
      on public.follow_requests
      for delete
      to authenticated
      using (auth.uid() = requester_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'follow_requests'
      and policyname = 'delete by target'
  ) then
    create policy "delete by target"
      on public.follow_requests
      for delete
      to authenticated
      using (auth.uid() = target_id);
  end if;
end;
$$;

-- RPC helpers
create or replace function public.request_follow(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  with already as (
    select 1 from public.follows
    where follower_id = auth.uid() and followee_id = target
  )
  insert into public.follow_requests (requester_id, target_id)
  select auth.uid(), target
  where not exists (select 1 from already)
  on conflict do nothing;
$$;

create or replace function public.approve_follow(requester uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.follow_requests
    where requester_id = requester and target_id = auth.uid()
  ) then
    return;
  end if;

  insert into public.follows (follower_id, followee_id)
  values (requester, auth.uid())
  on conflict do nothing;

  delete from public.follow_requests
  where requester_id = requester and target_id = auth.uid();
end;
$$;

create or replace function public.deny_follow(requester uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.follow_requests
  where requester_id = requester and target_id = auth.uid();
$$;
