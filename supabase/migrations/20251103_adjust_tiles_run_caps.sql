-- Adjust Tiles Run configuration to better match game session length

update public.game_config
   set min_duration_ms = 2000,
       max_duration_ms = 600000,
       max_score_per_min = 6000
 where game_id in (
   select id from public.game_titles where slug = 'tiles-run'
 );
