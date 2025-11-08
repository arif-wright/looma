-- Phase 12 — Profile identity hub (companions, posts polish, RLS)

-- Base profiles structure (idempotent)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text not null default '',
  bio text,
  avatar_url text,
  banner_url text,
  links jsonb not null default '[]'::jsonb,
  is_private boolean not null default false,
  joined_at timestamptz not null default now(),
  featured_companion_id uuid null
);

create index if not exists profiles_handle_lower_idx on public.profiles ((lower(handle)));

alter table if exists public.profiles
  add column if not exists featured_companion_id uuid null;

-- Companions table
create table if not exists public.companions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Unnamed',
  species text not null default 'Companion',
  avatar_url text,
  bond_level int not null default 1,
  bond_xp int not null default 0,
  bond_next int not null default 100,
  mood text not null default 'Calm',
  created_at timestamptz not null default now()
);

create index if not exists companions_owner_idx on public.companions(owner_id);

-- Posts table (augment existing if present)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  visibility text not null default 'public',
  is_deleted boolean not null default false,
  is_pinned boolean not null default false
);

alter table if exists public.posts
  add column if not exists author_id uuid references auth.users(id) on delete cascade;

update public.posts
set author_id = coalesce(author_id, user_id)
where author_id is null;

alter table if exists public.posts
  alter column author_id set not null;

alter table if exists public.posts
  add column if not exists visibility text;

update public.posts
set visibility = case
  when visibility is null then case when coalesce(is_public, true) then 'public' else 'private' end
  else visibility
end;

alter table if exists public.posts
  alter column visibility set default 'public',
  alter column visibility set not null;

alter table if exists public.posts
  add column if not exists is_deleted boolean not null default false;

alter table if exists public.posts
  add column if not exists is_pinned boolean not null default false;

create index if not exists posts_author_created_idx on public.posts(author_id, created_at desc);
create index if not exists posts_pinned_created_idx on public.posts(is_pinned desc, created_at desc);

-- RLS toggles
alter table if exists public.profiles enable row level security;
alter table if exists public.companions enable row level security;
alter table if exists public.posts enable row level security;

-- Profiles policies (replace legacy variants)
drop policy if exists "profiles_select_public" on public.profiles;
drop policy if exists "profiles_select_owner" on public.profiles;
drop policy if exists "profiles_insert_owner" on public.profiles;
drop policy if exists "profiles_update_owner" on public.profiles;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select'
  ) then
    create policy profiles_select on public.profiles
      for select
      using (is_private = false or auth.uid() = id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_upsert'
  ) then
    create policy profiles_upsert on public.profiles
      for all
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end$$;

-- Companions policies
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'companions' and policyname = 'companions_select'
  ) then
    create policy companions_select on public.companions
      for select
      using (
        owner_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.featured_companion_id = public.companions.id
            and (p.is_private = false or p.id = auth.uid())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'companions' and policyname = 'companions_owner_rw'
  ) then
    create policy companions_owner_rw on public.companions
      for all
      using (owner_id = auth.uid())
      with check (owner_id = auth.uid());
  end if;
end$$;

-- Posts policies (replace older names)
drop policy if exists "posts select visibility" on public.posts;
drop policy if exists "posts insert own" on public.posts;
drop policy if exists "posts update own" on public.posts;
drop policy if exists "posts delete own" on public.posts;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_select'
  ) then
    create policy posts_select on public.posts
      for select
      using (
        is_deleted = false
        and (
          visibility = 'public'
          or auth.uid() = author_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_owner_rw'
  ) then
    create policy posts_owner_rw on public.posts
      for all
      using (auth.uid() = author_id)
      with check (auth.uid() = author_id);
  end if;
end$$;

-- Foreign key from profiles to companions (set null on delete)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_featured_companion_fk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_featured_companion_fk
        foreign key (featured_companion_id)
        references public.companions(id)
        on delete set null;
  end if;
end$$;
