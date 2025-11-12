-- Phase 13.2b — Companion Care Loop (actions, events, cooldowns)

-- ===============================================================
-- Care action log
-- ===============================================================
create table if not exists public.companion_care_events (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references public.companions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('feed', 'play', 'groom')),
  affection_delta int not null default 0,
  trust_delta int not null default 0,
  energy_delta int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists companion_care_events_companion_idx
  on public.companion_care_events (companion_id, created_at desc);

create index if not exists companion_care_events_owner_idx
  on public.companion_care_events (owner_id, created_at desc);

alter table public.companion_care_events enable row level security;

drop policy if exists "care_events_owner_read" on public.companion_care_events;
create policy "care_events_owner_read" on public.companion_care_events
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "care_events_owner_insert" on public.companion_care_events;
create policy "care_events_owner_insert" on public.companion_care_events
  for insert to authenticated
  with check (owner_id = auth.uid());

-- ===============================================================
-- Daily goal tracking
-- ===============================================================
create table if not exists public.companion_daily_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  action_date date not null default current_date,
  actions_count int not null default 0,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, action_date)
);

create index if not exists companion_daily_goals_owner_idx
  on public.companion_daily_goals (owner_id, action_date desc);

alter table public.companion_daily_goals enable row level security;

drop policy if exists "care_goals_owner_read" on public.companion_daily_goals;
create policy "care_goals_owner_read" on public.companion_daily_goals
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "care_goals_owner_write" on public.companion_daily_goals;
create policy "care_goals_owner_write" on public.companion_daily_goals
  for insert to authenticated
  with check (owner_id = auth.uid());

-- ===============================================================
-- Helpers
-- ===============================================================
drop function if exists public.care_action(uuid, text);

-- ===============================================================
-- Care action RPC
-- ===============================================================
create or replace function public.perform_care_action(p_owner uuid, p_companion uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  action text := lower(coalesce(p_action, ''));
  now_ts timestamptz := now();
  cooldown interval := interval '10 minutes';
  delta_affection int := 0;
  delta_trust int := 0;
  delta_energy int := 0;
  comp public.companions%rowtype;
  milestones text[] := '{}';
  last_action timestamptz;
  cooldown_secs int := 0;
  goal_count int := 0;
  goal_completed boolean := false;
  goal_row public.companion_daily_goals%rowtype;
  stats_row public.companion_stats%rowtype;
  prev_affection int;
  prev_trust int;
  last_care_date date;
  new_streak int;
  has_events_type boolean;
  has_events_message boolean;
  event_message text;
  care_event_id uuid;
  event_payload jsonb;
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  if p_owner is null or p_owner <> u then
    raise exception 'owner_mismatch';
  end if;

  if action not in ('feed', 'play', 'groom') then
    raise exception 'invalid_action';
  end if;

  select *
    into comp
  from public.companions
  where id = p_companion
    and owner_id = p_owner
  for update;

  if not found then
    raise exception 'companion_missing';
  end if;

  if action = 'play' and comp.energy < 5 then
    raise exception 'insufficient_energy';
  end if;

  prev_affection := comp.affection;
  prev_trust := comp.trust;

  -- establish deltas
  if action = 'feed' then
    delta_affection := 2;
    delta_trust := 0;
    delta_energy := 5;
  elsif action = 'play' then
    delta_affection := 2;
    delta_trust := 1;
    delta_energy := -5;
  elsif action = 'groom' then
    delta_affection := 1;
    delta_trust := 2;
    delta_energy := 0;
  end if;

  -- ensure stats row exists
  insert into public.companion_stats (companion_id)
  values (p_companion)
  on conflict (companion_id) do nothing;

  select *
    into stats_row
  from public.companion_stats
  where companion_id = p_companion
  for update;

  if not found then
    raise exception 'stats_missing';
  end if;

  if action = 'feed' then
    last_action := stats_row.fed_at;
  elsif action = 'play' then
    last_action := stats_row.played_at;
  else
    last_action := stats_row.groomed_at;
  end if;

  if last_action is not null and now_ts - last_action < cooldown then
    cooldown_secs := ceil(extract(epoch from (cooldown - (now_ts - last_action))))::int;
    raise exception 'cooldown_active' using detail = cooldown_secs::text;
  end if;

  if stats_row.fed_at is not null or stats_row.played_at is not null or stats_row.groomed_at is not null then
    last_care_date := greatest(
      coalesce(date(stats_row.fed_at), date '1900-01-01'),
      coalesce(date(stats_row.played_at), date '1900-01-01'),
      coalesce(date(stats_row.groomed_at), date '1900-01-01')
    );
    if last_care_date = date '1900-01-01' then
      last_care_date := null;
    end if;
  else
    last_care_date := null;
  end if;

  if action = 'feed' then
    update public.companion_stats
       set fed_at = now_ts
     where companion_id = p_companion;
  elsif action = 'play' then
    update public.companion_stats
       set played_at = now_ts
     where companion_id = p_companion;
  else
    update public.companion_stats
       set groomed_at = now_ts
     where companion_id = p_companion;
  end if;

  if last_care_date is null then
    new_streak := 1;
  elsif last_care_date = current_date then
    new_streak := coalesce(stats_row.care_streak, 1);
  elsif last_care_date = current_date - 1 then
    new_streak := coalesce(stats_row.care_streak, 0) + 1;
  else
    new_streak := 1;
  end if;

  update public.companion_stats
     set care_streak = greatest(new_streak, 1)
   where companion_id = p_companion
   returning care_streak into stats_row.care_streak;

  update public.companions
     set affection = public._clamp(comp.affection + delta_affection),
         trust = public._clamp(comp.trust + delta_trust),
         energy = public._clamp(comp.energy + delta_energy),
         mood = case
           when public._clamp(comp.energy + delta_energy) <= 10 then 'tired'
           when public._clamp(comp.affection + delta_affection) >= 75 then 'radiant'
           when public._clamp(comp.trust + delta_trust) >= 60 then 'curious'
           else 'steady'
         end,
         updated_at = now_ts
   where id = p_companion
   returning affection, trust, energy, mood
    into comp.affection, comp.trust, comp.energy, comp.mood;

  if comp.affection >= 25 and prev_affection < 25 then
    milestones := array_append(milestones, 'affection_25');
  end if;
  if comp.affection >= 50 and prev_affection < 50 then
    milestones := array_append(milestones, 'affection_50');
  end if;
  if comp.affection >= 75 and prev_affection < 75 then
    milestones := array_append(milestones, 'affection_75');
  end if;

  if comp.trust >= 25 and prev_trust < 25 then
    milestones := array_append(milestones, 'trust_25');
  end if;
  if comp.trust >= 50 and prev_trust < 50 then
    milestones := array_append(milestones, 'trust_50');
  end if;
  if comp.trust >= 75 and prev_trust < 75 then
    milestones := array_append(milestones, 'trust_75');
  end if;

  insert into public.companion_care_events (
    companion_id,
    owner_id,
    action,
    affection_delta,
    trust_delta,
    energy_delta
  )
  values (p_companion, p_owner, action, delta_affection, delta_trust, delta_energy)
  returning id into care_event_id;

  event_payload := jsonb_build_object(
    'id', care_event_id,
    'companion_id', p_companion,
    'owner_id', p_owner,
    'action', action,
    'affection_delta', delta_affection,
    'trust_delta', delta_trust,
    'energy_delta', delta_energy,
    'created_at', now_ts
  );

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name = 'type'
  ) into has_events_type;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name = 'message'
  ) into has_events_message;

  event_message := format('%s enjoyed %s', comp.name, action);

  if has_events_type and has_events_message then
    insert into public.events (user_id, type, kind, message, meta)
    values (p_owner, 'companion_care', 'companion_care', event_message, jsonb_build_object('companion_id', p_companion, 'action', action));
  elsif has_events_type then
    insert into public.events (user_id, type, kind, meta)
    values (p_owner, 'companion_care', 'companion_care', jsonb_build_object('companion_id', p_companion, 'action', action));
  elsif has_events_message then
    insert into public.events (user_id, kind, message, meta)
    values (p_owner, 'companion_care', event_message, jsonb_build_object('companion_id', p_companion, 'action', action));
  else
    insert into public.events (user_id, kind, meta)
    values (p_owner, 'companion_care', jsonb_build_object('companion_id', p_companion, 'action', action));
  end if;

  select *
    into goal_row
  from public.companion_daily_goals
  where owner_id = p_owner
    and action_date = current_date
  for update;

  if not found then
    insert into public.companion_daily_goals (owner_id, action_date, actions_count, completed)
    values (p_owner, current_date, 1, false)
    returning * into goal_row;
  else
    update public.companion_daily_goals
       set actions_count = goal_row.actions_count + 1,
           completed = case when goal_row.actions_count + 1 >= 3 then true else goal_row.completed end
     where id = goal_row.id
     returning * into goal_row;
  end if;

  goal_count := goal_row.actions_count;
  goal_completed := goal_row.completed and goal_row.actions_count = 3;

  cooldown_secs := ceil(extract(epoch from cooldown))::int;

  return jsonb_build_object(
    'affection', comp.affection,
    'trust', comp.trust,
    'energy', comp.energy,
    'mood', comp.mood,
    'streak', stats_row.care_streak,
    'cooldownSecsRemaining', cooldown_secs,
    'milestones', milestones,
    'goal', jsonb_build_object('count', goal_count, 'completed', goal_completed),
    'event', event_payload
  );
end;
$$;

grant execute on function public.perform_care_action(uuid, uuid, text) to authenticated;

-- ===============================================================
-- Event feed RPC
-- ===============================================================
create or replace function public.get_companion_events(
  p_companion uuid,
  p_owner uuid,
  p_limit int default 20
)
returns table(
  id uuid,
  action text,
  affection_delta int,
  trust_delta int,
  energy_delta int,
  created_at timestamptz,
  label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  if p_owner is null or p_owner <> u then
    raise exception 'owner_mismatch';
  end if;

  if not exists (
    select 1
    from public.companions
    where id = p_companion
      and owner_id = p_owner
  ) then
    raise exception 'companion_missing';
  end if;

  return query
  select
    e.id,
    e.action,
    e.affection_delta,
    e.trust_delta,
    e.energy_delta,
    e.created_at,
    format(
      '%s %s aff %s trust %s energy',
      initcap(e.action),
      to_char(e.affection_delta, 'FM+999'),
      to_char(e.trust_delta, 'FM+999'),
      to_char(e.energy_delta, 'FM+999')
    ) as label
  from public.companion_care_events e
  where e.companion_id = p_companion
    and e.owner_id = p_owner
  order by e.created_at desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_companion_events(uuid, uuid, int) to authenticated;
