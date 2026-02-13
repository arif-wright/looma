create table if not exists public.circle_events (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  is_recurring boolean not null default false,
  rrule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_events_ends_after_start check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.event_rsvps (
  event_id uuid not null references public.circle_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'interested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint event_rsvps_status_check check (status in ('going', 'interested', 'not_going'))
);

alter table if exists public.notifications
  add column if not exists type text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists read_at timestamptz;

alter table if exists public.notifications
  drop constraint if exists notifications_kind_check;

alter table if exists public.notifications
  add constraint notifications_kind_check
  check (kind in ('reaction', 'comment', 'share', 'achievement_unlocked', 'companion_nudge', 'event_reminder'));

alter table if exists public.notifications
  drop constraint if exists notifications_target_kind_check;

alter table if exists public.notifications
  add constraint notifications_target_kind_check
  check (target_kind in ('post', 'comment', 'achievement', 'companion', 'event'));

create index if not exists circle_events_circle_starts_idx
  on public.circle_events(circle_id, starts_at);

create index if not exists circle_events_starts_idx
  on public.circle_events(starts_at);

create index if not exists event_rsvps_user_event_idx
  on public.event_rsvps(user_id, event_id);

create index if not exists notifications_user_created_idx_v2
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_read_at_idx
  on public.notifications(user_id, read_at);

create or replace function public.set_circle_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_circle_events_set_updated_at on public.circle_events;
create trigger trg_circle_events_set_updated_at
  before update on public.circle_events
  for each row
  execute procedure public.set_circle_events_updated_at();

create or replace function public.set_event_rsvps_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_event_rsvps_set_updated_at on public.event_rsvps;
create trigger trg_event_rsvps_set_updated_at
  before update on public.event_rsvps
  for each row
  execute procedure public.set_event_rsvps_updated_at();

alter table public.circle_events enable row level security;
alter table public.event_rsvps enable row level security;

drop policy if exists circle_events_member_select on public.circle_events;
create policy circle_events_member_select
  on public.circle_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circle_events.circle_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists circle_events_admin_insert on public.circle_events;
create policy circle_events_admin_insert
  on public.circle_events
  for insert
  to authenticated
  with check (
    creator_id = auth.uid()
    and exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circle_events.circle_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

drop policy if exists circle_events_admin_update on public.circle_events;
create policy circle_events_admin_update
  on public.circle_events
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circle_events.circle_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circle_events.circle_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

drop policy if exists circle_events_admin_delete on public.circle_events;
create policy circle_events_admin_delete
  on public.circle_events
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circle_events.circle_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

drop policy if exists event_rsvps_member_select on public.event_rsvps;
create policy event_rsvps_member_select
  on public.event_rsvps
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.circle_events ce
      join public.circle_members cm on cm.circle_id = ce.circle_id
      where ce.id = event_rsvps.event_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists event_rsvps_owner_insert on public.event_rsvps;
create policy event_rsvps_owner_insert
  on public.event_rsvps
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.circle_events ce
      join public.circle_members cm on cm.circle_id = ce.circle_id
      where ce.id = event_rsvps.event_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists event_rsvps_owner_update on public.event_rsvps;
create policy event_rsvps_owner_update
  on public.event_rsvps
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_update_read_at on public.notifications;
create policy notifications_update_read_at
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
