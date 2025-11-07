-- Phase 12.1 — Profile overview scaffolding, privacy, and RLS hardening

-- Ensure base table exists (idempotent)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null,
  display_name text not null default '',
  bio text null,
  avatar_url text null,
  banner_url text null,
  links jsonb null default '[]'::jsonb,
  is_private boolean not null default false,
  joined_at timestamptz not null default now()
);

alter table if exists public.profiles
  add column if not exists display_name text;

alter table if exists public.profiles
  add column if not exists bio text;

alter table if exists public.profiles
  add column if not exists avatar_url text;

alter table if exists public.profiles
  add column if not exists banner_url text;

alter table if exists public.profiles
  add column if not exists links jsonb;

alter table if exists public.profiles
  add column if not exists is_private boolean;

alter table if exists public.profiles
  add column if not exists joined_at timestamptz;

update public.profiles
set display_name = ''
where display_name is null;

alter table if exists public.profiles
  alter column display_name set not null,
  alter column display_name set default '';

update public.profiles
set links = '[]'::jsonb
where links is null;

alter table if exists public.profiles
  alter column links set default '[]'::jsonb;

update public.profiles
set is_private = false
where is_private is null;

alter table if exists public.profiles
  alter column is_private set not null,
  alter column is_private set default false;

update public.profiles
set joined_at = coalesce(joined_at, now())
where joined_at is null;

alter table if exists public.profiles
  alter column joined_at set not null,
  alter column joined_at set default now();

-- Case-insensitive uniqueness on handles
create unique index if not exists profiles_handle_lower_unique_idx
  on public.profiles (lower(handle));

-- RLS policies
alter table if exists public.profiles enable row level security;

drop policy if exists "profiles: owner can update" on public.profiles;
drop policy if exists "profiles_select_public" on public.profiles;
drop policy if exists "profiles_select_owner" on public.profiles;
drop policy if exists "profiles_insert_owner" on public.profiles;
drop policy if exists "profiles_update_owner" on public.profiles;

create policy "profiles_select_public"
on public.profiles
for select
  to public
  using (is_private = false);

create policy "profiles_select_owner"
on public.profiles
for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_owner"
on public.profiles
for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_owner"
on public.profiles
for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
