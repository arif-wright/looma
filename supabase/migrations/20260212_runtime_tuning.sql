create table if not exists public.runtime_tuning (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  description text,
  updated_at timestamptz not null default now()
);

create or replace function public.set_runtime_tuning_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_runtime_tuning_set_updated_at on public.runtime_tuning;
create trigger trg_runtime_tuning_set_updated_at
  before update on public.runtime_tuning
  for each row
  execute function public.set_runtime_tuning_updated_at();

alter table public.runtime_tuning enable row level security;

insert into public.runtime_tuning(key, value, enabled, description)
values
  (
    'reactions',
    jsonb_build_object(
      'preRunCooldownMs', 3600000,
      'preRunChancePercent', 55,
      'maxPreRunBuckets', 5000,
      'ttlMs', 3500
    ),
    true,
    'Companion reaction frequency and TTL tuning.'
  ),
  (
    'whispers',
    jsonb_build_object(
      'cooldownMs', 86400000,
      'ttlMs', 4800,
      'longBreakDays', 3,
      'streakMinDays', 2
    ),
    true,
    'World whisper cadence tuning.'
  ),
  (
    'rituals',
    jsonb_build_object(
      'cooldownMs',
      jsonb_build_object(
        'listen', 3600000,
        'focus', 3600000,
        'celebrate', 3600000
      ),
      'focusMoodDurationMs', 900000
    ),
    true,
    'Optional ritual cooldown and mood duration tuning.'
  ),
  (
    'milestones',
    jsonb_build_object(
      'companion',
      jsonb_build_object(
        'streak3', 3,
        'games5', 5,
        'firstWeekActive', 7
      ),
      'museEvolution',
      jsonb_build_object(
        'harmonae', jsonb_build_object('streakDays', 3, 'gamesPlayed', 5),
        'mirae', jsonb_build_object('streakDays', 7, 'gamesPlayed', 12)
      )
    ),
    true,
    'Companion milestone and Muse evolution threshold tuning.'
  )
on conflict (key) do update
set value = excluded.value,
    enabled = excluded.enabled,
    description = excluded.description;
