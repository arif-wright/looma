-- Phase 9.2C — Post thread permalink helpers (depends on 9.2B schema)

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
        and child.is_public = true
    ) as reply_count
  from public.comments c
  left join public.profiles prof on prof.id = c.author_id
  where c.post_id = p_post_id
    and c.parent_id is null
    and c.is_public = true
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
  left join public.profiles prof on prof.id = c.author_id
  where c.parent_id = p_parent_id
    and c.is_public = true
    and c.created_at < coalesce(p_before, now())
  order by c.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

grant execute on function public.get_post_by_id(uuid) to anon, authenticated;
grant execute on function public.get_post_comments_tree(uuid, int, timestamptz) to anon, authenticated;
grant execute on function public.get_comment_replies(uuid, int, timestamptz) to anon, authenticated;
