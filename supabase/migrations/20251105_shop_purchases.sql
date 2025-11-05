-- Phase 11.2: wallets, orders, inventory, and purchase RPC

-- Wallet table tracks shard balance per user
create table if not exists public.user_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shards int not null default 1000 check (shards >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Orders capture the transaction record for each purchase
create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.shop_items(id) on delete restrict,
  slug text not null,
  price_shards int not null check (price_shards >= 0),
  created_at timestamptz not null default now()
);

-- Inventory records each acquired item per user
create table if not exists public.shop_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.shop_items(id) on delete restrict,
  stackable boolean not null default true,
  acquired_at timestamptz not null default now()
);

-- RLS policies
alter table public.user_wallets enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_inventory enable row level security;

create policy "wallet read own"
on public.user_wallets
for select
using (user_id = auth.uid());

create policy "wallet insert own"
on public.user_wallets
for insert
with check (user_id = auth.uid());

create policy "orders read own"
on public.shop_orders
for select using (user_id = auth.uid());

create policy "inventory read own"
on public.shop_inventory
for select using (user_id = auth.uid());

-- Trigger ensures wallet updated_at stays current
create or replace function public.touch_wallet_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_wallet_touch on public.user_wallets;
create trigger trg_wallet_touch
before update on public.user_wallets
for each row
execute function public.touch_wallet_updated_at();

-- Secure RPC for transactional purchases
create or replace function public.purchase_item(p_item_slug text)
returns table (order_id uuid, new_shards int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_item record;
  v_wallet record;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select id, slug, price_shards, active, stackable
    into v_item
  from public.shop_items
  where slug = p_item_slug;

  if v_item.id is null or v_item.active = false then
    raise exception 'Item not available';
  end if;

  if v_item.stackable = false then
    perform 1
      from public.shop_inventory
     where user_id = v_user
       and item_id = v_item.id;

    if found then
      raise exception 'Item already owned';
    end if;
  end if;

  -- ensure wallet row exists
  insert into public.user_wallets (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  -- lock wallet row for update
  select user_id, shards
    into v_wallet
  from public.user_wallets
  where user_id = v_user
  for update;

  if v_wallet.shards < v_item.price_shards then
    raise exception 'Insufficient shards';
  end if;

  -- deduct shards
  update public.user_wallets
     set shards = shards - v_item.price_shards
   where user_id = v_user;

  -- create order record
  insert into public.shop_orders (user_id, item_id, slug, price_shards)
  values (v_user, v_item.id, v_item.slug, v_item.price_shards)
  returning id into order_id;

  -- grant inventory item
  insert into public.shop_inventory (user_id, item_id, stackable)
  values (v_user, v_item.id, v_item.stackable);

  -- fetch updated wallet balance
  select shards
    into new_shards
  from public.user_wallets
  where user_id = v_user;

  return next;
  return;
end;
$$;

grant execute on function public.purchase_item(text) to authenticated;
