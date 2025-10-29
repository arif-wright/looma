-- Phase 9.4 — Advanced social systems (replies, mentions, reactions, shares, notifications)

-- ============================================================================
-- Comments table housekeeping
-- ============================================================================

-- Ensure required comment columns exist and enforce constraints.
alter table if exists public.comments
  add column if not exists post_id uuid;

do $$
begin
  begin
    alter table public.comments
      add constraint comments_post_fk
      foreign key (post_id) references public.posts(id) on delete cascade;
  exception
    when duplicate_object then null;
  end;
end$$;

alter table if exists public.comments
  add column if not exists parent_id uuid;

do $$
begin
  begin
    alter table public.comments
      add constraint comments_parent_fk
      foreign key (parent_id) references public.comments(id) on delete cascade;
  exception
    when duplicate_object then null;
  end;
end$$;

alter table if exists public.comments
  add column if not exists author_id uuid;

alter table if exists public.comments
  alter column author_id set not null;

do $$
begin
  begin
    alter table public.comments
      add constraint comments_author_fk
      foreign key (author_id) references public.profiles(id) on delete cascade;
  exception
    when duplicate_object then null;
  end;
end$$;

alter table if exists public.comments
  alter column body set not null;

alter table if exists public.comments
  alter column created_at set default now();

alter table if exists public.comments
  alter column created_at set not null;

-- Comments indexes for thread traversal and ordering.
drop index if exists public.comments_post_created_idx;
create index if not exists comments_post_created_idx
  on public.comments (post_id, created_at, id);

create index if not exists comments_post_parent_idx
  on public.comments (post_id, parent_id, created_at, id);

-- ============================================================================
-- Comments RLS policies
-- ============================================================================

alter table public.comments enable row level security;

drop policy if exists "comments: read public" on public.comments;
drop policy if exists "comments: insert own" on public.comments;
drop policy if exists "comments: update own" on public.comments;
drop policy if exists "comments: delete own" on public.comments;
drop policy if exists comments_select_access on public.comments;
drop policy if exists comments_insert_own on public.comments;
drop policy if exists comments_update_own on public.comments;
drop policy if exists comments_delete_own on public.comments;

create policy comments_select_access
  on public.comments
  for select
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or author_id = auth.uid()
    or exists (
      select 1
      from public.posts p
      where p.id = public.comments.post_id
        and (
          p.is_public = true
          or p.author_id = auth.uid()
        )
    )
  );

create policy comments_insert_own
  on public.comments
  for insert
  with check (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or (
      auth.uid() = author_id
      and exists (
        select 1
        from public.posts p
        where p.id = public.comments.post_id
          and (
            p.is_public = true
            or p.author_id = auth.uid()
          )
      )
    )
  );

create policy comments_update_own
  on public.comments
  for update
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or author_id = auth.uid()
  )
  with check (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or author_id = auth.uid()
  );

create policy comments_delete_own
  on public.comments
  for delete
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or author_id = auth.uid()
  );

-- ============================================================================
-- Comment mentions adjustments
-- ============================================================================

create table if not exists public.comment_mentions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table if exists public.comment_mentions
  drop constraint if exists comment_mentions_pkey;

alter table if exists public.comment_mentions
  drop column if exists id;

drop index if exists public.comment_mentions_comment_user_unique;
drop index if exists public.comment_mentions_user_idx;

create unique index if not exists comment_mentions_unique_idx
  on public.comment_mentions (comment_id, mentioned_user_id);

create index if not exists comment_mentions_user_created_idx
  on public.comment_mentions (mentioned_user_id, created_at desc);

alter table if exists public.comment_mentions
  alter column comment_id set not null,
  alter column mentioned_user_id set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.comment_mentions enable row level security;

drop policy if exists "comment_mentions: read own" on public.comment_mentions;
drop policy if exists comment_mentions_select_access on public.comment_mentions;
drop policy if exists comment_mentions_insert_author on public.comment_mentions;
drop policy if exists comment_mentions_delete_author on public.comment_mentions;

create policy comment_mentions_select_access
  on public.comment_mentions
  for select
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or mentioned_user_id = auth.uid()
    or exists (
      select 1
      from public.comments c
      join public.posts p on p.id = c.post_id
      where c.id = public.comment_mentions.comment_id
        and (
          c.author_id = auth.uid()
          or p.author_id = auth.uid()
          or p.is_public = true
        )
    )
  );

create policy comment_mentions_insert_author
  on public.comment_mentions
  for insert
  with check (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or exists (
      select 1
      from public.comments c
      where c.id = public.comment_mentions.comment_id
        and c.author_id = auth.uid()
    )
  );

create policy comment_mentions_delete_author
  on public.comment_mentions
  for delete
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or exists (
      select 1
      from public.comments c
      where c.id = public.comment_mentions.comment_id
        and c.author_id = auth.uid()
    )
  );

-- ============================================================================
-- Comment mention helpers
-- ============================================================================

drop function if exists public.fn_extract_mentions(text);

create or replace function public.fn_extract_mentions(p_body text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id
  from regexp_matches(coalesce(p_body, '')::text, '@([A-Za-z0-9_]{1,32})', 'g') as r(handle)
  join public.profiles p on lower(p.handle) = lower(r[1])
  where p.handle is not null
$$;

grant execute on function public.fn_extract_mentions(text) to authenticated, service_role;

-- ============================================================================
-- Comment insertion with mentions
-- ============================================================================

drop function if exists public.fn_insert_comment_with_mentions(uuid, uuid, text);
drop function if exists public.fn_insert_comment_with_mentions(uuid, text, uuid);
drop function if exists public.insert_comment(uuid, text, uuid, boolean);
drop function if exists public.insert_comment(uuid, text, uuid, boolean, boolean);

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

  insert into public.comments (post_id, parent_id, author_id, body)
  values (p_post_id, p_parent_id, v_author, v_body)
  returning id into comment_id;

  if cardinality(v_mentions) > 0 then
    insert into public.comment_mentions (comment_id, mentioned_user_id)
    select comment_id, unnest(v_mentions)
    on conflict (comment_id, mentioned_user_id) do nothing;
  end if;

  return query
  select comment_id,
         case when p_parent_id is null then 0 else coalesce(v_parent_depth, -1) + 1 end as depth,
         v_mentions;
end;
$$;

grant execute on function public.fn_insert_comment_with_mentions(uuid, text, uuid) to authenticated, service_role;

-- ============================================================================
-- Comment tree view
-- ============================================================================

drop view if exists public.comment_tree_view;

create view public.comment_tree_view as
with recursive tree as (
  select
    c.id,
    c.post_id,
    c.parent_id,
    c.author_id,
    c.body,
    c.created_at,
    0 as depth,
    array[c.id] as id_path,
    array[to_char(c.created_at, 'YYYYMMDDHH24MISSUS') || ':' || c.id] as sort_path
  from public.comments c
  where c.parent_id is null

  union all

  select
    child.id,
    child.post_id,
    child.parent_id,
    child.author_id,
    child.body,
    child.created_at,
    parent.depth + 1,
    parent.id_path || child.id,
    parent.sort_path || (to_char(child.created_at, 'YYYYMMDDHH24MISSUS') || ':' || child.id)
  from public.comments child
  join tree parent on parent.id = child.parent_id
  where not (child.id = any(parent.id_path))
)
select
  id,
  post_id,
  parent_id,
  author_id,
  body,
  created_at,
  depth,
  id_path as path,
  array_to_string(sort_path, '.') as sort_key
from tree;

grant select on public.comment_tree_view to authenticated, service_role;

-- ============================================================================
-- Post reactions
-- ============================================================================

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

-- Align legacy schema to new constraints.
alter table if exists public.post_reactions
  alter column created_at set default now();

alter table if exists public.post_reactions
  alter column created_at set not null;

alter table if exists public.post_reactions
  alter column kind type text using (kind::text);

update public.post_reactions
set kind = 'cheer'
where kind = 'support';

alter table if exists public.post_reactions
  drop constraint if exists post_reactions_check;

alter table if exists public.post_reactions
  drop constraint if exists post_reactions_kind_check;

alter table if exists public.post_reactions
  add constraint post_reactions_kind_check
  check (kind in ('like', 'cheer', 'spark'));

alter table if exists public.post_reactions
  drop constraint if exists post_reactions_post_id_user_id_key;

alter table if exists public.post_reactions
  drop constraint if exists post_reactions_pkey;

alter table if exists public.post_reactions
  add constraint post_reactions_pk primary key (post_id, user_id, kind);

alter table if exists public.post_reactions
  drop constraint if exists post_reactions_user_id_fkey;

alter table if exists public.post_reactions
  drop constraint if exists post_reactions_user_profile_fk;

alter table if exists public.post_reactions
  add constraint post_reactions_user_profile_fk
  foreign key (user_id) references public.profiles(id) on delete cascade;

create index if not exists post_reactions_post_kind_idx
  on public.post_reactions (post_id, kind);

alter table public.post_reactions enable row level security;

drop policy if exists post_reactions_select_access on public.post_reactions;
drop policy if exists post_reactions_insert_own on public.post_reactions;
drop policy if exists post_reactions_delete_own on public.post_reactions;

create policy post_reactions_select_access
  on public.post_reactions
  for select
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
    or exists (
      select 1
      from public.posts p
      where p.id = public.post_reactions.post_id
        and (
          p.is_public = true
          or p.author_id = auth.uid()
        )
    )
  );

create policy post_reactions_insert_own
  on public.post_reactions
  for insert
  with check (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
  );

create policy post_reactions_delete_own
  on public.post_reactions
  for delete
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
  );

-- ============================================================================
-- Comment reactions
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

drop policy if exists comment_reactions_select_access on public.comment_reactions;
drop policy if exists comment_reactions_insert_own on public.comment_reactions;
drop policy if exists comment_reactions_delete_own on public.comment_reactions;

create policy comment_reactions_select_access
  on public.comment_reactions
  for select
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
    or exists (
      select 1
      from public.comments c
      join public.posts p on p.id = c.post_id
      where c.id = public.comment_reactions.comment_id
        and (
          c.author_id = auth.uid()
          or p.author_id = auth.uid()
          or p.is_public = true
        )
    )
  );

create policy comment_reactions_insert_own
  on public.comment_reactions
  for insert
  with check (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
  );

create policy comment_reactions_delete_own
  on public.comment_reactions
  for delete
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
  );

-- ============================================================================
-- Post shares
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

drop policy if exists post_shares_select_access on public.post_shares;
drop policy if exists post_shares_insert_own on public.post_shares;
drop policy if exists post_shares_delete_own on public.post_shares;

create policy post_shares_select_access
  on public.post_shares
  for select
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or sharer_id = auth.uid()
    or exists (
      select 1
      from public.posts p
      where p.id = public.post_shares.post_id
        and (
          p.is_public = true
          or p.author_id = auth.uid()
        )
    )
  );

create policy post_shares_insert_own
  on public.post_shares
  for insert
  with check (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or sharer_id = auth.uid()
  );

create policy post_shares_delete_own
  on public.post_shares
  for delete
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or sharer_id = auth.uid()
  );

-- ============================================================================
-- Notifications
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('mention', 'reply', 'reaction', 'share')),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid null references public.posts(id) on delete set null,
  comment_id uuid null references public.comments(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_read_idx
  on public.notifications (user_id, read_at);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_recipient on public.notifications;
drop policy if exists notifications_insert_service on public.notifications;
drop policy if exists notifications_update_recipient on public.notifications;
drop policy if exists notifications_delete_service on public.notifications;

create policy notifications_select_recipient
  on public.notifications
  for select
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
  );

create policy notifications_insert_service
  on public.notifications
  for insert
  with check (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
  );

create policy notifications_update_recipient
  on public.notifications
  for update
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
  )
  with check (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
  );

create policy notifications_delete_service
  on public.notifications
  for delete
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
  );

-- ============================================================================
-- Safety tables
-- ============================================================================

create table if not exists public.rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null,
  count integer not null default 0,
  primary key (user_id, action, window_started_at)
);

alter table public.rate_limits enable row level security;

drop policy if exists rate_limits_service_access on public.rate_limits;

create policy rate_limits_service_access
  on public.rate_limits
  for all
  using (coalesce(auth.jwt() ->> 'role', '') = 'service_role')
  with check (coalesce(auth.jwt() ->> 'role', '') = 'service_role');

create table if not exists public.content_flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, user_id)
);

create index if not exists content_flags_target_idx
  on public.content_flags (target_type, target_id, created_at desc);

alter table public.content_flags enable row level security;

drop policy if exists content_flags_select_self_or_admin on public.content_flags;
drop policy if exists content_flags_insert_own on public.content_flags;
drop policy if exists content_flags_delete_admin on public.content_flags;

create policy content_flags_select_self_or_admin
  on public.content_flags
  for select
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
  );

create policy content_flags_insert_own
  on public.content_flags
  for insert
  with check (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or user_id = auth.uid()
  );

create policy content_flags_delete_admin
  on public.content_flags
  for delete
  using (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
  );

-- ============================================================================
-- Aggregation views
-- ============================================================================

drop view if exists public.post_engagement_view;
create view public.post_engagement_view as
select
  p.id as post_id,
  coalesce(pc.comment_count, 0)::bigint as comment_count,
  coalesce(pr.like_count, 0)::bigint as reaction_like_count,
  coalesce(pr.cheer_count, 0)::bigint as reaction_cheer_count,
  coalesce(pr.spark_count, 0)::bigint as reaction_spark_count,
  coalesce(ps.share_count, 0)::bigint as share_count,
  (coalesce(pc.comment_count, 0)
   + coalesce(pr.like_count, 0)
   + coalesce(pr.cheer_count, 0)
   + coalesce(pr.spark_count, 0)
   + coalesce(ps.share_count, 0))::bigint as total_engagement
from public.posts p
left join lateral (
  select count(*) as comment_count
  from public.comments c
  where c.post_id = p.id
) pc on true
left join lateral (
  select
    count(*) filter (where r.kind = 'like') as like_count,
    count(*) filter (where r.kind = 'cheer') as cheer_count,
    count(*) filter (where r.kind = 'spark') as spark_count
  from public.post_reactions r
  where r.post_id = p.id
) pr on true
left join lateral (
  select count(*) as share_count
  from public.post_shares s
  where s.post_id = p.id
) ps on true;

alter view public.post_engagement_view set (security_invoker = true);

grant select on public.post_engagement_view to authenticated;

drop view if exists public.user_unread_notifications_view;
create view public.user_unread_notifications_view as
select
  n.user_id,
  count(*)::bigint as unread_count
from public.notifications n
where n.read_at is null
group by n.user_id;

alter view public.user_unread_notifications_view set (security_invoker = true);

grant select on public.user_unread_notifications_view to authenticated;

-- ============================================================================
-- Realtime publication support
-- ============================================================================

do $$
begin
  begin
    alter publication supabase_realtime add table public.post_reactions;
  exception
    when duplicate_object then null;
  end;
end$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.comment_reactions;
  exception
    when duplicate_object then null;
  end;
end$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.post_shares;
  exception
    when duplicate_object then null;
  end;
end$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
  end;
end$$;
