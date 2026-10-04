// REAL native PostgreSQL sessions only. PGlite cannot establish concurrency.
// LOCAL TEST PREPARATION: never target a live/hosted DB or use app credentials.
// MEMVOYA_PG_TEST_ONLY=1 PGHOST=/private/socket PGUSER=agent PGPORT=55437 \
//   node tests/sql/game-settlement-concurrency.mjs
// The uniquely named synthetic database is retained for inspection.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Session, literal as q, identifier, parseMarker } from './helpers/native-postgres.mjs';

const SCENARIOS = [
  'same session and payload: one payment and immutable replay',
  'same session and changed payload: committed winner and conflict',
  'distinct sessions: only the final hourly quota slot is paid',
  'downstream failure: rollback releases owner lock and retry pays once',
  'game then achievement: multiple eligible rewards settle once',
  'achievement then game: multiple eligible rewards settle once',
  'game then companion bond: parent before stats',
  'companion bond then game: no parent and stats inversion'
];
const FAULT_SCENARIO = SCENARIOS[3];
function verifyReport(report) {
  assert.equal(report.status, 'PASSED');
  assert.match(report.database, /^memvoya_game_settlement_[a-f0-9]{32}$/);
  assert.match(report.serverVersion, /^PostgreSQL 17\./);
  assert.deepEqual(report.checks, SCENARIOS);
  assert.equal(new Set(report.checks).size, SCENARIOS.length);
  assert.equal(report.blockingEvidence.length, SCENARIOS.length + 1);
  assert(report.manifest.some(piece => piece.name === report.forwardMigration));
  for (const piece of report.manifest) assert.match(piece.sha256, /^[a-f0-9]{64}$/);
  for (const scenario of SCENARIOS) {
    assert.equal(report.blockingEvidence.filter(item => item.scenario === scenario).length,
      scenario === FAULT_SCENARIO ? 2 : 1);
  }
  for (const evidence of report.blockingEvidence) {
    assert(SCENARIOS.includes(evidence.scenario));
    assert.notEqual(evidence.holderPid, evidence.waiterPid, 'Independent backend PIDs required');
    assert.equal(evidence.activity.length, 1);
    const waiter = evidence.activity[0];
    assert.equal(waiter.pid, evidence.waiterPid);
    assert.equal(waiter.wait_event_type, 'Lock');
    assert(waiter.blockers.includes(evidence.holderPid));
    assert(!waiter.blockers.includes(waiter.pid));
    assert(evidence.locks.some(lock => lock.pid === waiter.pid && !lock.granted));
    if (evidence.requiredWaitEvent) assert.equal(waiter.wait_event, evidence.requiredWaitEvent);
    if (evidence.requiredWaitEvent === 'advisory') {
      assert(evidence.locks.some(lock => lock.pid === waiter.pid && lock.locktype === 'advisory' && !lock.granted));
    }
  }
}
if (process.argv.includes('--self-test')) {
  assert.equal(q("O'Brien"), "'O''Brien'");
  assert.equal(identifier('a"b'), '"a""b"');
  assert.deepEqual(parseMarker('__END false 00000', '__END'), { failed: false, code: '00000' });
  assert.deepEqual(parseMarker('__END true P0001 game_settlement_conflict', '__END'),
    { failed: true, code: 'P0001', message: 'game_settlement_conflict' });
  for (const unsafe of ['postgresql://remote/db', 'host=remote dbname=postgres']) {
    assert.throws(() => new Session(unsafe, 'unsafe-connection'), /Only plain local database names/);
  }
  assert.throws(() => verifyReport({ status: 'NOT_RUN' }));
  assert.equal(SCENARIOS.length, 8);
  console.log('PASS: native harness syntax/status framing and scenario contract. Native concurrency NOT RUN.');
  process.exit(0);
}
if (process.argv.includes('--verify-report')) {
  const path = process.argv[process.argv.indexOf('--verify-report') + 1];
  assert(path, 'Supply a native report path');
  const report = JSON.parse(await readFile(path, 'utf8'));
  verifyReport(report);
  console.log(`Verified ${report.checks.length} native scenarios and ${report.blockingEvidence.length} observed lock waits`);
  process.exit(0);
}
assert.equal(process.env.MEMVOYA_PG_TEST_ONLY, '1', 'Explicit disposable local-cluster opt-in is required');
assert(process.env.PGHOST?.startsWith('/') && !process.env.PGHOST.includes(','), 'PGHOST must be one local Unix-socket directory; TCP/remote hosts are refused');
assert(process.env.PGUSER, 'Explicit local PGUSER is required');
assert(!process.env.PGHOSTADDR, 'PGHOSTADDR is refused; only local Unix sockets are allowed');
assert(!process.env.PGDATABASE || process.env.PGDATABASE === 'postgres', 'Bootstrap database must be postgres');
assert(!process.env.PGPASSWORD, 'Passwords are refused; use the disposable local peer-authenticated cluster');
assert(/^\d+$/.test(process.env.PGPORT || '5432'), 'Invalid local socket port');
const { bootstrap, FORWARD_MIGRATION } = await import('./helpers/game-settlement-fixture.mjs');
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const database = `memvoya_game_settlement_${randomUUID().replaceAll('-', '')}`;
const report = { status: 'RUNNING', database, forwardMigration: FORWARD_MIGRATION, manifest: [], checks: [], blockingEvidence: [] };
const sessions = new Set();
const connect = async (name, db = database) => {
  const s = new Session(db, `game:${name}`); sessions.add(s); return s.init();
};
const result = async (s, sql) => (await s.rows(sql))[0]?.result;
const actor = (s, owner) => s.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub',${q(owner)},false); SET ROLE service_role;`, { failFast: true });
const track = promise => {
  const work = { state: 'pending' };
  work.done = promise.then(value => { work.state = 'done'; return { value }; }, error => { work.state = 'failed'; return { error }; });
  return work;
};
const finish = async work => { const outcome = await work.done; if (outcome.error) throw outcome.error; return outcome.value; };
let observer;
let activeScenario;
async function blocked(label, waiter, holder, work, requiredWaitEvent = 'advisory') {
  assert.notEqual(waiter.pid, holder.pid, 'Independent real PostgreSQL connections required');
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    await observer.exec('SELECT pg_stat_clear_snapshot();');
    const activity = await observer.rows(`SELECT pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=${waiter.pid}`);
    if (activity[0]?.wait_event_type === 'Lock' && activity[0].blockers.includes(holder.pid)) {
      if (requiredWaitEvent) assert.equal(activity[0].wait_event, requiredWaitEvent, `${label}: must wait at the intended lock phase`);
      const locks = await observer.rows(`SELECT pid,locktype,relation::regclass::text AS relation,mode,granted,classid,objid,objsubid FROM pg_locks WHERE pid IN (${waiter.pid},${holder.pid}) ORDER BY pid,locktype,relation,mode`);
      report.blockingEvidence.push({ scenario: activeScenario, label, waiterPid: waiter.pid, holderPid: holder.pid, requiredWaitEvent, activity, locks });
      return;
    }
    assert.equal(work.state, 'pending', `${label}: completed without the required overlapping lock wait`);
    await delay(10);
  }
  throw new Error(`${label}: expected blocking was not observed`);
}
async function test(label, run) {
  activeScenario = label;
  const local = [];
  const session = async name => { const s = await connect(`${label}:${name}`); local.push(s); return s; };
  try { await run(session); report.checks.push(label); console.log(`PASS: ${label}`); }
  finally { for (const s of local) { s.kill(); sessions.delete(s); } }
}
const settleSQL = (f, { sessionId = f.sessions[0], score = 1000, maxPerHour = 20, stats = { synthetic: true } } = {}) =>
  `SELECT public.fn_settle_game_session(${q(f.owner)},${q(sessionId)},${score},60000,${q(f.nonce)},'1.0.0',true,${q(JSON.stringify(stats))}::jsonb,${maxPerHour},1.5,2) AS result`;
const achievementSQL = (f, achievement = f.achievements[0]) =>
  `SELECT public.fn_settle_achievement_reward(${q(f.owner)},${q(achievement.id)},2,'{"source":"native-synthetic-test"}'::jsonb) AS result`;
const bondSQL = f => `SELECT to_jsonb(public.calculate_bond_for_companion(${q(f.companion)})) AS result`;

async function fixture({ achievementCount = 0, withCompanion = false } = {}) {
  const f = { owner: randomUUID(), game: randomUUID(), sessions: [randomUUID(), randomUUID()], nonce: randomUUID(), achievements: [] };
  f.slug = `synthetic-concurrency-${f.game}`;
  await observer.exec(`INSERT INTO auth.users VALUES (${q(f.owner)});
    INSERT INTO public.profiles(id,xp) VALUES (${q(f.owner)},17);
    INSERT INTO public.wallets(user_id,balance) VALUES (${q(f.owner)},9);
    INSERT INTO public.user_points(user_id,points) VALUES (${q(f.owner)},11);
    INSERT INTO public.game_titles(id,slug,name,min_version,max_score) VALUES (${q(f.game)},${q(f.slug)},'Synthetic concurrency game','1.0.0',100000);
    INSERT INTO public.game_sessions(id,user_id,game_id,nonce,started_at) VALUES
      (${q(f.sessions[0])},${q(f.owner)},${q(f.game)},${q(f.nonce)},now()-interval '2 minutes'),
      (${q(f.sessions[1])},${q(f.owner)},${q(f.game)},${q(f.nonce)},now()-interval '2 minutes');`, { failFast: true });
  for (let i = 0; i < achievementCount; i++) {
    const achievement = { id: randomUUID(), points: 25 + i * 10 };
    f.achievements.push(achievement);
    await observer.exec(`INSERT INTO public.achievements(id,key,game_id,name,description,points,rule) VALUES
      (${q(achievement.id)},${q(`synthetic-${achievement.id}`)},${q(f.game)},'Synthetic achievement','Native test fixture',${achievement.points},
      ${q(JSON.stringify({ kind: 'score_threshold', slug: f.slug, gte: 100 }))}::jsonb);`, { failFast: true });
  }
  if (withCompanion) {
    f.companion = randomUUID();
    await observer.exec(`INSERT INTO public.companions(id,owner_id,name,affection,trust,energy,is_active,state) VALUES
      (${q(f.companion)},${q(f.owner)},'Synthetic companion',50,45,20,true,'active');
      INSERT INTO public.companion_stats(companion_id,care_streak,last_passive_tick,bond_level,bond_score) VALUES (${q(f.companion)},0,now(),5,95);`, { failFast: true });
  }
  return f;
}
async function snapshot(f) {
  const state = {};
  for (const [table, filter] of [
    ['game_sessions', `user_id=${q(f.owner)}`], ['game_scores', `user_id=${q(f.owner)}`], ['game_rewards', `session_id IN (${f.sessions.map(q).join(',')})`],
    ['game_grants', `user_id=${q(f.owner)}`], ['profiles', `id=${q(f.owner)}`],
    ['wallets', `user_id=${q(f.owner)}`], ['wallet_tx', `user_id=${q(f.owner)}`],
    ['user_points', `user_id=${q(f.owner)}`], ['user_achievements', `user_id=${q(f.owner)}`],
    ['economy_transactions', `user_id=${q(f.owner)}`], ['companion_rituals', `owner_id=${q(f.owner)}`],
    ['companions', `owner_id=${q(f.owner)}`], ['companion_stats', `companion_id IN (SELECT id FROM public.companions WHERE owner_id=${q(f.owner)})`],
    ['companion_emotional_state', `user_id=${q(f.owner)}`]
  ]) state[table] = await observer.rows(`SELECT to_jsonb(t) AS row FROM public.${table} t WHERE ${filter} ORDER BY to_jsonb(t)::text`);
  return state;
}
async function assertPaidOnce(f, settlement, achievementCount = 0) {
  assert.equal(settlement.replayed, false);
  const receipt = settlement.receipt;
  assert(receipt && typeof receipt === 'object', 'Canonical immutable receipt required');
  assert.equal(receipt.currencyDelta, 22);
  assert.equal(receipt.currencyMultiplier, 1.1);
  const ritual = f.companion ? 1 : 0;
  assert.equal(receipt.xpDelta, f.companion ? 11 : 10);
  const points = f.achievements.slice(0, achievementCount).reduce((sum, item) => sum + item.points, 0);
  const counts = (await observer.rows(`SELECT
    (SELECT count(*)::int FROM public.game_sessions WHERE user_id=${q(f.owner)} AND status='completed') AS completed,
    (SELECT count(*)::int FROM public.game_scores WHERE user_id=${q(f.owner)}) AS scores,
    (SELECT count(*)::int FROM public.game_rewards WHERE session_id IN (${f.sessions.map(q).join(',')})) AS rewards,
    (SELECT count(*)::int FROM public.game_grants WHERE user_id=${q(f.owner)}) AS grants,
    (SELECT xp FROM public.profiles WHERE id=${q(f.owner)}) AS xp,
    (SELECT balance::int FROM public.wallets WHERE user_id=${q(f.owner)}) AS balance,
    (SELECT points FROM public.user_points WHERE user_id=${q(f.owner)}) AS points,
    (SELECT count(*)::int FROM public.user_achievements WHERE user_id=${q(f.owner)}) AS claims,
    (SELECT count(*)::int FROM public.wallet_tx WHERE user_id=${q(f.owner)}) AS wallet_transactions,
    (SELECT count(*)::int FROM public.economy_transactions WHERE user_id=${q(f.owner)} AND applied) AS economy_receipts,
    (SELECT count(*)::int FROM public.economy_transactions WHERE user_id=${q(f.owner)} AND NOT applied) AS pending_receipts`))[0];
  assert.deepEqual(counts, { completed: 1, scores: 1, rewards: 1, grants: 1, xp: 17 + receipt.xpDelta + ritual * 20,
    balance: 9 + receipt.currencyDelta + points * 2 + ritual * 3, points: 11 + points, claims: achievementCount,
    wallet_transactions: 1 + achievementCount + ritual, economy_receipts: 1 + achievementCount + ritual, pending_receipts: 0 });
  const stored = (await observer.rows(`SELECT result FROM public.economy_transactions WHERE user_id=${q(f.owner)} AND source='game_session' AND idempotency_key=${q(`game-session:${f.sessions[0]}`)}`))[0];
  assert.deepEqual(stored.result, receipt);
  const rewards = (await observer.rows(`SELECT xp_delta,currency_delta FROM public.game_rewards WHERE session_id=${q(f.sessions[0])}`))[0];
  assert.deepEqual(rewards, { xp_delta: receipt.xpDelta, currency_delta: receipt.currencyDelta });
  if (f.companion) {
    const companion = (await observer.rows(`SELECT affection,trust FROM public.companions WHERE id=${q(f.companion)}`))[0];
    assert.deepEqual(companion, { affection: 51, trust: 46 }, 'Daily ritual relationship increments exactly once');
    const rituals = await observer.rows(`SELECT ritual_key,progress,completed,reward_claimed FROM public.companion_rituals WHERE owner_id=${q(f.owner)} AND completed ORDER BY ritual_key`);
    assert.deepEqual(rituals, [{ ritual_key: 'play_game_with_companion', progress: 1, completed: true, reward_claimed: true }]);
    const emotional = await observer.rows(`SELECT trust::float8 AS trust,bond::float8 AS bond FROM public.companion_emotional_state WHERE user_id=${q(f.owner)}`);
    assert.deepEqual(emotional, [{ trust: 0.46, bond: 0.485 }]);
  }
}
try {
  const admin = await connect('bootstrap-admin', process.env.PGDATABASE || 'postgres');
  assert.equal((await admin.rows('SELECT rolsuper FROM pg_roles WHERE rolname=current_user'))[0].rolsuper, true, 'Disposable-cluster superuser required');
  await admin.exec(`CREATE DATABASE ${identifier(database)};`, { failFast: true });
  observer = await connect('observer');
  report.serverVersion = (await observer.rows('SELECT version() AS version'))[0].version;
  await bootstrap(observer, root, report.manifest);
  // Catalog fixtures cannot accidentally pick up unrelated seeded achievements.
  await observer.exec('UPDATE public.achievements SET is_active=false;', { failFast: true });

  await test(SCENARIOS[0], async session => {
    const f = await fixture(), a = await session('winner'), b = await session('retry');
    await actor(a, f.owner); await actor(b, f.owner);
    await a.exec('BEGIN;'); const first = await result(a, settleSQL(f));
    const pending = track(result(b, settleSQL(f)));
    await blocked('identical request waits at owner lock', b, a, pending);
    await a.exec('COMMIT;', { failFast: true });
    const replay = await finish(pending);
    assert.deepEqual(replay, { receipt: first.receipt, replayed: true });
    await assertPaidOnce(f, first);
    const paid = await snapshot(f);
    assert.deepEqual(await result(b, settleSQL(f)), replay);
    assert.deepEqual(await snapshot(f), paid, 'Replay must not mutate any reward/session state');
  });
  await test(SCENARIOS[1], async session => {
    const f = await fixture(), a = await session('winner'), b = await session('conflict');
    await actor(a, f.owner); await actor(b, f.owner);
    await a.exec('BEGIN;'); const first = await result(a, settleSQL(f));
    const pending = track(result(b, settleSQL(f, { score: 1050 })));
    await blocked('changed payload waits at owner lock', b, a, pending);
    await a.exec('COMMIT;', { failFast: true });
    const outcome = await pending.done;
    assert(outcome.error, 'A changed committed payload must conflict');
    assert.equal(outcome.error.code, 'P0001');
    assert.equal(outcome.error.primaryMessage, 'game_settlement_conflict');
    await assertPaidOnce(f, first);
    const paid = await snapshot(f);
    assert.deepEqual(await result(b, settleSQL(f)), { receipt: first.receipt, replayed: true });
    assert.deepEqual(await snapshot(f), paid);
  });
  await test(SCENARIOS[2], async session => {
    const f = await fixture(), a = await session('final-slot'), b = await session('over-quota');
    await actor(a, f.owner); await actor(b, f.owner);
    await a.exec('BEGIN;'); const first = await result(a, settleSQL(f, { maxPerHour: 1 }));
    const pending = track(result(b, settleSQL(f, { sessionId: f.sessions[1], maxPerHour: 1 })));
    await blocked('different session waits before quota count', b, a, pending);
    await a.exec('COMMIT;', { failFast: true });
    const outcome = await pending.done;
    assert(outcome.error, 'Second session must not exceed the final quota slot');
    assert.equal(outcome.error.code, 'P0001');
    assert.equal(outcome.error.primaryMessage, 'game_settlement_cap_rewards_hourly');
    await assertPaidOnce(f, first);
    assert.equal((await observer.rows(`SELECT status FROM public.game_sessions WHERE id=${q(f.sessions[1])}`))[0].status, 'started');
    assert.deepEqual(await result(b, settleSQL(f, { maxPerHour: 1 })), { receipt: first.receipt, replayed: true }, 'An identical retry is allowed after quota is exhausted');
  });

  // Synthetic late fault with a transaction-level advisory barrier. The trigger
  // executes after the real game-grant write, so failure must roll back prior
  // receipt/session/reward writes. No pg_sleep or timing-only overlap evidence.
  await observer.exec(`CREATE FUNCTION public.native_test_fail_game() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF current_setting('test.fail_game',true) = 'yes' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(current_setting('test.game_fault_key'),0));
        RAISE EXCEPTION 'injected_game_grant_failure';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER native_test_fail_game AFTER INSERT ON public.game_grants FOR EACH ROW EXECUTE FUNCTION public.native_test_fail_game();`, { failFast: true });
  await test(SCENARIOS[3], async session => {
    const f = await fixture({ achievementCount: 2, withCompanion: true }), a = await session('failing'), b = await session('waiting-retry');
    await actor(a, f.owner); await actor(b, f.owner);
    const faultKey = `synthetic-game-fault:${randomUUID()}`;
    await observer.exec(`BEGIN; SELECT pg_advisory_xact_lock(hashtextextended(${q(faultKey)},0));`);
    await a.exec(`SET test.fail_game='yes'; SELECT set_config('test.game_fault_key',${q(faultKey)},false);`);
    const failure = track(result(a, settleSQL(f)));
    await blocked('late downstream fault barrier', a, observer, failure);
    const retry = track(result(b, settleSQL(f)));
    await blocked('retry waits for failed settlement owner lock', b, a, retry);
    await observer.exec('COMMIT;', { failFast: true });
    const failed = await failure.done;
    assert(failed.error); assert.equal(failed.error.code, 'P0001');
    assert.equal(failed.error.primaryMessage, 'injected_game_grant_failure');
    const settled = await finish(retry);
    await assertPaidOnce(f, settled, 2);
    assert.equal(settled.receipt.achievements.length, 2);
    assert.deepEqual(await result(b, settleSQL(f)), { receipt: settled.receipt, replayed: true });
  });
  for (const gameFirst of [true, false]) {
    await test(SCENARIOS[gameFirst ? 4 : 5], async session => {
      const f = await fixture({ achievementCount: 2 }), a = await session('first'), b = await session('second');
      await actor(a, f.owner); await actor(b, f.owner);
      await a.exec('BEGIN;');
      const first = await result(a, gameFirst ? settleSQL(f) : achievementSQL(f));
      const pending = track(result(b, gameFirst ? achievementSQL(f) : settleSQL(f)));
      await blocked('game and achievement share the first owner lock', b, a, pending);
      await a.exec('COMMIT;', { failFast: true });
      const second = await finish(pending);
      if (gameFirst) assert.deepEqual(second, { unlocked: false, reason: 'already_unlocked' });
      else assert.equal(first.unlocked, true);
      await assertPaidOnce(f, gameFirst ? first : second, 2);
      for (const achievement of f.achievements) {
        assert.deepEqual(await result(b, achievementSQL(f, achievement)), { unlocked: false, reason: 'already_unlocked' });
      }
    });
  }
  for (const gameFirst of [true, false]) {
    await test(SCENARIOS[gameFirst ? 6 : 7], async session => {
      const f = await fixture({ withCompanion: true }), a = await session('parent-holder'),
        b = await session('contender'), probe = await session('stats-probe');
      await actor(a, f.owner); await actor(b, f.owner);
      // Hold only the parent phase, before either actual RPC touches stats.
      // A reversed contender would lock stats then wait for the parent: the
      // NOWAIT probe fails, and the real holder RPC would otherwise deadlock.
      await a.exec(`BEGIN; ${gameFirst ? `SELECT pg_advisory_xact_lock(hashtextextended('reward-settlement:' || ${q(f.owner)},0));` : ''}
        SELECT id FROM public.companions WHERE id=${q(f.companion)} FOR NO KEY UPDATE;`);
      const pending = track(result(b, gameFirst ? bondSQL(f) : settleSQL(f)));
      await blocked('game and bond share parent-before-stats phase', b, a, pending, null);
      await probe.exec(`BEGIN; SELECT companion_id FROM public.companion_stats WHERE companion_id=${q(f.companion)} FOR UPDATE NOWAIT; ROLLBACK;`, { failFast: true });
      const first = await result(a, gameFirst ? settleSQL(f) : bondSQL(f));
      await a.exec('COMMIT;', { failFast: true });
      const second = await finish(pending);
      await assertPaidOnce(f, gameFirst ? first : second);
      const stats = (await observer.rows(`SELECT bond_level,bond_score FROM public.companion_stats WHERE companion_id=${q(f.companion)}`))[0];
      assert.deepEqual(stats, { bond_level: 5, bond_score: gameFirst ? 97 : 95 });
    });
  }
  report.status = 'PASSED';
  verifyReport(report);
  console.log(`PASS: ${report.checks.length} real PostgreSQL game-settlement schedules; evidence database ${database}`);
} catch (error) {
  report.status = 'FAILED'; report.error = { message: error.message, code: error.code, primaryMessage: error.primaryMessage };
  console.error(error); process.exitCode = 1;
} finally {
  for (const s of sessions) s.kill();
  const path = process.env.MEMVOYA_PG_REPORT || resolve(root, 'test-results/game-settlement-concurrency.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Evidence: ${path}`);
}
