-- Phase 10.5 — Social share hooks

-- Ensure the posts table has the fields required for social share cards.
alter table if exists public.posts
  add column if not exists kind text;

alter table if exists public.posts
  add column if not exists text text;

update public.posts
set kind = 'text'
where kind is null;

alter table if exists public.posts
  alter column kind set default 'text';

alter table if exists public.posts
  alter column kind set not null;

update public.posts
set text = body
where text is null or text = '';

alter table if exists public.posts
  alter column text set default '';

alter table if exists public.posts
  alter column text set not null;

create index if not exists idx_posts_inserted_at
  on public.posts(created_at desc);

-- Existing policies already restrict inserts/selects to authenticated users.

do $$
begin
  if exists (
    select 1
    from pg_views
    where schemaname = 'public'
      and viewname = 'post_share_projection'
  ) then
    execute 'drop view public.post_share_projection';
  end if;
end$$;

create view public.post_share_projection as
select id, user_id, kind, text, meta, created_at
from public.posts
where kind in ('run', 'achievement');

-- Refresh feed view to surface post kind/text for composer rendering.
drop view if exists public.feed_view;

create view public.feed_view as
select
  p.id,
  p.user_id,
  p.author_id,
  p.slug,
  p.kind,
  p.text,
  p.body,
  p.meta,
  p.image_url,
  p.is_public,
  p.created_at,
  p.deep_link_target,
  coalesce(prof.display_name, '@' || prof.handle, 'Someone') as author_name,
  prof.handle as author_handle,
  prof.avatar_url as author_avatar,
  coalesce(pc.comment_count, 0)::bigint as comment_count,
  coalesce(pr.like_count, 0)::bigint as reaction_like_count,
  coalesce(pr.spark_count, 0)::bigint as reaction_spark_count,
  coalesce(pr.support_count, 0)::bigint as reaction_support_count,
  self.kind as current_user_reaction,
  (f.follower_id is not null) as is_follow,
  coalesce(p.engagement_score, 0)::double precision as engagement,
  case
    when p.created_at is not null then
      1.0 / ((extract(epoch from (now() - p.created_at)) / 3600.0) + 1.0)
    else
      0.0
  end as recency,
  (
    case when f.follower_id is not null then 3.0 else 0.0 end +
    (
      case
        when p.created_at is not null then
          (1.0 / ((extract(epoch from (now() - p.created_at)) / 3600.0) + 1.0)) * 1.5
        else
          0.0
      end
    ) +
    (coalesce(p.engagement_score, 0) * 0.5)
  ) as score
from public.posts p
left join public.profiles prof on prof.id = p.author_id
left join public.follows f
  on f.followed_id = p.author_id
 and f.follower_id = auth.uid()
left join lateral (
  select count(*)::bigint as comment_count
  from public.comments c
  where c.post_id = p.id
    and c.is_public = true
) pc on true
left join lateral (
  select
    count(*) filter (where r.kind = 'like')::bigint as like_count,
    count(*) filter (where r.kind = 'spark')::bigint as spark_count,
    count(*) filter (where r.kind = 'support')::bigint as support_count
  from public.reactions r
  where r.target_kind = 'post'
    and r.target_id = p.id
) pr on true
left join lateral (
  select rself.kind::text as kind
  from public.reactions rself
  where rself.target_kind = 'post'
    and rself.target_id = p.id
    and rself.user_id = auth.uid()
  order by rself.created_at desc
  limit 1
) self on true
where p.is_public = true;

alter view public.feed_view set (security_invoker = true);

grant select on public.feed_view to authenticated;

drop function if exists public.get_public_posts(int, timestamptz);
create or replace function public.get_public_posts(
  p_limit int default 20,
  p_before timestamptz default now()
)
returns table (
  id uuid,
  user_id uuid,
  slug text,
  kind text,
  body text,
  text text,
  meta jsonb,
  image_url text,
  engagement_score double precision,
  deep_link_target jsonb,
  is_public boolean,
  created_at timestamptz,
  author_name text,
  author_handle text,
  author_avatar text,
  comment_count bigint,
  reaction_like_count bigint,
  reaction_spark_count bigint,
  reaction_support_count bigint,
  current_user_reaction text
) language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.slug,
    p.kind,
    p.body,
    p.text,
    p.meta,
    p.image_url,
    p.engagement_score,
    p.deep_link_target,
    p.is_public,
    p.created_at,
    coalesce(prof.display_name, '@' || prof.handle, 'Someone') as author_name,
    prof.handle as author_handle,
    prof.avatar_url as author_avatar,
    coalesce(pc.comment_count, 0) as comment_count,
    coalesce(pr.like_count, 0) as reaction_like_count,
    coalesce(pr.spark_count, 0) as reaction_spark_count,
    coalesce(pr.support_count, 0) as reaction_support_count,
    self.kind as current_user_reaction
  from public.posts p
  left join public.profiles prof on prof.id = p.author_id
  left join lateral (
    select count(*)::bigint as comment_count
    from public.comments c
    where c.post_id = p.id
      and c.is_public = true
  ) pc on true
  left join lateral (
    select
      count(*) filter (where kind = 'like')::bigint as like_count,
      count(*) filter (where kind = 'spark')::bigint as spark_count,
      count(*) filter (where kind = 'support')::bigint as support_count
    from public.reactions r
    where r.target_kind = 'post'
      and r.target_id = p.id
  ) pr on true
  left join lateral (
    select rself.kind::text as kind
    from public.reactions rself
    where rself.target_kind = 'post'
      and rself.target_id = p.id
      and rself.user_id = auth.uid()
    limit 1
  ) self on true
  where p.is_public = true
    and p.created_at < coalesce(p_before, now())
  order by p.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

grant execute on function public.get_public_posts(int, timestamptz) to anon, authenticated;

drop function if exists public.get_user_posts(uuid, int, timestamptz);
create or replace function public.get_user_posts(
  p_user uuid,
  p_limit int default 20,
  p_before timestamptz default now()
)
returns table (
  id uuid,
  user_id uuid,
  slug text,
  kind text,
  body text,
  text text,
  meta jsonb,
  image_url text,
  engagement_score double precision,
  deep_link_target jsonb,
  is_public boolean,
  created_at timestamptz,
  author_name text,
  author_handle text,
  author_avatar text,
  comment_count bigint,
  reaction_like_count bigint,
  reaction_spark_count bigint,
  reaction_support_count bigint,
  current_user_reaction text
) language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.slug,
    p.kind,
    p.body,
    p.text,
    p.meta,
    p.image_url,
    p.engagement_score,
    p.deep_link_target,
    p.is_public,
    p.created_at,
    coalesce(prof.display_name, '@' || prof.handle, 'Someone') as author_name,
    prof.handle as author_handle,
    prof.avatar_url as author_avatar,
    coalesce(pc.comment_count, 0) as comment_count,
    coalesce(pr.like_count, 0) as reaction_like_count,
    coalesce(pr.spark_count, 0) as reaction_spark_count,
    coalesce(pr.support_count, 0) as reaction_support_count,
    self.kind as current_user_reaction
  from public.posts p
  left join public.profiles prof on prof.id = p.author_id
  left join lateral (
    select count(*)::bigint as comment_count
    from public.comments c
    where c.post_id = p.id
      and c.is_public = true
  ) pc on true
  left join lateral (
    select
      count(*) filter (where kind = 'like')::bigint as like_count,
      count(*) filter (where kind = 'spark')::bigint as spark_count,
      count(*) filter (where kind = 'support')::bigint as support_count
    from public.reactions r
    where r.target_kind = 'post'
      and r.target_id = p.id
  ) pr on true
  left join lateral (
    select rself.kind::text as kind
    from public.reactions rself
    where rself.target_kind = 'post'
      and rself.target_id = p.id
      and rself.user_id = auth.uid()
    limit 1
  ) self on true
  where p.user_id = p_user
    and p.created_at < coalesce(p_before, now())
  order by p.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

grant execute on function public.get_user_posts(uuid, int, timestamptz) to authenticated;
