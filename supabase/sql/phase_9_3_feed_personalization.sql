-- Phase 9.3 — Personalized Feed and Navigation Support

alter table if exists public.posts
  add column if not exists image_url text;

alter table if exists public.posts
  add column if not exists engagement_score double precision default 0;

alter table if exists public.posts
  alter column engagement_score set not null;

alter table if exists public.posts
  add column if not exists deep_link_target jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_preferences'
      and column_name = 'last_context'
      and data_type = 'text'
  ) then
    alter table public.user_preferences
      alter column last_context type jsonb
      using case
        when last_context is null then null
        when jsonb_typeof(last_context::jsonb) = 'object' then last_context::jsonb
        else jsonb_build_object('context', last_context, 'trigger', null)
      end;
  end if;
end$$;

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id)
);

create index if not exists follows_followed_idx
  on public.follows (followed_id, follower_id);

alter table if exists public.follows enable row level security;

drop policy if exists follows_select_visibility on public.follows;
create policy follows_select_visibility
  on public.follows
  for select
  using (
    follower_id = auth.uid()
    or followed_id = auth.uid()
  );

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own
  on public.follows
  for insert
  with check (follower_id = auth.uid());

drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own
  on public.follows
  for delete
  using (follower_id = auth.uid());

create index if not exists posts_created_desc_idx
  on public.posts (created_at desc);

create index if not exists posts_engagement_score_idx
  on public.posts (engagement_score);

drop view if exists public.feed_view;

create view public.feed_view as
select
  p.id,
  p.user_id,
  p.author_id,
  p.slug,
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
