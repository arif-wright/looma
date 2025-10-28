-- Phase 9.2C — Home surface and landing preferences support

-- Create user preferences table (idempotent).
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  start_on text not null default 'home' check (start_on in ('home', 'creatures', 'dashboard')),
  last_context text,
  last_context_payload jsonb,
  ab_variant text check (ab_variant in ('A', 'B', 'C')),
  updated_at timestamptz not null default now()
);

alter table if exists public.user_preferences enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_preferences'
      and policyname = 'user_preferences_select'
  ) then
    create policy user_preferences_select
      on public.user_preferences
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_preferences'
      and policyname = 'user_preferences_upsert'
  ) then
    create policy user_preferences_upsert
      on public.user_preferences
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_preferences'
      and policyname = 'user_preferences_update'
  ) then
    create policy user_preferences_update
      on public.user_preferences
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;

-- Lightweight analytics event log.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  surface text,
  variant text,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.analytics_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'analytics_events'
      and policyname = 'analytics_insert_own'
  ) then
    create policy analytics_insert_own
      on public.analytics_events
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'analytics_events'
      and policyname = 'analytics_select_own'
  ) then
    create policy analytics_select_own
      on public.analytics_events
      for select
      using (auth.uid() = user_id);
  end if;
end$$;

create index if not exists analytics_events_user_id_created_idx
  on public.analytics_events (user_id, created_at desc);

-- Ensure updated_at stays fresh on changes.
create or replace function public.touch_user_preferences()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_user_preferences_touch on public.user_preferences;
create trigger trg_user_preferences_touch
  before update on public.user_preferences
  for each row
  execute function public.touch_user_preferences();

-- Supporting indexes (idempotent).
create index if not exists user_preferences_user_id_idx
  on public.user_preferences (user_id);

create index if not exists profiles_handle_idx
  on public.profiles (handle);

create index if not exists posts_author_created_desc_idx
  on public.posts (author_id, created_at desc);

create index if not exists comments_post_created_id_idx
  on public.comments (post_id, created_at asc, id);

-- Reaffirm unique slug requirement (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_slug_unique'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_slug_unique unique (slug);
  end if;
end$$;

-- Backfill profile handles where missing.
with computed_handles as (
  select
    prof.id,
    left(prof.id::text, 8) as short_id,
    regexp_replace(
      regexp_replace(
        lower(
          coalesce(
            nullif(trim(prof.handle), ''),
            nullif(trim(prof.display_name), ''),
            'user'
          )
        ),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '(^-+|-+$)',
      '',
      'g'
    ) as base_handle
  from public.profiles as prof
)
update public.profiles as prof
set handle = case
  when coalesce(nullif(c.base_handle, ''), '') <> ''
    then concat_ws('-', c.base_handle, c.short_id)
  else 'user-' || c.short_id
end
from computed_handles as c
where prof.id = c.id
  and (prof.handle is null or prof.handle = '');

alter table if exists public.profiles
  alter column handle set not null;

-- Backfill post slugs where missing.
with computed_slugs as (
  select
    p.id,
    left(p.id::text, 8) as short_id,
    regexp_replace(
      regexp_replace(
        lower(
          coalesce(
            nullif(trim(p.meta ->> 'title'), ''),
            left(coalesce(p.body, ''), 80)
          )
        ),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '(^-+|-+$)',
      '',
      'g'
    ) as base_slug
  from public.posts as p
)
update public.posts as p
set slug = case
  when coalesce(nullif(c.base_slug, ''), '') <> ''
    then concat_ws('-', c.base_slug, c.short_id)
  else 'thread-' || c.short_id
end
from computed_slugs as c
where p.id = c.id
  and (p.slug is null or p.slug = '');

alter table if exists public.posts
  alter column slug set not null;
