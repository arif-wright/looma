-- Phase 12.7 — Follow recommendations view

create or replace view public.follow_recommendations as
with me as (
  select auth.uid() as uid
),
my_following as (
  select f.followee_id
  from public.follows f, me
  where me.uid is not null
    and f.follower_id = me.uid
),
my_followers as (
  select f.follower_id
  from public.follows f, me
  where me.uid is not null
    and f.followee_id = me.uid
),
mutual_candidates as (
  select f.followee_id as candidate, count(*) as mutual_count
  from public.follows f
  join my_followers mf on mf.follower_id = f.follower_id
  where f.followee_id is not null
  group by f.followee_id
),
shared_following_candidates as (
  select f.follower_id as candidate, count(*) as shared_following
  from public.follows f
  join my_following mf on mf.followee_id = f.followee_id
  where f.follower_id is not null
  group by f.follower_id
),
popular as (
  select f.followee_id as candidate, count(*) as popularity
  from public.follows f
  where f.followee_id is not null
  group by f.followee_id
),
base as (
  select coalesce(m.candidate, s.candidate, p.candidate) as candidate
  from mutual_candidates m
  full outer join shared_following_candidates s on s.candidate = m.candidate
  full outer join popular p on p.candidate = coalesce(m.candidate, s.candidate)
)
select
  b.candidate as user_id,
  coalesce(m.mutual_count, 0)::bigint as mutuals,
  coalesce(s.shared_following, 0)::bigint as shared_following,
  coalesce(p.popularity, 0)::bigint as popularity,
  (coalesce(m.mutual_count, 0) * 3.0
   + coalesce(s.shared_following, 0) * 1.5
   + least(coalesce(p.popularity, 0), 50) * 0.05) as score
from base b
left join mutual_candidates m on m.candidate = b.candidate
left join shared_following_candidates s on s.candidate = b.candidate
left join popular p on p.candidate = b.candidate
, me
where b.candidate is not null
  and me.uid is not null
  and b.candidate <> me.uid
  and not exists (
    select 1 from public.follows f
    where f.follower_id = me.uid
      and f.followee_id = b.candidate
  )
order by score desc, user_id asc;

grant select on public.follow_recommendations to anon, authenticated;
