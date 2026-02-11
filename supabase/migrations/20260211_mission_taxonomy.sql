-- Mission taxonomy support: type/cost/cooldown/privacy plus mission session records.

alter table if exists public.missions
  add column if not exists type text not null default 'action',
  add column if not exists cost jsonb,
  add column if not exists cooldown_ms integer,
  add column if not exists privacy_tags text[] not null default '{}'::text[],
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'missions_type_check'
  ) then
    alter table public.missions
      add constraint missions_type_check
      check (type in ('identity', 'action', 'world'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'missions_cooldown_ms_check'
  ) then
    alter table public.missions
      add constraint missions_cooldown_ms_check
      check (cooldown_ms is null or cooldown_ms >= 0);
  end if;
end
$$;

create or replace function public.set_missions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_missions_set_updated_at on public.missions;
create trigger trg_missions_set_updated_at
  before update on public.missions
  for each row
  execute function public.set_missions_updated_at();

create table if not exists public.mission_sessions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'started',
  cost_snapshot jsonb,
  meta jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mission_sessions_status_check'
  ) then
    alter table public.mission_sessions
      add constraint mission_sessions_status_check
      check (status in ('started', 'completed', 'cancelled'));
  end if;
end
$$;

create index if not exists mission_sessions_user_idx
  on public.mission_sessions(user_id, started_at desc);

create index if not exists mission_sessions_mission_idx
  on public.mission_sessions(mission_id, started_at desc);

create index if not exists mission_sessions_active_idx
  on public.mission_sessions(user_id, mission_id, status)
  where status = 'started';

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
