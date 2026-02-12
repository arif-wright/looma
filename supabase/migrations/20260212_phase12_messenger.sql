create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'dm',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text,
  constraint conversations_type_check check (type in ('dm', 'group'))
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted boolean not null default false,
  primary key (conversation_id, user_id),
  constraint conversation_members_role_check check (role in ('member', 'admin'))
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  client_nonce text,
  constraint messages_body_check check (char_length(trim(body)) > 0)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self_check check (blocker_id <> blocked_id)
);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists conversations_last_message_idx
  on public.conversations(last_message_at desc nulls last);

create index if not exists conversation_members_user_joined_idx
  on public.conversation_members(user_id, joined_at desc);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at desc);

create unique index if not exists messages_client_nonce_uniq
  on public.messages(conversation_id, sender_id, client_nonce)
  where client_nonce is not null;

create index if not exists user_blocks_blocked_idx
  on public.user_blocks(blocked_id, created_at desc);

create index if not exists message_reports_message_created_idx
  on public.message_reports(message_id, created_at desc);

create or replace function public.set_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_conversations_set_updated_at on public.conversations;
create trigger trg_conversations_set_updated_at
  before update on public.conversations
  for each row
  execute procedure public.set_conversations_updated_at();

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;
alter table public.message_reports enable row level security;

drop policy if exists conversations_member_select on public.conversations;
create policy conversations_member_select
  on public.conversations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = conversations.id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists conversations_member_update on public.conversations;
create policy conversations_member_update
  on public.conversations
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = conversations.id
        and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = conversations.id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists conversation_members_select_own on public.conversation_members;
create policy conversation_members_select_own
  on public.conversation_members
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists conversation_members_update_own on public.conversation_members;
create policy conversation_members_update_own
  on public.conversation_members
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists messages_member_select on public.messages;
create policy messages_member_select
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists messages_member_insert on public.messages;
create policy messages_member_insert
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists user_blocks_owner_select on public.user_blocks;
create policy user_blocks_owner_select
  on public.user_blocks
  for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists user_blocks_owner_insert on public.user_blocks;
create policy user_blocks_owner_insert
  on public.user_blocks
  for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists user_blocks_owner_delete on public.user_blocks;
create policy user_blocks_owner_delete
  on public.user_blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists message_reports_insert_own on public.message_reports;
create policy message_reports_insert_own
  on public.message_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

create or replace function public.rpc_get_or_create_dm(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  dm_id uuid;
  lock_key text;
begin
  if caller is null then
    raise exception 'unauthorized';
  end if;

  if other_user_id is null or other_user_id = caller then
    raise exception 'invalid_other_user';
  end if;

  if not exists (select 1 from auth.users u where u.id = other_user_id) then
    raise exception 'user_not_found';
  end if;

  if exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = caller and b.blocked_id = other_user_id)
       or (b.blocker_id = other_user_id and b.blocked_id = caller)
  ) then
    raise exception 'blocked';
  end if;

  select c.id
    into dm_id
    from public.conversations c
    where c.type = 'dm'
      and exists (
        select 1 from public.conversation_members m1
        where m1.conversation_id = c.id
          and m1.user_id = caller
      )
      and exists (
        select 1 from public.conversation_members m2
        where m2.conversation_id = c.id
          and m2.user_id = other_user_id
      )
      and 2 = (
        select count(*)
        from public.conversation_members m3
        where m3.conversation_id = c.id
      )
    limit 1;

  if dm_id is not null then
    return dm_id;
  end if;

  lock_key :=
    'dm:' ||
    least(caller::text, other_user_id::text) || ':' ||
    greatest(caller::text, other_user_id::text);
  perform pg_advisory_xact_lock(hashtext(lock_key));

  select c.id
    into dm_id
    from public.conversations c
    where c.type = 'dm'
      and exists (
        select 1 from public.conversation_members m1
        where m1.conversation_id = c.id
          and m1.user_id = caller
      )
      and exists (
        select 1 from public.conversation_members m2
        where m2.conversation_id = c.id
          and m2.user_id = other_user_id
      )
      and 2 = (
        select count(*)
        from public.conversation_members m3
        where m3.conversation_id = c.id
      )
    limit 1;

  if dm_id is not null then
    return dm_id;
  end if;

  insert into public.conversations(type)
  values ('dm')
  returning id into dm_id;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (dm_id, caller),
    (dm_id, other_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return dm_id;
end;
$$;

grant execute on function public.rpc_get_or_create_dm(uuid) to authenticated;

create or replace function public.rpc_mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'unauthorized';
  end if;

  update public.conversation_members cm
     set last_read_at = now()
   where cm.conversation_id = p_conversation_id
     and cm.user_id = caller;

  if not found then
    raise exception 'not_member';
  end if;
end;
$$;

grant execute on function public.rpc_mark_conversation_read(uuid) to authenticated;

create or replace function public.rpc_is_blocked(p_other_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_other_user_id)
       or (b.blocker_id = p_other_user_id and b.blocked_id = auth.uid())
  );
$$;

grant execute on function public.rpc_is_blocked(uuid) to authenticated;

create or replace function public.rpc_get_unread_counts()
returns table(conversation_id uuid, unread_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    cm.conversation_id,
    coalesce(count(m.id), 0)::bigint as unread_count
  from public.conversation_members cm
  left join public.messages m
    on m.conversation_id = cm.conversation_id
   and m.deleted_at is null
   and m.sender_id <> auth.uid()
   and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
  where cm.user_id = auth.uid()
  group by cm.conversation_id;
$$;

grant execute on function public.rpc_get_unread_counts() to authenticated;

create or replace function public.rpc_get_conversation_members(p_conversation_id uuid)
returns table(user_id uuid)
language sql
security definer
set search_path = public
as $$
  select cm.user_id
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and exists (
      select 1
      from public.conversation_members mine
      where mine.conversation_id = p_conversation_id
        and mine.user_id = auth.uid()
    );
$$;

grant execute on function public.rpc_get_conversation_members(uuid) to authenticated;

alter table if exists public.messages replica identity full;
alter table if exists public.conversations replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversations'
    ) then
      execute 'alter publication supabase_realtime add table public.conversations';
    end if;
  else
    create publication supabase_realtime for table public.messages, public.conversations;
  end if;
end;
$$;
