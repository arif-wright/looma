-- Preserve existing rests when a slot is cleared. Account/companion deletion
-- retains its existing lifecycle; this change only decouples slot removal.
alter table public.sanctuary_interactions
  alter column placement_id drop not null,
  drop constraint sanctuary_interactions_placement_id_fkey,
  add constraint sanctuary_interactions_placement_id_fkey
    foreign key (placement_id) references public.sanctuary_placements(id) on delete set null;

-- Nullable only for legacy placements: historical acquisition identity cannot
-- be reconstructed reliably from a catalog ID or today's inventory.
alter table public.sanctuary_placements
  add column user_item_id uuid references public.user_items(id) on delete restrict;
create index sanctuary_placements_user_item_idx on public.sanctuary_placements(user_item_id);

-- These are historical snapshots, intentionally not foreign keys to mutable
-- inventory/slots. Do not backfill them from today's placement: slots are reused.
alter table public.sanctuary_interactions
  add column user_item_id uuid,
  add column placement_snapshot_id uuid,
  add column slot_key_snapshot text,
  add column acquisition_snapshot jsonb;

create function public.validate_sanctuary_owned_placement()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  owned public.user_items%rowtype;
  candidates uuid[];
  used_count integer;
begin
  if auth.uid() is null or new.owner_id <> auth.uid() then
    raise exception 'placement_owner_required' using errcode = '42501';
  end if;
  if new.companion_id is not null and not exists (
    select 1 from public.companions c where c.id = new.companion_id and c.owner_id = new.owner_id
  ) then
    raise exception 'placement_companion_not_owned' using errcode = '42501';
  end if;

  -- Serialize capacity checks for this owner's catalog item, including legacy
  -- placements. Advisory lock collisions only serialize unrelated writes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text || ':' || new.item_id::text, 0));
  if new.user_item_id is null then
    -- Old clients may send a catalog ID. Resolve only a single owned record;
    -- multiple acquisitions must be explicitly selected, never guessed.
    select array_agg(u.id) into candidates from public.user_items u
      where u.owner_id = new.owner_id and u.item_id = new.item_id;
    if coalesce(array_length(candidates, 1), 0) <> 1 then
      raise exception 'owned_item_selection_required' using errcode = '23514';
    end if;
    new.user_item_id := candidates[1];
  end if;
  select * into owned from public.user_items u
    where u.id = new.user_item_id and u.owner_id = new.owner_id and u.item_id = new.item_id;
  if not found or not exists (
    select 1 from public.item_catalog i where i.id = owned.item_id and 'placeable' = any(i.capabilities)
  ) then
    raise exception 'item_not_placeable' using errcode = '23514';
  end if;
  -- Unattributed legacy placements reserve capacity conservatively until the
  -- player clears/reselects them. No acquisition provenance is invented.
  select count(*) into used_count from public.sanctuary_placements p
    where p.owner_id = new.owner_id and p.item_id = new.item_id
      and p.id <> new.id and p.slot_key <> new.slot_key
      and (p.user_item_id = owned.id or p.user_item_id is null);
  if used_count >= owned.quantity then
    raise exception 'item_quantity_exhausted' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger sanctuary_validate_owned_placement
  before insert or update of owner_id, item_id, user_item_id, slot_key on public.sanctuary_placements
  for each row execute function public.validate_sanctuary_owned_placement();

create function public.snapshot_sanctuary_interaction_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  placed public.sanctuary_placements%rowtype;
  owned public.user_items%rowtype;
begin
  if auth.uid() is null or new.owner_id <> auth.uid() or not exists (
    select 1 from public.companions c where c.id = new.companion_id and c.owner_id = new.owner_id
  ) then
    raise exception 'interaction_owner_required' using errcode = '42501';
  end if;
  -- Hold the slot stable until this insertion commits. A concurrent removal
  -- then nulls the live link without deleting the historical snapshot.
  select * into placed from public.sanctuary_placements p
    where p.id = new.placement_id and p.owner_id = new.owner_id and p.item_id = new.item_id
    for share;
  if not found then
    raise exception 'interaction_placement_required' using errcode = '23514';
  end if;
  new.placement_snapshot_id := placed.id;
  new.slot_key_snapshot := placed.slot_key;
  new.user_item_id := placed.user_item_id;
  new.acquisition_snapshot := null;
  if placed.user_item_id is not null then
    select * into owned from public.user_items u
      where u.id = placed.user_item_id and u.owner_id = new.owner_id and u.item_id = new.item_id;
    if not found then
      raise exception 'interaction_item_not_owned' using errcode = '23514';
    end if;
    new.acquisition_snapshot := jsonb_build_object(
      'sourceType', owned.source_type, 'sourceKey', owned.source_key,
      'provenance', owned.provenance_json, 'acquiredAt', owned.acquired_at,
      'companionId', owned.companion_id
    );
  end if;
  return new;
end;
$$;
create trigger sanctuary_snapshot_interaction_item
  before insert on public.sanctuary_interactions
  for each row execute function public.snapshot_sanctuary_interaction_item();
