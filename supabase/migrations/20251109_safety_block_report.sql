-- Phase 12.9 safety primitives: blocks, reports, guards
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

create policy "select own blocks"
on public.blocks for select to authenticated
using (auth.uid() = blocker_id);

create policy "insert own blocks"
on public.blocks for insert to authenticated
with check (auth.uid() = blocker_id);

create policy "delete own blocks"
on public.blocks for delete to authenticated
using (auth.uid() = blocker_id);

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.blocked_peers(viewer uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public, auth
as $$
  select case when blocker_id = viewer then blocked_id else blocker_id end as user_id
  from public.blocks
  where blocker_id = viewer or blocked_id = viewer;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'report_target'
      and n.nspname = 'public'
  ) then
    create type public.report_target as enum ('profile','post','comment');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'report_reason'
      and n.nspname = 'public'
  ) then
    create type public.report_reason as enum ('harassment','hate','spam','nudity','violence','self-harm','other');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'report_status'
      and n.nspname = 'public'
  ) then
    create type public.report_status as enum ('open','reviewing','actioned','dismissed');
  end if;
end;
$$;

create table if not exists public.reports (
  id bigserial primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_kind public.report_target not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  reviewer_id uuid
);

alter table public.reports enable row level security;

create policy "insert own reports"
on public.reports for insert to authenticated
with check (auth.uid() = reporter_id);

create policy "select own reports"
on public.reports for select to authenticated
using (auth.uid() = reporter_id);

create or replace function public.prevent_follow_if_blocked()
returns trigger
language plpgsql
as $$
begin
  if public.is_blocked(new.follower_id, new.followee_id) then
    raise exception 'cannot follow: either user has blocked the other';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_follow_if_blocked on public.follows;
create trigger trg_prevent_follow_if_blocked
  before insert on public.follows
  for each row execute procedure public.prevent_follow_if_blocked();

create or replace function public.prevent_request_if_blocked()
returns trigger
language plpgsql
as $$
begin
  if public.is_blocked(new.requester_id, new.target_id) then
    raise exception 'cannot request follow: either user has blocked the other';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_request_if_blocked on public.follow_requests;
create trigger trg_prevent_request_if_blocked
  before insert on public.follow_requests
  for each row execute procedure public.prevent_request_if_blocked();
