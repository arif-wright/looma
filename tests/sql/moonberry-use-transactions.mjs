// Real native PostgreSQL sessions. Launch only through moonberry-use-native.mjs.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Session, literal as q, identifier } from './helpers/native-postgres.mjs';
import { bootstrap, candidatePath, sha256 } from './helpers/moonberry-use-fixture.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
assert.equal(process.env.MEMVOYA_PG_TEST_ONLY, '1', 'Native tests require an explicit disposable-cluster guard');
assert.match(process.env.MEMVOYA_MOONBERRY_CLUSTER_ROOT || '', /^\/tmp\/mv-moonberry-native-[a-zA-Z0-9]+$/);
assert.equal(process.env.PGHOST, `${process.env.MEMVOYA_MOONBERRY_CLUSTER_ROOT}/socket`);
assert.equal(await realpath(process.env.PGHOST), process.env.PGHOST);
assert.equal((await stat(process.env.PGHOST)).mode & 0o777, 0o700);
for (const key of ['PGHOSTADDR', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'DATABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL']) assert(!process.env[key], `${key} is forbidden`);
assert.equal(process.env.PGDATABASE, 'postgres');
assert.equal(process.env.PGPASSFILE, '/dev/null');
assert.match(process.env.PSQL_BIN, /\/postgresql\/17\/bin\/psql$/);
const database = `memvoya_moonberry_${randomUUID().replaceAll('-', '')}`;
const report = { status: 'RUNNING', startedAt: new Date().toISOString(), database, checks: [], failures: [], blockingEvidence: [], sessions: [],
  limitations: ['Synthetic consent schema is an explicit test fixture, not a verified hosted migration.', 'Native ACL/RLS checks do not replace hosted PostgREST authentication or UI acceptance.', 'Existing gather consent behavior is outside this candidate.', 'Ordinary archive-window filtering is application-level and not asserted by this SQL suite.'] };
const sessions = new Set();
let observer, admin, activeScenario;
const connect = async (name, db = database) => { const s = new Session(db, `moonberry:${name}`); sessions.add(s); await s.init(); report.sessions.push({ name, backendPid: s.pid, clientPid: s.child.pid }); return s; };
const scalar = async (s, sql) => (await s.rows(`${sql} AS result`))[0].result;
const track = promise => { const task = { state: 'pending' }; task.done = promise.then(value => { task.state = 'done'; return { value }; }, error => { task.state = 'failed'; return { error }; }); return task; };
const finish = async task => { const result = await task.done; if (result.error) throw result.error; return result.value; };
const actor = async (s, owner, role = 'authenticated') => s.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub',${q(owner || '')},false); SELECT set_config('request.jwt.claim.role',${q(role)},false); SET ROLE ${identifier(role)};`, { failFast: true });
const use = (s, f, key = randomUUID(), target = f.target, item = f.item) => scalar(s, `SELECT public.share_moonberry(${q(item)},${q(target)},${q(key)})`);
const gather = (s, f, key = randomUUID()) => scalar(s, `SELECT public.fn_world_gather_moonberry(${q(f.owner)},'wilds-exploration',1,'moonberry-bush',800,120,${q(key)})`);
const story = (s, item) => s.rows(`SELECT * FROM public.read_moonberry_share_moments(${q(item)})`);
async function blocked(label, waiter, holder, task) {
  assert.notEqual(waiter.pid, holder.pid);
  const until = Date.now() + 5_000;
  while (Date.now() < until) {
    await observer.exec('SELECT pg_stat_clear_snapshot();');
    const activity = await observer.rows(`SELECT pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=${waiter.pid}`);
    if (activity[0]?.wait_event_type === 'Lock' && activity[0].blockers.includes(holder.pid)) {
      const locks = await observer.rows(`SELECT pid,locktype,relation::regclass::text AS relation,mode,granted FROM pg_locks WHERE pid IN (${waiter.pid},${holder.pid}) ORDER BY pid,locktype,relation,mode`);
      report.blockingEvidence.push({ scenario: activeScenario, label, holderPid: holder.pid, waiterPid: waiter.pid, activity, locks }); return;
    }
    assert.equal(task.state, 'pending', `${label}: contender did not overlap/lock-wait`);
    await delay(10);
  }
  throw new Error(`${label}: no independently observed backend blocking`);
}
async function test(name, run) {
  activeScenario = name;
  const local = [];
  const session = async suffix => { const s = await connect(`${name}:${suffix}`); local.push(s); return s; };
  try { const evidence = await run(session); report.checks.push({ name, status: 'PASSED', ...(evidence ? { evidence } : {}) }); console.log(`PASS ${name}`); }
  catch (error) { report.failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
  finally { for (const s of local) { s.kill(); sessions.delete(s); } }
}
async function fixture(quantity = 1, preference = 'enabled') {
  const f = { owner: randomUUID(), source: randomUUID(), target: randomUUID(), item: randomUUID(), request: randomUUID() };
  await observer.exec(`INSERT INTO auth.users VALUES (${q(f.owner)});
    INSERT INTO public.companions(id,owner_id,name,is_active,state,affection,trust,energy) VALUES
      (${q(f.source)},${q(f.owner)},'Willow',true,'active',37,42,64),
      (${q(f.target)},${q(f.owner)},'Hazel',false,'idle',23,31,72);
    INSERT INTO public.companion_stats(companion_id,care_streak,last_passive_tick) VALUES (${q(f.source)},3,now()),(${q(f.target)},2,now());
    INSERT INTO public.user_items(id,owner_id,companion_id,item_id,quantity,source_type,source_key,provenance_json,acquired_at)
      SELECT ${q(f.item)},${q(f.owner)},${q(f.source)},id,${quantity},'world','moonberry-bush',
      '{"title":"Gathered in Whispering Grove","reason":"Original acquisition","worldEventId":"11111111-1111-4111-8111-111111111111","nested":{"keep":true}}'::jsonb,'2025-01-02T03:04:05Z'
      FROM public.item_catalog WHERE item_key='world-moonberry';
    INSERT INTO public.world_landmark_discoveries(user_id,landmark_id,map_id,map_version,idempotency_key)
      SELECT ${q(f.owner)},id,map_id,map_version,${q(randomUUID())} FROM public.world_landmarks WHERE landmark_key='moonberry-grove';`, { failFast: true });
  if (preference !== 'absent') {
    const memory = preference === 'enabled' || preference === 'reaction-off' ? 'true' : preference === 'null' ? 'null' : 'false';
    const reaction = preference === 'enabled' ? 'true' : preference === 'null' ? 'null' : 'false';
    await observer.exec(`INSERT INTO public.user_preferences(user_id,consent_memory,consent_reactions) VALUES (${q(f.owner)},${memory},${reaction});`, { failFast: true });
  }
  return f;
}
const inventory = async f => (await observer.rows(`SELECT * FROM public.user_items WHERE id=${q(f.item)}`))[0];
const quantity = async f => (await inventory(f))?.quantity;
const counts = async f => (await observer.rows(`SELECT
 (SELECT count(*)::int FROM item_use_internal.moonberry_receipts WHERE owner_id=${q(f.owner)}) AS receipts,
 (SELECT count(*)::int FROM public.companion_journal_entries WHERE owner_id=${q(f.owner)} AND meta_json->>'action'='share_moonberry') AS memories,
 (SELECT count(*)::int FROM public.world_events WHERE user_id=${q(f.owner)} AND status='succeeded') AS gathers`))[0];
const preserved = row => { const { quantity, updated_at, ...identity } = row; return identity; };
const sideEffects = async f => (await observer.rows(`SELECT
 (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM public.companions c WHERE owner_id=${q(f.owner)}) AS companions,
 (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.companion_id),'[]') FROM public.companion_stats s JOIN public.companions c ON c.id=s.companion_id WHERE c.owner_id=${q(f.owner)}) AS stats,
 (SELECT count(*)::int FROM public.companion_care_events WHERE owner_id=${q(f.owner)}) AS care,
 (SELECT count(*)::int FROM public.bond_events WHERE owner_id=${q(f.owner)}) AS bond,
 (SELECT count(*)::int FROM public.wallet_tx WHERE user_id=${q(f.owner)}) AS wallet,
 (SELECT count(*)::int FROM public.user_achievements WHERE user_id=${q(f.owner)}) AS achievements`))[0];
function minimalReplay(value) { assert.equal(value.replayed, true); assert.deepEqual(Object.keys(value).sort(), ['ok','status','requestId','userItemId','companionId','quantityAfter','replayed'].sort()); }
try {
  admin = await connect('admin', 'postgres');
  await admin.exec(`CREATE DATABASE ${identifier(database)};`, { failFast: true });
  observer = await connect('observer');
  report.native = (await observer.rows("SELECT version() AS version,current_setting('listen_addresses') AS listen_addresses,current_setting('unix_socket_directories') AS unix_socket_directories,inet_server_addr() AS server_address,inet_server_port() AS server_port,current_setting('transaction_isolation') AS isolation"))[0];
  assert.equal(report.native.listen_addresses, ''); assert.equal(report.native.server_address, null); assert.equal(report.native.server_port, null);
  assert.equal(report.native.unix_socket_directories, process.env.PGHOST); assert.equal(report.native.isolation, 'read committed');
  report.hba = await observer.rows('SELECT type,database,user_name,address,auth_method,error FROM pg_hba_file_rules');
  assert(report.hba.every(rule => !rule.error && (rule.type === 'local' ? rule.auth_method === 'peer' : rule.auth_method === 'reject')));
  await bootstrap(observer, root, report);
  const candidate = await readFile(resolve(root, candidatePath), 'utf8');
  const firstEnd = candidate.indexOf('alter table public.user_items drop constraint'); assert(firstEnd > 0);
  const preflight = candidate.slice(0, firstEnd);
  await test('rollout preflight rejects absent, partial and incorrectly typed consent columns', async () => {
    await assert.rejects(observer.exec(preflight), e => e.code === 'P0001' && (e.primaryMessage ?? e.message).includes('moonberry_use_requires_verified_consent_schema'));
    await observer.exec('ALTER TABLE public.user_preferences ADD COLUMN consent_memory boolean;', { failFast: true });
    await assert.rejects(observer.exec(preflight), e => e.code === 'P0001');
    await observer.exec('ALTER TABLE public.user_preferences ADD COLUMN consent_reactions text;', { failFast: true });
    await assert.rejects(observer.exec(preflight), e => e.code === 'P0001');
    await observer.exec('ALTER TABLE public.user_preferences DROP COLUMN consent_reactions; ALTER TABLE public.user_preferences ADD COLUMN consent_reactions boolean;', { failFast: true });
    assert.equal((await observer.rows("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname='item_use_internal'"))[0].count, 0);
  });
  await observer.exec(candidate, { failFast: true });
  await test('one share preserves exact acquisition and every unrelated progression field', async session => {
    const f = await fixture(); const s = await session('user'); await actor(s, f.owner);
    const before = await inventory(f), effects = await sideEffects(f);
    const result = await use(s, f, f.request);
    assert.equal(result.status, 'shared'); assert.equal(result.quantityAfter, 0); assert.equal(result.reaction, 'Hazel receives it gently.'); assert.equal(result.replayed, false);
    assert.deepEqual(preserved(await inventory(f)), preserved(before)); assert.equal(await quantity(f), 0);
    assert.deepEqual(await counts(f), { receipts: 1, memories: 1, gathers: 0 }); assert.deepEqual(await sideEffects(f), effects);
    const memories = await story(s, f.item); assert.equal(memories.length, 1); assert.equal(memories[0].companion_id, f.target);
    assert.equal(memories[0].body, 'You shared one Moonberry with Hazel.'); assert.equal(memories[0].meta_json.userItemId, f.item);
    assert.equal((await inventory(f)).companion_id, f.source);
    const columns = await observer.rows("SELECT column_name FROM information_schema.columns WHERE table_schema='item_use_internal' AND table_name='moonberry_receipts' ORDER BY ordinal_position");
    assert.deepEqual(columns.map(c => c.column_name), ['owner_id','request_id','user_item_id','companion_id','event_id','status','quantity_after','created_at']);
  });
  await test('negative quantities and non-Moonberry zero are rejected for inserts and updates', async () => {
    const f = await fixture();
    await assert.rejects(observer.exec(`UPDATE public.user_items SET quantity=-1 WHERE id=${q(f.item)};`), e => e.code === '23514');
    await assert.rejects(observer.exec(`INSERT INTO public.user_items(owner_id,item_id,quantity,source_type) SELECT ${q(f.owner)},id,0,'test' FROM public.item_catalog WHERE item_key='care-moss-seat';`), e => e.code === '23514');
    const foreignKind = randomUUID();
    await observer.exec(`INSERT INTO public.user_items(id,owner_id,item_id,source_type) SELECT ${q(foreignKind)},${q(f.owner)},id,'test' FROM public.item_catalog WHERE item_key='care-moss-seat';`, { failFast: true });
    await assert.rejects(observer.exec(`UPDATE public.user_items SET quantity=0 WHERE id=${q(foreignKind)};`), e => e.code === '23514');
    await observer.exec(`UPDATE public.user_items SET quantity=0 WHERE id=${q(f.item)};`, { failFast: true });
    await assert.rejects(observer.exec(`UPDATE public.user_items SET item_id=(SELECT id FROM public.item_catalog WHERE item_key='care-moss-seat') WHERE id=${q(f.item)};`), e => e.code === '23514');
    assert.equal(await quantity(f), 0);
  });
  await test('two independent requests race for the last unit exactly once', async session => {
    const f = await fixture(); const a = await session('first'), b = await session('second'); await actor(a, f.owner); await actor(b, f.owner);
    await a.exec('BEGIN;'); const first = await use(a, f, f.request); const work = track(use(b, f));
    await blocked('different requests serialize through grove lock', b, a, work); await a.exec('COMMIT;'); const second = await finish(work);
    assert.equal(first.status, 'shared'); assert.equal(second.status, 'empty'); assert.equal(second.replayed, false);
    assert.equal(await quantity(f), 0); assert.deepEqual(await counts(f), { receipts: 2, memories: 1, gathers: 0 });
  });
  await test('same-key overlapping retries decrement and write one memory once', async session => {
    const f = await fixture(2); const a = await session('first'), b = await session('retry'); await actor(a, f.owner); await actor(b, f.owner);
    await a.exec('BEGIN;'); const first = await use(a, f, f.request); const work = track(use(b, f, f.request));
    await blocked('same request advisory key', b, a, work); await a.exec('COMMIT;'); const second = await finish(work);
    assert.equal(first.quantityAfter, 1); minimalReplay(second); assert.equal(second.quantityAfter, 1);
    assert.equal(await quantity(f), 1); assert.deepEqual(await counts(f), { receipts: 1, memories: 1, gathers: 0 });
  });
  await test('same key cannot switch owned acquisition or chosen companion', async session => {
    const f = await fixture(2); const s = await session('user'); await actor(s, f.owner);
    const other = randomUUID(); await observer.exec(`INSERT INTO public.user_items(id,owner_id,companion_id,item_id,quantity,source_type,source_key) SELECT ${q(other)},owner_id,${q(f.target)},item_id,2,source_type,source_key FROM public.user_items WHERE id=${q(f.item)};`, { failFast: true });
    await use(s, f, f.request);
    assert.equal((await use(s, f, f.request, f.source)).error, 'request_target_mismatch');
    assert.equal((await use(s, f, f.request, f.target, other)).error, 'request_target_mismatch');
    assert.equal(await quantity(f), 1); assert.equal((await observer.rows(`SELECT quantity FROM public.user_items WHERE id=${q(other)}`))[0].quantity, 2);
    assert.deepEqual(await counts(f), { receipts: 1, memories: 1, gathers: 0 });
  });
  for (const changed of ['acquisition', 'companion']) await test(`same-key concurrent ${changed} substitution waits and then rejects`, async session => {
    const f = await fixture(2); const a = await session('first'), b = await session('substitution'); await actor(a, f.owner); await actor(b, f.owner);
    const other = randomUUID();
    await observer.exec(`INSERT INTO public.user_items(id,owner_id,companion_id,item_id,quantity,source_type,source_key) SELECT ${q(other)},owner_id,${q(f.target)},item_id,2,source_type,source_key FROM public.user_items WHERE id=${q(f.item)};`, { failFast: true });
    await a.exec('BEGIN;'); await use(a, f, f.request);
    const work = track(use(b, f, f.request, changed === 'companion' ? f.source : f.target, changed === 'acquisition' ? other : f.item));
    await blocked(`changed ${changed} waits for original request commit`, b, a, work); await a.exec('COMMIT;');
    assert.equal((await finish(work)).error, 'request_target_mismatch');
    assert.equal(await quantity(f), 1); assert.equal((await observer.rows(`SELECT quantity FROM public.user_items WHERE id=${q(other)}`))[0].quantity, 2);
    assert.deepEqual(await counts(f), { receipts: 1, memories: 1, gathers: 0 });
  });
  await test('gather then use observes refill after a real advisory-lock wait', async session => {
    const f = await fixture(0); const before = await inventory(f); const a = await session('gather'), b = await session('use'); await actor(a, f.owner, 'service_role'); await actor(b, f.owner);
    await a.exec('BEGIN;'); const gathered = await gather(a, f); const work = track(use(b, f));
    await blocked('use waits for gather commit', b, a, work); await a.exec('COMMIT;'); const shared = await finish(work);
    assert.equal(gathered.status, 'success'); assert.equal(shared.status, 'shared'); assert.equal(shared.quantityAfter, 0);
    assert.deepEqual(preserved(await inventory(f)), preserved(before)); assert.deepEqual(await counts(f), { receipts: 1, memories: 1, gathers: 1 });
  });
  await test('use then gather at stock limit observes decrement after lock wait', async session => {
    const f = await fixture(20); const before = await inventory(f); const a = await session('use'), b = await session('gather'); await actor(a, f.owner); await actor(b, f.owner, 'service_role');
    await a.exec('BEGIN;'); const shared = await use(a, f); const work = track(gather(b, f));
    await blocked('gather waits for use commit', b, a, work); await a.exec('COMMIT;'); const gathered = await finish(work);
    assert.equal(shared.quantityAfter, 19); assert.equal(gathered.status, 'success'); assert.equal(await quantity(f), 20);
    assert.deepEqual(preserved(await inventory(f)), preserved(before)); assert.deepEqual(await counts(f), { receipts: 1, memories: 1, gathers: 1 });
  });
  await test('gather at full stock commits terminal result before waiting use', async session => {
    const f = await fixture(20); const a = await session('gather'), b = await session('use'); await actor(a, f.owner, 'service_role'); await actor(b, f.owner);
    const key = randomUUID(); await a.exec('BEGIN;'); const full = await gather(a, f, key); const work = track(use(b, f));
    await blocked('use waits behind full gather receipt', b, a, work); await a.exec('COMMIT;'); assert.equal((await finish(work)).quantityAfter, 19);
    assert.equal(full.status, 'inventory_full'); assert.equal((await gather(a, f, key)).status, 'inventory_full'); assert.equal(await quantity(f), 19);
    assert.equal((await gather(a, f)).status, 'success'); assert.equal(await quantity(f), 20);
  });
  await test('empty receipt stays empty across gather refill and new request can consume', async session => {
    const f = await fixture(0); const before = await inventory(f); const s = await session('user'), g = await session('gather'); await actor(s, f.owner); await actor(g, f.owner, 'service_role');
    const empty = await use(s, f, f.request); assert.equal(empty.status, 'empty'); assert.equal(empty.ok, false);
    assert.equal((await gather(g, f)).status, 'success'); assert.equal(await quantity(f), 1);
    const replay = await use(s, f, f.request); minimalReplay(replay); assert.equal(replay.status, 'empty'); assert.equal(replay.quantityAfter, 0); assert.equal(await quantity(f), 1);
    assert.equal((await use(s, f, f.request, f.source)).error, 'request_target_mismatch');
    assert.equal(await quantity(f), 1);
    assert.equal((await use(s, f)).status, 'shared'); assert.equal(await quantity(f), 0); assert.deepEqual(preserved(await inventory(f)), preserved(before));
  });
  await test('successful receipt preserves event quantity across refill without consuming again', async session => {
    const f = await fixture(1); const s = await session('user'), g = await session('gather'); await actor(s, f.owner); await actor(g, f.owner, 'service_role');
    assert.equal((await use(s, f, f.request)).quantityAfter, 0);
    assert.equal((await gather(g, f)).status, 'success'); assert.equal(await quantity(f), 1);
    const replay = await use(s, f, f.request); minimalReplay(replay); assert.equal(replay.status, 'shared'); assert.equal(replay.quantityAfter, 0);
    assert.equal(await quantity(f), 1); assert.deepEqual(await counts(f), { receipts: 1, memories: 1, gathers: 1 });
  });
  await test('foreign owner, foreign companion and missing targets never consume', async session => {
    const f = await fixture(2), foreign = await fixture(2); const s = await session('user'); await actor(s, f.owner);
    assert.equal((await use(s, f, randomUUID(), foreign.target)).error, 'companion_required');
    assert.equal((await use(s, f, randomUUID(), f.target, foreign.item)).error, 'item_required');
    assert.equal((await use(s, f, randomUUID(), randomUUID())).error, 'companion_required');
    assert.equal((await use(s, f, randomUUID(), f.target, randomUUID())).error, 'item_required');
    assert.equal(await quantity(f), 2); assert.equal(await quantity(foreign), 2); assert.deepEqual(await counts(f), { receipts: 0, memories: 0, gathers: 0 });
    assert.deepEqual(await story(s, foreign.item), []);
  });
  await test('unsupported source, catalog, kind and capabilities never consume', async session => {
    const f = await fixture(2); const s = await session('user'); await actor(s, f.owner);
    const edits = ["source_type='shop'", "source_key='other-bush'", 'source_key=null', "item_id=(SELECT id FROM public.item_catalog WHERE item_key='care-moss-seat')"];
    const original = await inventory(f);
    for (const edit of edits) {
      await observer.exec(`UPDATE public.user_items SET ${edit} WHERE id=${q(f.item)};`, { failFast: true });
      assert.equal((await use(s, f)).error, 'item_not_supported');
      await observer.exec(`UPDATE public.user_items SET source_type='world',source_key='moonberry-bush',item_id=${q(original.item_id)} WHERE id=${q(f.item)};`, { failFast: true });
    }
    const catalog = (await observer.rows(`SELECT * FROM public.item_catalog WHERE id=${q(original.item_id)}`))[0];
    try {
      for (const edit of ["item_key='test-impostor'", "kind='gift'", "capabilities='{giftable}'", "capabilities='{consumable}'", "capabilities='{consumable,giftable,placeable}'"]) {
        await observer.exec(`UPDATE public.item_catalog SET ${edit} WHERE id=${q(original.item_id)};`, { failFast: true });
        assert.equal((await use(s, f)).error, 'item_not_supported');
        await observer.exec(`UPDATE public.item_catalog SET item_key='world-moonberry',kind='consumable',capabilities='{consumable,giftable}' WHERE id=${q(original.item_id)};`, { failFast: true });
      }
    } finally { await observer.exec(`UPDATE public.item_catalog SET item_key=${q(catalog.item_key)},kind=${q(catalog.kind)},capabilities=ARRAY[${catalog.capabilities.map(q).join(',')}]::text[] WHERE id=${q(original.item_id)};`, { failFast: true }); }
    assert.equal(await quantity(f), 2); assert.deepEqual(await counts(f), { receipts: 0, memories: 0, gathers: 0 });
  });
  await test('malformed, null and signed-out calls and role ACLs are fail-closed', async session => {
    const f = await fixture(); const s = await session('user'); await actor(s, f.owner);
    for (const args of [`null,${q(f.target)},${q(f.request)}`, `${q(f.item)},null,${q(f.request)}`, `${q(f.item)},${q(f.target)},null`]) assert.equal((await scalar(s, `SELECT public.share_moonberry(${args})`)).error, 'invalid_request');
    await assert.rejects(s.exec(`SELECT public.share_moonberry('not-a-uuid',${q(f.target)},${q(f.request)});`), e => e.code === '22P02');
    await actor(s, ''); await assert.rejects(use(s, f), e => e.code === '42501'); assert.deepEqual(await story(s, f.item), []);
    for (const role of ['anon', 'service_role']) {
      await actor(s, f.owner, role); await assert.rejects(use(s, f), e => e.code === '42501'); await assert.rejects(story(s, f.item), e => e.code === '42501');
    }
    await actor(s, f.owner); await assert.rejects(s.exec('SELECT * FROM item_use_internal.moonberry_receipts;'), e => e.code === '42501');
    await assert.rejects(s.exec(`UPDATE public.user_items SET quantity=10 WHERE id=${q(f.item)};`), e => e.code === '42501');
    const acl = await observer.rows("SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('share_moonberry','read_moonberry_share_moments') ORDER BY p.proname");
    assert.equal(acl.length, 2); for (const row of acl) { assert.equal(row.prosecdef, true); assert.equal(row.authenticated, true); assert.equal(row.anon, false); assert.equal(row.service_role, false); assert.deepEqual(row.proconfig, ['search_path=""']); }
    assert.equal(await quantity(f), 1); assert.deepEqual(await counts(f), { receipts: 0, memories: 0, gathers: 0 }); return { acl };
  });
  for (const kind of ['receipt', 'Journal']) await test(`${kind} insertion failure rolls back quantity, receipt and memory atomically`, async session => {
    const f = await fixture(); const s = await session('user'); await actor(s, f.owner); const before = await inventory(f), effects = await sideEffects(f);
    const table = kind === 'receipt' ? 'item_use_internal.moonberry_receipts' : 'public.companion_journal_entries';
    await observer.exec(`CREATE FUNCTION public.moonberry_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected_moonberry_${kind}_failure' USING ERRCODE='P0001'; END $$;
      CREATE TRIGGER moonberry_test_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.moonberry_test_fail();`, { failFast: true });
    try { await assert.rejects(use(s, f, f.request), e => e.code === 'P0001' && (e.primaryMessage ?? e.message).includes('injected_moonberry_')); }
    finally { await observer.exec(`DROP TRIGGER moonberry_test_failure ON ${table}; DROP FUNCTION public.moonberry_test_fail();`, { failFast: true }); }
    assert.deepEqual(await inventory(f), before); assert.deepEqual(await sideEffects(f), effects); assert.deepEqual(await counts(f), { receipts: 0, memories: 0, gathers: 0 });
    assert.equal((await use(s, f, f.request)).status, 'shared'); assert.deepEqual(await counts(f), { receipts: 1, memories: 1, gathers: 0 });
  });
  await test('caller rollback removes a successful share and permits the same request to commit later', async session => {
    const f = await fixture(); const s = await session('user'); await actor(s, f.owner);
    const before = await inventory(f), effects = await sideEffects(f);
    await s.exec('BEGIN;'); assert.equal((await use(s, f, f.request)).status, 'shared');
    assert.equal(await quantity(f), 1); assert.deepEqual(await counts(f), { receipts: 0, memories: 0, gathers: 0 });
    await s.exec('ROLLBACK;');
    assert.deepEqual(await inventory(f), before); assert.deepEqual(await sideEffects(f), effects); assert.deepEqual(await counts(f), { receipts: 0, memories: 0, gathers: 0 });
    const result = await use(s, f, f.request); assert.equal(result.status, 'shared'); assert.equal(result.replayed, false);
    assert.equal(await quantity(f), 0); assert.deepEqual(await counts(f), { receipts: 1, memories: 1, gathers: 0 });
  });
  await test('enabled, disabled, null, absent and reaction-off consent are independent', async session => {
    const results = [];
    for (const preference of ['enabled', 'disabled', 'null', 'absent', 'reaction-off']) {
      const f = await fixture(1, preference); const s = await session(preference); await actor(s, f.owner);
      const value = await use(s, f); const count = await counts(f); const enabled = ['enabled','reaction-off'].includes(preference);
      assert.equal(count.memories, enabled ? 1 : 0); assert.equal('reaction' in value, preference === 'enabled'); assert.equal((await story(s, f.item)).length, enabled ? 1 : 0);
      assert.equal(await quantity(f), 0); results.push({ preference, memory: count.memories, reaction: 'reaction' in value });
    }
    return results;
  });
  await test('concurrent existing opt-out first suppresses memory after lock wait', async session => {
    const f = await fixture(); const a = await session('opt-out'), b = await session('use'); await actor(a, f.owner); await actor(b, f.owner);
    await a.exec(`BEGIN; UPDATE public.user_preferences SET consent_memory=false,consent_reactions=false WHERE user_id=${q(f.owner)};`, { failFast: true });
    const work = track(use(b, f)); await blocked('use waits for existing consent update', b, a, work); await a.exec('COMMIT;'); const shared = await finish(work);
    assert.equal(shared.status, 'shared'); assert.equal('reaction' in shared, false); assert.deepEqual(await counts(f), { receipts: 1, memories: 0, gathers: 0 }); assert.deepEqual(await story(b, f.item), []);
  });
  await test('concurrent use first holds consent through commit and later opt-out hides history', async session => {
    const f = await fixture(); const a = await session('use'), b = await session('opt-out'); await actor(a, f.owner); await actor(b, f.owner);
    await a.exec('BEGIN;'); await use(a, f, f.request);
    const work = track(b.exec(`UPDATE public.user_preferences SET consent_memory=false,consent_reactions=false WHERE user_id=${q(f.owner)};`));
    await blocked('opt-out waits for share consent lock', b, a, work); await a.exec('COMMIT;'); await finish(work);
    assert.deepEqual(await counts(f), { receipts: 1, memories: 1, gathers: 0 }); assert.deepEqual(await story(a, f.item), []);
    const replay = await use(a, f, f.request); minimalReplay(replay); assert.deepEqual(await story(a, f.item), []); assert.equal(await quantity(f), 0);
  });
  await test('concurrent first-time opt-out insert cannot create a memory', async session => {
    const f = await fixture(1, 'absent'); const a = await session('first-preference'), b = await session('use'); await actor(a, f.owner); await actor(b, f.owner);
    await a.exec(`BEGIN; INSERT INTO public.user_preferences(user_id,consent_memory,consent_reactions) VALUES (${q(f.owner)},false,false);`, { failFast: true });
    const result = await use(b, f, f.request); assert.equal(result.status, 'shared'); assert.equal('reaction' in result, false);
    assert.deepEqual(await counts(f), { receipts: 1, memories: 0, gathers: 0 }); await a.exec('COMMIT;'); assert.deepEqual(await story(b, f.item), []);
  });
  await test('deleted Journal and subsequent consent changes never resurrect memory on replay', async session => {
    const f = await fixture(2); const s = await session('user'); await actor(s, f.owner); await use(s, f, f.request);
    await observer.exec(`DELETE FROM public.companion_journal_entries WHERE owner_id=${q(f.owner)}; UPDATE public.user_preferences SET consent_memory=false WHERE user_id=${q(f.owner)};`, { failFast: true });
    minimalReplay(await use(s, f, f.request)); assert.deepEqual(await story(s, f.item), []);
    await observer.exec(`UPDATE public.user_preferences SET consent_memory=true WHERE user_id=${q(f.owner)};`, { failFast: true });
    minimalReplay(await use(s, f, f.request)); assert.deepEqual(await story(s, f.item), []);
    assert.equal(await quantity(f), 1); assert.deepEqual(await counts(f), { receipts: 1, memories: 0, gathers: 0 });
  });
  await test('deleted recipient keeps receipt replay and target-substitution protection', async session => {
    const f = await fixture(2); const s = await session('user'); await actor(s, f.owner); await use(s, f, f.request);
    await observer.exec(`DELETE FROM public.companions WHERE id=${q(f.target)};`, { failFast: true });
    const replay = await use(s, f, f.request); minimalReplay(replay); assert.equal(replay.companionId, f.target);
    assert.equal((await use(s, f, f.request, f.source)).error, 'request_target_mismatch');
    assert.equal((await use(s, f)).error, 'companion_required'); assert.equal(await quantity(f), 1); assert.deepEqual(await story(s, f.item), []);
    assert.deepEqual(await counts(f), { receipts: 1, memories: 0, gathers: 0 });
  });
  await test('deleted acquisition preserves replay but cannot redirect receipt to replacement', async session => {
    const f = await fixture(2); const s = await session('user'); await actor(s, f.owner); await use(s, f, f.request);
    await observer.exec(`DELETE FROM public.user_items WHERE id=${q(f.item)};`, { failFast: true });
    minimalReplay(await use(s, f, f.request)); assert.deepEqual(await story(s, f.item), []);
    const replacement = randomUUID(); await observer.exec(`INSERT INTO public.user_items(id,owner_id,companion_id,item_id,quantity,source_type,source_key) SELECT ${q(replacement)},${q(f.owner)},${q(f.source)},id,2,'world','moonberry-bush' FROM public.item_catalog WHERE item_key='world-moonberry';`, { failFast: true });
    assert.equal((await use(s, f, f.request, f.target, replacement)).error, 'request_target_mismatch');
    assert.equal((await observer.rows(`SELECT quantity FROM public.user_items WHERE id=${q(replacement)}`))[0].quantity, 2);
  });
  await test('history reader requires matching private receipt and exact owner/acquisition/recipient', async session => {
    const f = await fixture(3), foreign = await fixture(); const s = await session('user'); await actor(s, f.owner); await use(s, f, f.request);
    const row = (await story(s, f.item))[0]; assert(row); assert.equal(row.companion_id, f.target);
    const forged = randomUUID(); await s.exec(`INSERT INTO public.companion_journal_entries(id,owner_id,companion_id,source_type,source_id,title,body,meta_json)
      VALUES (${q(forged)},${q(f.owner)},${q(f.target)},'system',${q(randomUUID())},'Forged share','No consumption occurred',${q(JSON.stringify(row.meta_json))}::jsonb);`, { failFast: true });
    assert.deepEqual((await story(s, f.item)).map(r => r.id), [row.id]);
    await s.exec(`UPDATE public.companion_journal_entries SET companion_id=${q(f.source)} WHERE id=${q(row.id)};`, { failFast: true }); assert.deepEqual(await story(s, f.item), []);
    await s.exec(`UPDATE public.companion_journal_entries SET companion_id=${q(f.target)},meta_json=jsonb_set(meta_json,'{userItemId}',to_jsonb(${q(foreign.item)}::text)) WHERE id=${q(row.id)};`, { failFast: true }); assert.deepEqual(await story(s, f.item), []);
    await s.exec(`UPDATE public.companion_journal_entries SET meta_json=${q(JSON.stringify(row.meta_json))}::jsonb WHERE id=${q(row.id)};`, { failFast: true }); assert.equal((await story(s, f.item)).length, 1);
    assert.deepEqual(await story(s, foreign.item), []); assert.deepEqual(await story(s, randomUUID()), []);
    assert.equal(await quantity(f), 2); return { acquisitionCompanion: f.source, shareRecipient: row.companion_id, forgedJournalIgnored: true };
  });
  await test('history reader caps at six recent receipt-backed rows and honors absent consent', async session => {
    const f = await fixture(8); const s = await session('user'); await actor(s, f.owner);
    for (let i = 0; i < 8; i++) await use(s, f);
    const rows = await story(s, f.item); assert.equal(rows.length, 6); assert.equal(new Set(rows.map(r => r.source_id)).size, 6);
    const expected = await observer.rows(`SELECT id FROM public.companion_journal_entries WHERE owner_id=${q(f.owner)} ORDER BY created_at DESC,id DESC LIMIT 6`); assert.deepEqual(rows.map(r => r.id), expected.map(r => r.id));
    await observer.exec(`DELETE FROM public.user_preferences WHERE user_id=${q(f.owner)};`, { failFast: true }); assert.deepEqual(await story(s, f.item), []);
  });
  await test('owner-scoped UUID request keys do not cross accounts', async session => {
    const f = await fixture(), g = await fixture(); const s = await session('one'), t = await session('two'); await actor(s, f.owner); await actor(t, g.owner);
    const a = await use(s, f, f.request), b = await use(t, g, f.request); assert.equal(a.status, 'shared'); assert.equal(b.status, 'shared');
    assert.equal(await quantity(f), 0); assert.equal(await quantity(g), 0); assert.equal((await counts(f)).receipts, 1); assert.equal((await counts(g)).receipts, 1);
  });
  for (const source of report.sourceFiles) assert.equal(sha256(await readFile(resolve(root, source.path))), source.sha256, `Source changed during native run: ${source.path}`);
  report.sourceHashesUnchanged = true;
  report.status = report.failures.length ? 'FAILED' : 'PASSED';
} catch (error) { report.status = 'FAILED'; report.fatalError = error.stack; }
finally {
  for (const s of sessions) s.kill();
  report.finishedAt = new Date().toISOString(); report.checkCount = report.checks.length; report.failureCount = report.failures.length;
  await writeFile(process.env.MEMVOYA_MOONBERRY_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.status}: ${report.checkCount} scenarios passed, ${report.failureCount} failed; ${report.blockingEvidence.length} independently observed lock waits`);
  if (report.fatalError) console.error(report.fatalError);
  if (report.status !== 'PASSED') process.exitCode = 1;
}
