-- Forward-only lock-order repair. Apply after the five October feature migrations
-- and the separately reviewed bond ACL prerequisite, with affected writers drained.
-- No formulas, authorization guards, function signatures, ownership, or ACLs change.
-- CREATE OR REPLACE preserves existing owner/grants; no new RPC is introduced.
-- Do not replay historical migrations or apply this file to a hosted DB without approval.
begin;

-- Fail closed if baseline functions are absent instead of creating a new public RPC.
do $$
begin
  if to_regprocedure('public.calculate_bond_for_companion(uuid)') is null
    or to_regprocedure('public.recalculate_bonds_for_player(uuid)') is null
    or to_regprocedure('public.tick_companions_for_player(uuid)') is null
    or to_regprocedure('public.apply_daily_companion_bonus(uuid)') is null
    or to_regprocedure('public.set_active_companion(uuid)') is null
    or to_regprocedure('public.reorder_companions(uuid[])') is null then
    raise exception 'companion_lock_order_baseline_missing';
  end if;
end;
$$;

-- Calculates and persists bond score/level for a single companion
create or replace function public.calculate_bond_for_companion(p_companion_id uuid)
returns public.companion_stats
language plpgsql
security definer
set search_path = public
as $$
declare
  cs public.companion_stats;
  comp public.companions%rowtype;
  care_count integer;
  score integer;
  level integer;
begin
  -- Parent before child, matching shared rest, care, tick, and daily bonus.
  -- NO KEY UPDATE remains compatible with child foreign-key KEY SHARE locks.
  select *
    into comp
    from public.companions
   where id = p_companion_id
   for no key update;

  select *
    into cs
    from public.companion_stats
   where companion_id = p_companion_id
   for update;

  if not found then
    raise exception 'No stats found for companion %', p_companion_id;
  end if;

  -- Preserve the historical missing-stats error precedence.
  if comp.id is null then
    raise exception 'No companion %', p_companion_id;
  end if;

  select count(*) into care_count
  from public.companion_care_events
  where companion_id = p_companion_id;

  score := coalesce(comp.affection, 0)
         + coalesce(comp.trust, 0)
         + least(coalesce(care_count, 0) / 5, 20);

  if score < 0 then
    score := 0;
  elsif score > 200 then
    score := 200;
  end if;

  if score >= 180 then
    level := 10;
  elsif score >= 160 then
    level := 9;
  elsif score >= 140 then
    level := 8;
  elsif score >= 120 then
    level := 7;
  elsif score >= 100 then
    level := 6;
  elsif score >= 80 then
    level := 5;
  elsif score >= 60 then
    level := 4;
  elsif score >= 40 then
    level := 3;
  elsif score >= 20 then
    level := 2;
  elsif score >= 10 then
    level := 1;
  else
    level := 0;
  end if;

  update public.companion_stats
     set bond_score = score,
         bond_level = level
   where companion_id = p_companion_id
   returning * into cs;

  return cs;
end;
$$;


-- Recalculate bonds for all companions a player owns
create or replace function public.recalculate_bonds_for_player(p_player_id uuid)
returns setof public.companion_stats
language plpgsql
security definer
set search_path = public
as $$
declare
  cs public.companion_stats;
  locked_companion_ids uuid[];
begin
  -- Freeze this invocation's workset while locking every parent in UUID order.
  -- Later statements use only these IDs, so a concurrent roster insertion cannot
  -- introduce an unlocked companion between the parent and stats phases.
  select coalesce(array_agg(locked.id order by locked.id), array[]::uuid[])
    into locked_companion_ids
    from (
      select c.id
      from public.companions c
      where c.owner_id = p_player_id
      order by c.id
      for no key update of c
    ) locked;

  for cs in
    select s.*
    from public.companion_stats s
    join public.companions c on c.id = s.companion_id
    where c.owner_id = p_player_id
      and c.id = any(locked_companion_ids)
    order by c.id
  loop
    perform public.calculate_bond_for_companion(cs.companion_id);
  end loop;

  return query
    select s2.*
    from public.companion_stats s2
    join public.companions c2 on c2.id = s2.companion_id
    where c2.owner_id = p_player_id
      and c2.id = any(locked_companion_ids);
end;
$$;



-- Time away may restore energy or change mood, but never subtract earned affection or trust.
-- Replace in place to retain existing ownership, grants, authorization, and return shape.
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
  locked_companion_ids uuid[];
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

  -- Freeze this invocation's workset while locking every parent in UUID order.
  -- Later statements use only these IDs, so a concurrent roster insertion cannot
  -- introduce an unlocked companion between the parent and stats phases.
  select coalesce(array_agg(locked.id order by locked.id), array[]::uuid[])
    into locked_companion_ids
    from (
      select c.id
      from public.companions c
      where c.owner_id = p_player_id
      order by c.id
      for no key update of c
    ) locked;

  insert into public.companion_stats (companion_id)
  select c.id
  from public.companions c
  where c.owner_id = p_player_id
    and c.id = any(locked_companion_ids)
  order by c.id
  -- Name the existing primary key to avoid ambiguity with the output parameter.
  on conflict on constraint companion_stats_pkey do nothing;

  -- Lock child rows only after all parent locks and missing-row inserts finish.
  perform s.companion_id
    from public.companion_stats s
   where s.companion_id = any(locked_companion_ids)
   order by s.companion_id
   for update of s;

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
      and c.id = any(locked_companion_ids)
  ),
  computed as (
    select
      b.*,
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
      least(greatest(0, 80 - c.energy), c.raw_energy_gain) as energy_gain
    from computed c
  ),
  prepared as (
    select
      a.*,
      public._clamp(a.affection) as new_affection,
      public._clamp(a.trust) as new_trust,
      public._clamp(a.energy + a.energy_gain) as new_energy,
      case
        when public._clamp(a.energy + a.energy_gain) <= 10 then 'tired'
        when public._clamp(a.affection) >= 75 then 'radiant'
        when public._clamp(a.trust) >= 60 then 'curious'
        else coalesce(a.mood, 'steady')
      end as new_mood,
      public._clamp(a.affection) - a.affection as affection_delta,
      public._clamp(a.trust) - a.trust as trust_delta,
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
    returning c.id, c.affection, c.trust, c.energy, c.mood
  ),
  stats_update as (
    update public.companion_stats as cs
    set last_passive_tick = now_ts
    from base b
    where cs.companion_id = b.id
    returning cs.companion_id, cs.last_passive_tick
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
    coalesce(u.affection, c.affection),
    coalesce(u.trust, c.trust),
    coalesce(u.energy, c.energy),
    coalesce(u.mood, c.mood),
    su.last_passive_tick,
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
  -- Data-modifying CTEs share a snapshot: return the written values via RETURNING.
  left join updated u on u.id = c.id
  left join passive_events pe on pe.companion_id = c.id
  left join stats_update su on su.companion_id = c.id
  where c.owner_id = p_player_id
    and c.id = any(locked_companion_ids)
  order by c.created_at;
end;
$$;



-- The tick endpoint also invokes this RPC. Preserve its bonuses and return current values.
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
  locked_companion_ids uuid[];
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

  -- Freeze this invocation's workset while locking every parent in UUID order.
  -- Later statements use only these IDs, so a concurrent roster insertion cannot
  -- introduce an unlocked companion between the parent and stats phases.
  select coalesce(array_agg(locked.id order by locked.id), array[]::uuid[])
    into locked_companion_ids
    from (
      select c.id
      from public.companions c
      where c.owner_id = p_player_id
      order by c.id
      for no key update of c
    ) locked;

  insert into public.companion_stats (companion_id)
  select c.id
  from public.companions c
  where c.owner_id = p_player_id
    and c.id = any(locked_companion_ids)
  order by c.id
  on conflict on constraint companion_stats_pkey do nothing;

  -- Lock child rows only after all parent locks and missing-row inserts finish.
  perform s.companion_id
    from public.companion_stats s
   where s.companion_id = any(locked_companion_ids)
   order by s.companion_id
   for update of s;

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
      and c.id = any(locked_companion_ids)
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
    returning c.id, c.affection, c.trust, c.energy, c.mood
  ),
  stats_update as (
    update public.companion_stats as cs
    set last_daily_bonus_at = now_ts
    from prepared p
    where cs.companion_id = p.id
      and p.needs_bonus
    returning cs.companion_id, cs.last_daily_bonus_at
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
    coalesce(u.affection, c.affection),
    coalesce(u.trust, c.trust),
    coalesce(u.energy, c.energy),
    coalesce(u.mood, c.mood),
    cs.last_passive_tick,
    coalesce(su.last_daily_bonus_at, cs.last_daily_bonus_at),
    de.id as event_id,
    de.action as event_action,
    de.note as event_note,
    de.created_at as event_created_at,
    de.affection_delta,
    de.trust_delta,
    de.energy_delta
  from public.companions c
  join public.companion_stats cs on cs.companion_id = c.id
  left join updates u on u.id = c.id
  left join daily_events de on de.companion_id = c.id
  left join stats_update su on su.companion_id = c.id
  where c.owner_id = p_player_id
    and c.id = any(locked_companion_ids)
  order by c.created_at;
end;
$$;


-- Roster writers share the same companion rows as tick/bonus/recalculation.
create or replace function public.set_active_companion(p_companion uuid)
returns table(companion_id uuid, is_active boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  owner uuid;
  locked_companion_ids uuid[];
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  select owner_id
    into owner
    from public.companions
   where id = p_companion;

  if owner is null or owner <> u then
    raise exception 'not_owner';
  end if;

  -- Freeze this invocation's workset while locking every parent in UUID order.
  -- Later statements use only these IDs, so a concurrent roster insertion cannot
  -- introduce an unlocked companion between the parent and stats phases.
  select coalesce(array_agg(locked.id order by locked.id), array[]::uuid[])
    into locked_companion_ids
    from (
      select c.id
      from public.companions c
      where c.owner_id = u
      order by c.id
      for no key update of c
    ) locked;

  -- The target may have been deleted or reassigned while the lock query waited.
  if not (p_companion = any(locked_companion_ids)) then
    raise exception 'not_owner';
  end if;

  update public.companions as c
     set is_active = false,
         state = 'idle'
   where c.owner_id = u
     and c.id = any(locked_companion_ids)
     and c.id <> p_companion
     and (c.is_active = true or c.state = 'active');

  update public.companions as c
     set is_active = true,
         state = 'active',
         updated_at = now()
   where c.id = p_companion
     and c.id = any(locked_companion_ids)
   returning c.id, c.is_active into companion_id, is_active;

  return next;
end;
$$;



create or replace function public.reorder_companions(p_order uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  mx int;
  idx int := 0;
  cid uuid;
  locked_companion_ids uuid[];
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  mx := public.ensure_slots();

  if p_order is null then
    return;
  end if;

  -- Freeze this invocation's workset while locking every parent in UUID order.
  -- Later statements use only these IDs, so a concurrent roster insertion cannot
  -- introduce an unlocked companion between the parent and stats phases.
  select coalesce(array_agg(locked.id order by locked.id), array[]::uuid[])
    into locked_companion_ids
    from (
      select c.id
      from public.companions c
      where c.owner_id = u
      order by c.id
      for no key update of c
    ) locked;

  -- Preserve requested slot order and capacity; only lock acquisition is sorted.
  foreach cid in array p_order loop
    exit when idx >= mx;
    update public.companions
       set slot_index = idx
     where id = cid
       and owner_id = u
       and id = any(locked_companion_ids);
    idx := idx + 1;
  end loop;
end;
$$;



commit;
