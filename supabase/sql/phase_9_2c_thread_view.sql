-- Phase 9.2C — Post thread permalink + nested comments

-- === Comment hierarchy support ==============================================

-- Add parent reference for threaded replies (idempotent).
alter table if exists public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

-- Ensure helpful indexes exist.
create index if not exists comments_target_created_idx
  on public.comments (target_kind, target_id, created_at desc);

create index if not exists comments_parent_created_idx
  on public.comments (parent_id, created_at asc);

-- Enforce single-level depth (replies only to top-level comments).
create or replace function public.enforce_comment_depth()
returns trigger
language plpgsql
as $$
declare
  parent_target uuid;
  parent_kind text;
  parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select c.parent_id, c.target_kind, c.target_id
    into parent_parent, parent_kind, parent_target
  from public.comments c
  where c.id = new.parent_id;

  if parent_parent is not null then
    raise exception 'Nested replies beyond one level are not allowed';
  end if;

  if parent_kind is distinct from new.target_kind or parent_target is distinct from new.target_id then
    raise exception 'Reply must target the same post as its parent comment';
  end if;

  return new;
end$$;

drop trigger if exists comments_depth_check on public.comments;
create trigger comments_depth_check
  before insert or update on public.comments
  for each row
  execute function public.enforce_comment_depth();

-- === RPCs ===================================================================

drop function if exists public.get_post_by_id(uuid);
create or replace function public.get_post_by_id(p_post_id uuid)
returns table (
  id uuid,
  user_id uuid,
  body text,
  meta jsonb,
  created_at timestamptz,
  is_public boolean,
  author_name text,
  author_handle text,
  author_avatar text,
  like_count bigint,
  comment_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.body,
    p.meta,
    p.created_at,
    p.is_public,
    coalesce(pr.display_name, '@' || pr.handle, 'Someone') as author_name,
    pr.handle as author_handle,
    pr.avatar_url as author_avatar,
    (
      select count(*)::bigint
      from public.reactions r
      where r.target_kind = 'post'
        and r.target_id = p.id
        and r.kind = 'like'
    ) as like_count,
    (
      select count(*)::bigint
      from public.comments c
      where c.target_kind = 'post'
        and c.target_id = p.id
    ) as comment_count
  from public.posts p
  left join public.profiles pr on pr.id = p.user_id
  where p.id = p_post_id
    and (p.is_public = true or p.user_id = auth.uid());
$$;

drop function if exists public.get_post_comments_tree(uuid, int, timestamptz);
create or replace function public.get_post_comments_tree(
  p_post_id uuid,
  p_limit int default 20,
  p_before timestamptz default now()
)
returns table (
  id uuid,
  user_id uuid,
  body text,
  created_at timestamptz,
  parent_id uuid,
  display_name text,
  handle text,
  avatar_url text,
  reply_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.user_id,
    c.body,
    c.created_at,
    c.parent_id,
    prof.display_name,
    prof.handle,
    prof.avatar_url,
    (
      select count(*)::bigint
      from public.comments child
      where child.parent_id = c.id
    ) as reply_count
  from public.comments c
  left join public.profiles prof on prof.id = c.user_id
  where c.target_kind = 'post'
    and c.target_id = p_post_id
    and c.parent_id is null
    and c.created_at < coalesce(p_before, now())
  order by c.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

drop function if exists public.get_comment_replies(uuid, int, timestamptz);
create or replace function public.get_comment_replies(
  p_parent_id uuid,
  p_limit int default 20,
  p_before timestamptz default now()
)
returns table (
  id uuid,
  user_id uuid,
  body text,
  created_at timestamptz,
  parent_id uuid,
  display_name text,
  handle text,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.user_id,
    c.body,
    c.created_at,
    c.parent_id,
    prof.display_name,
    prof.handle,
    prof.avatar_url
  from public.comments c
  left join public.profiles prof on prof.id = c.user_id
  where c.parent_id = p_parent_id
    and c.created_at < coalesce(p_before, now())
  order by c.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

grant execute on function public.get_post_by_id(uuid) to anon, authenticated;
grant execute on function public.get_post_comments_tree(uuid, int, timestamptz) to anon, authenticated;
grant execute on function public.get_comment_replies(uuid, int, timestamptz) to anon, authenticated;
