-- Phase 10.3 — Leaderboard foundations

create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.game_titles(id) on delete cascade,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  score integer not null check (score >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  inserted_at timestamptz not null default now()
);

create unique index if not exists game_scores_session_unique on public.game_scores(session_id);

alter table public.game_scores enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'game_scores' and policyname = 'read own scores'
  ) then
    execute 'create policy "read own scores" on public.game_scores for select to authenticated using (user_id = auth.uid())';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'game_scores' and policyname = 'insert via server only'
  ) then
    execute 'create policy "insert via server only" on public.game_scores for insert to service_role with check (true)';
  end if;
end;
$$;

create materialized view if not exists public.mv_leader_alltime as
with best as (
  select game_id, user_id, max(score) as best_score
  from public.game_scores
  group by game_id, user_id
)
select
  best.game_id,
  best.user_id,
  best.best_score,
  (
    select min(gs.inserted_at)
    from public.game_scores gs
    where gs.game_id = best.game_id
      and gs.user_id = best.user_id
      and gs.score = best.best_score
  ) as achieved_at
from best;

create unique index if not exists mv_leader_alltime_idx on public.mv_leader_alltime(game_id, user_id);

create materialized view if not exists public.mv_leader_daily as
select
  game_id,
  user_id,
  date_trunc('day', inserted_at at time zone 'UTC') as day_utc,
  max(score) as best_score
from public.game_scores
group by game_id, user_id, date_trunc('day', inserted_at at time zone 'UTC');

create unique index if not exists mv_leader_daily_idx on public.mv_leader_daily(game_id, user_id, day_utc);

create materialized view if not exists public.mv_leader_weekly as
select
  game_id,
  user_id,
  date_trunc('week', inserted_at at time zone 'UTC') as week_utc,
  max(score) as best_score
from public.game_scores
group by game_id, user_id, date_trunc('week', inserted_at at time zone 'UTC');

create unique index if not exists mv_leader_weekly_idx on public.mv_leader_weekly(game_id, user_id, week_utc);

create or replace function public.fn_leader_refresh(p_scope text)
returns void
language plpgsql
security definer
as $$
begin
  if p_scope = 'all' or p_scope = 'alltime' then
    refresh materialized view concurrently public.mv_leader_alltime;
  end if;
  if p_scope = 'all' or p_scope = 'daily' then
    refresh materialized view concurrently public.mv_leader_daily;
  end if;
  if p_scope = 'all' or p_scope = 'weekly' then
    refresh materialized view concurrently public.mv_leader_weekly;
  end if;
end;
$$;

create or replace function public.fn_leader_fetch_alltime(
  p_game uuid,
  p_limit integer,
  p_offset integer
)
returns table (rank integer, user_id uuid, best_score integer, achieved_at timestamptz)
language sql
stable
as $$
  with ranked as (
    select
      dense_rank() over (order by best_score desc, achieved_at asc) as rnk,
      row_number() over (order by best_score desc, achieved_at asc) as rn,
      user_id,
      best_score,
      achieved_at
    from public.mv_leader_alltime
    where game_id = p_game
  )
  select rnk, user_id, best_score, achieved_at
  from ranked
  where rn > coalesce(p_offset, 0)
  order by rn
  limit coalesce(p_limit, 25);
$$;

create or replace function public.fn_leader_fetch_daily(
  p_game uuid,
  p_limit integer,
  p_offset integer
)
returns table (rank integer, user_id uuid, best_score integer, period_start timestamp without time zone)
language sql
stable
as $$
  with ranked as (
    select
      dense_rank() over (order by best_score desc) as rnk,
      row_number() over (order by best_score desc) as rn,
      user_id,
      best_score,
      day_utc
    from public.mv_leader_daily
    where game_id = p_game
      and day_utc = date_trunc('day', now() at time zone 'UTC')
  )
  select rnk, user_id, best_score, day_utc
  from ranked
  where rn > coalesce(p_offset, 0)
  order by rn
  limit coalesce(p_limit, 25);
$$;

create or replace function public.fn_leader_fetch_weekly(
  p_game uuid,
  p_limit integer,
  p_offset integer
)
returns table (rank integer, user_id uuid, best_score integer, period_start timestamp without time zone)
language sql
stable
as $$
  with ranked as (
    select
      dense_rank() over (order by best_score desc) as rnk,
      row_number() over (order by best_score desc) as rn,
      user_id,
      best_score,
      week_utc
    from public.mv_leader_weekly
    where game_id = p_game
      and week_utc = date_trunc('week', now() at time zone 'UTC')
  )
  select rnk, user_id, best_score, week_utc
  from ranked
  where rn > coalesce(p_offset, 0)
  order by rn
  limit coalesce(p_limit, 25);
$$;

create or replace function public.fn_leader_count_alltime(p_game uuid)
returns integer
language sql
stable
as $$
  select count(*) from public.mv_leader_alltime where game_id = p_game;
$$;

create or replace function public.fn_leader_count_daily(p_game uuid)
returns integer
language sql
stable
as $$
  select count(*)
  from public.mv_leader_daily
  where game_id = p_game
    and day_utc = date_trunc('day', now() at time zone 'UTC');
$$;

create or replace function public.fn_leader_count_weekly(p_game uuid)
returns integer
language sql
stable
as $$
  select count(*)
  from public.mv_leader_weekly
  where game_id = p_game
    and week_utc = date_trunc('week', now() at time zone 'UTC');
$$;
