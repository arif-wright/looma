alter table if exists public.companion_stats
  add column if not exists last_meaningful_interaction_at timestamptz,
  add column if not exists repair_started_at timestamptz,
  add column if not exists repair_completed_at timestamptz;

insert into public.companion_stats (companion_id)
select id
from public.companions
on conflict (companion_id) do nothing;

update public.companion_stats stats
set last_meaningful_interaction_at = greatest(
  companion.created_at,
  companion.first_bond_completed_at,
  stats.fed_at,
  stats.played_at,
  stats.groomed_at
)
from public.companions companion
where companion.id = stats.companion_id
  and stats.last_meaningful_interaction_at is null;

alter table if exists public.companion_care_events
  drop constraint if exists companion_care_events_action_check;

alter table if exists public.companion_care_events
  add constraint companion_care_events_action_check
  check (
    action in (
      'feed',
      'play',
      'groom',
      'passive',
      'daily_bonus',
      'system',
      'sanctuary_rest',
      'presence'
    )
  );
