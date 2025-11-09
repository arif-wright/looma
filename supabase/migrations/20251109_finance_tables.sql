create table if not exists public.stripe_payments (
  id text primary key,
  amount integer not null,
  currency text not null default 'usd',
  status text not null,
  brand text,
  last4 text,
  created_at timestamptz not null,
  raw jsonb
);
alter table public.stripe_payments enable row level security;

create policy "nobody_reads_stripe" on public.stripe_payments
for select to authenticated
using (false);

create or replace function public.stripe_payments_summary(window_start timestamptz)
returns table(total_cents bigint, payment_count bigint)
language sql
stable
as $$
  select coalesce(sum(amount), 0)::bigint as total_cents,
         count(*)::bigint as payment_count
  from public.stripe_payments
  where created_at >= window_start;
$$;
