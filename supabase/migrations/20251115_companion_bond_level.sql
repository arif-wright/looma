-- Phase 13.6 — Companion bond score + bonuses

-- Ensure bond columns exist on companion stats
alter table if exists public.companion_stats
  add column if not exists bond_score integer not null default 0,
  add column if not exists bond_level integer not null default 0;

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
  select *
    into cs
    from public.companion_stats
   where companion_id = p_companion_id
   for update;

  if not found then
    raise exception 'No stats found for companion %', p_companion_id;
  end if;

  select *
    into comp
  from public.companions
  where id = p_companion_id
  for update;

  if not found then
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

grant execute on function public.calculate_bond_for_companion(uuid) to authenticated;

-- Recalculate bonds for all companions a player owns
create or replace function public.recalculate_bonds_for_player(p_player_id uuid)
returns setof public.companion_stats
language plpgsql
security definer
set search_path = public
as $$
declare
  cs public.companion_stats;
begin
  for cs in
    select s.*
    from public.companion_stats s
    join public.companions c on c.id = s.companion_id
    where c.owner_id = p_player_id
  loop
    perform public.calculate_bond_for_companion(cs.companion_id);
  end loop;

  return query
    select s2.*
    from public.companion_stats s2
    join public.companions c2 on c2.id = s2.companion_id
    where c2.owner_id = p_player_id;
end;
$$;

grant execute on function public.recalculate_bonds_for_player(uuid) to authenticated;

-- Bond-focused achievements
insert into public.achievements (key, name, description, icon, rarity, points, rule)
values
  (
    'bond_first',
    'First Bond',
    'Reach bond level 1 with any companion.',
    'heart',
    'common',
    25,
    jsonb_build_object('kind', 'bond_level', 'gte', 1)
  ),
  (
    'bond_growing',
    'Growing Closer',
    'Reach bond level 4 with any companion.',
    'sparkles',
    'rare',
    50,
    jsonb_build_object('kind', 'bond_level', 'gte', 4)
  ),
  (
    'bond_unbreakable',
    'Unbreakable Bond',
    'Reach bond level 8 with any companion.',
    'infinity',
    'epic',
    100,
    jsonb_build_object('kind', 'bond_level', 'gte', 8)
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  rarity = excluded.rarity,
  points = excluded.points,
  rule = excluded.rule,
  is_active = true;
