-- This file is for the isolated harness only. It creates fixture-only grants,
-- matching the existing application's table access; the migration grants none.
grant usage on schema public, auth to authenticated;
grant select on public.user_items, public.item_catalog, public.companions to authenticated;
grant select, insert, update, delete on public.sanctuary_placements to authenticated;
grant select, insert on public.sanctuary_interactions to authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

-- Helper makes each expected failure a subtransaction, preserving test progress.
create function pg_temp.must_fail(statement text, expected text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise exception 'Expected %, got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'Statement unexpectedly succeeded: %', statement;
end;
$$;

set role authenticated;
do $$ begin
  if exists(select 1 from public.sanctuary_interactions where user_item_id is not null or acquisition_snapshot is not null) then
    raise exception 'Legacy history must not acquire guessed provenance';
  end if;
end $$;
-- New rests on a legacy placement preserve unknown acquisition, even if forged.
insert into public.sanctuary_interactions(owner_id,companion_id,placement_id,item_id,action,energy_before,energy_after,user_item_id,acquisition_snapshot)
select owner_id,companion_id,id,item_id,'shared_rest',10,45,'30000000-0000-0000-0000-000000000099','{"sourceType":"forged"}' from public.sanctuary_placements;
do $$ begin
  if exists(select 1 from public.sanctuary_interactions where user_item_id is not null or acquisition_snapshot is not null) then raise exception 'Legacy rest invented acquisition identity'; end if;
end $$;
-- Legacy unattributed placement conservatively consumes capacity.
select pg_temp.must_fail($q$insert into public.sanctuary_placements(owner_id,item_id,user_item_id,slot_key)
select owner_id,item_id,id,'near_left' from public.user_items$q$, 'item_quantity_exhausted');
delete from public.sanctuary_placements where slot_key = 'center_glade';
do $$ begin
  if (select count(*) from public.sanctuary_interactions) <> 2 or exists(select 1 from public.sanctuary_interactions where placement_id is not null) then
    raise exception 'Clearing a legacy slot erased history/cooldown';
  end if;
end $$;
-- Backward-compatible unique catalog lookup binds the actual owned identity.
insert into public.sanctuary_placements(owner_id,companion_id,item_id,slot_key)
select owner_id,companion_id,item_id,'center_glade' from public.user_items;
do $$ begin
  if exists(select 1 from public.sanctuary_placements where user_item_id is null) then raise exception 'Missing identity'; end if;
end $$;
-- Moving a row does not spend another copy.
update public.sanctuary_placements set slot_key='left_grove';
update public.sanctuary_placements set slot_key='center_glade';
-- Replacing the same slot is permitted and does not spend a second copy.
insert into public.sanctuary_placements(owner_id,companion_id,item_id,user_item_id,slot_key)
select owner_id,companion_id,item_id,id,'center_glade' from public.user_items
on conflict(owner_id,slot_key) do update set user_item_id=excluded.user_item_id;
select pg_temp.must_fail($q$insert into public.sanctuary_placements(owner_id,item_id,user_item_id,slot_key)
select owner_id,item_id,id,'near_left' from public.user_items$q$, 'item_quantity_exhausted');
select pg_temp.must_fail($q$insert into public.sanctuary_placements(owner_id,item_id,user_item_id,slot_key)
select '10000000-0000-0000-0000-000000000002',item_id,id,'near_left' from public.user_items$q$, 'placement_owner_required');
select pg_temp.must_fail($q$insert into public.sanctuary_placements(owner_id,companion_id,item_id,user_item_id,slot_key)
select owner_id,'20000000-0000-0000-0000-000000000002',item_id,id,'near_left' from public.user_items$q$, 'placement_companion_not_owned');
select pg_temp.must_fail($q$update public.sanctuary_placements set companion_id='20000000-0000-0000-0000-000000000002'$q$, 'row-level security');
-- Claimed provenance and identity are replaced with the actual persisted source.
insert into public.sanctuary_interactions(owner_id,companion_id,placement_id,item_id,action,energy_before,energy_after,user_item_id,acquisition_snapshot)
select owner_id,companion_id,id,item_id,'shared_rest',30,65,'30000000-0000-0000-0000-000000000099','{"sourceType":"forged"}'
from public.sanctuary_placements;
do $$ begin
  if not exists(select 1 from public.sanctuary_interactions where user_item_id = '30000000-0000-0000-0000-000000000001' and acquisition_snapshot->>'sourceType' = 'care_milestone' and slot_key_snapshot = 'center_glade') then
    raise exception 'Rest did not retain authoritative provenance';
  end if;
end $$;
select pg_temp.must_fail($q$insert into public.sanctuary_interactions(owner_id,companion_id,placement_id,item_id,action,energy_before,energy_after)
select owner_id,'20000000-0000-0000-0000-000000000002',id,item_id,'shared_rest',30,65 from public.sanctuary_placements$q$, 'interaction_owner_required');
reset role;
insert into public.user_items(id,owner_id,companion_id,item_id,source_type,source_key)
select '30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',id,'chapter_reward','lantern-chapter'
from public.item_catalog where item_key='chapter-care-lantern';
set role authenticated;
update public.sanctuary_placements set
  item_id=(select item_id from public.user_items where id='30000000-0000-0000-0000-000000000003'),
  user_item_id='30000000-0000-0000-0000-000000000003';
do $$ begin
  if not exists(select 1 from public.sanctuary_interactions where user_item_id='30000000-0000-0000-0000-000000000001' and acquisition_snapshot->>'sourceKey'='care-three') then
    raise exception 'Replacement rewrote historical acquisition';
  end if;
end $$;
delete from public.sanctuary_placements;
reset role;
delete from public.user_items where id='30000000-0000-0000-0000-000000000003';
set role authenticated;
do $$ begin
  if (select count(*) from public.sanctuary_interactions) <> 3 or not exists(select 1 from public.sanctuary_interactions where placement_id is null and placement_snapshot_id is not null and acquisition_snapshot->>'sourceKey'='care-three') then
    raise exception 'Rest history or provenance lost on removal';
  end if;
end $$;
reset role;
-- Separate acquisitions of the same catalog item remain separately selectable.
insert into public.user_items(id,owner_id,companion_id,item_id,source_type,source_key,quantity)
select '30000000-0000-0000-0000-000000000002',owner_id,companion_id,item_id,source_type,'care-six',2 from public.user_items;
set role authenticated;
select pg_temp.must_fail($q$insert into public.sanctuary_placements(owner_id,item_id,slot_key)
select owner_id,item_id,'near_left' from public.user_items limit 1$q$, 'owned_item_selection_required');
insert into public.sanctuary_placements(owner_id,companion_id,item_id,user_item_id,slot_key)
select owner_id,companion_id,item_id,id,slot from public.user_items cross join (values ('near_left'), ('near_right')) v(slot)
where id = '30000000-0000-0000-0000-000000000002';
select pg_temp.must_fail($q$insert into public.sanctuary_placements(owner_id,item_id,user_item_id,slot_key)
select owner_id,item_id,id,'center_glade' from public.user_items where id='30000000-0000-0000-0000-000000000002'$q$, 'item_quantity_exhausted');
-- Mismatched catalog/owned IDs cannot be inserted directly through the Data API.
select pg_temp.must_fail($q$insert into public.sanctuary_placements(owner_id,item_id,user_item_id,slot_key)
select '10000000-0000-0000-0000-000000000001',id,'30000000-0000-0000-0000-000000000001','left_grove' from public.item_catalog where item_key='chapter-care-lantern'$q$, 'item_not_placeable');
reset role;
-- Historical snapshots survive inventory cleanup after a slot is cleared.
delete from public.user_items where id='30000000-0000-0000-0000-000000000001';
do $$ begin
  if not exists(select 1 from public.sanctuary_interactions where user_item_id='30000000-0000-0000-0000-000000000001' and acquisition_snapshot->>'sourceKey'='care-three') then raise exception 'Inventory cleanup erased snapshot'; end if;
end $$;
insert into public.user_items(id,owner_id,companion_id,item_id,source_type,source_key)
select '30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',id,'care_milestone','care-other-owner'
from public.item_catalog where item_key='care-moss-seat';
set role authenticated;
select pg_temp.must_fail($q$insert into public.sanctuary_placements(owner_id,item_id,user_item_id,slot_key)
select '10000000-0000-0000-0000-000000000001',id,'30000000-0000-0000-0000-000000000004','left_grove' from public.item_catalog where item_key='care-moss-seat'$q$, 'item_not_placeable');
reset role;
-- Companion removal only clears the live companion association.
select set_config('request.jwt.claim.sub', '', false);
delete from public.companions where id='20000000-0000-0000-0000-000000000001';
-- Existing account deletion must still cascade through owned objects/history.
delete from auth.users where id='10000000-0000-0000-0000-000000000001';
