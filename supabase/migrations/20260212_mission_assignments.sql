-- Auditable mission rotation assignments.
-- Stores immutable mission ID sets for each daily/weekly period.

create table if not exists public.mission_assignments (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  period_key text not null,
  mission_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mission_assignments_period_check'
  ) then
    alter table public.mission_assignments
      add constraint mission_assignments_period_check
      check (period in ('daily', 'weekly'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mission_assignments_mission_ids_array_check'
  ) then
    alter table public.mission_assignments
      add constraint mission_assignments_mission_ids_array_check
      check (jsonb_typeof(mission_ids) = 'array');
  end if;
end
$$;

create unique index if not exists mission_assignments_period_unique_idx
  on public.mission_assignments(period, period_key);

create index if not exists mission_assignments_created_idx
  on public.mission_assignments(created_at desc);

create index if not exists mission_assignments_mission_ids_gin_idx
  on public.mission_assignments using gin (mission_ids);

alter table public.mission_assignments enable row level security;

drop policy if exists mission_assignments_read_authenticated on public.mission_assignments;
create policy mission_assignments_read_authenticated
  on public.mission_assignments
  for select
  to authenticated
  using (true);

-- Optional per-user progress snapshots for assignment-specific progress bookkeeping.
-- Current implementation can derive progress from mission_sessions, so this remains optional.
create table if not exists public.user_assignment_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid not null references public.mission_assignments(id) on delete cascade,
  mission_id text not null,
  status text not null default 'active',
  session_id uuid references public.mission_sessions(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_assignment_progress_status_check'
  ) then
    alter table public.user_assignment_progress
      add constraint user_assignment_progress_status_check
      check (status in ('active', 'completed', 'skipped', 'failed'));
  end if;
end
$$;

create unique index if not exists user_assignment_progress_unique_idx
  on public.user_assignment_progress(user_id, assignment_id, mission_id);

create index if not exists user_assignment_progress_user_idx
  on public.user_assignment_progress(user_id, created_at desc);

create or replace function public.set_user_assignment_progress_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_assignment_progress_set_updated_at on public.user_assignment_progress;
create trigger trg_user_assignment_progress_set_updated_at
  before update on public.user_assignment_progress
  for each row
  execute function public.set_user_assignment_progress_updated_at();

alter table public.user_assignment_progress enable row level security;

drop policy if exists user_assignment_progress_owner_select on public.user_assignment_progress;
create policy user_assignment_progress_owner_select
  on public.user_assignment_progress
  for select
  using (user_id = auth.uid());

drop policy if exists user_assignment_progress_owner_insert on public.user_assignment_progress;
create policy user_assignment_progress_owner_insert
  on public.user_assignment_progress
  for insert
  with check (user_id = auth.uid());

drop policy if exists user_assignment_progress_owner_update on public.user_assignment_progress;
create policy user_assignment_progress_owner_update
  on public.user_assignment_progress
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
