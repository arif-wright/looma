alter table public.shop_items
  add column if not exists stackable boolean not null default true;

drop view if exists public.shop_items_view;

create view public.shop_items_view as
  select id,
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
         created_at,
         stackable
    from public.shop_items;

alter table public.shop_inventory
  add column if not exists stackable boolean not null default true;

update public.shop_inventory inv
set stackable = s.stackable
from public.shop_items s
where inv.item_id = s.id;

with duplicates as (
  select id
  from (
    select inv.id,
           row_number() over (partition by inv.user_id, inv.item_id order by inv.acquired_at, inv.id) as rn
      from public.shop_inventory inv
      where inv.stackable = false
  ) ranked
  where ranked.rn > 1
)
delete from public.shop_inventory
where id in (select id from duplicates);

create unique index if not exists uq_inventory_nonstackable
  on public.shop_inventory (user_id, item_id)
  where stackable = false;
