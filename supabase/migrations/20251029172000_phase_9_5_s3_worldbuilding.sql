-- Phase 9.5 — Worldbuilding baseline (missions + creatures)

-- ============================================================================
-- Species catalogue
-- ============================================================================

create table if not exists public.creatures_species (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  description text,
  created_at timestamptz not null default now()
);

create index if not exists creatures_species_name_idx
  on public.creatures_species (name);

-- ============================================================================
-- Creatures owned by players
-- ============================================================================

create table if not exists public.creatures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  species_id uuid references public.creatures_species(id) on delete set null,
  name text,
  nickname text,
  bonded boolean not null default false,
  bond_level integer not null default 0,
  alignment text,
  traits jsonb not null default '[]'::jsonb,
  species text,
  mood text,
  mood_label text,
  care_due_at timestamptz,
  next_care_at timestamptz,
  needs_care boolean not null default false,
  mood_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.creatures
  add column if not exists species text;

alter table if exists public.creatures
  add column if not exists mood text;

alter table if exists public.creatures
  add column if not exists mood_label text;

alter table if exists public.creatures
  add column if not exists care_due_at timestamptz;

alter table if exists public.creatures
  add column if not exists next_care_at timestamptz;

alter table if exists public.creatures
  add column if not exists needs_care boolean;

alter table if exists public.creatures
  add column if not exists mood_expires_at timestamptz;

do $$
begin
  if to_regclass('public.creatures') is not null then
    update public.creatures
    set needs_care = coalesce(needs_care, false)
    where needs_care is null;
  end if;
end$$;

alter table if exists public.creatures
  alter column needs_care set default false;

alter table if exists public.creatures
  alter column needs_care set not null;

create index if not exists creatures_owner_idx
  on public.creatures (owner_id, created_at desc);

create index if not exists creatures_species_idx
  on public.creatures (species_id);

create index if not exists creatures_next_care_idx
  on public.creatures (next_care_at);

alter table public.creatures enable row level security;

drop policy if exists creatures_select_own on public.creatures;
create policy creatures_select_own
  on public.creatures
  for select
  using (auth.uid() = owner_id);

drop policy if exists creatures_insert_own on public.creatures;
create policy creatures_insert_own
  on public.creatures
  for insert
  with check (auth.uid() = owner_id);

drop policy if exists creatures_update_own on public.creatures;
create policy creatures_update_own
  on public.creatures
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists creatures_delete_own on public.creatures;
create policy creatures_delete_own
  on public.creatures
  for delete
  using (auth.uid() = owner_id);

create or replace function public.set_creatures_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_creatures_set_updated_at on public.creatures;
create trigger trg_creatures_set_updated_at
  before update on public.creatures
  for each row
  execute function public.set_creatures_updated_at();

-- ============================================================================
-- Missions catalogue (surface suggestions)
-- ============================================================================

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  title text,
  summary text,
  difficulty text,
  energy_reward integer not null default 0,
  xp_reward integer not null default 0,
  status text not null default 'available',
  starts_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists missions_owner_idx
  on public.missions (owner_id, created_at desc);

create index if not exists missions_status_idx
  on public.missions (status, created_at desc);

alter table public.missions enable row level security;

drop policy if exists missions_public_read on public.missions;
create policy missions_public_read
  on public.missions
  for select
  using (
    status in ('available', 'active')
    or coalesce(owner_id, auth.uid()) = auth.uid()
  );

drop policy if exists missions_owner_manage on public.missions;
create policy missions_owner_manage
  on public.missions
  for all
  using (coalesce(owner_id, auth.uid()) = auth.uid())
  with check (coalesce(owner_id, auth.uid()) = auth.uid());
