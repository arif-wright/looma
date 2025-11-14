-- Phase 13.3-I — Slot license consumable + unlock RPC

-- Ensure the slot-license catalog item exists (idempotent)
insert into public.shop_items (
  slug,
  title,
  subtitle,
  description,
  type,
  rarity,
  price_shards,
  image_url,
  tags,
  sort,
  active,
  stackable
)
values (
  'slot-license',
  'Companion Slot License',
  'Expand your roster',
  'Consume to permanently unlock an additional companion slot.',
  'token',
  'rare',
  500,
  '/shop/items/slot-license.png',
  array['companions','license'],
  25,
  true,
  true
)
on conflict (slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  description = excluded.description,
  rarity = excluded.rarity,
  price_shards = excluded.price_shards,
  image_url = excluded.image_url,
  tags = excluded.tags,
  sort = excluded.sort,
  active = true,
  stackable = true;

-- Quick view of license inventory counts per user
create or replace view public.v_inventory_slot_license as
select
  inv.user_id,
  count(inv.id)::int as qty
from public.shop_inventory inv
join public.shop_items item on item.id = inv.item_id
where item.slug = 'slot-license'
group by inv.user_id;

-- Consume one license atomically and unlock a slot
create or replace function public.consume_slot_license_and_unlock()
returns table(max_slots int)
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  license_item_id uuid;
  inventory_row_id uuid;
  new_max int;
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  select id
    into license_item_id
  from public.shop_items
  where slug = 'slot-license'
    and active = true
  limit 1;

  if license_item_id is null then
    raise exception 'license_unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtext('slot_license_' || u::text));

  select id
    into inventory_row_id
  from public.shop_inventory
  where user_id = u
    and item_id = license_item_id
  order by acquired_at asc nulls first, id asc
  limit 1
  for update;

  if inventory_row_id is null then
    raise exception 'no_license_in_inventory';
  end if;

  delete from public.shop_inventory
   where id = inventory_row_id;

  select slot_result.max_slots into new_max
  from public.unlock_companion_slot('license') as slot_result
  limit 1;

  if new_max is null then
    raise exception 'unlock_failed';
  end if;

  return query select new_max;
end;
$$;

grant execute on function public.consume_slot_license_and_unlock() to authenticated;
