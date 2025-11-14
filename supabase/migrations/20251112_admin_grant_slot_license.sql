-- Phase 13.3-O — Admin utility to grant slot licenses

create or replace function public.admin_grant_slot_license(p_user uuid, p_qty int default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  license_item_id uuid;
  license_stackable boolean;
begin
  if p_user is null then
    raise exception 'missing_user';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'bad_qty';
  end if;

  select id, stackable
    into license_item_id, license_stackable
  from public.shop_items
  where slug = 'slot-license'
    and active = true
  limit 1;

  if license_item_id is null then
    raise exception 'license_not_seeded';
  end if;

  insert into public.shop_inventory (user_id, item_id, stackable)
  select p_user, license_item_id, coalesce(license_stackable, true)
  from generate_series(1, p_qty);

  insert into public.events (user_id, kind, meta)
  values (p_user, 'admin_grant_slot_license', jsonb_build_object('qty', p_qty));
end;
$$;

revoke all on function public.admin_grant_slot_license(uuid, int) from public, authenticated;
