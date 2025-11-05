create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('credit','debit')),
  amount int not null check (amount <> 0),
  source text not null,
  ref_id text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

create policy "wallet_transactions read own"
on public.wallet_transactions
for select
using (user_id = auth.uid());

create or replace function public.credit_wallet(
  p_user uuid,
  p_amount int,
  p_source text,
  p_ref text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  insert into public.user_wallets (user_id)
  values (p_user)
  on conflict (user_id) do nothing;

  update public.user_wallets
     set shards = shards + p_amount
   where user_id = p_user;

  insert into public.wallet_transactions (user_id, kind, amount, source, ref_id, meta)
  values (p_user, 'credit', p_amount, p_source, p_ref, coalesce(p_meta, '{}'::jsonb));
end;
$$;

grant execute on function public.credit_wallet(uuid, int, text, text, jsonb) to authenticated;
