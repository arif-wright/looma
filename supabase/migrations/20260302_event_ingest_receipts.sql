create table if not exists public.event_ingest_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, event_type, idempotency_key)
);

create index if not exists event_ingest_receipts_created_idx
  on public.event_ingest_receipts (created_at desc);

alter table public.event_ingest_receipts enable row level security;

drop policy if exists event_ingest_receipts_no_direct_access on public.event_ingest_receipts;
create policy event_ingest_receipts_no_direct_access
  on public.event_ingest_receipts
  for all
  to authenticated
  using (false)
  with check (false);

revoke all on table public.event_ingest_receipts from public, authenticated;
