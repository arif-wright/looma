-- Phase 9.2C — Thread detail prep (slug + indexes)

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

-- Ensure a created_at descending index exists for posts (idempotent).
create index if not exists posts_created_desc_idx
  on public.posts (created_at desc);

-- Composite pagination index for comments.
create index if not exists comments_post_created_id_idx
  on public.comments (post_id, created_at desc, id);
