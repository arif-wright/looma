// Isolated PostgreSQL (WASM) regression. No credentials or hosted data required.
// PGLITE_MODULE=file:///tmp/<dir>/node_modules/@electric-sql/pglite/dist/index.js node tests/sql/achievement-rewards.mjs
// PGlite is single-session: queued overlapping requests below are NOT a real
// competing-session/lock-scheduling test. Run that separately before release.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000001';
const foreign = '00000000-0000-0000-0000-000000000002';
const achievement = '00000000-0000-0000-0000-000000000003';
const signature = 'public.fn_settle_achievement_reward(uuid,uuid,integer,jsonb)';
const read = (name) => readFileSync(`supabase/migrations/${name}`, 'utf8');
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
let checks = 0;
const check = (name) => { checks++; console.log(`PASS ${checks}: ${name}`); };

await db.exec(`
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table public.game_titles(id uuid primary key);
create table public.notifications(kind text, target_kind text);
create table public.mv_leader_weekly(user_id uuid, game_id uuid, best_score integer, week_utc timestamp);
insert into auth.users values ('${owner}'), ('${foreign}');
`);
// Use the actual catalog/claim/points and wallet migrations, plus the unchanged
// economy ledger DDL. Its unrelated generic economy/mission functions are not
// needed here and are deliberately not replaced by test implementations.
await db.exec(read('20251101_phase10_4_achievements.sql'));
await db.exec(read('20251102_phase10_6_economy.sql'));
const economyMigration = read('20260212_economy_transactions_and_mission_sessions.sql');
await db.exec(economyMigration.slice(0, economyMigration.indexOf('create or replace function public.fn_economy_apply(')));
await db.exec(`
grant usage on schema public, auth to anon, authenticated, service_role;
grant select on public.achievements, public.user_achievements, public.user_points,
  public.wallets, public.wallet_tx, public.economy_transactions to authenticated;
-- Test prerequisite models service_role's existing table access, not a grant
-- introduced by the migration under test.
grant select, insert, update, delete on all tables in schema public to service_role;
revoke all on function public.fn_wallet_grant(uuid,bigint,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.fn_wallet_grant(uuid,bigint,text,uuid,jsonb) to service_role;
insert into public.achievements(id,key,name,description,points,rule)
values('${achievement}', 'fixture-first', 'First', 'Synthetic achievement', 25, '{"kind":"first_clear"}');
`);
const otherAcl = async () => rows(`select oid::regprocedure::text as name, proacl::text, prosecdef, proconfig
from pg_proc where oid in ('public.fn_add_points(uuid,integer)'::regprocedure,
'public.fn_wallet_grant(uuid,bigint,text,uuid,jsonb)'::regprocedure) order by name`);
const tableAcl = async () => rows(`select relname, relacl::text from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname`);
const beforeAcl = await otherAcl();
const beforeTableAcl = await tableAcl();
const migration = read('20261004014624_settle_achievement_rewards_atomically.sql');
await db.exec(migration);
await db.exec(migration);
assert.deepEqual(await otherAcl(), beforeAcl);
assert.deepEqual(await tableAcl(), beforeTableAcl);
const fn = (await rows(`select prosecdef,proconfig from pg_proc where oid='${signature}'::regprocedure`))[0];
assert.equal(fn.prosecdef, false);
assert.deepEqual(fn.proconfig, ['search_path=""']);
for (const role of ['anon', 'authenticated']) {
  assert.equal((await rows(`select has_function_privilege('${role}','${signature}','execute') as permitted`))[0].permitted, false);
}
assert.equal((await rows(`select has_function_privilege('service_role','${signature}','execute') as permitted`))[0].permitted, true);
check('migration reapplies; invoker/search_path and service-only ACL; other ACLs unchanged');

const settle = async (user = owner, factor = 5, meta = {}) => (await rows(
  'select public.fn_settle_achievement_reward($1::uuid,$2::uuid,$3::integer,$4::jsonb) as result',
  [user, achievement, factor, JSON.stringify(meta)]
))[0].result;
const snapshot = async () => {
  const result = {};
  for (const table of ['user_achievements','user_points','wallets','wallet_tx','economy_transactions']) {
    result[table] = await rows(`select * from public.${table} order by 1`);
  }
  return result;
};
const reset = async () => db.exec(`
reset role;
set test.stage='';
truncate public.user_achievements,public.user_points,public.wallet_tx,public.wallets,public.economy_transactions;
insert into public.user_points values ('${owner}',17,now());
insert into public.wallets(user_id,balance) values ('${owner}',9);
set role service_role;
`);
await reset();
const result = await settle(owner, 5, { points: 999999, shards: 999999, key: 'forged' });
assert.deepEqual({points:result.points,shards:result.shards,key:result.key}, {points:25,shards:125,key:'fixture-first'});
assert.equal(result.unlocked, true);
assert.equal((await rows('select points from public.user_points'))[0].points,42);
assert.equal((await rows('select balance from public.wallets'))[0].balance,134);
const receipt = (await rows('select * from public.economy_transactions'))[0];
assert.equal(receipt.idempotency_key, `achievement:${achievement}`);
assert.deepEqual(receipt.amounts,{points:25,shards:125});
assert.equal(receipt.applied,true);
assert.deepEqual(receipt.result,result);
assert.equal((await rows('select meta from public.wallet_tx'))[0].meta.economyTransactionId,receipt.id);
check('trusted catalog amounts, claim, points, wallet balance, transaction and existing ledger receipt commit together');
const paid = await snapshot();
for (let i=0; i<3; i++) assert.deepEqual(await settle(),{unlocked:false,reason:'already_unlocked'});
assert.deepEqual(await snapshot(),paid);
check('repeat and lost-response retry do not write or pay again');

await reset();
const queued = await Promise.all(Array.from({length:8},() => settle()));
assert.equal(queued.filter((row) => row.unlocked).length,1);
assert.equal((await rows('select count(*)::int as n from public.economy_transactions'))[0].n,1);
assert.equal((await rows('select points from public.user_points'))[0].points,42);
check('queued overlap has one winner (single-session, NOT multisession concurrency evidence)');

// Faults after the actual writes prove the entire statement rolls back, including
// preexisting balances and ledger rows. A later success and retry must pay once.
await db.exec(`reset role;
create function public.test_achievement_failure() returns trigger language plpgsql as $$
begin
  if current_setting('test.stage',true) = tg_table_name || ':' || tg_op then
    raise exception 'injected_%_%',tg_table_name,tg_op;
  end if;
  return new;
end; $$;
create trigger fail_claim after insert on public.user_achievements for each row execute function public.test_achievement_failure();
create trigger fail_receipt after insert or update on public.economy_transactions for each row execute function public.test_achievement_failure();
create trigger fail_points after insert or update on public.user_points for each row execute function public.test_achievement_failure();
create trigger fail_wallet_tx after insert on public.wallet_tx for each row execute function public.test_achievement_failure();
create trigger fail_wallet after insert or update on public.wallets for each row execute function public.test_achievement_failure();
`);
for (const stage of ['user_achievements:INSERT','economy_transactions:INSERT','user_points:UPDATE','wallet_tx:INSERT','wallets:UPDATE','economy_transactions:UPDATE']) {
  await reset();
  const before = await snapshot();
  await rows("select set_config('test.stage',$1,false)",[stage]);
  await assert.rejects(settle(),/injected_/);
  assert.deepEqual(await snapshot(),before,stage);
  await db.exec("set test.stage=''");
  assert.equal((await settle()).unlocked,true);
  assert.equal((await settle()).unlocked,false);
  assert.equal((await rows('select points from public.user_points'))[0].points,42);
  assert.equal((await rows('select balance from public.wallets'))[0].balance,134);
  assert.equal((await rows('select count(*)::int as n from public.wallet_tx'))[0].n,1);
  assert.equal((await rows('select count(*)::int as n from public.economy_transactions'))[0].n,1);
  check(`${stage}: rollback, successful retry, repeated no-op`);
}
// First-time balance creation takes INSERT branches in the old helpers.
for (const stage of ['user_points:INSERT','wallets:INSERT']) {
  await reset();
  await db.exec('delete from public.user_points; delete from public.wallets;');
  const before = await snapshot();
  await rows("select set_config('test.stage',$1,false)",[stage]);
  await assert.rejects(settle(),/injected_/);
  assert.deepEqual(await snapshot(),before);
  check(`${stage}: first-balance creation rolls back`);
}

await reset();
await db.exec(`insert into public.user_achievements(user_id,achievement_id,meta) values('${owner}','${achievement}','{"legacy":true}')`);
const legacy = await snapshot();
assert.deepEqual(await settle(),{unlocked:false,reason:'already_unlocked'});
assert.deepEqual(await snapshot(),legacy);
check('legacy unlock remains untouched without inferring or repairing payment');

for (const applied of [false,true]) {
  await reset();
  await rows(`insert into public.economy_transactions(user_id,source,direction,idempotency_key,applied,result)
    values($1,'achievement','grant',$2,$3,'{}')`,[owner,`achievement:${achievement}`,applied]);
  const before = await snapshot();
  await assert.rejects(settle(),/achievement_reward_receipt_conflict/);
  assert.deepEqual(await snapshot(),before);
  check(`orphan receipt applied=${applied} fails closed without repair or rewards`);
}

await reset();
await db.exec(`reset role; update public.achievements set points=0 where id='${achievement}'; set role service_role;`);
const zero = await settle();
assert.equal(zero.points,0);assert.equal(zero.shards,0);assert.equal(zero.unlocked,true);
assert.equal((await rows('select count(*)::int as n from public.wallet_tx'))[0].n,0);
assert.equal((await rows('select applied from public.economy_transactions'))[0].applied,true);
check('zero-point achievement has a single atomic claim and applied receipt');

await reset();
await db.exec(`reset role; update public.achievements set points=37 where id='${achievement}'; set role service_role;`);
assert.equal((await settle(owner,7)).shards,259);
check('database catalog changes and existing private conversion configuration determine settled amounts');

await reset();
const beforeInvalid = await snapshot();
for (const factor of [0,-1,null]) await assert.rejects(settle(owner,factor),/invalid_shard_factor/);
await assert.rejects(settle(null),/identity_required/);
await assert.rejects(settle(owner,5,[]),/invalid_meta/);
await db.exec(`reset role; update public.achievements set is_active=false; set role service_role;`);
await assert.rejects(settle(),/catalog_unavailable/);
assert.deepEqual(await snapshot(),beforeInvalid);
check('invalid factors, missing identity, malformed metadata and inactive catalog fail without writes');

await db.exec(`reset role; update public.achievements set is_active=true,points=2147483647; set role service_role;`);
await assert.rejects(settle(owner,2147483647),/amount_out_of_range/);
assert.deepEqual(await snapshot(),beforeInvalid);
check('amount beyond the JS safe-integer summary range is rejected before writes');
await db.exec(`reset role; update public.achievements set points=25; set test.uid='${owner}';`);
for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(settle(owner,999999),/permission denied/);
  await assert.rejects(settle(foreign,999999),/permission denied/);
  await assert.rejects(rows(`update public.achievements set points=999999 where id='${achievement}'`),/permission denied/);
  await assert.rejects(rows(`insert into public.user_achievements(user_id,achievement_id) values('${owner}','${achievement}')`),/permission denied/);
  await db.exec('reset role');
}
assert.deepEqual(await snapshot(),beforeInvalid);
check('anon/authenticated direct own or foreign RPC, catalog tamper and claim insertion denied');

// Supabase installations can also have default table DML grants. In this
// synthetic fixture, broaden only the test role's table privileges to verify
// the existing RLS policies still reject tampering without a write policy.
await db.exec(`grant insert, update, delete on public.achievements, public.user_achievements,
  public.user_points, public.wallets, public.wallet_tx, public.economy_transactions to authenticated;
set role authenticated;`);
assert.deepEqual(await rows(`update public.achievements set points=999999 where id='${achievement}' returning id`),[]);
assert.equal((await rows('select points from public.achievements'))[0].points,25);
await assert.rejects(rows(`insert into public.user_achievements(user_id,achievement_id) values('${owner}','${achievement}')`),/row-level security/);
await assert.rejects(rows(`insert into public.economy_transactions(user_id,source,direction,idempotency_key)
  values('${owner}','achievement','grant','achievement:${achievement}')`),/row-level security/);
await assert.rejects(settle(owner),/permission denied/);
await assert.rejects(settle(foreign),/permission denied/);
await db.exec('reset role');
assert.deepEqual(await snapshot(),beforeInvalid);
check('existing RLS still blocks catalog/claim/receipt tampering with synthetic default-style DML grants');

await reset();
await db.exec('update public.user_points set points=2147483640');
const beforeOverflow = await snapshot();
await assert.rejects(settle(),/integer out of range/);
assert.deepEqual(await snapshot(),beforeOverflow);
check('real points arithmetic overflow rolls back claim and receipt');

await reset();
await settle(owner);
await settle(foreign);
assert.equal((await rows('select count(*)::int as n from public.economy_transactions'))[0].n,2);
check('the same achievement settles once per distinct owner');
await db.close();
console.log(`PASS: ${checks} isolated SQL checks. No live database or multisession concurrency was tested.`);
