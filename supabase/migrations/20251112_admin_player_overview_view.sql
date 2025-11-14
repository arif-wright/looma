-- Admin helper view for paginated player lookups

create or replace view public.admin_player_overview as
select
  u.id,
  u.email,
  u.created_at,
  p.display_name,
  p.handle,
  p.joined_at,
  coalesce(s.max_slots, 3) as max_slots,
  coalesce(l.qty, 0) as slot_license_count
from auth.users u
left join public.profiles p on p.id = u.id
left join public.player_companion_slots s on s.user_id = u.id
left join public.v_inventory_slot_license l on l.user_id = u.id;
