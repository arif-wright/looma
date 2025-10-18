-- View with per-player aggregates used on the dashboard.
-- Columns: id, level, xp, xp_next, energy, energy_max, bonded_count, triad_species_count, missions_completed

create or replace view public.player_stats as
select
  p.id,
  p.level,
  p.xp,
  p.xp_next,
  p.energy,
  p.energy_max,
  coalesce((
    select count(*)
    from public.creatures c
    where c.owner_id = p.id and c.bonded = true
  ), 0) as bonded_count,
  coalesce((
    select count(distinct c.species_id)
    from public.creatures c
    where c.owner_id = p.id and c.bonded = true
  ), 0) as triad_species_count,
  coalesce((
    select count(*)
    from public.events e
    where e.user_id = p.id and e.type = 'mission_complete'
  ), 0) as missions_completed
from public.profiles p;

create index if not exists events_user_type_idx on public.events (user_id, type);
