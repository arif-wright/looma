-- Phase 9.2C — Profile-centric thread prep (handles, slugs, indexes)

-- Ensure profiles have a handle column that is populated, unique, and indexed.
alter table if exists public.profiles
  add column if not exists handle text;

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

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_handle_unique'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_handle_unique unique (handle);
  end if;
end$$;

create index if not exists profiles_handle_idx
  on public.profiles (handle);

-- Add slug column for posts (idempotent).
alter table if exists public.posts
  add column if not exists slug text;

-- Backfill slug values using meta->>'title' when present, otherwise body snippet,
-- and guarantee uniqueness by suffixing the short id. Fallback to thread-<id>.
with computed as (
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
from computed as c
where p.id = c.id
  and (p.slug is null or p.slug = '');

-- Ensure slug column is not null after backfill.
alter table if exists public.posts
  alter column slug set not null;

-- Unique constraint / index on slug (idempotent).
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

-- Ensure an author reference is available for profile-centric lookups.
alter table if exists public.posts
  add column if not exists author_id uuid;

update public.posts
set author_id = coalesce(author_id, user_id)
where author_id is null;

alter table if exists public.posts
  alter column author_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_author_fk'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_author_fk
        foreign key (author_id) references public.profiles(id) on delete cascade;
  end if;
end$$;

-- Keep author_id aligned with user_id for legacy inserts.
drop function if exists public.sync_post_author_id() cascade;
create or replace function public.sync_post_author_id()
returns trigger language plpgsql as $$
begin
  new.author_id := coalesce(new.author_id, new.user_id);
  if new.user_id is not null and new.author_id is distinct from new.user_id then
    new.author_id := new.user_id;
  end if;
  return new;
end$$;

drop trigger if exists trg_posts_sync_author_id on public.posts;
create trigger trg_posts_sync_author_id
  before insert or update on public.posts
  for each row
  execute function public.sync_post_author_id();

-- Author + created_at index for timelines.
create index if not exists posts_author_created_desc_idx
  on public.posts (author_id, created_at desc);

-- Retain legacy created_at-only index for other queries (idempotent).
create index if not exists posts_created_desc_idx
  on public.posts (created_at desc);

-- Composite pagination index for comments in ascending keyset order.
drop index if exists public.comments_post_created_id_idx;
create index if not exists comments_post_created_id_idx
  on public.comments (post_id, created_at asc, id);
