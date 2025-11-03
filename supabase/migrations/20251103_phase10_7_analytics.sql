-- Phase 10.7 — Analytics & Anti-Cheat Telemetry

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  session_id uuid,
  game_id uuid references public.game_titles(id) on delete set null,
  score integer,
  duration_ms integer,
  amount bigint,
  currency text,
  meta jsonb not null default '{}'::jsonb,
  ip inet,
  ua text,
  inserted_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

drop policy if exists "own events read" on public.analytics_events;
create policy "own events read" on public.analytics_events
  for select to authenticated
  using (user_id = auth.uid());

alter table if exists public.analytics_events
  add column if not exists kind text,
  add column if not exists session_id uuid,
  add column if not exists game_id uuid references public.game_titles(id) on delete set null,
  add column if not exists score integer,
  add column if not exists duration_ms integer,
  add column if not exists amount bigint,
  add column if not exists currency text,
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists ip inet,
  add column if not exists ua text,
  add column if not exists inserted_at timestamptz not null default now();

update public.analytics_events
set kind = coalesce(kind, 'unknown')
where kind is null;

create index if not exists ae_kind_idx on public.analytics_events(kind);
create index if not exists ae_inserted_idx on public.analytics_events(inserted_at desc);
create index if not exists ae_game_idx on public.analytics_events(game_id);

create table if not exists public.anomalies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  type text not null,
  severity int not null default 1,
  details jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.anomalies enable row level security;

drop policy if exists "own anomalies read" on public.anomalies;
create policy "own anomalies read" on public.anomalies
  for select to authenticated
  using (user_id = auth.uid());

create unique index if not exists anomalies_session_type_idx on public.anomalies(session_id, type);

create materialized view if not exists public.mv_game_funnels as
select
  gt.slug,
  date_trunc('day', ae.inserted_at at time zone 'UTC') as day_utc,
  count(*) filter (where ae.kind = 'game_start') as starts,
  count(*) filter (where ae.kind = 'game_complete') as completes
from public.analytics_events ae
left join public.game_titles gt on gt.id = ae.game_id
group by gt.slug, date_trunc('day', ae.inserted_at at time zone 'UTC');

create materialized view if not exists public.mv_score_dist as
select
  ae.game_id,
  width_bucket(coalesce(ae.score, 0), 0, 200000, 20) as bucket,
  count(*) as n
from public.analytics_events ae
where ae.kind = 'game_complete'
group by ae.game_id, width_bucket(coalesce(ae.score, 0), 0, 200000, 20);

create unique index if not exists mv_game_funnels_idx on public.mv_game_funnels(slug, day_utc);
create unique index if not exists mv_score_dist_idx on public.mv_score_dist(game_id, bucket);

drop function if exists public.fn_analytics_refresh();
create or replace function public.fn_analytics_refresh()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.mv_game_funnels;
  refresh materialized view concurrently public.mv_score_dist;
end;
$$;
