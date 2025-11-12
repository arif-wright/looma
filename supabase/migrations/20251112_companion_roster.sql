-- Phase 13.3 — Companion roster core schema

-- Add roster fields to companions
alter table if exists public.companions
  add column if not exists is_active boolean not null default false,
  add column if not exists slot_index int,
  add column if not exists state text not null default 'idle';

-- Ensure only one active companion per owner
drop index if exists companions_one_active_per_owner;
create unique index companions_one_active_per_owner
  on public.companions (owner_id)
  where is_active = true;

-- Backfill slot ordering for existing companions (0-based)
do $$
begin
  update public.companions c
     set slot_index = ordered.slot_pos
    from (
      select id,
             row_number() over (partition by owner_id order by slot_index nulls last, created_at) - 1 as slot_pos
        from public.companions
    ) as ordered
   where c.id = ordered.id
     and (c.slot_index is distinct from ordered.slot_pos);
end;
$$;

-- Player slot allowances
create table if not exists public.player_companion_slots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  max_slots int not null default 3,
  updated_at timestamptz not null default now()
);

alter table public.player_companion_slots enable row level security;

drop policy if exists "slots_owner_read" on public.player_companion_slots;
create policy "slots_owner_read" on public.player_companion_slots
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "slots_owner_upd" on public.player_companion_slots;
create policy "slots_owner_upd" on public.player_companion_slots
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "slots_owner_mod" on public.player_companion_slots;
create policy "slots_owner_mod" on public.player_companion_slots
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
