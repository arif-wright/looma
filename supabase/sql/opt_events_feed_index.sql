create index if not exists events_public_created_idx
  on public.events (is_public, created_at desc);
