-- Phase 10.0 — Mini-game platform schema

-- Core tables
create table if not exists public.game_titles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  min_version text default '1.0.0',
  max_score integer default 100000,
  is_active boolean default true,
  inserted_at timestamptz default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.game_titles(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  score integer default 0,
  status text not null default 'started', -- started|completed|aborted|invalid
  nonce text not null,
  client_ver text,
  inserted_at timestamptz default now()
);

create table if not exists public.game_rewards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  currency_delta integer default 0,
  xp_delta integer default 0,
  item_id uuid,
  meta jsonb default '{}'::jsonb,
  inserted_at timestamptz default now()
);

create table if not exists public.game_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  amount integer not null,
  currency text default 'shards',
  meta jsonb default '{}'::jsonb,
  inserted_at timestamptz default now()
);

insert into public.game_titles (slug, name, min_version, max_score)
values ('tiles-run', 'Tiles Run', '1.0.0', 200000)
on conflict (slug) do nothing;

-- Policies
alter table public.game_titles enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_rewards enable row level security;
alter table public.game_grants  enable row level security;

create policy "read active games"
on public.game_titles for select
to authenticated
using (is_active = true);

create policy "own session"
on public.game_sessions for select
to authenticated
using (user_id = auth.uid());

create policy "own rewards"
on public.game_rewards for select
to authenticated
using (
  session_id in (
    select id from public.game_sessions where user_id = auth.uid()
  )
);

create policy "own grants"
on public.game_grants for select
to authenticated
using (user_id = auth.uid());

-- RPC to start session (returns nonce)
create or replace function public.fn_game_start(p_slug text)
returns table(session_id uuid, nonce text)
language plpgsql
security definer as $$
declare
  v_game_id uuid;
  v_nonce text;
begin
  select id into v_game_id from public.game_titles where slug = p_slug and is_active = true;
  if v_game_id is null then
    raise exception 'Game not available';
  end if;
  v_nonce := encode(gen_random_bytes(16), 'hex');
  insert into public.game_sessions(user_id, game_id, nonce)
  values (auth.uid(), v_game_id, v_nonce)
  returning id into session_id;
  nonce := v_nonce;
  return next;
end;
$$;

-- RPC to complete session (server checks to be done in API layer)
create or replace function public.fn_game_complete(p_session uuid, p_score int, p_duration_ms int)
returns void
language sql
security definer as $$
  update public.game_sessions
     set completed_at = now(),
         duration_ms = p_duration_ms,
         score = p_score,
         status = 'completed'
   where id = p_session and user_id = auth.uid();
$$;
