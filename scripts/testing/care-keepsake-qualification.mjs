// Isolated PostgreSQL/WASM regression suite. No hosted database or credentials.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and pass its
// dist/index.js as PGLITE_MODULE. No production dependency is required.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const migration = '20261003215132_qualify_care_moss_seat.sql';
const root = new URL('../../', import.meta.url);
const sqlFile = (name) => readFile(new URL(`supabase/migrations/${name}`, root), 'utf8');
export const qualificationSecuritySnapshot = async (db) => ({
  tables: (await db.query(`select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') order by c.relname`)).rows,
  policies: (await db.query(`select * from pg_policies where schemaname='public' order by tablename,policyname`)).rows
});

export async function runCareQualificationSuite(db) {
  const owner = '11000000-0000-0000-0000-000000000001';
  const other = '11000000-0000-0000-0000-000000000002';
  const cid = (n) => `22000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const eid = (n) => `33000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const rows = async (sql, args=[]) => (await db.query(sql,args)).rows;
  const scalar = async (sql,args=[]) => Object.values((await rows(sql,args))[0])[0];
  const checks = [];
  const check = (name, actual, expected) => { assert.deepEqual(actual,expected,name); checks.push(name); };
  await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  for (let n=1;n<=7;n++) await db.query('insert into public.companions(id,owner_id,name) values($1,$2,$3)',[cid(n),n===7?other:owner,`Care ${n}`]);
  const event = (n,companion,action='feed',at='2026-01-01T00:00:00Z',who=owner) => db.query(
    'insert into public.companion_care_events(id,owner_id,companion_id,action,created_at) values($1,$2,$3,$4,$5)',[eid(n),who,cid(companion),action,at]);
  const award = async (companion,ev,who=owner) => {
    await db.exec('set role service_role');
    try { return await scalar('select public.unlock_care_moss_seat($1,$2,$3)',[who,cid(companion),ev===null?null:eid(ev)]); }
    finally { await db.exec('reset role'); }
  };
  const count = (table,companion) => scalar(`select count(*)::int from public.${table} where companion_id=$1`,[cid(companion)]);

  // Excluded events are persisted too; their action, not an in-memory counter,
  // determines qualification. Milestone-style events use the historical system action.
  for (const [i,action] of ['passive','daily_bonus','sanctuary_rest','system'].entries()) await event(10+i,1,action);
  check('passive, bonus, shared-rest and milestone/system events do not qualify',await award(1,10),null);
  await event(21,1,'feed');
  check('one direct event is insufficient',await award(1,21),null);
  await event(22,1,'play');
  check('two direct events are insufficient',await award(1,22),null);
  await event(23,2,'groom');
  await event(24,1,'feed','2026-01-01T00:00:00Z',other);
  check('other companion and wrong-owner rows do not count',await award(1,22),null);
  await event(25,1,'groom','2026-01-03T00:00:00Z');
  check('missing persisted trigger is rejected even after threshold',await award(1,999),null);
  check('null trigger is rejected',await award(1,null),null);
  check('passive triggering event is rejected even after threshold',await award(1,10),null);
  check('other companion triggering event is rejected',await award(1,23),null);
  check('wrong-owner triggering event is rejected',await award(1,24),null);
  check('wrong owner cannot award this companion',await award(1,25,other),null);
  const first = await award(1,25);
  check('third persisted direct-care event awards Moss Seat',first?.itemKey,'care-moss-seat');
  const owned = (await rows('select * from public.user_items where id=$1',[first.id]))[0];
  check('proof records exactly the qualifying feed/play/groom events',owned.provenance_json.careEvents.map(e=>e.id),[eid(21),eid(22),eid(25)]);
  check('proof version is stable',owned.provenance_json.ruleVersion,'direct-care-3-v1');
  check('proof moment count is three',owned.provenance_json.careMoments,3);
  const journal = (await rows('select * from public.companion_journal_entries where source_id=$1',[first.id]))[0];
  check('award and Journal share authoritative evidence',journal.meta_json.careEvents,owned.provenance_json.careEvents);
  check('Journal binds acquisition identity',journal.meta_json.userItemId,first.id);
  check('repeat triggering event is a no-op',await award(1,25),null);
  await event(26,1,'feed','2026-01-04T00:00:00Z');
  check('later successful event cannot duplicate award',await award(1,26),null);
  check('one award remains',await count('user_items',1),1);
  check('one Journal remains',await count('companion_journal_entries',1),1);

  // Deliberately reverse insertion order and tie two times. Every moment may be
  // the same action; qualification must not accidentally require action diversity.
  await event(44,3,'feed','2026-02-03T00:00:00Z');
  await event(43,3,'feed','2026-02-02T00:00:00Z');
  await event(42,3,'feed','2026-02-01T00:00:00Z');
  await event(41,3,'feed','2026-02-01T00:00:00Z');
  const same = await award(3,44);
  check('three same-action moments qualify',same?.itemKey,'care-moss-seat');
  const evidence = await scalar('select provenance_json from public.user_items where id=$1',[same.id]);
  check('earliest three use deterministic created_at/id ordering',evidence.careEvents.map(e=>e.id),[eid(41),eid(42),eid(43)]);
  check('later trigger need not be one of earliest three',evidence.careEvents.some(e=>e.id===eid(44)),false);

  // Legacy acquisition is intentionally opaque; the new path must not backfill
  // guessed proof, change timestamps, or create a retrospective Journal entry.
  for(let n=51;n<=53;n++) await event(n,4);
  await db.query(`insert into public.user_items(owner_id,companion_id,item_id,source_type,source_key,provenance_json,acquired_at,updated_at)
    select $1,$2,id,'care_milestone','care_3','{"legacy":"untouched"}','2020-01-01','2020-01-02'
    from public.item_catalog where item_key='care-moss-seat'`,[owner,cid(4)]);
  const legacyBefore = await rows('select * from public.user_items where companion_id=$1',[cid(4)]);
  check('legacy award is a no-op',await award(4,53),null);
  check('legacy row is byte-for-byte equivalent after call',await rows('select * from public.user_items where companion_id=$1',[cid(4)]),legacyBefore);
  check('legacy award receives no new Journal',await count('companion_journal_entries',4),0);

  for(let n=61;n<=63;n++) await event(n,5);
  await db.exec(`create function public.test_care_journal_failure() returns trigger language plpgsql as $$ begin
    if current_setting('test.care_fail',true)='yes' then raise exception 'injected_care_journal_failure'; end if;
    return new; end $$;
    create trigger test_care_journal_failure before insert on public.companion_journal_entries
      for each row execute function public.test_care_journal_failure();
    select set_config('test.care_fail','yes',false);`);
  await assert.rejects(()=>award(5,63),/injected_care_journal_failure/);
  checks.push('Journal insert failure is propagated');
  check('Journal failure rolls back inventory acquisition',await count('user_items',5),0);
  check('Journal failure leaves no partial memory',await count('companion_journal_entries',5),0);
  check('Journal failure preserves already-persisted care',await count('companion_care_events',5),3);
  await db.exec("select set_config('test.care_fail','',false)");
  check('retry succeeds after Journal failure',Boolean((await award(5,63))?.id),true);
  check('second retry is a no-op',await award(5,63),null);
  check('successful retry creates one acquisition',await count('user_items',5),1);
  check('successful retry creates one Journal',await count('companion_journal_entries',5),1);
  await db.exec('drop trigger test_care_journal_failure on public.companion_journal_entries; drop function public.test_care_journal_failure()');

  // Catalog absence and unknown companion are harmless, with no generated proof.
  check('unknown companion rejected',await award(99,63),null);
  await event(71,6); await event(72,6); await event(73,6);
  await db.exec("update public.item_catalog set item_key='care-moss-seat-temporarily-absent' where item_key='care-moss-seat'");
  check('missing catalog item is a no-op',await award(6,73),null);
  await db.exec("update public.item_catalog set item_key='care-moss-seat' where item_key='care-moss-seat-temporarily-absent'");
  for(const role of ['anon','authenticated']) {
    check(`${role} lacks execute`,await scalar("select has_function_privilege($1,'public.unlock_care_moss_seat(uuid,uuid,uuid)','EXECUTE')",[role]),false);
    await db.exec(`set role ${role}`);
    try { await assert.rejects(()=>db.query('select public.unlock_care_moss_seat($1,$2,$3)',[owner,cid(6),eid(73)]),/permission denied/); }
    finally { await db.exec('reset role'); }
    checks.push(`${role} execution is denied at runtime`);
  }
  check('service role has execute',await scalar("select has_function_privilege('service_role','public.unlock_care_moss_seat(uuid,uuid,uuid)','EXECUTE')"),true);
  check('helper is invoker with empty pinned search path',await rows("select prosecdef,proconfig from pg_proc where oid='public.unlock_care_moss_seat(uuid,uuid,uuid)'::regprocedure"),[{prosecdef:false,proconfig:['search_path=""']}]);
  check('qualification does not change companion gameplay stats',await rows('select affection,trust,energy from public.companions where id=$1',[cid(1)]),[{affection:0,trust:0,energy:100}]);
  return checks;
}

async function main() {
  const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role authenticated; create role anon; create role service_role bypassrls;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema public,auth to authenticated,anon,service_role;`);
    for(const name of ['20251109_companion_core.sql','20251112_companion_actions_mood.sql',
      '20260228_companion_chapter_rewards.sql','20260228_companion_journal_entries.sql',
      '20260613201500_fix_companion_journal_upsert_conflict.sql','20260612201500_personal_sanctuary_mvp.sql',
      '20260612213000_unified_items_and_sanctuary_purpose.sql','20260612223000_sanctuary_shared_rest.sql']) await db.exec(await sqlFile(name));
    // PGlite has no Supabase default grants; this is a fixture-only service role.
    await db.exec('grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role');
    // Seed a legacy acquisition before the forward migration, so deployment itself
    // is also checked for accidental backfill or retrospective Journal creation.
    await db.exec(`insert into auth.users(id) values('99000000-0000-0000-0000-000000000001');
      insert into public.companions(id,owner_id,name) values('98000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000001','Legacy');
      insert into public.companion_care_events(owner_id,companion_id,action,created_at)
        select '99000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000001','feed','2020-01-01' from generate_series(1,3);
      insert into public.user_items(owner_id,companion_id,item_id,source_type,source_key,provenance_json,acquired_at,updated_at)
        select '99000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000001',id,'care_milestone','care_3','{"historical":"original"}','2020-01-01','2020-01-02'
        from public.item_catalog where item_key='care-moss-seat';`);
    const legacySnapshot=async()=>({items:(await db.query('select * from public.user_items order by id')).rows,
      journal:(await db.query('select * from public.companion_journal_entries order by id')).rows});
    const legacyBefore=await legacySnapshot();
    const before = await qualificationSecuritySnapshot(db);
    await db.exec(await sqlFile(migration));
    assert.deepEqual(await legacySnapshot(),legacyBefore,'forward migration must leave legacy acquisition/Journal unchanged');
    assert.deepEqual(await qualificationSecuritySnapshot(db),before,'new migration must not change gameplay table grants or RLS');
    const checks=await runCareQualificationSuite(db);
    console.log(`PASS: ${checks.length+2} care qualification assertions (including legacy migration preservation and unchanged gameplay ACL/RLS)`);
    for(const name of checks) console.log(`  PASS: ${name}`);
    console.log('Scope: isolated single-session PostgreSQL/WASM; no live database or multisession claim.');
  } catch(error) { console.error(error.message,error.detail??'',error.where??''); process.exitCode=1; }
  finally { await db.close(); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
