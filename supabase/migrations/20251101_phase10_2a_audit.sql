-- Phase 10.2A — Game audit trail

create table if not exists public.game_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  ip inet,
  session_id uuid,
  event text not null,
  details jsonb default '{}'::jsonb,
  inserted_at timestamptz default now()
);

alter table public.game_audit enable row level security;

create policy "own audit read"
  on public.game_audit for select
  to authenticated
  using (user_id = auth.uid());

create index if not exists game_audit_user_idx on public.game_audit (user_id, inserted_at desc);
create index if not exists game_audit_session_idx on public.game_audit (session_id, inserted_at desc);
