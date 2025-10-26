-- Phase 9.2B — Threaded comments with mentions support

-- ============================================================================
-- Comment table housekeeping
-- ============================================================================

-- Ensure required columns exist (idempotent alterations).
alter table if exists public.comments
  add column if not exists post_id uuid;

update public.comments
   set post_id = coalesce(post_id, target_id)
 where post_id is null
   and (target_kind is null or target_kind = 'post');

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

do $$
begin
  begin
    alter table public.comments
      add constraint comments_post_presence
      check (coalesce(target_kind, 'event') <> 'post' or post_id is not null);
  exception
    when duplicate_object then null;
  end;
end$$;


alter table if exists public.comments
  add column if not exists author_id uuid;

update public.comments
   set author_id = coalesce(author_id, user_id)
 where author_id is null;

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
  alter column author_id set not null;

alter table if exists public.comments
  add column if not exists is_public boolean not null default true;

alter table if exists public.comments
  alter column is_public set default true;

alter table if exists public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

alter table if exists public.comments
  alter column created_at set default now();

-- Generated helpers for threading.
alter table if exists public.comments
  add column if not exists thread_root_id uuid
  generated always as (coalesce(parent_id, id)) stored;

alter table if exists public.comments
  add column if not exists depth int
  generated always as (
    case
      when parent_id is null then 0
      else 1
    end
  ) stored;

-- Core indexes used for tree traversal.
create index if not exists comments_post_created_idx
  on public.comments (post_id, created_at desc);

create index if not exists comments_parent_created_idx
  on public.comments (parent_id, created_at asc);

create index if not exists comments_thread_root_idx
  on public.comments (thread_root_id, created_at asc);

-- Remove legacy single-depth trigger (if present).
drop trigger if exists comments_depth_check on public.comments;
drop function if exists public.enforce_comment_depth();

-- ============================================================================
-- Mentions table + trigger
-- ============================================================================

create table if not exists public.comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists comment_mentions_user_idx
  on public.comment_mentions (mentioned_user_id, created_at desc);

create unique index if not exists comment_mentions_comment_user_unique
  on public.comment_mentions (comment_id, mentioned_user_id);

-- Extract @mentions from comment bodies.
create or replace function public.handle_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handles text[];
  v_handle text;
  v_target_profile uuid;
begin
  v_handles := array(
    select distinct lower(trim(leading '@' from match[1]))
    from regexp_matches(coalesce(new.body, ''), '@([A-Za-z0-9_]{2,})', 'g') as match
  );

  if v_handles is null or array_length(v_handles, 1) is null then
    return new;
  end if;

  foreach v_handle in array v_handles loop
    select p.id
      into v_target_profile
    from public.profiles as p
    where lower(p.handle) = v_handle
    limit 1;

    if v_target_profile is null or v_target_profile = new.author_id then
      continue;
    end if;

    insert into public.comment_mentions (comment_id, mentioned_user_id)
    values (new.id, v_target_profile)
    on conflict (comment_id, mentioned_user_id) do nothing;

    perform public.emit_event(
      v_target_profile,
      'mention',
      'You were mentioned in a comment',
      jsonb_build_object(
        'comment_id', new.id,
        'post_id', new.post_id,
        'author_id', new.author_id
      ),
      true
    );
  end loop;

  return new;
end$$;

drop trigger if exists trg_comment_mentions on public.comments;
create trigger trg_comment_mentions
  after insert on public.comments
  for each row execute function public.handle_comment_mentions();

do $$
begin
  begin
    alter publication supabase_realtime add table public.comments;
  exception
    when duplicate_object then null;
  end;
end$$;

-- Insert helper & tree queries
-- ============================================================================

drop function if exists public.insert_comment(uuid, text, uuid, boolean);
drop function if exists public.insert_comment(uuid, text, uuid, boolean, boolean);
drop function if exists public.get_comments_tree(uuid, integer, timestamptz);
drop function if exists public.get_replies(uuid, integer, timestamptz);
create or replace function public.insert_comment(
  p_post uuid,
  p_body text,
  p_parent uuid default null,
  p_is_public boolean default true
)
returns table(
  comment_id uuid,
  comment_post_id uuid,
  author_id uuid,
  comment_user_id uuid,
  body text,
  created_at timestamptz,
  parent_id uuid,
  is_public boolean,
  thread_root_id uuid,
  depth int,
  author_display_name text,
  author_handle text,
  author_avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_post uuid;
  v_post_owner uuid;
  v_post_public boolean;
  v_comment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_body is null or length(trim(both from p_body)) = 0 then
    raise exception 'Body is required';
  end if;

  select p_posts.user_id, p_posts.is_public
    into v_post_owner, v_post_public
  from public.posts as p_posts
  where p_posts.id = p_post;

  if v_post_owner is null then
    raise exception 'Post not found';
  end if;

  if coalesce(v_post_public, false) = false and v_post_owner <> auth.uid() then
    raise exception 'Not authorized to comment on this post';
  end if;

  if p_parent is not null then
    select c_parent.post_id
      into v_parent_post
    from public.comments as c_parent
    where c_parent.id = p_parent;

    if v_parent_post is null then
      raise exception 'Parent comment not found';
    end if;

    if v_parent_post <> p_post then
      raise exception 'Parent comment belongs to a different post';
    end if;
  end if;

  insert into public.comments (
    post_id,
    target_kind,
    target_id,
    author_id,
    user_id,
    body,
    parent_id,
    is_public
  )
  values (
    p_post,
    'post',
    p_post,
    auth.uid(),
    auth.uid(),
    p_body,
    p_parent,
    coalesce(p_is_public, true)
  )
  returning public.comments.id
  into v_comment_id;

  perform public.emit_event(
    auth.uid(),
    'comment',
    'Commented on a post',
    jsonb_build_object(
      'post_id', p_post,
      'comment_id', v_comment_id,
      'parent_id', p_parent
    ),
    coalesce(v_post_public, true)
  );

  return query
  select
    c.id as comment_id,
    c.post_id as comment_post_id,
    c.author_id as author_id,
    c.user_id as comment_user_id,
    c.body as body,
    c.created_at as created_at,
    c.parent_id as parent_id,
    c.is_public as is_public,
    c.thread_root_id as thread_root_id,
    c.depth as depth,
    prof.display_name as author_display_name,
    prof.handle as author_handle,
    prof.avatar_url as author_avatar_url
  from public.comments as c
  left join public.profiles as prof on prof.id = c.author_id
  where c.id = v_comment_id;
end$$;

create or replace function public.get_comments_tree(
  p_post uuid,
  p_limit int default 10,
  p_before timestamptz default now()
)
returns table (
  comment_id uuid,
  comment_post_id uuid,
  author_id uuid,
  comment_user_id uuid,
  body text,
  created_at timestamptz,
  parent_id uuid,
  is_public boolean,
  thread_root_id uuid,
  depth int,
  author_display_name text,
  author_handle text,
  author_avatar_url text,
  reply_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    c.id as comment_id,
    c.post_id as comment_post_id,
    c.author_id as author_id,
    c.user_id as comment_user_id,
    c.body as body,
    c.created_at as created_at,
    c.parent_id as parent_id,
    c.is_public as is_public,
    c.thread_root_id as thread_root_id,
    c.depth as depth,
    prof.display_name as author_display_name,
    prof.handle as author_handle,
    prof.avatar_url as author_avatar_url,
    (
      select count(*)::bigint
      from public.comments as r
      where r.parent_id = c.id
    ) as reply_count
  from public.comments as c
  left join public.profiles as prof on prof.id = c.author_id
  where c.post_id = p_post
    and c.parent_id is null
    and c.is_public = true
    and c.created_at < coalesce(p_before, now())
  order by c.created_at desc
  limit greatest(1, coalesce(p_limit, 10));
$$;

create or replace function public.get_replies(
  p_comment uuid,
  p_limit int default 10,
  p_after timestamptz default null
)
returns table (
  comment_id uuid,
  comment_post_id uuid,
  author_id uuid,
  comment_user_id uuid,
  body text,
  created_at timestamptz,
  parent_id uuid,
  is_public boolean,
  thread_root_id uuid,
  depth int,
  author_display_name text,
  author_handle text,
  author_avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id as comment_id,
    c.post_id as comment_post_id,
    c.author_id as author_id,
    c.user_id as comment_user_id,
    c.body as body,
    c.created_at as created_at,
    c.parent_id as parent_id,
    c.is_public as is_public,
    c.thread_root_id as thread_root_id,
    c.depth as depth,
    prof.display_name as author_display_name,
    prof.handle as author_handle,
    prof.avatar_url as author_avatar_url
  from public.comments as c
  left join public.profiles as prof on prof.id = c.author_id
  where c.parent_id = p_comment
    and c.is_public = true
    and (
      p_after is null
      or c.created_at < p_after
    )
  order by c.created_at desc
  limit greatest(1, coalesce(p_limit, 10));
$$;

grant execute on function public.insert_comment(uuid, text, uuid, boolean) to authenticated;
grant execute on function public.get_comments_tree(uuid, integer, timestamptz) to anon, authenticated;
grant execute on function public.get_replies(uuid, integer, timestamptz) to anon, authenticated;

-- ============================================================================
-- RLS policies
-- ============================================================================

alter table public.comments enable row level security;
alter table public.comment_mentions enable row level security;

drop policy if exists "comments: read public" on public.comments;
create policy "comments: read public"
  on public.comments
  for select
  using (public.comments.is_public = true);

drop policy if exists "comments: insert own" on public.comments;
create policy "comments: insert own"
  on public.comments
  for insert
  with check (auth.uid() = author_id);

drop policy if exists "comments: update own" on public.comments;
create policy "comments: update own"
  on public.comments
  for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "comments: delete own" on public.comments;
create policy "comments: delete own"
  on public.comments
  for delete
  using (auth.uid() = author_id);

drop policy if exists "comment_mentions: read own" on public.comment_mentions;
create policy "comment_mentions: read own"
  on public.comment_mentions
  for select
  using (mentioned_user_id = auth.uid());
