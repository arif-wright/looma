-- Phase 13.6 — Register Looma ARPG game metadata

insert into public.game_titles (slug, name, min_version, max_score, is_active)
values ('arpg', 'Looma ARPG', '1.0.0', 150000, true)
on conflict (slug) do update
set name = excluded.name,
    min_version = excluded.min_version,
    max_score = excluded.max_score,
    is_active = true;

insert into public.game_config (game_id, max_duration_ms, min_duration_ms, max_score_per_min, min_client_ver)
select id, 600000, 10000, 9000, '1.0.0'
from public.game_titles
where slug = 'arpg'
on conflict (game_id) do update
set max_duration_ms = excluded.max_duration_ms,
    min_duration_ms = excluded.min_duration_ms,
    max_score_per_min = excluded.max_score_per_min,
    min_client_ver = excluded.min_client_ver;
