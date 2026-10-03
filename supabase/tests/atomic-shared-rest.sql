-- Fixture grants mirror existing caller permissions. Production migration adds
-- only authenticated EXECUTE. New private receipt storage grants no caller access.
grant usage on schema public,auth to authenticated;
grant select,update on public.companions to authenticated;
grant select,insert,update on public.companion_stats to authenticated;
grant select,insert on public.companion_care_events,public.companion_journal_entries,public.sanctuary_interactions to authenticated;
grant update on public.companion_journal_entries to authenticated;
grant select,insert,update,delete on public.sanctuary_placements to authenticated;
grant select on public.item_catalog,public.user_items to authenticated;
insert into auth.users values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into public.companions(id,owner_id,name,affection,trust,energy,updated_at) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Root',80,75,60,'2020-01-01'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Sprig',100,100,0,'2020-01-01'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','Other',80,75,60,'2020-01-01');
insert into public.companion_stats(companion_id,fed_at,care_streak) select id,'2020-01-01',7 from public.companions;
insert into public.user_items(id,owner_id,companion_id,item_id,source_type,source_key)
select '30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',id,'care_milestone','care-three'
from public.item_catalog where item_key='care-moss-seat';
insert into public.user_items(id,owner_id,companion_id,item_id,source_type,source_key)
select '30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',id,'chapter_reward','lantern-chapter' from public.item_catalog where item_key='chapter-care-lantern';
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
set role authenticated;
insert into public.sanctuary_placements(owner_id,companion_id,item_id,user_item_id,slot_key)
select owner_id,companion_id,item_id,id,'center_glade' from public.user_items where id='30000000-0000-0000-0000-000000000001';
reset role;

create function public.test_rest_failure() returns trigger language plpgsql as $$
begin
 if current_setting('test.fail_stage',true)=TG_TABLE_NAME then raise exception 'injected_rest_failure'; end if;
 return new;
end $$;
create trigger test_failure before insert or update on public.companion_stats for each row execute function public.test_rest_failure();
create trigger test_failure before insert on public.sanctuary_interactions for each row execute function public.test_rest_failure();
create trigger test_failure before insert on public.companion_care_events for each row execute function public.test_rest_failure();
create trigger test_failure before insert on public.companion_journal_entries for each row execute function public.test_rest_failure();
create trigger test_failure before insert on sanctuary_internal.rest_receipts for each row execute function public.test_rest_failure();
set role authenticated;
do $$ declare stage text; result jsonb; replay jsonb; begin
 foreach stage in array array['companion_stats','sanctuary_interactions','companion_care_events','companion_journal_entries','rest_receipts'] loop
  perform set_config('test.fail_stage',stage,false);
  begin
    perform public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
    raise exception 'Failure injection did not fail';
  exception when others then
    if sqlerrm <> 'injected_rest_failure' then raise; end if;
  end;
  if (select affection<>80 or trust<>75 or energy<>60 from public.companions where id='20000000-0000-0000-0000-000000000001')
    or exists(select 1 from public.sanctuary_interactions)
    or exists(select 1 from public.companion_care_events)
    or exists(select 1 from public.companion_journal_entries)
    or exists(select 1 from public.companion_stats where last_meaningful_interaction_at is not null)
  then raise exception 'Partial rest leaked after % failure',stage; end if;
 end loop;
 perform set_config('test.fail_stage','',false);
 result := public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
 if result->>'ok'<>'true' or result#>>'{companion,affection}'<>'82' or result#>>'{companion,trust}'<>'78' or result#>>'{companion,energy}'<>'95' or result#>>'{memory,id}' is null then
   raise exception 'Wrong result/no-absence stats: %',result;
 end if;
 if not exists(select 1 from public.companion_journal_entries where meta_json->>'userItemId'='30000000-0000-0000-0000-000000000001' and meta_json#>>'{acquisition,sourceKey}'='care-three') then raise exception 'Journal lost authoritative provenance'; end if;
 if exists(select 1 from public.companion_stats where care_streak<>7 or fed_at<>'2020-01-01'::timestamptz) then raise exception 'Rest overwrote care history'; end if;
 replay := public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
 if replay-'replayed' <> result-'replayed' or replay->>'replayed'<>'true' then raise exception 'Replay changed recorded result/Journal'; end if;
 if (public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002')->>'error') <> 'rest_cooldown' then raise exception 'Different request bypassed cooldown'; end if;
 if (public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001')->>'error') <> 'request_companion_mismatch' then raise exception 'Request switched companion'; end if;
 if (public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001')->>'error') <> 'companion_required' then raise exception 'Foreign companion exposed'; end if;
 if (select count(*) from public.sanctuary_interactions) <> 1 or (select count(*) from public.companion_care_events) <> 1 or (select count(*) from public.companion_journal_entries) <> 1 then raise exception 'Retry duplicated evidence'; end if;
 -- Companion-scoped cooldown: another owned companion can rest and recover 0.
 replay := public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003');
 if replay#>>'{companion,energy}'<>'35' or replay#>>'{companion,affection}'<>'100' or replay#>>'{companion,trust}'<>'100' then raise exception 'Zero-energy/full-relationship rest failed'; end if;
 if exists(select 1 from public.companion_care_events where companion_id='20000000-0000-0000-0000-000000000002' and (affection_delta<>0 or trust_delta<>0)) then raise exception 'Capped gains misreported'; end if;
 -- Later care and caller-editable Journal content cannot change a receipt.
 update public.companions set energy=12 where id='20000000-0000-0000-0000-000000000001';
 update public.companion_journal_entries set title='Caller-edited title' where id=(result#>>'{memory,id}')::uuid;
 update public.sanctuary_placements set user_item_id='30000000-0000-0000-0000-000000000002',
   item_id=(select item_id from public.user_items where id='30000000-0000-0000-0000-000000000002');
 replay := public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
 if replay-'replayed' <> result-'replayed' or (select energy from public.companions where id='20000000-0000-0000-0000-000000000001')<>12 then raise exception 'Replacement/replay mutated current stats or recorded receipt'; end if;
 delete from public.sanctuary_placements;
 replay := public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
 if replay-'replayed' <> result-'replayed' then raise exception 'Seat removal invalidated replay'; end if;
end $$;
reset role;
-- The bounded definer RPC is available only to authenticated callers.
do $$ begin
 if has_function_privilege('anon','public.perform_sanctuary_shared_rest(uuid,uuid)','EXECUTE') then raise exception 'Anonymous execute granted'; end if;
 if not exists(select 1 from pg_proc where oid='public.perform_sanctuary_shared_rest(uuid,uuid)'::regprocedure and prosecdef and proconfig @> array['search_path=""']) then raise exception 'Definer path not pinned'; end if;
end $$;

create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when insufficient_privilege then return; end;
 raise exception 'Unexpected permission: %',statement;
end $$;
set role authenticated;
select pg_temp.expect_denied('select * from sanctuary_internal.rest_receipts');
select pg_temp.expect_denied('insert into sanctuary_internal.rest_receipts default values');
select pg_temp.expect_denied('update sanctuary_internal.rest_receipts set result_snapshot=''{}''');
select pg_temp.expect_denied('delete from sanctuary_internal.rest_receipts');
-- Authentication absence fails before any data access.
select set_config('request.jwt.claim.sub','',false);
select pg_temp.expect_denied($q$select public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001')$q$);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
do $$ declare result jsonb; begin
 result:=public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001');
 if result->>'error'<>'moss_seat_must_be_placed' or result ? 'memory' then raise exception 'Cross-owner UUID exposed receipt'; end if;
 result:=public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
 if result->>'error'<>'companion_required' then raise exception 'Foreign companion returned data'; end if;
 if (public.perform_sanctuary_shared_rest(null,null)->>'error')<>'invalid_request' then raise exception 'Null request accepted'; end if;
end $$;
reset role;
set role anon;
select pg_temp.expect_denied($q$select public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001')$q$);
reset role;
-- A hostile caller search path cannot replace fully-qualified gameplay tables.
create schema hostile;
grant usage on schema hostile to authenticated;
create table hostile.companions(id uuid,owner_id uuid);
create table hostile.rest_receipts(result_snapshot jsonb);
set role authenticated;
set search_path=hostile,public;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
do $$ declare result jsonb; begin
 result:=public.perform_sanctuary_shared_rest('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001');
 if result->>'replayed'<>'true' or result#>>'{companion,energy}'<>'95' then raise exception 'Hostile path changed receipt'; end if;
end $$;
reset role;
reset search_path;
do $$ declare role_name text; permission text; begin
 foreach role_name in array array['anon','authenticated'] loop
   if has_schema_privilege(role_name,'sanctuary_internal','USAGE') then raise exception 'Private schema exposed to %',role_name; end if;
   foreach permission in array array['SELECT','INSERT','UPDATE','DELETE'] loop
     if has_table_privilege(role_name,'sanctuary_internal.rest_receipts',permission) then raise exception 'Private receipt privilege % for %',permission,role_name; end if;
   end loop;
 end loop;
end $$;
