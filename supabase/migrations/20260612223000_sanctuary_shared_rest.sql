create table if not exists public.sanctuary_interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  companion_id uuid not null references public.companions(id) on delete cascade,
  placement_id uuid not null references public.sanctuary_placements(id) on delete cascade,
  item_id uuid not null references public.item_catalog(id) on delete restrict,
  action text not null,
  response_text text not null default '',
  energy_before int not null check (energy_before between 0 and 100),
  energy_after int not null check (energy_after between 0 and 100),
  created_at timestamptz not null default now(),
  constraint sanctuary_interactions_action_check
    check (action in ('shared_rest'))
);

create index if not exists sanctuary_interactions_owner_idx
  on public.sanctuary_interactions (owner_id, created_at desc);

create index if not exists sanctuary_interactions_companion_idx
  on public.sanctuary_interactions (companion_id, created_at desc);

alter table public.sanctuary_interactions enable row level security;

drop policy if exists sanctuary_interactions_owner_select on public.sanctuary_interactions;
create policy sanctuary_interactions_owner_select
  on public.sanctuary_interactions
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists sanctuary_interactions_owner_insert on public.sanctuary_interactions;
create policy sanctuary_interactions_owner_insert
  on public.sanctuary_interactions
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.companions
      where id = companion_id and owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.sanctuary_placements
      where id = placement_id
        and owner_id = auth.uid()
        and item_id = sanctuary_interactions.item_id
    )
  );

alter table public.companion_care_events
  drop constraint if exists companion_care_events_action_check;

alter table public.companion_care_events
  add constraint companion_care_events_action_check
  check (action in ('feed', 'play', 'groom', 'passive', 'daily_bonus', 'system', 'sanctuary_rest'));
