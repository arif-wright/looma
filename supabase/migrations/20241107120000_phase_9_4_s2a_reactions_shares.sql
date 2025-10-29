-- Phase 9.4 S2a — reactions, shares, engagement summary

-- ============================================================================
-- S2a tables: post_reactions
-- ============================================================================

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('like', 'cheer', 'spark')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

create index if not exists post_reactions_post_kind_idx
  on public.post_reactions (post_id, kind);

alter table public.post_reactions enable row level security;

drop policy if exists post_reactions_select_public on public.post_reactions;
create policy post_reactions_select_public
  on public.post_reactions
  for select
  using (true);

drop policy if exists post_reactions_insert_own on public.post_reactions;
create policy post_reactions_insert_own
  on public.post_reactions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists post_reactions_delete_own on public.post_reactions;
create policy post_reactions_delete_own
  on public.post_reactions
  for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- S2a tables: comment_reactions
-- ============================================================================

create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('like', 'cheer', 'spark')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, kind)
);

create index if not exists comment_reactions_comment_kind_idx
  on public.comment_reactions (comment_id, kind);

alter table public.comment_reactions enable row level security;

drop policy if exists comment_reactions_select_public on public.comment_reactions;
create policy comment_reactions_select_public
  on public.comment_reactions
  for select
  using (true);

drop policy if exists comment_reactions_insert_own on public.comment_reactions;
create policy comment_reactions_insert_own
  on public.comment_reactions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists comment_reactions_delete_own on public.comment_reactions;
create policy comment_reactions_delete_own
  on public.comment_reactions
  for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- S2a tables: post_shares
-- ============================================================================

create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  sharer_id uuid not null references public.profiles(id) on delete cascade,
  quote text null,
  created_at timestamptz not null default now()
);

create index if not exists post_shares_post_created_idx
  on public.post_shares (post_id, created_at desc);

alter table public.post_shares enable row level security;

drop policy if exists post_shares_select_public on public.post_shares;
create policy post_shares_select_public
  on public.post_shares
  for select
  using (true);

drop policy if exists post_shares_insert_own on public.post_shares;
create policy post_shares_insert_own
  on public.post_shares
  for insert
  with check (auth.uid() = sharer_id);

-- ============================================================================
-- S2a view: post_engagement_view
-- ============================================================================

create or replace view public.post_engagement_view as
select
  p.id as post_id,
  coalesce(c.comment_count, 0)::bigint as comment_count,
  coalesce(r.like_count, 0)::bigint as reaction_like_count,
  coalesce(r.cheer_count, 0)::bigint as reaction_cheer_count,
  coalesce(r.spark_count, 0)::bigint as reaction_spark_count,
  coalesce(s.share_count, 0)::bigint as share_count,
  (
    coalesce(c.comment_count, 0)
    + coalesce(r.like_count, 0)
    + coalesce(r.cheer_count, 0)
    + coalesce(r.spark_count, 0)
    + coalesce(s.share_count, 0)
  )::bigint as total_engagement,
  -- S2a column aliases
  coalesce(r.like_count, 0)::bigint as reactions_like,
  coalesce(r.cheer_count, 0)::bigint as reactions_cheer,
  coalesce(r.spark_count, 0)::bigint as reactions_spark,
  coalesce(s.share_count, 0)::bigint as shares_count,
  coalesce(c.comment_count, 0)::bigint as comments_count
from public.posts p
left join lateral (
  select
    count(*) filter (where pr.kind = 'like') as like_count,
    count(*) filter (where pr.kind = 'cheer') as cheer_count,
    count(*) filter (where pr.kind = 'spark') as spark_count
  from public.post_reactions pr
  where pr.post_id = p.id
) r on true
left join lateral (
  select count(*) as share_count
  from public.post_shares ps
  where ps.post_id = p.id
) s on true
left join lateral (
  select count(*) as comment_count
  from public.comments co
  where co.post_id = p.id
) c on true;
