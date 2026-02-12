create table if not exists public.companion_emotional_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  companion_id text not null,
  mood text not null default 'steady',
  trust numeric not null default 0,
  bond numeric not null default 0,
  streak_momentum numeric not null default 0,
  volatility numeric not null default 0,
  recent_tone text,
  last_milestone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companion_emotional_state_unique_user_companion'
  ) then
    alter table public.companion_emotional_state
      add constraint companion_emotional_state_unique_user_companion
      unique (user_id, companion_id);
  end if;
end
$$;

create index if not exists companion_emotional_state_user_idx
  on public.companion_emotional_state(user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companion_emotional_state_mood_check'
  ) then
    alter table public.companion_emotional_state
      add constraint companion_emotional_state_mood_check
      check (mood in ('steady', 'luminous', 'dim'));
  end if;
end
$$;

create or replace function public.set_companion_emotional_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_companion_emotional_state_set_updated_at on public.companion_emotional_state;
create trigger trg_companion_emotional_state_set_updated_at
  before update on public.companion_emotional_state
  for each row
  execute function public.set_companion_emotional_state_updated_at();

alter table public.companion_emotional_state enable row level security;

drop policy if exists companion_emotional_state_owner_select on public.companion_emotional_state;
create policy companion_emotional_state_owner_select
  on public.companion_emotional_state
  for select
  using (user_id = auth.uid());

drop policy if exists companion_emotional_state_owner_insert on public.companion_emotional_state;
create policy companion_emotional_state_owner_insert
  on public.companion_emotional_state
  for insert
  with check (user_id = auth.uid());

drop policy if exists companion_emotional_state_owner_update on public.companion_emotional_state;
create policy companion_emotional_state_owner_update
  on public.companion_emotional_state
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.fn_mission_complete_finalize_emotional(
  p_session_id uuid,
  p_user uuid,
  p_completed_at timestamptz,
  p_rewards_json jsonb,
  p_mission_type text,
  p_idempotency_key text default null,
  p_companion_id text default null,
  p_emotional_state jsonb default null
)
returns table(
  id uuid,
  mission_id uuid,
  user_id uuid,
  mission_type text,
  status text,
  cost_json jsonb,
  rewards_json jsonb,
  idempotency_key text,
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  update public.mission_sessions
     set mission_type = p_mission_type,
         status = 'completed',
         completed_at = p_completed_at,
         rewards = p_rewards_json,
         rewards_json = p_rewards_json,
         idempotency_key = coalesce(idempotency_key, p_idempotency_key)
   where id = p_session_id
     and user_id = p_user
     and status = 'active'
   returning
     mission_sessions.id,
     mission_sessions.mission_id,
     mission_sessions.user_id,
     mission_sessions.mission_type,
     mission_sessions.status,
     mission_sessions.cost_json,
     mission_sessions.rewards_json,
     mission_sessions.idempotency_key,
     mission_sessions.started_at,
     mission_sessions.completed_at
   into v_row;

  if p_companion_id is not null
     and btrim(p_companion_id) <> ''
     and p_emotional_state is not null
     and jsonb_typeof(p_emotional_state) = 'object'
  then
    insert into public.companion_emotional_state (
      user_id,
      companion_id,
      mood,
      trust,
      bond,
      streak_momentum,
      volatility,
      recent_tone,
      last_milestone_at
    )
    values (
      p_user,
      btrim(p_companion_id),
      coalesce(nullif(p_emotional_state ->> 'mood', ''), 'steady'),
      greatest(coalesce((p_emotional_state ->> 'trust')::numeric, 0), 0),
      greatest(coalesce((p_emotional_state ->> 'bond')::numeric, 0), 0),
      greatest(coalesce((p_emotional_state ->> 'streakMomentum')::numeric, 0), 0),
      greatest(coalesce((p_emotional_state ->> 'volatility')::numeric, 0), 0),
      nullif(p_emotional_state ->> 'recentTone', ''),
      (p_emotional_state ->> 'lastMilestoneAt')::timestamptz
    )
    on conflict (user_id, companion_id)
    do update
      set mood = excluded.mood,
          trust = excluded.trust,
          bond = excluded.bond,
          streak_momentum = excluded.streak_momentum,
          volatility = excluded.volatility,
          recent_tone = excluded.recent_tone,
          last_milestone_at = excluded.last_milestone_at,
          updated_at = now();
  end if;

  if v_row.id is null then
    return query
      select
        ms.id,
        ms.mission_id,
        ms.user_id,
        ms.mission_type,
        ms.status,
        ms.cost_json,
        ms.rewards_json,
        ms.idempotency_key,
        ms.started_at,
        ms.completed_at
      from public.mission_sessions ms
      where ms.id = p_session_id
        and ms.user_id = p_user
      limit 1;
    return;
  end if;

  return query
    select
      v_row.id::uuid,
      v_row.mission_id::uuid,
      v_row.user_id::uuid,
      v_row.mission_type::text,
      v_row.status::text,
      v_row.cost_json::jsonb,
      v_row.rewards_json::jsonb,
      v_row.idempotency_key::text,
      v_row.started_at::timestamptz,
      v_row.completed_at::timestamptz;
end;
$$;

grant execute on function public.fn_mission_complete_finalize_emotional(
  uuid,
  uuid,
  timestamptz,
  jsonb,
  text,
  text,
  text,
  jsonb
) to authenticated;
