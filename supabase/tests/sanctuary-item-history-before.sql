-- Minimal historical state, inserted before the forward migration.
insert into auth.users values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
insert into public.companions values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'), ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
insert into public.user_items(id, owner_id, companion_id, item_id, source_type, source_key)
select '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', id, 'care_milestone', 'care-three'
from public.item_catalog where item_key = 'care-moss-seat';
insert into public.sanctuary_placements(id, owner_id, companion_id, item_id, slot_key)
select '40000000-0000-0000-0000-000000000001', owner_id, companion_id, item_id, 'center_glade' from public.user_items;
insert into public.sanctuary_interactions(owner_id, companion_id, placement_id, item_id, action, energy_before, energy_after)
select owner_id, companion_id, id, item_id, 'shared_rest', 20, 55 from public.sanctuary_placements;
