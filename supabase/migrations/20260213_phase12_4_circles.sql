create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  privacy text not null default 'invite',
  invite_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  conversation_id uuid references public.conversations(id) on delete set null,
  constraint circles_privacy_check check (privacy in ('public', 'invite'))
);

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id),
  constraint circle_members_role_check check (role in ('owner', 'admin', 'member'))
);

create table if not exists public.circle_announcements (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists circles_owner_idx on public.circles(owner_id);
create unique index if not exists circles_invite_code_uq on public.circles(invite_code);
create index if not exists circle_members_user_idx on public.circle_members(user_id);
create index if not exists circle_announcements_circle_pinned_idx
  on public.circle_announcements(circle_id, pinned desc, created_at desc);

create or replace function public.set_circles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_circles_set_updated_at on public.circles;
create trigger trg_circles_set_updated_at
  before update on public.circles
  for each row
  execute procedure public.set_circles_updated_at();

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_announcements enable row level security;

drop policy if exists circles_member_select on public.circles;
create policy circles_member_select
  on public.circles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circles.id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists circles_admin_update on public.circles;
create policy circles_admin_update
  on public.circles
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circles.id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circles.id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

drop policy if exists circle_members_member_select on public.circle_members;
create policy circle_members_member_select
  on public.circle_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circle_members.circle_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists circle_announcements_member_select on public.circle_announcements;
create policy circle_announcements_member_select
  on public.circle_announcements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circle_announcements.circle_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists circle_announcements_admin_insert on public.circle_announcements;
create policy circle_announcements_admin_insert
  on public.circle_announcements
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circle_announcements.circle_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

drop policy if exists circle_announcements_admin_update on public.circle_announcements;
create policy circle_announcements_admin_update
  on public.circle_announcements
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circle_announcements.circle_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = circle_announcements.circle_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

create or replace function public.rpc_create_circle(p_name text, p_description text default null, p_privacy text default 'invite')
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_description text := nullif(btrim(coalesce(p_description, '')), '');
  normalized_privacy text := lower(coalesce(p_privacy, 'invite'));
  v_circle_id uuid;
  v_conversation_id uuid;
  v_invite_code text;
  attempts int := 0;
begin
  if caller is null then
    raise exception 'unauthorized';
  end if;

  if char_length(normalized_name) < 2 or char_length(normalized_name) > 80 then
    raise exception 'invalid_name';
  end if;

  if normalized_privacy not in ('public', 'invite') then
    raise exception 'invalid_privacy';
  end if;

  insert into public.conversations(type)
  values ('group')
  returning id into v_conversation_id;

  loop
    attempts := attempts + 1;
    v_invite_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    begin
      insert into public.circles (owner_id, name, description, privacy, invite_code, conversation_id)
      values (caller, normalized_name, normalized_description, normalized_privacy, v_invite_code, v_conversation_id)
      returning id into v_circle_id;
      exit;
    exception when unique_violation then
      if attempts >= 8 then
        raise exception 'invite_code_generation_failed';
      end if;
    end;
  end loop;

  insert into public.circle_members (circle_id, user_id, role)
  values (v_circle_id, caller, 'owner')
  on conflict (circle_id, user_id) do nothing;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, caller, 'admin')
  on conflict (conversation_id, user_id) do nothing;

  return v_circle_id;
end;
$$;

grant execute on function public.rpc_create_circle(text, text, text) to authenticated;

create or replace function public.rpc_join_circle_by_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  normalized_code text := upper(btrim(coalesce(p_invite_code, '')));
  v_circle_id uuid;
  v_conversation_id uuid;
begin
  if caller is null then
    raise exception 'unauthorized';
  end if;

  if char_length(normalized_code) < 4 then
    raise exception 'invalid_code';
  end if;

  select c.id, c.conversation_id
    into v_circle_id, v_conversation_id
    from public.circles c
    where c.invite_code = normalized_code
    limit 1;

  if v_circle_id is null then
    raise exception 'circle_not_found';
  end if;

  insert into public.circle_members (circle_id, user_id, role)
  values (v_circle_id, caller, 'member')
  on conflict (circle_id, user_id) do nothing;

  if v_conversation_id is not null then
    insert into public.conversation_members (conversation_id, user_id, role)
    values (v_conversation_id, caller, 'member')
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_circle_id;
end;
$$;

grant execute on function public.rpc_join_circle_by_code(text) to authenticated;

create or replace function public.rpc_leave_circle(p_circle_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  v_conversation_id uuid;
begin
  if caller is null then
    raise exception 'unauthorized';
  end if;

  select cm.role, c.conversation_id
    into caller_role, v_conversation_id
    from public.circle_members cm
    join public.circles c on c.id = cm.circle_id
    where cm.circle_id = p_circle_id
      and cm.user_id = caller
    limit 1;

  if caller_role is null then
    raise exception 'not_member';
  end if;

  if caller_role = 'owner' then
    raise exception 'owner_cannot_leave';
  end if;

  delete from public.circle_members cm
   where cm.circle_id = p_circle_id
     and cm.user_id = caller;

  if v_conversation_id is not null then
    delete from public.conversation_members m
     where m.conversation_id = v_conversation_id
       and m.user_id = caller;
  end if;
end;
$$;

grant execute on function public.rpc_leave_circle(uuid) to authenticated;

create or replace function public.rpc_set_circle_role(p_circle_id uuid, p_target_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  target_role text;
  normalized_role text := lower(coalesce(p_role, ''));
begin
  if caller is null then
    raise exception 'unauthorized';
  end if;

  if normalized_role not in ('admin', 'member') then
    raise exception 'invalid_role';
  end if;

  select cm.role into caller_role
  from public.circle_members cm
  where cm.circle_id = p_circle_id
    and cm.user_id = caller
  limit 1;

  if caller_role not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  select cm.role into target_role
  from public.circle_members cm
  where cm.circle_id = p_circle_id
    and cm.user_id = p_target_user_id
  limit 1;

  if target_role is null then
    raise exception 'target_not_member';
  end if;

  if target_role = 'owner' then
    raise exception 'cannot_change_owner';
  end if;

  if caller_role = 'admin' and normalized_role = 'admin' then
    raise exception 'forbidden';
  end if;

  update public.circle_members cm
     set role = normalized_role
   where cm.circle_id = p_circle_id
     and cm.user_id = p_target_user_id;

  update public.conversation_members m
     set role = case when normalized_role = 'admin' then 'admin' else 'member' end
   where m.conversation_id = (select c.conversation_id from public.circles c where c.id = p_circle_id)
     and m.user_id = p_target_user_id;
end;
$$;

grant execute on function public.rpc_set_circle_role(uuid, uuid, text) to authenticated;

create or replace function public.rpc_kick_circle_member(p_circle_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  target_role text;
  v_conversation_id uuid;
begin
  if caller is null then
    raise exception 'unauthorized';
  end if;

  select cm.role into caller_role
  from public.circle_members cm
  where cm.circle_id = p_circle_id
    and cm.user_id = caller
  limit 1;

  if caller_role not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  select cm.role into target_role
  from public.circle_members cm
  where cm.circle_id = p_circle_id
    and cm.user_id = p_target_user_id
  limit 1;

  if target_role is null then
    raise exception 'target_not_member';
  end if;

  if target_role = 'owner' then
    raise exception 'cannot_kick_owner';
  end if;

  if caller_role = 'admin' and target_role = 'admin' then
    raise exception 'forbidden';
  end if;

  select c.conversation_id into v_conversation_id
  from public.circles c
  where c.id = p_circle_id;

  delete from public.circle_members cm
   where cm.circle_id = p_circle_id
     and cm.user_id = p_target_user_id;

  if v_conversation_id is not null then
    delete from public.conversation_members m
     where m.conversation_id = v_conversation_id
       and m.user_id = p_target_user_id;
  end if;
end;
$$;

grant execute on function public.rpc_kick_circle_member(uuid, uuid) to authenticated;
