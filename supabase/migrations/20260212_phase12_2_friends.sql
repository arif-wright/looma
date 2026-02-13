create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_status_check check (status in ('pending', 'accepted', 'declined', 'canceled')),
  constraint friend_requests_no_self_check check (requester_id <> recipient_id)
);

create table if not exists public.friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friends_no_self_check check (user_id <> friend_id)
);

create unique index if not exists friend_requests_pending_unique
  on public.friend_requests(requester_id, recipient_id)
  where status = 'pending';

create index if not exists friend_requests_recipient_status_created_idx
  on public.friend_requests(recipient_id, status, created_at desc);

create index if not exists friend_requests_requester_status_created_idx
  on public.friend_requests(requester_id, status, created_at desc);

create index if not exists friends_user_created_idx
  on public.friends(user_id, created_at desc);

create or replace function public.set_friend_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_friend_requests_set_updated_at on public.friend_requests;
create trigger trg_friend_requests_set_updated_at
  before update on public.friend_requests
  for each row
  execute procedure public.set_friend_requests_updated_at();

alter table public.friend_requests enable row level security;
alter table public.friends enable row level security;

drop policy if exists friend_requests_select_requester on public.friend_requests;
create policy friend_requests_select_requester
  on public.friend_requests
  for select
  to authenticated
  using (requester_id = auth.uid());

drop policy if exists friend_requests_select_recipient on public.friend_requests;
create policy friend_requests_select_recipient
  on public.friend_requests
  for select
  to authenticated
  using (recipient_id = auth.uid());

drop policy if exists friend_requests_insert_requester on public.friend_requests;
create policy friend_requests_insert_requester
  on public.friend_requests
  for insert
  to authenticated
  with check (
    requester_id = auth.uid()
    and requester_id <> recipient_id
    and status = 'pending'
  );

drop policy if exists friend_requests_update_requester_cancel on public.friend_requests;
create policy friend_requests_update_requester_cancel
  on public.friend_requests
  for update
  to authenticated
  using (
    requester_id = auth.uid()
    and status = 'pending'
  )
  with check (
    requester_id = auth.uid()
    and recipient_id <> auth.uid()
    and status = 'canceled'
  );

drop policy if exists friend_requests_update_recipient_decision on public.friend_requests;
create policy friend_requests_update_recipient_decision
  on public.friend_requests
  for update
  to authenticated
  using (
    recipient_id = auth.uid()
    and status = 'pending'
  )
  with check (
    recipient_id = auth.uid()
    and status in ('accepted', 'declined')
  );

drop policy if exists friends_select_owner on public.friends;
create policy friends_select_owner
  on public.friends
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.rpc_send_friend_request(recipient_id uuid, note text default null)
returns table(request_id uuid, status text, friend_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  existing_pending uuid;
  reverse_pending_id uuid;
begin
  if caller is null then
    raise exception 'unauthorized';
  end if;

  if recipient_id is null or recipient_id = caller then
    raise exception 'invalid_recipient';
  end if;

  if not exists (select 1 from auth.users u where u.id = recipient_id) then
    raise exception 'user_not_found';
  end if;

  if exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = caller and b.blocked_id = recipient_id)
       or (b.blocker_id = recipient_id and b.blocked_id = caller)
  ) then
    raise exception 'blocked';
  end if;

  if exists (
    select 1
    from public.friends f
    where f.user_id = caller
      and f.friend_id = recipient_id
  ) then
    return query select null::uuid, 'already_friends'::text, recipient_id;
    return;
  end if;

  select fr.id
    into existing_pending
    from public.friend_requests fr
    where fr.requester_id = caller
      and fr.recipient_id = recipient_id
      and fr.status = 'pending'
    limit 1;

  if existing_pending is not null then
    return query select existing_pending, 'pending'::text, null::uuid;
    return;
  end if;

  select fr.id
    into reverse_pending_id
    from public.friend_requests fr
    where fr.requester_id = recipient_id
      and fr.recipient_id = caller
      and fr.status = 'pending'
    limit 1;

  if reverse_pending_id is not null then
    update public.friend_requests fr
       set status = 'accepted',
           updated_at = now()
     where fr.id = reverse_pending_id
       and fr.status = 'pending';

    insert into public.friends (user_id, friend_id)
    values (caller, recipient_id), (recipient_id, caller)
    on conflict (user_id, friend_id) do nothing;

    return query select reverse_pending_id, 'accepted'::text, recipient_id;
    return;
  end if;

  insert into public.friend_requests (requester_id, recipient_id, status, message)
  values (caller, recipient_id, 'pending', nullif(btrim(coalesce(note, '')), ''))
  returning id into request_id;

  status := 'pending';
  friend_id := null;
  return next;
end;
$$;

grant execute on function public.rpc_send_friend_request(uuid, text) to authenticated;

create or replace function public.rpc_accept_friend_request(request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  requester uuid;
  recipient uuid;
begin
  if caller is null then
    raise exception 'unauthorized';
  end if;

  select fr.requester_id, fr.recipient_id
    into requester, recipient
    from public.friend_requests fr
    where fr.id = request_id
      and fr.status = 'pending'
    limit 1;

  if requester is null then
    raise exception 'request_not_found';
  end if;

  if recipient <> caller then
    raise exception 'forbidden';
  end if;

  if exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = caller and b.blocked_id = requester)
       or (b.blocker_id = requester and b.blocked_id = caller)
  ) then
    raise exception 'blocked';
  end if;

  update public.friend_requests fr
     set status = 'accepted',
         updated_at = now()
   where fr.id = request_id
     and fr.status = 'pending';

  insert into public.friends (user_id, friend_id)
  values (caller, requester), (requester, caller)
  on conflict (user_id, friend_id) do nothing;

  return requester;
end;
$$;

grant execute on function public.rpc_accept_friend_request(uuid) to authenticated;

create or replace function public.rpc_decline_friend_request(request_id uuid)
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

  update public.friend_requests fr
     set status = 'declined',
         updated_at = now()
   where fr.id = request_id
     and fr.recipient_id = caller
     and fr.status = 'pending';

  if not found then
    raise exception 'request_not_found';
  end if;
end;
$$;

grant execute on function public.rpc_decline_friend_request(uuid) to authenticated;

create or replace function public.rpc_cancel_friend_request(request_id uuid)
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

  update public.friend_requests fr
     set status = 'canceled',
         updated_at = now()
   where fr.id = request_id
     and fr.requester_id = caller
     and fr.status = 'pending';

  if not found then
    raise exception 'request_not_found';
  end if;
end;
$$;

grant execute on function public.rpc_cancel_friend_request(uuid) to authenticated;

create or replace function public.rpc_unfriend(p_friend_id uuid)
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

  if p_friend_id is null or p_friend_id = caller then
    raise exception 'invalid_friend';
  end if;

  delete from public.friends f
   where (f.user_id = caller and f.friend_id = p_friend_id)
      or (f.user_id = p_friend_id and f.friend_id = caller);
end;
$$;

grant execute on function public.rpc_unfriend(uuid) to authenticated;
