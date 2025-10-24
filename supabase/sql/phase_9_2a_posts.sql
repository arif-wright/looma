-- Phase 9.2A — Posts, comments, reactions, and feed integration

-- Create enum for reaction kinds
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reaction_kind') then
    create type public.reaction_kind as enum ('like', 'spark', 'support');
  end if;
end$$;

-- Posts table
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  meta jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists posts_user_created_idx on public.posts (user_id, created_at desc);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_is_public_idx on public.posts (is_public);

alter table public.posts enable row level security;

drop policy if exists "posts select visibility" on public.posts;
create policy "posts select visibility"
on public.posts for select
  using (is_public OR auth.uid() = user_id);

drop policy if exists "posts insert own" on public.posts;
create policy "posts insert own"
on public.posts for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "posts update own" on public.posts;
create policy "posts update own"
on public.posts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "posts delete own" on public.posts;
create policy "posts delete own"
on public.posts for delete
  to authenticated
  using (auth.uid() = user_id);

-- Post comments table
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_created_idx on public.post_comments (post_id, created_at asc);

alter table public.post_comments enable row level security;

drop policy if exists "post_comments select visibility" on public.post_comments;
create policy "post_comments select visibility"
on public.post_comments for select
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_id
        and (p.is_public OR p.user_id = auth.uid())
    )
  );

drop policy if exists "post_comments insert own" on public.post_comments;
create policy "post_comments insert own"
on public.post_comments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.posts p
      where p.id = post_id
        and (p.is_public OR p.user_id = auth.uid())
    )
  );

drop policy if exists "post_comments delete own" on public.post_comments;
create policy "post_comments delete own"
on public.post_comments for delete
  to authenticated
  using (auth.uid() = user_id);

-- Post reactions table
create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.reaction_kind not null default 'like',
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_reactions enable row level security;

drop policy if exists "post_reactions select visibility" on public.post_reactions;
create policy "post_reactions select visibility"
on public.post_reactions for select
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_id
        and (p.is_public OR p.user_id = auth.uid())
    )
  );

drop policy if exists "post_reactions insert own" on public.post_reactions;
create policy "post_reactions insert own"
on public.post_reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.posts p
      where p.id = post_id
        and (p.is_public OR p.user_id = auth.uid())
    )
  );

drop policy if exists "post_reactions delete own" on public.post_reactions;
create policy "post_reactions delete own"
on public.post_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- Events integration triggers
drop function if exists public.on_post_insert_emit_event() cascade;
create or replace function public.on_post_insert_emit_event()
returns trigger language plpgsql as $$
declare
  msg text;
begin
  msg := left(coalesce(new.body, ''), 140);
  perform public.emit_event(
    new.user_id,
    'post',
    msg,
    jsonb_build_object('post_id', new.id),
    true
  );
  return new;
end$$;

drop trigger if exists trg_posts_emit_event on public.posts;
create trigger trg_posts_emit_event
  after insert on public.posts
  for each row
  execute function public.on_post_insert_emit_event();

drop function if exists public.on_post_comment_insert_emit_event() cascade;
create or replace function public.on_post_comment_insert_emit_event()
returns trigger language plpgsql as $$
declare
  msg text;
  post_owner uuid;
  post_public boolean;
begin
  select p.user_id, p.is_public
    into post_owner, post_public
  from public.posts p
  where p.id = new.post_id;

  if post_owner is null then
    return new;
  end if;

  msg := left(coalesce(new.body, ''), 140);
  perform public.emit_event(
    new.user_id,
    'comment',
    msg,
    jsonb_build_object(
      'post_id', new.post_id,
      'comment_id', new.id,
      'post_owner', post_owner
    ),
    coalesce(post_public, false)
  );
  return new;
end$$;

drop trigger if exists trg_post_comments_emit_event on public.post_comments;
create trigger trg_post_comments_emit_event
  after insert on public.post_comments
  for each row
  execute function public.on_post_comment_insert_emit_event();

-- RPC: public posts feed
drop function if exists public.get_public_posts(int, timestamptz);
create or replace function public.get_public_posts(
  p_limit int default 20,
  p_before timestamptz default now()
)
returns table (
  id uuid,
  user_id uuid,
  body text,
  meta jsonb,
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
    p.body,
    p.meta,
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
  left join public.profiles prof on prof.id = p.user_id
  left join lateral (
    select count(*)::bigint as comment_count
    from public.comments c
    where c.target_kind = 'post'
      and c.target_id = p.id
  ) pc on true
  left join lateral (
    select
      count(*) filter (where kind = 'like')::bigint as like_count,
      0::bigint as spark_count,
      0::bigint as support_count
    from public.reactions r
    where r.target_kind = 'post'
      and r.target_id = p.id
  ) pr on true
  left join lateral (
    select 'like'::text as kind
    from public.reactions rself
    where rself.target_kind = 'post'
      and rself.target_id = p.id
      and rself.user_id = auth.uid()
      and rself.kind = 'like'
    limit 1
  ) self on true
  where p.is_public = true
    and p.created_at < coalesce(p_before, now())
  order by p.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

grant execute on function public.get_public_posts(int, timestamptz) to anon, authenticated;

-- RPC: user posts feed with visibility
drop function if exists public.get_user_posts(uuid, int, timestamptz);
create or replace function public.get_user_posts(
  p_user uuid,
  p_limit int default 20,
  p_before timestamptz default now()
)
returns table (
  id uuid,
  user_id uuid,
  body text,
  meta jsonb,
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
    p.body,
    p.meta,
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
  left join public.profiles prof on prof.id = p.user_id
  left join lateral (
    select count(*)::bigint as comment_count
    from public.comments c
    where c.target_kind = 'post'
      and c.target_id = p.id
  ) pc on true
  left join lateral (
    select
      count(*) filter (where kind = 'like')::bigint as like_count,
      0::bigint as spark_count,
      0::bigint as support_count
    from public.reactions r
    where r.target_kind = 'post'
      and r.target_id = p.id
  ) pr on true
  left join lateral (
    select 'like'::text as kind
    from public.reactions rself
    where rself.target_kind = 'post'
      and rself.target_id = p.id
      and rself.user_id = auth.uid()
      and rself.kind = 'like'
    limit 1
  ) self on true
  where p.user_id = p_user
    and p.created_at < coalesce(p_before, now())
    and (p.is_public = true or p.user_id = auth.uid())
  order by p.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

grant execute on function public.get_user_posts(uuid, int, timestamptz) to anon, authenticated;

-- Optional seed example (commented out)
-- insert into public.posts (user_id, body) values ('00000000-0000-0000-0000-000000000000', 'Welcome to posts!');
