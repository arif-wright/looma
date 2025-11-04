-- Phase 11.0 — Shop Core (Catalog, Pricing, Purchases, Promos, History)

-- Products & variants
create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  rarity text not null default 'common',
  is_active boolean not null default true,
  inserted_at timestamptz not null default now()
);

create table if not exists public.shop_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products(id) on delete cascade,
  sku text unique not null,
  display_name text not null,
  icon text not null default 'cube',
  stackable boolean not null default true,
  max_stack int not null default 99,
  is_active boolean not null default true
);

-- Authoritative prices (current row wins by valid window)
create table if not exists public.shop_prices (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.shop_variants(id) on delete cascade,
  currency text not null default 'shards',
  unit_price bigint not null check (unit_price >= 0),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  check (valid_to is null or valid_to > valid_from)
);

create index if not exists shop_prices_active_idx
  on public.shop_prices(variant_id, valid_from, valid_to);

-- Promotions (percentage off; optional scope by rarity/sku)
create table if not exists public.shop_promotions (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  percent_off int not null check (percent_off between 1 and 90),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  sku text,
  rarity text,
  is_flash boolean not null default false,
  check (ends_at > starts_at)
);

-- Cooldowns / limits
create table if not exists public.shop_limits (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  per_user_daily int,
  per_user_weekly int,
  cooldown_sec int
);

create index if not exists shop_limits_sku_idx on public.shop_limits(sku);

-- Orders & items
create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total bigint not null,
  currency text not null default 'shards',
  status text not null default 'paid', -- paid|failed|refunded
  meta jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now()
);

create index if not exists shop_orders_user_idx on public.shop_orders(user_id, inserted_at desc);

create table if not exists public.shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  sku text not null,
  name text not null,
  qty int not null check (qty > 0),
  unit_price bigint not null,
  discount bigint not null default 0
);

create index if not exists shop_order_items_order_idx on public.shop_order_items(order_id);

-- Inventory (delivered goods)
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null,
  qty int not null default 0,
  unique (user_id, sku)
);

create index if not exists inventory_user_idx on public.inventory(user_id);

-- RLS
alter table public.shop_products enable row level security;
alter table public.shop_variants enable row level security;
alter table public.shop_prices enable row level security;
alter table public.shop_promotions enable row level security;
alter table public.shop_limits enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_items enable row level security;
alter table public.inventory enable row level security;

-- Read for everyone authenticated; write only via server role
drop policy if exists "read catalog" on public.shop_products;
create policy "read catalog" on public.shop_products for select to authenticated using (is_active);

drop policy if exists "read variants" on public.shop_variants;
create policy "read variants" on public.shop_variants for select to authenticated using (is_active);

drop policy if exists "read prices" on public.shop_prices;
create policy "read prices" on public.shop_prices for select to authenticated using (true);

drop policy if exists "read promos" on public.shop_promotions;
create policy "read promos" on public.shop_promotions for select to authenticated using (now() between starts_at and ends_at);

drop policy if exists "read limits" on public.shop_limits;
create policy "read limits" on public.shop_limits for select to authenticated using (true);

drop policy if exists "own orders" on public.shop_orders;
create policy "own orders" on public.shop_orders for select to authenticated using (user_id = auth.uid());

drop policy if exists "own order items" on public.shop_order_items;
create policy "own order items" on public.shop_order_items for select to authenticated using (
  order_id in (select id from public.shop_orders where user_id = auth.uid())
);

drop policy if exists "own inventory" on public.inventory;
create policy "own inventory" on public.inventory for select to authenticated using (user_id = auth.uid());

-- Seed catalog data
with upsert_products as (
  insert into public.shop_products (slug, name, description, rarity, is_active)
    values
      ('energy-refill', 'Energy Refill', 'Top up your mission energy instantly.', 'common', true),
      ('hyper-booster', 'Hyper Booster', 'Stackable boosts that amplify rewards.', 'rare', true),
      ('neon-cosmetic', 'Neon Cosmetic', 'Cosmetic variants to stand out in the plaza.', 'epic', true),
      ('loot-crate', 'Loot Crate', 'Grab bags packed with random rewards.', 'rare', true),
      ('xp-burst', 'XP Burst', 'Accelerate your progress for a limited time.', 'uncommon', true),
      ('emote-pack', 'Emote Pack', 'Unlock new emotes for social flexing.', 'common', true)
  on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    rarity = excluded.rarity,
    is_active = excluded.is_active
  returning id, slug
)
insert into public.shop_variants (product_id, sku, display_name, icon, stackable, max_stack, is_active)
select
  p.id,
  v.sku,
  v.display_name,
  v.icon,
  v.stackable,
  v.max_stack,
  v.is_active
from upsert_products p
join (
  values
    ('energy-refill', 'energy-refill-small', 'Energy Refill — Small', 'battery', true, 10, true),
    ('energy-refill', 'energy-refill-large', 'Energy Refill — Large', 'battery-charging', true, 5, true),
    ('hyper-booster', 'booster-charge', 'Booster Charge', 'zap', true, 5, true),
    ('hyper-booster', 'booster-ultra', 'Booster Ultra', 'zap-off', true, 3, true),
    ('neon-cosmetic', 'cosmetic-neon-trail', 'Neon Trail Cosmetic', 'sparkles', false, 1, true),
    ('neon-cosmetic', 'cosmetic-avatar-glow', 'Avatar Glow Cosmetic', 'sparkles', false, 1, true),
    ('loot-crate', 'loot-crate-standard', 'Standard Loot Crate', 'treasure-chest', true, 20, true),
    ('xp-burst', 'xp-burst-30m', 'XP Burst — 30m', 'timer', true, 10, true),
    ('xp-burst', 'xp-burst-2h', 'XP Burst — 2h', 'timer-reset', true, 5, true),
    ('emote-pack', 'emote-pack-hype', 'Hype Emote Pack', 'smile', false, 1, true)
) as v(slug, sku, display_name, icon, stackable, max_stack, is_active) on p.slug = v.slug
on conflict (sku) do update set
  product_id = excluded.product_id,
  display_name = excluded.display_name,
  icon = excluded.icon,
  stackable = excluded.stackable,
  max_stack = excluded.max_stack,
  is_active = excluded.is_active;

insert into public.shop_prices (variant_id, currency, unit_price, valid_from, valid_to)
select
  v.id,
  'shards',
  p.unit_price,
  coalesce(p.valid_from, now()),
  p.valid_to
from public.shop_variants v
join (
  values
    ('energy-refill-small', 60, now(), null),
    ('energy-refill-large', 140, now(), null),
    ('booster-charge', 220, now(), null),
    ('booster-ultra', 480, now(), null),
    ('cosmetic-neon-trail', 650, now(), null),
    ('cosmetic-avatar-glow', 900, now(), null),
    ('loot-crate-standard', 320, now(), null),
    ('xp-burst-30m', 150, now(), null),
    ('xp-burst-2h', 360, now(), null),
    ('emote-pack-hype', 250, now(), null)
) as p(sku, unit_price, valid_from, valid_to) on v.sku = p.sku
where not exists (
  select 1 from public.shop_prices sp where sp.variant_id = v.id and sp.valid_to is null
);

insert into public.shop_promotions (slug, name, percent_off, starts_at, ends_at, sku, rarity, is_flash)
values
  ('flash-energy-boost', 'Flash Energy Boost', 20, now() - interval '15 minutes', now() + interval '2 hours', 'energy-refill-large', null, true),
  ('rare-weekend', 'Rare Weekend', 10, now() - interval '1 day', now() + interval '2 days', null, 'rare', false),
  ('cosmetic-fanfare', 'Cosmetic Fanfare', 15, now() - interval '6 hours', now() + interval '18 hours', 'cosmetic-neon-trail', 'epic', false)
on conflict (slug) do update set
  name = excluded.name,
  percent_off = excluded.percent_off,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  sku = excluded.sku,
  rarity = excluded.rarity,
  is_flash = excluded.is_flash;

insert into public.shop_limits (sku, per_user_daily, per_user_weekly, cooldown_sec)
values
  ('energy-refill-small', 3, 10, 300),
  ('energy-refill-large', 2, 6, 900),
  ('loot-crate-standard', 1, 3, 3600),
  ('booster-ultra', 1, 2, 1800),
  ('emote-pack-hype', null, 1, 86400)
on conflict (sku) do update set
  per_user_daily = excluded.per_user_daily,
  per_user_weekly = excluded.per_user_weekly,
  cooldown_sec = excluded.cooldown_sec;
