-- Phase 10.2A — Per-game configuration caps

create table if not exists public.game_config (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.game_titles(id) on delete cascade,
  max_duration_ms integer default 600000,
  min_duration_ms integer default 10000,
  max_score_per_min integer default 8000,
  min_client_ver text default '1.0.0',
  inserted_at timestamptz default now()
);

create unique index if not exists game_config_game_id_idx on public.game_config (game_id);

alter table public.game_config enable row level security;

create policy "read game config"
on public.game_config for select
  to authenticated
  using (true);

insert into public.game_config (game_id, max_duration_ms, min_duration_ms, max_score_per_min, min_client_ver)
select id, 600000, 15000, 6000, '1.0.0'
from public.game_titles
where slug = 'tiles-run'
on conflict (game_id) do update
set max_duration_ms = excluded.max_duration_ms,
    min_duration_ms = excluded.min_duration_ms,
    max_score_per_min = excluded.max_score_per_min,
    min_client_ver = excluded.min_client_ver;
