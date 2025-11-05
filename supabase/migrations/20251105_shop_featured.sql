alter table public.shop_items
  add column if not exists featured boolean not null default false,
  add column if not exists featured_sort int default 100,
  add column if not exists badge text;

update public.shop_items
set featured = true, featured_sort = 10, badge = '20% OFF'
where slug = 'radiant-shard-pack';

update public.shop_items
set featured = true, featured_sort = 20
where slug = 'tiles-run-skin-nebula';
