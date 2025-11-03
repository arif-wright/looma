-- Phase 10.6 — Wallet & Economy ledger

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'shards',
  balance bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_tx (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('grant','spend','adjust')),
  source text not null,
  amount bigint not null,
  currency text not null default 'shards',
  ref_id uuid,
  meta jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now()
);

alter table public.wallets enable row level security;
alter table public.wallet_tx enable row level security;

drop policy if exists "own wallet" on public.wallets;
create policy "own wallet" on public.wallets
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own tx read" on public.wallet_tx;
create policy "own tx read" on public.wallet_tx
  for select to authenticated
  using (user_id = auth.uid());

create index if not exists wallet_tx_user_inserted_idx
  on public.wallet_tx (user_id, inserted_at desc);

create index if not exists wallet_tx_ref_idx
  on public.wallet_tx (ref_id) where ref_id is not null;

drop function if exists public.fn_wallet_grant(uuid, bigint, text, uuid, jsonb);
create or replace function public.fn_wallet_grant(
  p_user uuid,
  p_amount bigint,
  p_source text,
  p_ref uuid,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    raise exception 'user is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'grant amount must be positive';
  end if;

  insert into public.wallet_tx(user_id, kind, source, amount, ref_id, meta)
  values (p_user, 'grant', p_source, p_amount, p_ref, coalesce(p_meta, '{}'::jsonb));

  insert into public.wallets(user_id, balance)
  values (p_user, p_amount)
  on conflict (user_id)
  do update set
    balance = public.wallets.balance + excluded.balance,
    updated_at = now();
end;
$$;

drop function if exists public.fn_wallet_spend(uuid, bigint, text, uuid, jsonb);
create or replace function public.fn_wallet_spend(
  p_user uuid,
  p_amount bigint,
  p_source text,
  p_ref uuid,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  if p_user is null then
    raise exception 'user is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'spend amount must be positive';
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = p_user
  for update;

  if v_balance is null or v_balance < p_amount then
    raise exception 'insufficient funds';
  end if;

  insert into public.wallet_tx(user_id, kind, source, amount, ref_id, meta)
  values (p_user, 'spend', p_source, -p_amount, p_ref, coalesce(p_meta, '{}'::jsonb));

  update public.wallets
     set balance = balance - p_amount,
         updated_at = now()
   where user_id = p_user;
end;
$$;
