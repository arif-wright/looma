-- Phase 13.4 — Companion passive loop & daily check-ins

-- Companion stats metadata
alter table public.companion_stats
  add column if not exists last_passive_tick timestamptz,
  add column if not exists last_daily_bonus_at timestamptz;

-- Care event metadata for passive + daily events
alter table public.companion_care_events
  add column if not exists note text;

alter table public.companion_care_events
  drop constraint if exists companion_care_events_action_check;

alter table public.companion_care_events
  add constraint companion_care_events_action_check
  check (action in ('feed', 'play', 'groom', 'passive', 'daily_bonus', 'system'));

drop function if exists public.tick_companions_for_player(uuid);
create or replace function public.tick_companions_for_player(p_player_id uuid)
returns table(
  companion_id uuid,
  affection int,
  trust int,
  energy int,
  mood text,
  last_passive_tick timestamptz,
  last_daily_bonus_at timestamptz,
  event_id uuid,
  event_action text,
  event_note text,
  event_created_at timestamptz,
  affection_delta int,
  trust_delta int,
  energy_delta int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  now_ts timestamptz := now();
  passive_messages text[] := array[
    'Rested while you were away.',
    'Dreamt of new adventures while you were gone.',
    'Seemed a little lonely.'
  ];
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  if p_player_id is null or p_player_id <> u then
    raise exception 'not_owner';
  end if;

  insert into public.companion_stats (companion_id)
  select c.id
  from public.companions c
  where c.owner_id = p_player_id
  on conflict (companion_id) do nothing;

  return query
  with base as (
    select
      c.id,
      c.owner_id,
      c.affection,
      c.trust,
      c.energy,
      c.mood,
      cs.last_passive_tick,
      cs.last_daily_bonus_at,
      greatest(0, coalesce(floor(extract(epoch from (now_ts - cs.last_passive_tick)) / 60)::int, 0)) as minutes_elapsed
    from public.companions c
    join public.companion_stats cs on cs.companion_id = c.id
    where c.owner_id = p_player_id
    for update of c
  ),
  computed as (
    select
      b.*,
      least(4, greatest(0, b.minutes_elapsed / 360)) as affection_loss,
      least(3, greatest(0, b.minutes_elapsed / 480)) as trust_loss,
      greatest(0, b.minutes_elapsed / 60) as raw_energy_gain
    from base b
  ),
  adjusted as (
    select
      c.id,
      c.owner_id,
      c.affection,
      c.trust,
      c.energy,
      c.mood,
      c.last_passive_tick,
      c.last_daily_bonus_at,
      c.affection_loss,
      c.trust_loss,
      least(greatest(0, 80 - c.energy), c.raw_energy_gain) as energy_gain
    from computed c
  ),
  prepared as (
    select
      a.*,
      public._clamp(a.affection - a.affection_loss) as new_affection,
      public._clamp(a.trust - a.trust_loss) as new_trust,
      public._clamp(a.energy + a.energy_gain) as new_energy,
      case
        when public._clamp(a.energy + a.energy_gain) <= 10 then 'tired'
        when public._clamp(a.affection - a.affection_loss) >= 75 then 'radiant'
        when public._clamp(a.trust - a.trust_loss) >= 60 then 'curious'
        else coalesce(a.mood, 'steady')
      end as new_mood,
      public._clamp(a.affection - a.affection_loss) - a.affection as affection_delta,
      public._clamp(a.trust - a.trust_loss) - a.trust as trust_delta,
      public._clamp(a.energy + a.energy_gain) - a.energy as energy_delta
    from adjusted a
  ),
  changes as (
    select
      p.*,
      (p.affection_delta <> 0 or p.trust_delta <> 0 or p.energy_delta <> 0) as changed
    from prepared p
  ),
  updated as (
    update public.companions as c
    set affection = ch.new_affection,
        trust = ch.new_trust,
        energy = ch.new_energy,
        mood = ch.new_mood,
        updated_at = now_ts
    from changes ch
    where c.id = ch.id
      and ch.changed
    returning ch.id
  ),
  stats_update as (
    update public.companion_stats as cs
    set last_passive_tick = now_ts
    from base b
    where cs.companion_id = b.id
    returning cs.companion_id
  ),
  passive_events as (
    insert into public.companion_care_events (companion_id, owner_id, action, affection_delta, trust_delta, energy_delta, note)
    select
      ch.id,
      p_player_id,
      'passive',
      ch.affection_delta,
      ch.trust_delta,
      ch.energy_delta,
      coalesce(
        passive_messages[1 + floor(random() * greatest(array_length(passive_messages, 1), 1))::int],
        passive_messages[1]
      )
    from changes ch
    where ch.changed
    returning *
  )
  select
    c.id as companion_id,
    c.affection,
    c.trust,
    c.energy,
    c.mood,
    cs.last_passive_tick,
    cs.last_daily_bonus_at,
    pe.id as event_id,
    pe.action as event_action,
    pe.note as event_note,
    pe.created_at as event_created_at,
    pe.affection_delta,
    pe.trust_delta,
    pe.energy_delta
  from public.companions c
  join public.companion_stats cs on cs.companion_id = c.id
  left join passive_events pe on pe.companion_id = c.id
  left join stats_update su on su.companion_id = c.id
  where c.owner_id = p_player_id
  order by c.created_at;
end;
$$;

grant execute on function public.tick_companions_for_player(uuid) to authenticated;

drop function if exists public.apply_daily_companion_bonus(uuid);
create or replace function public.apply_daily_companion_bonus(p_player_id uuid)
returns table(
  companion_id uuid,
  affection int,
  trust int,
  energy int,
  mood text,
  last_passive_tick timestamptz,
  last_daily_bonus_at timestamptz,
  event_id uuid,
  event_action text,
  event_note text,
  event_created_at timestamptz,
  affection_delta int,
  trust_delta int,
  energy_delta int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  now_ts timestamptz := now();
  affection_bonus int := 3;
  trust_bonus int := 2;
  energy_bonus int := 5;
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  if p_player_id is null or p_player_id <> u then
    raise exception 'not_owner';
  end if;

  insert into public.companion_stats (companion_id)
  select c.id
  from public.companions c
  where c.owner_id = p_player_id
  on conflict (companion_id) do nothing;

  return query
  with base as (
    select
      c.id,
      c.owner_id,
      c.affection,
      c.trust,
      c.energy,
      c.mood,
      cs.last_passive_tick,
      cs.last_daily_bonus_at,
      case
        when cs.last_daily_bonus_at is null then true
        when date_trunc('day', cs.last_daily_bonus_at) < date_trunc('day', now_ts) then true
        else false
      end as needs_bonus
    from public.companions c
    join public.companion_stats cs on cs.companion_id = c.id
    where c.owner_id = p_player_id
    for update of c
  ),
  prepared as (
    select
      b.*,
      case when b.needs_bonus then public._clamp(b.affection + affection_bonus) else b.affection end as new_affection,
      case when b.needs_bonus then public._clamp(b.trust + trust_bonus) else b.trust end as new_trust,
      case when b.needs_bonus then public._clamp(b.energy + energy_bonus) else b.energy end as new_energy,
      case
        when (case when b.needs_bonus then public._clamp(b.energy + energy_bonus) else b.energy end) <= 10 then 'tired'
        when (case when b.needs_bonus then public._clamp(b.affection + affection_bonus) else b.affection end) >= 75 then 'radiant'
        when (case when b.needs_bonus then public._clamp(b.trust + trust_bonus) else b.trust end) >= 60 then 'curious'
        else coalesce(b.mood, 'steady')
      end as new_mood,
      (case when b.needs_bonus then public._clamp(b.affection + affection_bonus) else b.affection end) - b.affection as affection_delta,
      (case when b.needs_bonus then public._clamp(b.trust + trust_bonus) else b.trust end) - b.trust as trust_delta,
      (case when b.needs_bonus then public._clamp(b.energy + energy_bonus) else b.energy end) - b.energy as energy_delta
    from base b
  ),
  updates as (
    update public.companions as c
    set affection = p.new_affection,
        trust = p.new_trust,
        energy = p.new_energy,
        mood = p.new_mood,
        updated_at = now_ts
    from prepared p
    where c.id = p.id
      and p.needs_bonus
    returning p.id
  ),
  stats_update as (
    update public.companion_stats as cs
    set last_daily_bonus_at = now_ts
    from prepared p
    where cs.companion_id = p.id
      and p.needs_bonus
    returning cs.companion_id
  ),
  daily_events as (
    insert into public.companion_care_events (companion_id, owner_id, action, affection_delta, trust_delta, energy_delta, note)
    select
      p.id,
      p_player_id,
      'daily_bonus',
      p.affection_delta,
      p.trust_delta,
      p.energy_delta,
      'Brightened when you checked in today.'
    from prepared p
    where p.needs_bonus
      and (p.affection_delta <> 0 or p.trust_delta <> 0 or p.energy_delta <> 0)
    returning *
  )
  select
    c.id as companion_id,
    c.affection,
    c.trust,
    c.energy,
    c.mood,
    cs.last_passive_tick,
    cs.last_daily_bonus_at,
    de.id as event_id,
    de.action as event_action,
    de.note as event_note,
    de.created_at as event_created_at,
    de.affection_delta,
    de.trust_delta,
    de.energy_delta
  from public.companions c
  join public.companion_stats cs on cs.companion_id = c.id
  left join daily_events de on de.companion_id = c.id
  left join stats_update su on su.companion_id = c.id
  where c.owner_id = p_player_id
  order by c.created_at;
end;
$$;

grant execute on function public.apply_daily_companion_bonus(uuid) to authenticated;
