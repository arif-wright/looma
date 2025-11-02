insert into public.achievements (key, game_id, name, description, icon, rarity, points, rule)
values
  (
    'tiles.first_clear',
    (select id from public.game_titles where slug = 'tiles-run'),
    'First clear of Tiles Run',
    'Complete your first Tiles Run session.',
    'sparkles',
    'common',
    10,
    '{"kind":"first_clear","slug":"tiles-run"}'::jsonb
  ),
  (
    'tiles.score_1k',
    (select id from public.game_titles where slug = 'tiles-run'),
    'Score 1,000 points',
    'Reach a score of 1,000 in Tiles Run.',
    'trophy',
    'common',
    10,
    '{"kind":"score_threshold","slug":"tiles-run","gte":1000}'::jsonb
  ),
  (
    'tiles.score_5k',
    (select id from public.game_titles where slug = 'tiles-run'),
    'Score 5,000 points',
    'Reach a score of 5,000 in Tiles Run.',
    'medal',
    'rare',
    20,
    '{"kind":"score_threshold","slug":"tiles-run","gte":5000}'::jsonb
  ),
  (
    'tiles.score_10k',
    (select id from public.game_titles where slug = 'tiles-run'),
    'Score 10,000 points',
    'Reach a score of 10,000 in Tiles Run.',
    'crown',
    'epic',
    30,
    '{"kind":"score_threshold","slug":"tiles-run","gte":10000}'::jsonb
  ),
  (
    'tiles.sessions_25',
    (select id from public.game_titles where slug = 'tiles-run'),
    'Tiles Marathoner',
    'Complete 25 Tiles Run sessions.',
    'flag',
    'rare',
    20,
    '{"kind":"sessions_completed","slug":"tiles-run","gte":25}'::jsonb
  ),
  (
    'global.streak_3',
    null,
    'Three-Day Streak',
    'Play any game three days in a row.',
    'fire',
    'rare',
    20,
    '{"kind":"streak_days","gte":3}'::jsonb
  ),
  (
    'tiles.weekly_top10',
    (select id from public.game_titles where slug = 'tiles-run'),
    'Weekly Top 10',
    'Finish a Tiles Run session that lands you in the top 10 for the week.',
    'star',
    'legendary',
    30,
    '{"kind":"weekly_top_rank","slug":"tiles-run","rank_lte":10}'::jsonb
  )
on conflict (key) do update
set
  game_id = excluded.game_id,
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  rarity = excluded.rarity,
  points = excluded.points,
  is_active = true,
  rule = excluded.rule;
