insert into public.runtime_tuning(key, value, enabled, description)
values
  (
    'missions',
    jsonb_build_object(
      'dailyCount', 3,
      'weeklyCount', 3,
      'repeatAvoidanceWindow', 1
    ),
    true,
    'Mission rotation size and repeat-avoidance tuning.'
  )
on conflict (key) do update
set value = excluded.value,
    enabled = excluded.enabled,
    description = excluded.description;

insert into public.runtime_tuning(key, value, enabled, description)
values
  (
    'milestones',
    jsonb_build_object(
      'dailyStreak',
      jsonb_build_object(
        'streak3', 3,
        'streak7', 7,
        'streak14', 14
      )
    ),
    true,
    'Milestone tuning, including daily streak thresholds.'
  )
on conflict (key) do update
set value = jsonb_set(
      coalesce(public.runtime_tuning.value, '{}'::jsonb),
      '{dailyStreak}',
      coalesce(public.runtime_tuning.value -> 'dailyStreak', excluded.value -> 'dailyStreak'),
      true
    ),
    enabled = excluded.enabled,
    description = public.runtime_tuning.description;
