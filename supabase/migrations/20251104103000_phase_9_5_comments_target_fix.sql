-- Phase 9.5 — Ensure comment inserts populate polymorphic targets

drop function if exists public.fn_insert_comment_with_mentions(uuid, text, uuid);
drop function if exists public.fn_insert_comment_with_mentions(uuid, uuid, text);

create or replace function public.fn_insert_comment_with_mentions(
  p_post_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns table(comment_id uuid, depth integer, mentioned_user_ids uuid[])
language plpgsql
security invoker
set search_path = public
as $$
declare
  comment_id uuid;
  v_author uuid := auth.uid();
  v_parent_post uuid;
  v_parent_depth integer := -1;
  v_body text := coalesce(p_body, '');
  v_mentions uuid[] := array[]::uuid[];
begin
  if v_author is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_body := trim(v_body);
  if v_body = '' then
    raise exception 'Comment body required' using errcode = '22023';
  end if;

  if p_parent_id is not null then
    select post_id into v_parent_post
    from public.comments
    where id = p_parent_id;

    if not found then
      raise exception 'Parent comment not found' using errcode = 'P0001';
    end if;

    if v_parent_post is distinct from p_post_id then
      raise exception 'Parent comment does not belong to target post' using errcode = 'P0001';
    end if;

    with recursive ancestry as (
      select id, parent_id, 0 as depth
      from public.comments
      where id = p_parent_id
      union all
      select c.id, c.parent_id, a.depth + 1
      from public.comments c
      join ancestry a on c.id = a.parent_id
    )
    select max(depth) into v_parent_depth from ancestry;
  end if;

  select coalesce(array_agg(uid), array[]::uuid[])
    into v_mentions
    from public.fn_extract_mentions(v_body) as uid;

  insert into public.comments (
    post_id,
    parent_id,
    author_id,
    user_id,
    target_kind,
    target_id,
    body
  )
  values (
    p_post_id,
    p_parent_id,
    v_author,
    v_author,
    case when p_parent_id is null then 'post' else 'comment' end,
    case when p_parent_id is null then p_post_id else p_parent_id end,
    v_body
  )
  returning id into comment_id;

  if cardinality(v_mentions) > 0 then
    insert into public.comment_mentions (comment_id, mentioned_user_id)
    select comment_id, unnest(v_mentions)
    on conflict (comment_id, mentioned_user_id) do nothing;
  end if;

  return query
  select
    comment_id,
    case when p_parent_id is null then 0 else coalesce(v_parent_depth, -1) + 1 end as depth,
    v_mentions as mentioned_user_ids;
end;
$$;

grant execute on function public.fn_insert_comment_with_mentions(uuid, text, uuid) to authenticated, service_role;
