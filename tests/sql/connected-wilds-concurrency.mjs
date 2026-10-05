// Native multi-connection PostgreSQL only. Prepared, not run in the restricted authoring environment.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Session, literal as q, identifier } from './helpers/native-postgres.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const scenarios = ['two first joins preserve one checkpoint', 'travel defeats an old source save', 'simultaneous portal requests commit once'];
if (process.argv.includes('--self-test')) {
  assert.equal(scenarios.length, 3);
  assert.throws(() => new Session('host=remote dbname=postgres', 'invalid'));
  console.log('PASS harness framing/scope self-test. Native concurrency NOT RUN.');
  process.exit(0);
}
assert.equal(process.env.MEMVOYA_PG_TEST_ONLY, '1');
assert(process.env.PGHOST?.startsWith('/') && !process.env.PGHOST.includes(','), 'Only an explicitly approved disposable Unix-socket cluster is allowed');
assert(process.env.PGUSER && !process.env.PGPASSWORD && !process.env.PGHOSTADDR && !process.env.PGSERVICE && !process.env.PGSERVICEFILE);
assert(!process.env.PGDATABASE || process.env.PGDATABASE === 'postgres');
const database = `memvoya_wilds_${randomUUID().replaceAll('-', '')}`;
const sessions = [];
const report = { status: 'RUNNING', database, scenarios: [], blockingEvidence: [] };
const connect = async (name, db = database) => { const session = new Session(db, name); sessions.push(session); return session.init(); };
const result = async (session, sql) => (await session.rows(`${sql} AS result`))[0].result;
const actor = session => session.exec("select set_config('request.jwt.claim.role','service_role',false); set role service_role;", { failFast: true });
let observer;
async function observeBlock(label, waiter, holder) {
  for (let n = 0; n < 250; n++) {
    await observer.exec('select pg_stat_clear_snapshot();');
    const rows = await observer.rows(`SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=${waiter.pid}`);
    if (rows[0]?.wait_event_type === 'Lock' && rows[0].blockers.includes(holder.pid)) {
      assert.notEqual(waiter.pid, holder.pid); report.blockingEvidence.push({ label, waiterPid: waiter.pid, holderPid: holder.pid, ...rows[0] }); return;
    }
    await delay(10);
  }
  throw new Error(`${label}: required independent-backend lock wait not observed`);
}
try {
  const bootstrap = await connect('bootstrap', 'postgres');
  await bootstrap.exec(`CREATE DATABASE ${identifier(database)};`, { failFast: true });
  observer = await connect('observer');
  report.serverVersion = (await observer.rows('SELECT version() AS value'))[0].value;
  for (const path of ['tests/sql/connected-wilds-fixture.sql','supabase/migrations/20260802210000_world_persistence.sql','supabase/migrations/20261005052000_connected_wilds_portals.sql','tests/sql/connected-wilds-portals.sql']) {
    await observer.exec(await readFile(resolve(root, path), 'utf8'), { failFast: true });
  }
  const a = await connect('first'); const b = await connect('second'); await actor(a); await actor(b);
  const firstUser = '33333333-3333-4333-8333-333333333333';
  await observer.exec(`INSERT INTO auth.users VALUES (${q(firstUser)});`);
  await a.exec('BEGIN;');
  const loadA = await result(a, `SELECT public.fn_world_load_state(${q(firstUser)},'wilds-exploration')`);
  const loadBPromise = result(b, `SELECT public.fn_world_load_state(${q(firstUser)},'wilds-town')`);
  await observeBlock(scenarios[0], b, a); await a.exec('COMMIT;');
  const loadB = await loadBPromise;
  assert.equal(loadA.mapId, 'wilds-exploration'); assert.equal(loadB.mapId, loadA.mapId); assert.equal(loadB.stateVersion, loadA.stateVersion);
  report.scenarios.push(scenarios[0]);

  await a.exec('BEGIN;');
  const travelled = await result(a, `SELECT public.fn_world_travel_portal(${q(firstUser)},'wilds-exploration',1,'grove-to-hollow',880,270,1)`);
  const savePromise = result(b, `SELECT public.fn_world_save_state(${q(firstUser)},'wilds-exploration',1,500,270,1)`);
  await observeBlock(scenarios[1], b, a); await a.exec('COMMIT;');
  assert.equal(travelled.ok, true); assert.equal((await savePromise).ok, false);
  report.scenarios.push(scenarios[1]);

  await a.exec('BEGIN;');
  const returnA = await result(a, `SELECT public.fn_world_travel_portal(${q(firstUser)},'wilds-town',1,'hollow-to-grove',80,270,2)`);
  const returnBPromise = result(b, `SELECT public.fn_world_travel_portal(${q(firstUser)},'wilds-town',1,'hollow-to-grove',80,270,2)`);
  await observeBlock(scenarios[2], b, a); await a.exec('COMMIT;');
  assert.equal(returnA.ok, true); assert.equal((await returnBPromise).ok, false);
  const final = (await observer.rows(`SELECT map_id,state_version,x,y FROM public.player_world_state WHERE user_id=${q(firstUser)}`))[0];
  assert.equal(final.map_id, 'wilds-exploration'); assert.equal(Number(final.state_version), 3); assert.equal(Number(final.x), 804);
  report.scenarios.push(scenarios[2]);
  assert.deepEqual(report.scenarios, scenarios); assert.equal(report.blockingEvidence.length, 3); report.status = 'PASSED';
} catch (error) { report.status = 'FAILED'; report.error = error.message; process.exitCode = 1; }
finally {
  for (const session of sessions) session.kill();
  const path = process.env.MEMVOYA_WILDS_REPORT || resolve(root, 'test-results/connected-wilds/native-postgres.json');
  await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
