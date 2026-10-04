// Functional and catalog regression only. PGlite is single-session; see the
// companion-lock-order-concurrency.mjs harness for real PostgreSQL lock tests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const migrationName = '20261004151936_enforce_companion_stats_lock_order.sql';
const read = (name) => readFileSync(`supabase/migrations/${name}`, 'utf8');
const migration = read(migrationName);
const owner = '10000000-0000-0000-0000-000000000001';
const foreign = '10000000-0000-0000-0000-000000000002';
const low = '20000000-0000-0000-0000-000000000001';
const high = '20000000-0000-0000-0000-000000000002';
const later = '20000000-0000-0000-0000-000000000003';
let checks = 0;
const check = (label) => console.log(`PASS ${++checks}: ${label}`);
const db = new PGlite();
const rows = async (sql, params=[]) => (await db.query(sql, params)).rows;
const call = (name, id=owner) => rows(`select * from public.${name}($1)`,[id]);
const snapshot = () => rows('select * from companions order by id');
const catalog = () => rows(`select p.oid::regprocedure::text signature, p.proowner, p.proacl::text,
 p.prosecdef, p.proconfig, p.provolatile, p.proparallel, p.proisstrict, p.proargnames,
 pg_get_function_arguments(p.oid) args, pg_get_function_result(p.oid) result
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('calculate_bond_for_companion',
 'recalculate_bonds_for_player','tick_companions_for_player','apply_daily_companion_bonus','set_active_companion','reorder_companions') order by 1`);
try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function public._clamp(int) returns int language sql as $$ select greatest(0,least(100,$1)) $$;
 create table companions(id uuid primary key,owner_id uuid,affection int,trust int,energy int,mood text,updated_at timestamptz,created_at timestamptz default now());
 create table companion_stats(companion_id uuid primary key references companions,last_passive_tick timestamptz,last_daily_bonus_at timestamptz,bond_score int default 0,bond_level int default 0);
 create table companion_care_events(id uuid default gen_random_uuid(),companion_id uuid references companions,owner_id uuid,action text,affection_delta int,trust_delta int,energy_delta int,note text,created_at timestamptz default now());
 set test.uid='${owner}';
 insert into companions values ('${high}','${owner}',50,40,20,'neutral',now(),now()),('${low}','${owner}',80,75,20,'neutral',now(),now());
 insert into companion_stats(companion_id,last_passive_tick) values('${high}',now()-interval '10 years'),('${low}',now()-interval '10 years');`);
 const bond = read('20251115_companion_bond_level.sql');
 await db.exec(bond.slice(bond.indexOf('-- Calculates'),bond.indexOf('-- Bond-focused achievements')));
 await db.exec(read('20261003211051_preserve_companion_relationship_on_absence.sql'));
 // Match intended existing service-only bond ACL; forward replacement must not undo it.
 await db.exec(`revoke all on function public.calculate_bond_for_companion(uuid),public.recalculate_bonds_for_player(uuid) from public,anon,authenticated;
 grant execute on function public.calculate_bond_for_companion(uuid),public.recalculate_bonds_for_player(uuid) to service_role;`);
 await db.exec(`alter table companions add column is_active boolean not null default false,
 add column state text not null default 'idle', add column slot_index int;
 create table player_companion_slots(user_id uuid primary key,max_slots int not null default 3);`);
 const roster = read('20251112_companion_roster_rpcs.sql');
 await db.exec(roster.slice(0,roster.indexOf('drop function if exists public.rename_companion')));
 const active = read('20260615120000_active_companion_state_coherence.sql');
 await db.exec(active.slice(active.indexOf('create or replace function public.set_active_companion')));
 const beforeCatalog = await catalog();
 await db.exec(migration);
 await db.exec(migration);
 assert.deepEqual(await catalog(), beforeCatalog);
 assert.equal(beforeCatalog.length,6);
 check('forward replacement and reapplication preserve all six signatures, owners, ACLs and function attributes');
 const access = (await rows(`select has_function_privilege('anon','public.calculate_bond_for_companion(uuid)','EXECUTE') anon,
 has_function_privilege('authenticated','public.recalculate_bonds_for_player(uuid)','EXECUTE') authenticated,
 has_function_privilege('service_role','public.calculate_bond_for_companion(uuid)','EXECUTE') service`))[0];
 assert.deepEqual(access,{anon:false,authenticated:false,service:true});
 check('service-only bond containment remains intact');
 const before = await snapshot();
 await db.exec(`set test.uid=''`);
 await assert.rejects(call('tick_companions_for_player'),/unauthorized/);
 await assert.rejects(call('apply_daily_companion_bonus'),/unauthorized/);
 await db.exec(`set test.uid='${owner}'`);
 for(const fn of ['tick_companions_for_player','apply_daily_companion_bonus']) {
   await assert.rejects(call(fn,foreign),/not_owner/);
   await assert.rejects(call(fn,null),/not_owner/);
 }
 assert.deepEqual(await snapshot(),before);
 check('unauthenticated, null owner and foreign owner guards precede mutation');
 const tick = await call('tick_companions_for_player');
 assert.equal(tick.length,2);
 for(const value of tick) assert.equal(value.energy,80);
 assert.deepEqual(tick.find(x=>x.companion_id===low).affection,80);
 assert.deepEqual(tick.find(x=>x.companion_id===low).trust,75);
 const bonus = await call('apply_daily_companion_bonus');
 assert.equal(bonus.length,2);
 assert.deepEqual(bonus.map(x=>[x.companion_id,x.affection,x.trust,x.energy]).sort(),[[low,83,77,85],[high,53,42,85]]);
 check('reverse-inserted multi-companion tick/bonus preserve exact formulas and returned values');
 const eventsBefore = (await rows('select count(*)::int n from companion_care_events'))[0].n;
 await call('tick_companions_for_player'); await call('apply_daily_companion_bonus');
 assert.equal((await rows('select count(*)::int n from companion_care_events'))[0].n,eventsBefore);
 check('repeated tick/bonus produce no duplicate gain or event');
 // Compare unchanged formula around every threshold, negative and upper saturation.
 for(const sum of [-10,0,9,10,19,20,39,40,59,60,79,80,99,100,119,120,139,140,159,160,179,180,200,250]) {
   await db.query('update companions set affection=$1,trust=0 where id=$2',[sum,low]);
   const [value] = await call('calculate_bond_for_companion',low);
   const score = Math.max(0,Math.min(200,sum));
   assert.equal(value.bond_score,score);
   assert.equal(value.bond_level,score<10?0:score<20?1:Math.min(10,Math.floor(score/20)+1));
 }
 check('bond threshold boundaries and lower/upper score saturation are unchanged');
 await db.exec(`insert into companion_care_events(companion_id,owner_id,action) select '${low}','${owner}','feed' from generate_series(1,100);
 update companions set affection=50,trust=40 where id='${low}';`);
 assert.equal((await call('calculate_bond_for_companion',low))[0].bond_score,110);
 await db.exec(`insert into companion_care_events(companion_id,owner_id,action) select '${low}','${owner}','feed' from generate_series(1,100);`);
 assert.equal((await call('calculate_bond_for_companion',low))[0].bond_score,110);
 assert.equal((await call('recalculate_bonds_for_player')).length,2);
 check('care-event contribution remains capped and player recalculation returns existing stats');
 // Roster prelocks must not sort the user's requested presentation order.
 await rows(`select reorder_companions(array['${high}','${low}']::uuid[])`);
 assert.deepEqual(await rows('select id,slot_index from companions order by id'),[{id:low,slot_index:1},{id:high,slot_index:0}]);
 await rows(`select reorder_companions(array['${high}','${high}','${low}','${high}']::uuid[])`);
 assert.deepEqual(await rows('select id,slot_index from companions order by id'),[{id:low,slot_index:2},{id:high,slot_index:1}]);
 await rows(`select reorder_companions(null::uuid[])`);
 await rows(`select * from set_active_companion('${high}')`);
 const activation = await rows(`select * from set_active_companion('${low}')`);
 assert.deepEqual(activation,[{companion_id:low,is_active:true}]);
 assert.deepEqual(await rows('select id,is_active,state from companions order by id'),[{id:low,is_active:true,state:'active'},{id:high,is_active:false,state:'idle'}]);
 await rows(`select set_companion_state('${high}','active')`);
 assert.deepEqual(await rows('select id,is_active,state from companions order by id'),[{id:low,is_active:false,state:'idle'},{id:high,is_active:true,state:'active'}]);
 const beforeRosterGuard = await snapshot();
 await db.exec(`set test.uid=''`);
 await assert.rejects(rows(`select reorder_companions(array['${high}']::uuid[])`),/unauthorized/);
 await assert.rejects(rows(`select * from set_active_companion('${high}')`),/unauthorized/);
 await db.exec(`set test.uid='${foreign}'`);
 await assert.rejects(rows(`select * from set_active_companion('${high}')`),/not_owner/);
 await rows(`select reorder_companions(array['${high}']::uuid[])`);
 assert.deepEqual(await snapshot(),beforeRosterGuard);
 await db.exec(`set test.uid='${owner}'`);
 check('roster prelocks preserve caller order, duplicates/capacity, active-state coherence and authorization');
 await db.exec(`delete from companion_stats where companion_id='${high}';`);
 await assert.rejects(call('calculate_bond_for_companion',high),/No stats found for companion/);
 await assert.rejects(call('calculate_bond_for_companion',later),/No stats found for companion/);
 assert.equal((await call('recalculate_bonds_for_player')).length,1);
 assert.equal((await rows(`select count(*)::int n from companion_stats where companion_id='${high}'`))[0].n,0);
 await call('tick_companions_for_player');
 assert.equal((await rows(`select count(*)::int n from companion_stats where companion_id='${high}'`))[0].n,1);
 check('missing stats semantics remain: bond throws, recalc skips, tick creates');
 await db.exec(`delete from companion_stats where companion_id='${high}';`);
 await call('apply_daily_companion_bonus');
 assert.equal((await rows(`select count(*)::int n from companion_stats where companion_id='${high}'`))[0].n,1);
 check('daily bonus creates missing stats only for owned locked companions');
 // A trigger simulates a roster insertion after the workset was locked. It does
 // not simulate competing PostgreSQL sessions; it verifies the frozen-ID boundary.
 await db.exec(`delete from companion_stats where companion_id='${high}';
 create function test_new_roster() returns trigger language plpgsql as $$ begin
 if new.companion_id='${high}' then
 insert into companions(id,owner_id,affection,trust,energy,mood,updated_at,created_at) values('${later}','${owner}',1,2,3,'neutral',now(),now());
 insert into companion_stats(companion_id,last_passive_tick) values('${later}',now()-interval '10 years');
 end if; return new; end $$;
 create trigger test_new_roster before insert on companion_stats for each row execute function test_new_roster();`);
 const frozen = await call('tick_companions_for_player');
 assert.equal(frozen.length,2);
 assert.equal(frozen.some(x=>x.companion_id===later),false);
 assert.equal((await rows(`select energy from companions where id='${later}'`))[0].energy,3);
 await db.exec('drop trigger test_new_roster on companion_stats');
 assert.equal((await call('tick_companions_for_player')).length,3);
 check('new roster entries after parent-lock phase are deferred until the next invocation');
 await db.exec(`set test.uid='${foreign}'`);
 assert.deepEqual(await call('tick_companions_for_player',foreign),[]);
 assert.deepEqual(await call('apply_daily_companion_bonus',foreign),[]);
 assert.deepEqual(await call('recalculate_bonds_for_player',foreign),[]);
 check('empty roster returns empty sets');
 // Absence of a required baseline must abort before any replacement or new RPC.
 await db.exec('drop function public.recalculate_bonds_for_player(uuid)');
 const beforeMissing = await catalog();
 await assert.rejects(db.exec(migration),/companion_lock_order_baseline_missing/);
 await db.exec('rollback');
 assert.deepEqual(await catalog(),beforeMissing);
 check('missing baseline aborts atomically without accidentally creating an exposed function');
 console.log(`PASS: ${checks} functional/catalog groups; real multi-session concurrency is a separate NOT-RUN gate here.`);
} finally { await db.close(); }
