-- Option A canonical mission sessions refactor.
-- Keeps existing table and upgrades shape/status semantics for server-authoritative flows.

alter table if exists public.mission_sessions
  add column if not exists mission_type text,
  add column if not exists cost_json jsonb,
  add column if not exists rewards_json jsonb,
  add column if not exists idempotency_key text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Backfill canonical JSON columns from existing snapshots.
update public.mission_sessions
set cost_json = coalesce(cost_json, cost, cost_snapshot)
where cost_json is null;

update public.mission_sessions
set rewards_json = coalesce(rewards_json, rewards)
where rewards_json is null;

update public.mission_sessions
set mission_type = coalesce(mission_type, meta ->> 'missionType', 'action')
where mission_type is null;

update public.mission_sessions
set idempotency_key = coalesce(idempotency_key, nullif(meta ->> 'idempotencyKey', ''))
where idempotency_key is null;

-- Normalize statuses to canonical values.
update public.mission_sessions
set status = case
  when status = 'started' then 'active'
  when status = 'cancelled' then 'canceled'
  else status
end
where status in ('started', 'cancelled');

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'mission_sessions_status_check'
  ) then
    alter table public.mission_sessions
      drop constraint mission_sessions_status_check;
  end if;

  alter table public.mission_sessions
    add constraint mission_sessions_status_check
    check (status in ('active', 'completed', 'canceled', 'failed'));
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'mission_sessions_mission_type_check'
  ) then
    alter table public.mission_sessions
      drop constraint mission_sessions_mission_type_check;
  end if;

  alter table public.mission_sessions
    add constraint mission_sessions_mission_type_check
    check (mission_type in ('identity', 'action', 'world'));
end
$$;

create unique index if not exists mission_sessions_idempotency_idx
  on public.mission_sessions(user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists mission_sessions_user_status_idx
  on public.mission_sessions(user_id, status, started_at desc);

create index if not exists mission_sessions_user_mission_idx
  on public.mission_sessions(user_id, mission_id, started_at desc);

-- Optional guard: one active mission session per user/mission.
create unique index if not exists mission_sessions_active_unique_idx
  on public.mission_sessions(user_id, mission_id)
  where status = 'active';

create or replace function public.set_mission_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_mission_sessions_set_updated_at on public.mission_sessions;
create trigger trg_mission_sessions_set_updated_at
  before update on public.mission_sessions
  for each row
  execute function public.set_mission_sessions_updated_at();

alter table public.mission_sessions enable row level security;

drop policy if exists mission_sessions_owner_select on public.mission_sessions;
create policy mission_sessions_owner_select
  on public.mission_sessions
  for select
  using (user_id = auth.uid());

drop policy if exists mission_sessions_owner_insert on public.mission_sessions;
create policy mission_sessions_owner_insert
  on public.mission_sessions
  for insert
  with check (user_id = auth.uid());

drop policy if exists mission_sessions_owner_update on public.mission_sessions;
create policy mission_sessions_owner_update
  on public.mission_sessions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
