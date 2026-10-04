// REAL PostgreSQL sessions only. This suite cannot run on PGlite.
// Requires a disposable, local socket-only PostgreSQL cluster and its superuser.
// MEMVOYA_PG_TEST_ONLY=1 PGHOST=/private/socket PGUSER=agent PGPORT=55437 \
//   node tests/sql/companion-lock-order-concurrency.mjs
// It creates and retains a uniquely named database for inspection. Never targets a live DB.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Session, literal as q, identifier, parseMarker } from './helpers/native-postgres.mjs';
import { bootstrap, FORWARD_MIGRATION } from './helpers/companion-migration-fixture.mjs';

if (process.argv.includes('--self-test')) {
  assert.equal(q("O'Brien"), "'O''Brien'");
  assert.equal(identifier('a"b'), '"a""b"');
  assert.deepEqual(parseMarker('__END false 00000', '__END'), { failed: false, code: '00000' });
  assert.deepEqual(parseMarker('__END true 40P01', '__END'), { failed: true, code: '40P01' });
  assert.deepEqual(parseMarker('__END true P0001 not_owner', '__END'), { failed: true, code: 'P0001', message: 'not_owner' });
  assert.equal(parseMarker('ordinary output', '__END'), null);
  console.log('PASS: SQL quoting and psql status framing helpers. Native concurrency NOT RUN.');
  process.exit(0);
}
assert.equal(process.env.MEMVOYA_PG_TEST_ONLY, '1', 'Explicit disposable local-cluster opt-in is required');
assert(process.env.PGHOST?.startsWith('/') && !process.env.PGHOST.includes(','), 'PGHOST must be one local Unix-socket directory; TCP/remote hosts are refused');
assert(process.env.PGUSER, 'Explicit local PGUSER is required');
assert(!process.env.PGPASSWORD, 'Passwords are refused; use the disposable local peer-authenticated cluster');
assert(/^\d+$/.test(process.env.PGPORT || '5432'), 'Invalid local socket port');
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const database = `memvoya_lock_order_${randomUUID().replaceAll('-', '')}`;
const report = { status: 'RUNNING', database, forwardMigration: FORWARD_MIGRATION, manifest: [], checks: [], blockingEvidence: [] };
const sessions = new Set();
const connect = async (name, db = database) => { const s = new Session(db, name); sessions.add(s); return s.init(); };
const result = async (s, sql) => (await s.rows(sql))[0]?.result;
const actor = async (s, owner, role = 'authenticated') => s.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub',${q(owner)},false); SET ROLE ${role};`, { failFast: true });
const restSQL = (f, request = randomUUID()) => `SELECT public.perform_sanctuary_shared_rest(${q(f.low)},${q(request)}) AS result`;
const callSQL = (kind, f) => ({
  bond: `SELECT to_jsonb(public.calculate_bond_for_companion(${q(f.low)})) AS result`,
  recalc: `SELECT to_jsonb(t) AS result FROM public.recalculate_bonds_for_player(${q(f.owner)}) t`,
  tick: `SELECT to_jsonb(t) AS result FROM public.tick_companions_for_player(${q(f.owner)}) t`,
  bonus: `SELECT to_jsonb(t) AS result FROM public.apply_daily_companion_bonus(${q(f.owner)}) t`
})[kind];
const roleFor = (kind) => ['bond', 'recalc'].includes(kind) ? 'service_role' : 'authenticated';
const track = (promise) => { const work = { state: 'pending' }; work.done = promise.then(value => { work.state = 'done'; return { value }; }, error => { work.state = 'failed'; return { error }; }); return work; };
const finish = async (work) => { const outcome = await work.done; if (outcome.error) throw outcome.error; return outcome.value; };
let observer;
async function blocked(label, waiter, holder, work) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    // The observer sometimes holds a barrier transaction: refresh cached activity.
    await observer.exec('SELECT pg_stat_clear_snapshot();');
    const activity = await observer.rows(`SELECT pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=${waiter.pid}`);
    if (activity[0]?.wait_event_type === 'Lock' && activity[0].blockers.includes(holder.pid)) {
      const locks = await observer.rows(`SELECT pid,locktype,relation::regclass::text AS relation,mode,granted FROM pg_locks WHERE pid IN (${waiter.pid},${holder.pid}) ORDER BY pid,locktype,relation,mode`);
      report.blockingEvidence.push({ label, activity, locks });
      return;
    }
    assert.equal(work.state, 'pending', `${label}: contender completed without the required overlapping lock wait`);
    await delay(10);
  }
  throw new Error(`${label}: expected blocking was not observed`);
}
async function test(label, run) {
  const local = [];
  const session = async (name) => { const s = await connect(`${label}:${name}`); local.push(s); return s; };
  try { await run(session); report.checks.push(label); console.log(`PASS: ${label}`); }
  finally { for (const s of local) { s.kill(); sessions.delete(s); } }
}
async function fixture() {
  const owner = randomUUID();
  const [low, high] = [randomUUID(), randomUUID()].sort();
  await observer.exec(`INSERT INTO auth.users VALUES (${q(owner)});
    INSERT INTO public.companions(id,owner_id,name,affection,trust,energy,updated_at,created_at) VALUES
      (${q(high)},${q(owner)},'Higher UUID first',50,45,20,'2020-01-01','2020-01-01'),
      (${q(low)},${q(owner)},'Lower UUID second',50,45,20,'2020-01-01','2020-02-01');
    INSERT INTO public.companion_stats(companion_id,care_streak,last_passive_tick)
      VALUES (${q(high)},7,now()),(${q(low)},7,now());`, { failFast: true });
  await actor(observer, owner);
  let care;
  for (const action of ['feed', 'play', 'groom']) care = await result(observer, `SELECT public.perform_care_action(${q(owner)},${q(low)},${q(action)}) AS result`);
  await actor(observer, owner, 'service_role');
  const item = await result(observer, `SELECT public.unlock_care_moss_seat(${q(owner)},${q(low)},${q(care.event.id)}) AS result`);
  assert.equal(item.itemKey, 'care-moss-seat');
  await observer.exec('RESET ROLE;');
  const owned = (await observer.rows(`SELECT * FROM public.user_items WHERE id=${q(item.id)}`))[0];
  await actor(observer, owner);
  const placement = randomUUID();
  await observer.exec(`INSERT INTO public.sanctuary_placements(id,owner_id,companion_id,item_id,user_item_id,slot_key) VALUES (${q(placement)},${q(owner)},${q(low)},${q(owned.item_id)},${q(owned.id)},'center_glade');`, { failFast: true });
  await observer.exec('RESET ROLE;');
  return { owner, low, high, item: owned, placement };
}
const lockParent = (s, f) => s.exec(`BEGIN; SELECT id FROM public.companions WHERE id=${q(f.low)} FOR NO KEY UPDATE;`, { failFast: true });
async function assertOneRest(f) {
  const counts = (await observer.rows(`SELECT
    (SELECT count(*)::int FROM sanctuary_internal.rest_receipts WHERE owner_id=${q(f.owner)}) AS receipts,
    (SELECT count(*)::int FROM public.sanctuary_interactions WHERE owner_id=${q(f.owner)}) AS interactions,
    (SELECT count(*)::int FROM public.companion_care_events WHERE owner_id=${q(f.owner)} AND action='sanctuary_rest') AS care,
    (SELECT count(*)::int FROM public.companion_journal_entries WHERE owner_id=${q(f.owner)} AND meta_json->>'action'='shared_rest') AS memories`))[0];
  assert.deepEqual(counts, { receipts: 1, interactions: 1, care: 1, memories: 1 });
}
const placementSQL = (f, slot) => `INSERT INTO public.sanctuary_placements(owner_id,companion_id,item_id,user_item_id,slot_key) VALUES (${q(f.owner)},${q(f.low)},${q(f.item.item_id)},${q(f.item.id)},${q(slot)});`;
try {
  const admin = await connect('bootstrap-admin', process.env.PGDATABASE || 'postgres');
  assert.equal((await admin.rows('SELECT rolsuper FROM pg_roles WHERE rolname=current_user'))[0].rolsuper, true, 'Disposable-cluster superuser needed for isolated fixture setup');
  await admin.exec(`CREATE DATABASE ${identifier(database)};`, { failFast: true });
  observer = await connect('observer');
  report.serverVersion = (await observer.rows('SELECT version() AS version'))[0].version;
  await bootstrap(observer, root, report.manifest);

  for (const kind of ['bond', 'recalc', 'tick', 'bonus']) {
    await test(`shared rest × ${kind}: parent before stats`, async session => {
      const f = await fixture(), a = await session('rest'), b = await session(kind);
      await actor(a, f.owner); await actor(b, f.owner, roleFor(kind));
      // Anchor the exact parent lock taken near the start of the real rest RPC.
      // The contender must wait before touching stats; then the real rest runs.
      await lockParent(a, f);
      const pending = track(b.rows(callSQL(kind, f)));
      await blocked(`rest × ${kind}`, b, a, pending);
      assert.equal((await result(a, restSQL(f))).ok, true);
      await a.exec('COMMIT;', { failFast: true });
      await finish(pending);
      await assertOneRest(f);
    });
  }
  for (const kind of ['tick', 'bonus']) {
    await test(`${kind} × bond: no lock inversion`, async session => {
      const f = await fixture(), a = await session(kind), b = await session('bond');
      await observer.exec(`UPDATE public.companion_stats SET last_passive_tick=now()-interval '10 hours',last_daily_bonus_at=null WHERE companion_id IN (${q(f.low)},${q(f.high)});`);
      const before = (await observer.rows(`SELECT affection,trust,energy FROM public.companions WHERE id=${q(f.low)}`))[0];
      await actor(a, f.owner); await actor(b, f.owner, 'service_role');
      await lockParent(a, f);
      const pending = track(b.rows(callSQL('bond', f)));
      await blocked(`${kind} × bond`, b, a, pending);
      await a.rows(callSQL(kind, f));
      await a.exec('COMMIT;', { failFast: true }); await finish(pending);
      const after = (await observer.rows(`SELECT affection,trust,energy FROM public.companions WHERE id=${q(f.low)}`))[0];
      if (kind === 'tick') assert.deepEqual(after, { ...before, energy: Math.min(80, before.energy + 10) });
      else assert.deepEqual(after, { affection: Math.min(100, before.affection + 3), trust: Math.min(100, before.trust + 2), energy: Math.min(100, before.energy + 5) });
    });
  }
  for (const kind of ['recalc', 'tick', 'bonus']) {
    await test(`${kind}: ascending UUID locks with reverse insertion order`, async session => {
      const f = await fixture(), a = await session('low-holder'), b = await session(kind), probe = await session('high-probe');
      await actor(a, f.owner); await actor(b, f.owner, roleFor(kind));
      // Remove accidental index-scan order as a reason an unordered baseline passes.
      await b.exec('SET enable_indexscan=off; SET enable_bitmapscan=off;');
      await lockParent(a, f);
      const pending = track(b.rows(callSQL(kind, f)));
      await blocked(`${kind} UUID order`, b, a, pending);
      // Correct ordering has not locked the higher parent OR child while waiting
      // for the lower UUID, despite the higher UUID being inserted/created first.
      await probe.exec(`BEGIN; SELECT id FROM public.companions WHERE id=${q(f.high)} FOR NO KEY UPDATE NOWAIT; SELECT companion_id FROM public.companion_stats WHERE companion_id=${q(f.high)} FOR UPDATE NOWAIT;`, { failFast: true });
      await probe.exec('ROLLBACK;', { failFast: true });
      await a.exec('COMMIT;', { failFast: true }); await finish(pending);
    });
  }
  for (const kind of ['activate', 'reorder', 'active-state']) {
    await test(`${kind} × tick: roster respects ascending parent order`, async session => {
      const f = await fixture(), a = await session('tick-low-holder'), b = await session(kind), probe = await session('high-probe');
      await observer.exec(`UPDATE public.companions SET is_active=(id=${q(f.high)}::uuid), state=CASE WHEN id=${q(f.high)}::uuid THEN 'active' ELSE 'idle' END WHERE owner_id=${q(f.owner)};`, { failFast: true });
      await actor(a, f.owner); await actor(b, f.owner);
      await lockParent(a, f);
      const sql = kind === 'activate'
        ? `SELECT to_jsonb(t) AS result FROM public.set_active_companion(${q(f.low)}) t`
        : kind === 'reorder'
          ? `SELECT public.reorder_companions(ARRAY[${q(f.high)},${q(f.low)}]::uuid[]) AS result`
          : `SELECT public.set_companion_state(${q(f.low)},'active') AS result`;
      const pending = track(b.rows(sql));
      await blocked(`${kind} × tick`, b, a, pending);
      await probe.exec(`BEGIN; SELECT id FROM public.companions WHERE id=${q(f.high)} FOR NO KEY UPDATE NOWAIT; ROLLBACK;`, { failFast: true });
      await a.rows(callSQL('tick', f));
      await a.exec('COMMIT;', { failFast: true }); await finish(pending);
      const roster = await observer.rows(`SELECT id,is_active,state,slot_index FROM public.companions WHERE owner_id=${q(f.owner)} ORDER BY id`);
      if (kind === 'reorder') {
        assert.equal(roster.find(c => c.id === f.high).slot_index, 0);
        assert.equal(roster.find(c => c.id === f.low).slot_index, 1);
      } else {
        assert.equal(roster.find(c => c.id === f.low).is_active, true);
        assert.equal(roster.find(c => c.id === f.low).state, 'active');
        assert.equal(roster.find(c => c.id === f.high).is_active, false);
        assert.equal(roster.find(c => c.id === f.high).state, 'idle');
      }
    });
  }
  for (const mutation of ['delete', 'reassign']) {
    await test(`activation target ${mutation} while waiting fails without deactivating previous companion`, async session => {
      const f = await fixture(), holder = await session('target-mutation'), activation = await session('activation');
      const newOwner = randomUUID();
      await observer.exec(`INSERT INTO auth.users VALUES (${q(newOwner)}); UPDATE public.companions SET is_active=(id=${q(f.low)}::uuid), state=CASE WHEN id=${q(f.low)}::uuid THEN 'active' ELSE 'idle' END WHERE owner_id=${q(f.owner)};`, { failFast: true });
      const before = (await observer.rows(`SELECT to_jsonb(c) AS result FROM public.companions c WHERE id=${q(f.low)}`))[0].result;
      // The uncommitted mutation is invisible to the initial nonlocking owner
      // check. Its row lock is encountered later during ordered acquisition.
      await holder.exec(`BEGIN; ${mutation === 'delete'
        ? `DELETE FROM public.companions WHERE id=${q(f.high)};`
        : `UPDATE public.companions SET owner_id=${q(newOwner)} WHERE id=${q(f.high)};`}`, { failFast: true });
      await actor(activation, f.owner);
      const pending = track(activation.rows(`SELECT to_jsonb(t) AS result FROM public.set_active_companion(${q(f.high)}) t`));
      await blocked(`activation target ${mutation}`, activation, holder, pending);
      await holder.exec('COMMIT;', { failFast: true });
      const outcome = await pending.done;
      assert(outcome.error, 'activation must reject a target lost while waiting');
      assert.equal(outcome.error.code, 'P0001'); assert.equal(outcome.error.primaryMessage, 'not_owner');
      const after = (await observer.rows(`SELECT to_jsonb(c) AS result FROM public.companions c WHERE id=${q(f.low)}`))[0].result;
      assert.deepEqual(after, before, 'previous active companion must be completely unchanged');
    });
  }
  for (const sameRequest of [true, false]) {
    await test(`concurrent rest: ${sameRequest ? 'same UUID replays' : 'different UUID sees cooldown'}`, async session => {
      const f = await fixture(), a = await session('first'), b = await session('second');
      await actor(a, f.owner); await actor(b, f.owner);
      const firstId = randomUUID(), secondId = sameRequest ? firstId : randomUUID();
      await a.exec('BEGIN;');
      const first = await result(a, restSQL(f, firstId)); assert.equal(first.ok, true);
      const pending = track(result(b, restSQL(f, secondId)));
      await blocked('rest idempotency', b, a, pending);
      await a.exec('COMMIT;', { failFast: true });
      const second = await finish(pending);
      if (sameRequest) assert.deepEqual(second, { ...first, replayed: true });
      else assert.equal(second.error, 'rest_cooldown');
      await assertOneRest(f);
    });
  }

  await test('rest × placement clear preserves committed snapshots', async session => {
    const f = await fixture(), a = await session('rest'), b = await session('clear');
    await actor(a, f.owner); await actor(b, f.owner);
    await a.exec('BEGIN;'); assert.equal((await result(a, restSQL(f))).ok, true);
    const pending = track(b.exec(`DELETE FROM public.sanctuary_placements WHERE id=${q(f.placement)};`));
    await blocked('rest × clear', b, a, pending);
    await a.exec('COMMIT;', { failFast: true }); await finish(pending);
    await assertOneRest(f);
    const history = (await observer.rows(`SELECT placement_id,placement_snapshot_id,user_item_id,acquisition_snapshot FROM public.sanctuary_interactions WHERE owner_id=${q(f.owner)}`))[0];
    assert.equal(history.placement_id, null); assert.equal(history.placement_snapshot_id, f.placement);
    assert.equal(history.user_item_id, f.item.id); assert.deepEqual(history.acquisition_snapshot.provenance, f.item.provenance_json);
  });
  await test('placement clear × rest fails closed without partial writes', async session => {
    const f = await fixture(), a = await session('clear'), b = await session('rest');
    await actor(a, f.owner); await actor(b, f.owner);
    await a.exec(`BEGIN; DELETE FROM public.sanctuary_placements WHERE id=${q(f.placement)};`);
    const pending = track(result(b, restSQL(f)));
    await blocked('clear × rest', b, a, pending);
    await a.exec('COMMIT;', { failFast: true });
    assert.equal((await finish(pending)).error, 'moss_seat_must_be_placed');
    assert.equal((await observer.rows(`SELECT count(*)::int AS n FROM sanctuary_internal.rest_receipts WHERE owner_id=${q(f.owner)}`))[0].n, 0);
  });
  await test('two placements contend for one acquired item quantity', async session => {
    const f = await fixture(), a = await session('first-place'), b = await session('second-place');
    await actor(observer, f.owner); await observer.exec(`DELETE FROM public.sanctuary_placements WHERE id=${q(f.placement)};`); await observer.exec('RESET ROLE;');
    await actor(a, f.owner); await actor(b, f.owner);
    await a.exec(`BEGIN; ${placementSQL(f, 'left_grove')}`, { failFast: true });
    const pending = track(b.exec(placementSQL(f, 'right_grove')));
    await blocked('placement capacity', b, a, pending);
    await a.exec('COMMIT;', { failFast: true });
    const outcome = await pending.done;
    assert(outcome.error, 'second placement must fail'); assert.equal(outcome.error.code, '23514');
    assert.equal((await observer.rows(`SELECT count(*)::int AS n FROM public.sanctuary_placements WHERE owner_id=${q(f.owner)}`))[0].n, 1);
  });

  await observer.exec(`CREATE FUNCTION public.lock_test_fail_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF current_setting('test.fail_wallet',true)='yes' THEN RAISE EXCEPTION 'injected_wallet_failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER lock_test_fail_wallet BEFORE INSERT ON public.wallet_tx FOR EACH ROW EXECUTE FUNCTION public.lock_test_fail_wallet();`, { failFast: true });
  const achievement = (await observer.rows("SELECT id FROM public.achievements WHERE key='bond_first'"))[0].id;
  const settleSQL = (f) => `SELECT public.fn_settle_achievement_reward(${q(f.owner)},${q(achievement)},2,'{"source":"synthetic-concurrency-test"}'::jsonb) AS result`;
  async function assertRewardOnce(f) {
    const state = (await observer.rows(`SELECT
      (SELECT count(*)::int FROM public.user_achievements WHERE user_id=${q(f.owner)}) AS claims,
      (SELECT points FROM public.user_points WHERE user_id=${q(f.owner)}) AS points,
      (SELECT balance::int FROM public.wallets WHERE user_id=${q(f.owner)}) AS balance,
      (SELECT count(*)::int FROM public.wallet_tx WHERE user_id=${q(f.owner)}) AS wallet_transactions,
      (SELECT count(*)::int FROM public.economy_transactions WHERE user_id=${q(f.owner)} AND applied) AS applied_receipts`))[0];
    assert.deepEqual(state, { claims: 1, points: 25, balance: 50, wallet_transactions: 1, applied_receipts: 1 });
  }
  await test('achievement competing success commits reward exactly once', async session => {
    const f = await fixture(), a = await session('first-reward'), b = await session('second-reward');
    await actor(a, f.owner, 'service_role'); await actor(b, f.owner, 'service_role');
    await a.exec('BEGIN;'); assert.equal((await result(a, settleSQL(f))).unlocked, true);
    const pending = track(result(b, settleSQL(f)));
    await blocked('achievement unique claim', b, a, pending);
    await a.exec('COMMIT;', { failFast: true });
    assert.equal((await finish(pending)).reason, 'already_unlocked'); await assertRewardOnce(f);
  });
  await test('achievement failed transaction rolls back, contender retries once', async session => {
    const f = await fixture(), a = await session('failed-reward'), b = await session('retry-reward');
    await actor(a, f.owner, 'service_role'); await actor(b, f.owner, 'service_role');
    // Block A only after its claim/points/receipt writes reach the wallet INSERT.
    // A real relation lock is the barrier, rather than timing-based pg_sleep.
    await observer.exec('BEGIN; LOCK TABLE public.wallet_tx IN ACCESS EXCLUSIVE MODE;');
    await a.exec("SET test.fail_wallet='yes';");
    const failure = track(result(a, settleSQL(f)));
    await blocked('achievement downstream fault barrier', a, observer, failure);
    const retry = track(result(b, settleSQL(f)));
    await blocked('achievement retry waits for failed claim', b, a, retry);
    await observer.exec('COMMIT;', { failFast: true });
    const failed = await failure.done; assert(failed.error); assert.equal(failed.error.code, 'P0001');
    assert.equal((await finish(retry)).unlocked, true);
    await assertRewardOnce(f);
    assert.equal((await result(b, settleSQL(f))).reason, 'already_unlocked');
    await assertRewardOnce(f);
  });
  report.status = 'PASSED';
  console.log(`PASS: ${report.checks.length} real PostgreSQL concurrency checks; evidence database ${database}`);
} catch (error) {
  report.status = 'FAILED'; report.error = { message: error.message, code: error.code };
  console.error(error); process.exitCode = 1;
} finally {
  for (const s of sessions) s.kill();
  const path = process.env.MEMVOYA_PG_REPORT || resolve(root, 'test-results/companion-lock-order-concurrency.json');
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Evidence: ${path}`);
}
