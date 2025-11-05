create type shop_item_type as enum ('cosmetic','boost','bundle','token','other');
create type shop_rarity as enum ('common','uncommon','rare','epic','legendary','mythic');

create table if not exists public.shop_items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  description text,
  type shop_item_type not null,
  rarity shop_rarity not null default 'common',
  price_shards int not null check (price_shards >= 0),
  image_url text not null,
  tags text[] default '{}',
  sort int default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace view public.shop_items_view as
  select id, slug, title, subtitle, description, type, rarity,
         price_shards, image_url, tags, sort, active, created_at
  from public.shop_items;

alter table public.shop_items enable row level security;

create policy "shop read public"
on public.shop_items
for select
to anon, authenticated
using (active = true);

insert into public.shop_items
  (slug,title,subtitle,description,type,rarity,price_shards,image_url,tags,sort,active)
values
  ('radiant-shard-pack','Radiant Shard Pack','5x premium shards','Bundle of radiant currency','bundle','rare',200,'/games/tiles-run/cover-640.webp','{boost,limited}',10,true),
  ('tiles-run-skin-nebula','Tiles Run – Nebula Skin','Color-burst cosmetic','Reactive prism trail for Tiles Run','cosmetic','epic',120,'/games/tiles-run/cover-512.webp','{tiles-run,cosmetic}',20,true),
  ('double-xp-30m','Double XP (30m)','Stackable boost','Doubles XP gain for 30 minutes','boost','uncommon',90,'/games/tiles-run/cover-640.webp','{boost}',30,true),
  ('avatar-frame-prism','Avatar Frame — Prism','Reactive glow','Profile frame that pulses to your level','cosmetic','legendary',260,'/games/tiles-run/cover-512.webp','{profile,cosmetic}',40,true);
