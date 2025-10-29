-- Phase 9.5 — Notifications + Safety Baseline

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('reaction', 'comment', 'share')),
  target_id uuid not null,
  target_kind text not null check (target_kind in ('post', 'comment')),
  created_at timestamptz not null default now(),
  read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  using (auth.uid() = user_id);

drop policy if exists notifications_insert_actor on public.notifications;
create policy notifications_insert_actor
  on public.notifications
  for insert
  with check (auth.uid() = actor_id);

drop policy if exists notifications_update_read on public.notifications;
create policy notifications_update_read
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists notifications_delete_none on public.notifications;
create policy notifications_delete_none
  on public.notifications
  for delete
  using (false);

-- RPC to retrieve notifications for the authenticated user (default limit 20)
drop function if exists public.get_notifications_for_user(uuid, int);
drop function if exists public.get_notifications_for_user(uuid);

create or replace function public.get_notifications_for_user(p_user uuid, p_limit int default 20)
returns table (
  id uuid,
  user_id uuid,
  actor_id uuid,
  kind text,
  target_id uuid,
  target_kind text,
  created_at timestamptz,
  read boolean,
  metadata jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    n.id,
    n.user_id,
    n.actor_id,
    n.kind,
    n.target_id,
    n.target_kind,
    n.created_at,
    n.read,
    n.metadata
  from public.notifications n
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

revoke all on function public.get_notifications_for_user(uuid, int) from public;
grant execute on function public.get_notifications_for_user(uuid, int) to authenticated;
