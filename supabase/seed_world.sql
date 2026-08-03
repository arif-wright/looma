-- Local Stage 5/6 fixtures. Safe to run repeatedly after migrations.
insert into public.world_maps(
  id, display_name, map_type, version, is_active, is_default,
  min_x, max_x, min_y, max_y, spawn_x, spawn_y
) values
  ('wilds-town', 'Wayfarer Town', 'town', 1, true, true, 16, 944, 16, 524, 160, 270),
  ('wilds-exploration', 'Whispering Grove', 'exploration', 1, true, false, 16, 944, 16, 524, 120, 120)
on conflict (id) do nothing;

insert into public.world_landmarks(
  map_id, landmark_key, display_name, map_version, x, y, discovery_radius, is_active
) values
  ('wilds-town', 'town-well', 'Wayfarer Well', 1, 540, 270, 56, true),
  ('wilds-exploration', 'ancient-grove', 'Ancient Grove', 1, 800, 120, 64, true),
  ('wilds-exploration', 'moonberry-grove', 'Moonberry Grove', 1, 800, 120, 72, true)
on conflict (map_id, landmark_key) do nothing;

insert into public.item_catalog(item_key, title, description, kind, tone, visual_key, capabilities)
values (
  'world-moonberry', 'Moonberry',
  'A softly glowing berry gathered with a companion in Whispering Grove.',
  'consumable', 'wonder', 'moonberry', '{consumable,giftable}'
)
on conflict (item_key) do nothing;

insert into public.world_gather_nodes(
  map_id, node_key, map_version, x, y, interaction_radius,
  reward_item_id, reward_quantity, cooldown_seconds, max_owned_quantity, is_active
)
select 'wilds-exploration', 'moonberry-bush', 1, 800, 120, 58,
       id, 1, 300, 20, true
from public.item_catalog where item_key = 'world-moonberry'
on conflict (map_id, node_key) do nothing;
