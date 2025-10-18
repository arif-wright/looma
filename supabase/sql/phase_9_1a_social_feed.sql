-- 1.1 Add "is_public" to events (safe if already present)
alter table if exists public.events
  add column if not exists is_public boolean not null default false;

-- 1.2 Upgrade emit_event to accept is_public flag (idempotent signature change)
create or replace function public.emit_event(
  p_user uuid,
  p_type text,
  p_message text,
  p_meta jsonb default '{}'::jsonb,
  p_is_public boolean default false
) returns void language plpgsql as $$
begin
  insert into public.events (user_id, type, message, meta, is_public)
  values (p_user, p_type, p_message, coalesce(p_meta, '{}'::jsonb), coalesce(p_is_public,false));
end$$;

-- 1.3 Public feed RPC (SECURITY DEFINER) to bypass RLS but only for public events
drop function if exists public.get_public_feed(int);
create or replace function public.get_public_feed(p_limit int default 20)
returns table(
  id uuid,
  created_at timestamptz,
  type text,
  message text,
  meta jsonb,
  is_public boolean,
  user_id uuid,
  display_name text
) language sql
security definer
set search_path = public
as $$
  select e.id, e.created_at, e.type, e.message, e.meta, e.is_public, e.user_id,
         (select display_name from public.profiles p where p.id = e.user_id) as display_name
  from public.events e
  where e.is_public = true
  order by e.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

grant execute on function public.get_public_feed(int) to anon, authenticated;

-- 1.4 Energy transfers table + trigger to emit event to recipient (private)
create table if not exists public.energy_transfers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  amount integer not null default 1 check (amount > 0 and amount <= 10),
  created_at timestamptz not null default now()
);

alter table public.energy_transfers enable row level security;

drop policy if exists "et: sender insert" on public.energy_transfers;
create policy "et: sender insert"
on public.energy_transfers for insert
  to authenticated
  with check (auth.uid() = from_user);

drop policy if exists "et: read own" on public.energy_transfers;
create policy "et: read own"
on public.energy_transfers for select
  to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

-- 1.5 Trigger: on insert, emit a recipient event (not public)
drop function if exists public.on_energy_transfer_insert() cascade;
create or replace function public.on_energy_transfer_insert()
returns trigger language plpgsql as $$
begin
  perform public.emit_event(
    new.to_user,
    'energy_received',
    'Received ' || new.amount || ' energy',
    jsonb_build_object('from_user', new.from_user, 'amount', new.amount),
    false
  );
  return new;
end$$;

drop trigger if exists trg_energy_transfer_insert on public.energy_transfers;
create trigger trg_energy_transfer_insert
  after insert on public.energy_transfers
  for each row
  execute function public.on_energy_transfer_insert();
