-- Phase 13.3 — Companion actions + mood logic prerequisites

-- Ensure core companion stats columns exist
alter table public.companions
  add column if not exists affection int not null default 50 check (affection between 0 and 100);

alter table public.companions
  add column if not exists trust int not null default 40 check (trust between 0 and 100);

alter table public.companions
  add column if not exists energy int not null default 80 check (energy between 0 and 100);

alter table public.companions
  add column if not exists mood text not null default 'neutral';

-- Care stats table stores cooldown timestamps + streak
create table if not exists public.companion_stats (
  companion_id uuid primary key references public.companions(id) on delete cascade,
  care_streak int not null default 0,
  fed_at timestamptz,
  played_at timestamptz,
  groomed_at timestamptz
);

alter table public.companion_stats enable row level security;

drop policy if exists "companion_stats_owner_read" on public.companion_stats;
create policy "companion_stats_owner_read" on public.companion_stats
  for select to authenticated
  using (
    exists (
      select 1
      from public.companions c
      where c.id = companion_id
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists "companion_stats_owner_write" on public.companion_stats;
create policy "companion_stats_owner_write" on public.companion_stats
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.companions c
      where c.id = companion_id
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists "companion_stats_owner_update" on public.companion_stats;
create policy "companion_stats_owner_update" on public.companion_stats
  for update to authenticated
  using (
    exists (
      select 1
      from public.companions c
      where c.id = companion_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.companions c
      where c.id = companion_id
        and c.owner_id = auth.uid()
    )
  );

-- Care / bond events log
create table if not exists public.companion_care_events (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references public.companions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('feed', 'play', 'groom', 'system')),
  affection_delta int not null default 0,
  trust_delta int not null default 0,
  energy_delta int not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists companion_care_events_companion_idx
  on public.companion_care_events (companion_id, created_at desc);

create index if not exists companion_care_events_owner_idx
  on public.companion_care_events (owner_id, created_at desc);

alter table public.companion_care_events enable row level security;

drop policy if exists "care_events_owner_read" on public.companion_care_events;
create policy "care_events_owner_read" on public.companion_care_events
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "care_events_owner_insert" on public.companion_care_events;
create policy "care_events_owner_insert" on public.companion_care_events
  for insert to authenticated
  with check (owner_id = auth.uid());
