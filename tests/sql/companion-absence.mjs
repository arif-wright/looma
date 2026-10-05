// Isolated SQL regression: no network or live database is used by this test.
// Install @electric-sql/pglite@0.5.8 in a temporary directory, then run from repo root:
// PGLITE_MODULE=file:///tmp/<dir>/node_modules/@electric-sql/pglite/dist/index.js node tests/sql/companion-absence.mjs
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const owner='00000000-0000-0000-0000-000000000001', id='00000000-0000-0000-0000-000000000002';
await db.exec(`
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function public._clamp(int) returns int language sql as $$ select greatest(0,least(100,$1)) $$;
create table companions (id uuid primary key, owner_id uuid, affection int, trust int, energy int, mood text, updated_at timestamptz, created_at timestamptz default now());
create table companion_stats (companion_id uuid primary key references companions, last_passive_tick timestamptz, last_daily_bonus_at timestamptz, bond_score int default 0, bond_level int default 0);
create table companion_care_events (id uuid default gen_random_uuid(), companion_id uuid, owner_id uuid, action text, affection_delta int, trust_delta int, energy_delta int, note text, created_at timestamptz default now());
set test.uid='${owner}';
insert into companions values ('${id}','${owner}',80,75,20,'neutral',now(),now());
insert into companion_stats(companion_id,last_passive_tick) values('${id}',now()-interval '10 years');
`);
const old=readFileSync('supabase/migrations/20251114_companion_passive_and_checkin.sql','utf8');
await db.exec(old.slice(old.indexOf('create or replace function public.tick_companions'),old.indexOf('drop function if exists public.apply_daily')));
await db.exec(old.slice(old.indexOf('create or replace function public.apply_daily')));
const bond=readFileSync('supabase/migrations/20251115_companion_bond_level.sql','utf8');
await db.exec(bond.slice(bond.indexOf('create or replace function public.calculate_bond'),bond.indexOf('-- Recalculate bonds')));
const permissions = async () => (await db.query("select proacl::text, prosecdef, proconfig from pg_proc where proname in ('tick_companions_for_player','apply_daily_companion_bonus') order by proname")).rows;
const beforePermissions = await permissions();
const migration = readFileSync('supabase/migrations/20261003211051_preserve_companion_relationship_on_absence.sql','utf8');
await db.exec(migration);
await db.exec(migration); // Safe reapplication must retain function permissions and behavior.
assert.deepEqual(await permissions(), beforePermissions);
const query = async(sql) => (await db.query(sql)).rows;
const tick = () => query(`select * from tick_companions_for_player('${owner}')`);
const snapshot = async() => (await query(`select affection,trust,energy,mood from companions where id='${id}'`))[0];
await query(`select calculate_bond_for_companion('${id}')`);
const before=(await query('select bond_score from companion_stats'))[0].bond_score;
const tickRows = await tick();
assert.equal(tickRows[0].energy,80);
assert.equal(tickRows[0].affection,80);
assert.equal(tickRows[0].trust,75);
assert.equal(tickRows[0].mood,'radiant');
assert.ok(new Date(tickRows[0].last_passive_tick).getTime() > Date.now()-60_000);
assert.deepEqual(await snapshot(),{affection:80,trust:75,energy:80,mood:'radiant'});
await query(`select calculate_bond_for_companion('${id}')`);
assert.equal((await query('select bond_score from companion_stats'))[0].bond_score,before);
assert.deepEqual((await query('select affection_delta,trust_delta,energy_delta from companion_care_events'))[0],{affection_delta:0,trust_delta:0,energy_delta:60});
await tick();await tick();
assert.equal((await query('select count(*)::int as n from companion_care_events'))[0].n,1);
assert.deepEqual(await snapshot(),{affection:80,trust:75,energy:80,mood:'radiant'});
await query(`select calculate_bond_for_companion('${id}')`);
assert.equal((await query('select bond_score from companion_stats'))[0].bond_score,before);
for (const value of [0,-10,100,120]) {
 await db.exec(`update companions set affection=${value},trust=${value},energy=0; update companion_stats set last_passive_tick=now()-interval '10 years';`);
 await tick();
 const s=await snapshot(); assert.equal(s.affection,Math.max(0,Math.min(100,value)));assert.equal(s.trust,Math.max(0,Math.min(100,value))); assert.equal(s.energy,80);
}
await db.exec(`update companions set affection=70,trust=65,energy=0,mood='neutral';update companion_stats set last_passive_tick=now()+interval '1 day';`);
await tick();assert.deepEqual(await snapshot(),{affection:70,trust:65,energy:0,mood:'neutral'});
// Complete the two-RPC sequence used by /api/companions/tick, including the daily bonus.
await db.exec(`update companions set affection=80,trust=75,energy=20,mood='neutral';update companion_stats set last_passive_tick=now()-interval '10 years',last_daily_bonus_at=null;`);
await tick();
const daily = () => query(`select * from apply_daily_companion_bonus('${owner}')`);
const bonusRows = await daily();
assert.deepEqual(await snapshot(),{affection:83,trust:77,energy:85,mood:'radiant'});
for (const [key,value] of Object.entries(await snapshot())) assert.equal(bonusRows[0][key],value);
assert.ok(new Date(bonusRows[0].last_daily_bonus_at).getTime() > Date.now()-60_000);
assert.equal(bonusRows[0].affection_delta,3);assert.equal(bonusRows[0].trust_delta,2);assert.equal(bonusRows[0].energy_delta,5);
const eventCount=(await query('select count(*)::int as n from companion_care_events'))[0].n;
await query(`select calculate_bond_for_companion('${id}')`);
const earnedBond=(await query('select bond_score from companion_stats'))[0].bond_score;
for(let i=0;i<3;i++) {
  const repeatTick=await tick();const repeatBonus=await daily();
  for(const row of [repeatTick[0],repeatBonus[0]]) {
    assert.equal(row.affection,83);assert.equal(row.trust,77);assert.equal(row.energy,85);assert.equal(row.event_id,null);
  }
}
assert.equal((await query('select count(*)::int as n from companion_care_events'))[0].n,eventCount);
await query(`select calculate_bond_for_companion('${id}')`);
assert.equal((await query('select bond_score from companion_stats'))[0].bond_score,earnedBond);
await assert.rejects(query(`select * from apply_daily_companion_bonus('${id}')`),/not_owner/);
await assert.rejects(query(`select * from tick_companions_for_player('${id}')`),/not_owner/);
await db.exec(`set test.uid=''`);await assert.rejects(tick(),/unauthorized/);await assert.rejects(daily(),/unauthorized/);
console.log('PASS: isolated PGlite migration, ten-year absence, returned and persisted stats/bond, tick + daily sequence, repeated ticks, bounds, future timestamps, and auth guards');
await db.close();
