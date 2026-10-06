// Native PostgreSQL 17 only. Launch through moonberry-rollout-native.mjs.
// This suite models a runner locally; it does not implement or verify a hosted API.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Session, literal as q, identifier } from './helpers/native-postgres.mjs';
import { bootstrap, sha256, configureHardenedPreferences } from './helpers/moonberry-use-fixture.mjs';
import { readContract, scenarios, lockScenario, lockLabel } from './helpers/moonberry-rollout-contract.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
assert.equal(process.env.MEMVOYA_PG_TEST_ONLY, '1');
assert.match(process.env.MEMVOYA_MOONBERRY_CLUSTER_ROOT || '', /^\/tmp\/mv-moonberry-rollout-[a-zA-Z0-9]+$/);
assert.equal(process.env.PGHOST, `${process.env.MEMVOYA_MOONBERRY_CLUSTER_ROOT}/socket`);
assert.equal(await realpath(process.env.PGHOST), process.env.PGHOST);
assert.equal((await stat(process.env.PGHOST)).mode & 0o777, 0o700);
for (const key of ['PGHOSTADDR', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'DATABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL']) assert(!process.env[key], `${key} is forbidden`);
assert.equal(process.env.PGDATABASE, 'postgres'); assert.equal(process.env.PGPASSFILE, '/dev/null');
assert.match(process.env.PSQL_BIN, /\/postgresql\/17\/bin\/psql$/);
const contract = await readContract(root), { wrapper, wrapperSha256, productSha256 } = contract;
const database = `memvoya_rollout_${randomUUID().replaceAll('-', '')}`;
const report = { status: 'RUNNING', startedAt: new Date().toISOString(), database,
  wrapperSource: { path: contract.wrapperPath, sha256: wrapperSha256, productSha256, topLevelStatementCount: contract.topLevelStatementCount },
  checks: [], failures: [], blockingEvidence: [], sessions: [], cleanup: {},
  historyModel: { synthetic: true, managementApiLedgerCoatomicityVerified: false, responseLossInjectedInHarness: true },
  limitations: [
    'Only source migrations and synthetic local infrastructure/configuration are used; no production captures or credentials.',
    'SET ROLE postgres models the reviewed owner within a private peer-authenticated cluster.',
    'A local synthetic history table and explicit runner transaction do not establish Management API ledger coatomicity.',
    'Response loss is simulated after a harness-observed commit; no actual hosted transport failure is exercised.',
    'Hosted authentication, production migration execution and browser acceptance are outside this suite.'
  ] };
const sessions = new Set(); let admin, observer, activeScenario;
const connect = async (name, db = database, owner = true) => {
  const s = new Session(db, `moonberry-rollout:${name}`); sessions.add(s); await s.init();
  if (owner) await s.exec('SET ROLE postgres;', { failFast: true });
  report.sessions.push({ name, backendPid: s.pid, clientPid: s.child.pid }); return s;
};
const scalar = async (s, sql) => (await s.rows(`${sql} AS result`))[0].result;
const state = async (s = observer) => (await s.rows(`SELECT
  to_regnamespace('item_use_internal') IS NOT NULL AS private_schema,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('share_moonberry','read_moonberry_share_moments','validate_moonberry_depleted_stack')) AS functions,
  (SELECT count(*)::int FROM pg_trigger WHERE tgrelid='public.user_items'::regclass AND tgname='user_items_validate_depleted_stack') AS triggers,
  (SELECT pg_get_constraintdef(oid,true) FROM pg_constraint WHERE conrelid='public.user_items'::regclass AND conname='user_items_quantity_check') AS quantity_check,
  (SELECT count(*)::int FROM synthetic_migration_runner.history) AS history_rows`))[0];
const absent = async (s = observer) => {
  const actual = await state(s); assert.deepEqual(actual, { private_schema: false, functions: 0, triggers: 0, quantity_check: 'CHECK (quantity > 0)', history_rows: 0 }); return actual;
};
const expectError = (promise, message, code = 'P0001') => assert.rejects(promise, error => {
  assert.equal(error.code, code); assert((error.primaryMessage ?? error.message).includes(message), `${message}: ${error.message}`); return true;
});
async function test(name, run) {
  activeScenario = name; const local = [];
  const session = async suffix => { const s = await connect(`${name}:${suffix}`); local.push(s); return s; };
  try { const evidence = await run(session); report.checks.push({ name, status: 'PASSED', evidence }); console.log(`PASS ${name}`); }
  catch (error) { report.failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); throw error; }
  finally { for (const s of local) { s.kill(); sessions.delete(s); } }
}
async function drift(patch, message) {
  const s = await connect(`drift:${message}`);
  try {
    await s.exec('BEGIN;', { failFast: true }); await s.exec(patch, { failFast: true });
    await expectError(s.exec(wrapper), message); await s.exec('ROLLBACK;', { failFast: true });
    return { expectedError: message, rollback: await absent() };
  } finally { s.kill(); sessions.delete(s); }
}
async function postconditions(s = observer) {
  const actual = await state(s);
  assert.deepEqual(actual, { private_schema: true, functions: 3, triggers: 1, quantity_check: 'CHECK (quantity >= 0)', history_rows: 1 });
  const privateObject = (await s.rows(`SELECT n.nspowner='postgres'::regrole AS schema_owner,
    c.relowner='postgres'::regrole AS table_owner,c.relrowsecurity,NOT c.relforcerowsecurity AS not_forced,
    (SELECT count(*)::int FROM pg_policy WHERE polrelid=c.oid) AS policies
    FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid
    WHERE n.nspname='item_use_internal' AND c.relname='moonberry_receipts'`))[0];
  assert.deepEqual(privateObject, { schema_owner: true, table_owner: true, relrowsecurity: true, not_forced: true, policies: 0 });
  const privateGrants = await s.rows(`SELECT x.grantee,x.privilege_type FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x
    WHERE n.nspname='item_use_internal' AND x.grantee<>'postgres'::regrole
    UNION ALL SELECT x.grantee,x.privilege_type FROM pg_class c
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
    WHERE c.oid='item_use_internal.moonberry_receipts'::regclass AND x.grantee<>'postgres'::regrole`);
  assert.deepEqual(privateGrants, []);
  for (const role of ['anon','authenticated','service_role']) {
    assert.equal(await scalar(s, `SELECT has_schema_privilege(${q(role)},'item_use_internal','USAGE,CREATE')`), false);
    assert.equal(await scalar(s, `SELECT has_table_privilege(${q(role)},'item_use_internal.moonberry_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`), false);
  }
  const rpc = await s.rows(`SELECT proname,proowner='postgres'::regrole AS owner,prosecdef,proconfig,
    has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated,
    has_function_privilege('anon',oid,'EXECUTE') AS anon,
    has_function_privilege('service_role',oid,'EXECUTE') AS service,
    (SELECT count(*)::int FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) x
      WHERE x.grantee NOT IN ('postgres'::regrole,'authenticated'::regrole) OR x.privilege_type<>'EXECUTE' OR x.is_grantable) AS unexpected_grants
    FROM pg_proc WHERE oid IN ('public.share_moonberry(uuid,uuid,uuid)'::regprocedure,'public.read_moonberry_share_moments(uuid)'::regprocedure) ORDER BY proname`);
  assert.equal(rpc.length, 2);
  for (const fn of rpc) assert.deepEqual({ ...fn, proname: undefined }, { proname: undefined, owner: true, prosecdef: true, proconfig: ['search_path=""'], authenticated: true, anon: false, service: false, unexpected_grants: 0 });
  const receiptColumns = await s.rows(`SELECT a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_expression FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='item_use_internal.moonberry_receipts'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`);
  const receiptConstraints = await s.rows(`SELECT conname,contype,convalidated,pg_get_constraintdef(oid,true) AS definition FROM pg_constraint WHERE conrelid='item_use_internal.moonberry_receipts'::regclass ORDER BY conname`);
  const depletionTrigger = await s.rows(`SELECT tgname,tgenabled,tgisinternal,tgtype,tgattr::smallint[] AS columns,tgfoid::regprocedure::text AS function,pg_get_triggerdef(oid,true) AS definition FROM pg_trigger WHERE tgrelid='public.user_items'::regclass AND tgname='user_items_validate_depleted_stack'`);
  assert(receiptColumns.length > 0); assert(receiptConstraints.length > 0); assert.equal(depletionTrigger.length, 1);
  return { state: actual, privateObject, privateGrants, rpc, receiptColumns, receiptConstraints, depletionTrigger };
}
try {
  admin = await connect('admin', 'postgres', false);
  // initdb's OS-user superuser remains the peer-login identity. All fixture and
  // feature objects are owned by postgres; no password or client role membership.
  await admin.exec(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres SUPERUSER NOLOGIN; END IF; END $$; CREATE DATABASE ${identifier(database)} OWNER postgres;`, { failFast: true });
  observer = await connect('observer');
  report.native = (await observer.rows("SELECT version() AS version,current_user,current_setting('listen_addresses') AS listen_addresses,current_setting('unix_socket_directories') AS unix_socket_directories,inet_server_addr() AS server_address,inet_server_port() AS server_port"))[0];
  assert.equal(report.native.current_user, 'postgres'); assert.equal(report.native.listen_addresses, '');
  assert.equal(report.native.server_address, null); assert.equal(report.native.server_port, null); assert.equal(report.native.unix_socket_directories, process.env.PGHOST);
  report.hba = await observer.rows('SELECT type,database,user_name,address,auth_method,error FROM pg_hba_file_rules');
  assert(report.hba.every(rule => !rule.error && (rule.type === 'local' ? rule.auth_method === 'peer' : rule.auth_method === 'reject')));
  await bootstrap(observer, root, report);
  await observer.exec(`ALTER TABLE public.user_preferences ADD COLUMN consent_memory boolean DEFAULT true, ADD COLUMN consent_reactions boolean NOT NULL DEFAULT true;
    CREATE SCHEMA synthetic_migration_runner;
    CREATE TABLE synthetic_migration_runner.history(version text PRIMARY KEY,name text NOT NULL,wrapper_sha256 text NOT NULL);`, { failFast: true });
  await configureHardenedPreferences(observer, report);
  for (const path of [contract.wrapperPath, 'tests/sql/helpers/moonberry-rollout-contract.mjs', 'tests/sql/moonberry-rollout-native.mjs', 'tests/sql/moonberry-rollout-transactions.mjs', 'scripts/ci/moonberry-share-rollout-verify.mjs', 'tests/sql/fixtures/moonberry-rollout-postflight.sql']) report.sourceFiles.push({ path, sha256: sha256(await readFile(resolve(root, path))) });

  await test(scenarios[0], async () => {
    await absent();
    const tables = await observer.rows(`SELECT c.relname,c.relowner='postgres'::regrole AS owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY c.relname`);
    assert.equal(tables.length, 6); assert(tables.every(t => t.owner && t.relrowsecurity && !t.relforcerowsecurity));
    assert.equal(await scalar(observer, "SELECT count(*)::int FROM pg_default_acl WHERE defaclrole='postgres'::regrole AND defaclnamespace=0"), 0);
    assert.equal(await scalar(observer, "SELECT count(*)::int FROM pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole)"), 0);
    const config = (await observer.rows(`SELECT
      (SELECT count(*)::int FROM public.item_catalog WHERE item_key='world-moonberry' AND kind='consumable' AND capabilities=ARRAY['consumable','giftable']::text[]) AS catalog,
      (SELECT count(*)::int FROM public.world_maps WHERE id='wilds-exploration' AND version=1 AND is_active) AS map,
      (SELECT count(*)::int FROM public.world_landmarks WHERE map_id='wilds-exploration' AND landmark_key='moonberry-grove' AND map_version=1 AND x=800 AND y=120 AND discovery_radius=72 AND is_active) AS landmark,
      (SELECT count(*)::int FROM public.world_gather_nodes n JOIN public.item_catalog i ON i.id=n.reward_item_id WHERE n.map_id='wilds-exploration' AND n.node_key='moonberry-bush' AND n.map_version=1 AND n.x=800 AND n.y=120 AND n.interaction_radius=58 AND i.item_key='world-moonberry' AND n.reward_quantity=1 AND n.cooldown_seconds=300 AND n.max_owned_quantity=20 AND n.is_active) AS node`))[0];
    assert.deepEqual(config, { catalog: 1, map: 1, landmark: 1, node: 1 });
    return { tables, config, hardenedPreferences: report.hardenedPreferenceBaseline };
  });
  await test(scenarios[1], async session => {
    const s = await session('autocommit');
    await expectError(s.exec(wrapper), 'moonberry_runner_lost_transaction_local_safety_settings');
    assert(s.stderr.includes('SET LOCAL can only be used in transaction blocks'));
    return { submittedWrapperSha256: sha256(wrapper), withoutRunnerTransaction: true, rollback: await absent() };
  });
  await test(scenarios[2], async () => {
    const results = [];
    for (const patch of [
      'ALTER TABLE public.user_preferences DROP COLUMN consent_memory;',
      'ALTER TABLE public.user_preferences ALTER COLUMN consent_memory SET NOT NULL;',
      'ALTER TABLE public.user_preferences ALTER COLUMN consent_memory SET DEFAULT false;',
      'ALTER TABLE public.user_preferences ALTER COLUMN consent_reactions DROP NOT NULL;',
      'ALTER TABLE public.user_preferences ALTER COLUMN consent_reactions DROP DEFAULT;'
    ]) results.push(await drift(patch, 'moonberry_consent_shape_drift'));
    return { variants: results };
  });
  await test(scenarios[3], async () => {
    const results = [await drift('SET LOCAL ROLE service_role;', 'moonberry_reviewed_owner_or_postgresql17_drift')];
    for (const patch of ['ALTER TABLE public.user_items OWNER TO service_role;', 'ALTER TABLE public.user_items DISABLE ROW LEVEL SECURITY;', 'ALTER TABLE public.user_items FORCE ROW LEVEL SECURITY;']) results.push(await drift(patch, 'moonberry_target_table_owner_or_rls_drift'));
    return { variants: results };
  });
  await test(scenarios[4], async () => {
    const results = [];
    for (const patch of [
      "UPDATE public.item_catalog SET capabilities=ARRAY['consumable','giftable','placeable'] WHERE item_key='world-moonberry';",
      "UPDATE public.world_maps SET is_active=false WHERE id='wilds-exploration';",
      "UPDATE public.world_gather_nodes SET cooldown_seconds=301 WHERE node_key='moonberry-bush';",
      "UPDATE public.world_landmarks SET discovery_radius=73 WHERE landmark_key='moonberry-grove';"
    ]) results.push(await drift(patch, 'moonberry_nonplayer_configuration_drift'));
    return { variants: results };
  });
  await test(scenarios[5], async () => drift('ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT ON TABLES TO authenticated;', 'moonberry_unreviewed_global_creator_defaults'));
  await test(scenarios[6], async () => drift('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated WITH GRANT OPTION;', 'moonberry_unreviewed_public_function_default_access'));
  await test(scenarios[7], async () => ({ variants: [
    await drift('GRANT service_role TO authenticated;', 'moonberry_client_role_membership_drift'),
    await drift('GRANT UPDATE ON public.user_preferences TO authenticated;', 'moonberry_client_schema_or_broad_preference_authority_drift'),
    await drift('GRANT UPDATE (moderation_status) ON public.user_preferences TO authenticated;', 'moonberry_protected_preference_acl_drift')
  ] }));
  await test(scenarios[8], async session => {
    const lastHash = '7c1adbc6b9518e0f29136cc3daa77e7f', badHash = '00000000000000000000000000000000';
    assert.equal(wrapper.split(lastHash).length, 2);
    const injected = wrapper.replace(lastHash, badHash);
    assert.equal(injected.replace(badHash, lastHash), wrapper);
    const s = await session('late-failure'); await s.exec('BEGIN;', { failFast: true });
    await expectError(s.exec(injected), 'moonberry_function_body_changed');
    await s.exec('ROLLBACK;', { failFast: true });
    return { injectedOnlyFinalPostflightHash: true, submittedSha256: sha256(injected), exactWrapperSha256: wrapperSha256, rollback: await absent() };
  });
  await test(scenarios[9], async session => {
    const holder = await session('holder'), waiter = await session('waiter');
    await holder.exec('BEGIN; LOCK TABLE public.user_items IN ACCESS SHARE MODE;', { failFast: true });
    await waiter.exec('BEGIN;', { failFast: true });
    const start = performance.now(); let settled = false;
    const work = waiter.exec(wrapper).then(() => { settled = true; return {}; }, error => { settled = true; return { error }; });
    let evidence;
    try {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline && !evidence) {
        await observer.exec('SELECT pg_stat_clear_snapshot();');
        const activity = await observer.rows(`SELECT pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=${waiter.pid}`);
        if (activity[0]?.wait_event_type === 'Lock' && activity[0].blockers.includes(holder.pid)) {
          const locks = await observer.rows(`SELECT pid,locktype,relation::regclass::text AS relation,mode,granted FROM pg_locks WHERE pid IN (${waiter.pid},${holder.pid}) ORDER BY pid,locktype,relation,mode`);
          assert(locks.some(lock => lock.pid===waiter.pid && lock.relation==='user_items' && lock.mode==='AccessExclusiveLock' && !lock.granted));
          evidence = { scenario: lockScenario, label: lockLabel, holderPid: holder.pid, waiterPid: waiter.pid, activity, locks };
        } else { assert.equal(settled, false); await delay(10); }
      }
      assert(evidence, 'Real backend blocking must be observed before timeout');
      const { error } = await work; assert(error); assert.equal(error.code, '55P03');
      assert((error.primaryMessage ?? error.message).includes('lock timeout'));
      const elapsedMs = performance.now() - start; assert(elapsedMs >= 4500 && elapsedMs < 12000, `Unexpected lock-timeout duration ${elapsedMs}`);
      await waiter.exec('ROLLBACK;', { failFast: true }); await holder.exec('ROLLBACK;', { failFast: true });
      const remainingLocks = await observer.rows(`SELECT pid,mode FROM pg_locks WHERE pid IN (${waiter.pid},${holder.pid}) AND relation='public.user_items'::regclass`);
      assert.deepEqual(remainingLocks, []);
      Object.assign(evidence, { elapsedMs, sqlstate: error.code, remainingLocks, rollback: await absent() });
      report.blockingEvidence.push(evidence); return evidence;
    } finally {
      // Release the holder even if an evidence assertion failed; consume the
      // waiter's promise before disposing sessions and stopping the cluster.
      if (!holder.closed) await holder.exec('ROLLBACK;').catch(() => {});
      await work;
      if (!waiter.closed) await waiter.exec('ROLLBACK;').catch(() => {});
    }
  });
  await test(scenarios[10], async session => {
    const s = await session('synthetic-runner-failure'); await s.exec('BEGIN;', { failFast: true });
    await s.exec(wrapper, { failFast: true });
    await s.exec(`INSERT INTO synthetic_migration_runner.history VALUES ('synthetic-local-v1','moonberry_share_v1',${q(wrapperSha256)});`, { failFast: true });
    const inside = await state(s); assert.equal(inside.functions, 3); assert.equal(inside.history_rows, 1);
    await expectError(s.exec("DO $$ BEGIN RAISE EXCEPTION 'synthetic_runner_failure_after_history'; END $$;"), 'synthetic_runner_failure_after_history');
    await s.exec('ROLLBACK;', { failFast: true });
    return { modelOnly: true, managementApiLedgerCoatomicityVerified: false, observedBeforeFailure: inside, rollback: await absent() };
  });
  await test(scenarios[11], async session => {
    const s = await session('exact-success'); await s.exec('BEGIN;', { failFast: true });
    await s.exec(wrapper, { failFast: true });
    await s.exec(`INSERT INTO synthetic_migration_runner.history VALUES ('synthetic-local-v1','moonberry_share_v1',${q(wrapperSha256)});`, { failFast: true });
    await s.exec('COMMIT;', { failFast: true });
    const metadataQuery = (await readFile(resolve(root, 'tests/sql/fixtures/moonberry-rollout-postflight.sql'), 'utf8')).trim().replace(/;$/, '');
    report.featurePostflight = (await observer.rows(metadataQuery))[0].feature_postflight;
    assert.equal(report.featurePostflight.receipt_columns.length, 8);
    assert.equal(report.featurePostflight.functions.length, 3);
    report.historyModel.commitObservedByHarness = true;
    // Deliberately discard the runner's successful response at this boundary.
    // A fresh reader below must establish state instead of retrying the migration.
    report.historyModel.simulatedClientOutcome = 'unknown';
    return { submittedWrapperSha256: sha256(wrapper), embeddedProductSha256: productSha256, exactBytes: true, postconditions: await postconditions() };
  });
  await test(scenarios[12], async session => {
    const reader = await session('fresh-readback');
    const history = await reader.rows('SELECT version,name,wrapper_sha256 FROM synthetic_migration_runner.history ORDER BY version');
    assert.deepEqual(history, [{ version: 'synthetic-local-v1', name: 'moonberry_share_v1', wrapper_sha256: wrapperSha256 }]);
    const after = await postconditions(reader);
    Object.assign(report.historyModel, { readbackConfirmed: true, replayAttemptedDuringReconciliation: false, resolution: 'synthetic_committed_do_not_reapply' });
    return { freshReaderPid: reader.pid, history, postconditions: after, modelOnly: true };
  });
  await test(scenarios[13], async session => {
    const before = await state(); const s = await session('reject-reapply'); await s.exec('BEGIN;', { failFast: true });
    await expectError(s.exec(wrapper), 'moonberry_feature_name_exists_stop_do_not_reapply');
    await s.exec('ROLLBACK;', { failFast: true }); assert.deepEqual(await state(), before);
    return { expectedError: 'moonberry_feature_name_exists_stop_do_not_reapply', unchanged: before };
  });
  for (const source of report.sourceFiles) assert.equal(sha256(await readFile(resolve(root, source.path))), source.sha256, `Source changed: ${source.path}`);
  report.sourceHashesUnchanged = true; report.status = 'PASSED';
} catch (error) { report.status = 'FAILED'; report.fatalError = error.stack; }
finally {
  for (const s of sessions) if (s !== admin) s.kill();
  if (admin && !admin.closed) {
    try { await admin.exec(`DROP DATABASE IF EXISTS ${identifier(database)} WITH (FORCE);`, { failFast: true }); report.cleanup.databaseDropped = true; }
    catch (error) { report.status = 'FAILED'; report.cleanup.error = error.stack; }
    admin.kill();
  }
  report.finishedAt = new Date().toISOString(); report.checkCount = report.checks.length; report.failureCount = report.failures.length;
  await writeFile(process.env.MEMVOYA_MOONBERRY_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.status}: ${report.checkCount} rollout scenarios passed, ${report.failureCount} failed; ${report.blockingEvidence.length} observed lock timeout`);
  if (report.fatalError) console.error(report.fatalError);
  if (report.status !== 'PASSED') process.exitCode = 1;
}
