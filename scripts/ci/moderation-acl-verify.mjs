#!/usr/bin/env node
/**
 * Credential-free PostgreSQL 17 regression runner. This is NOT a deployment tool.
 * It accepts no connection string, host, database, SQL, or credentials as input.
 * Every database lives in a fresh private cluster with TCP disabled. Only the
 * three reviewed SQL artifacts and synthetic fixtures below are loaded.
 *
 * Usage: node scripts/ci/moderation-acl-verify.mjs [--self-test]
 * Binaries: /usr/lib/postgresql/17/bin, or absolute MODERATION_ACL_PG_BIN.
 * Evidence: test-results/moderation-acl/native/ (synthetic records only).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  readFileSync, realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setImmediate as yieldToSignals } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = join(root, 'test-results/moderation-acl/native');
const tables = ['user_preferences', 'user_items', 'item_catalog', 'companions',
  'companion_journal_entries', 'world_events'];
const clients = ['anon', 'authenticated'];
const protectedColumns = ['moderation_status', 'moderation_until'];
const files = {
  proposal: 'scripts/sql/moderation-acl-hardening-proposal.sql',
  capture: 'scripts/sql/moderation-acl-capture-before.sql',
  acceptance: 'scripts/sql/moderation-acl-acceptance-catalog.sql',
  fixture: 'tests/sql/moderation-acl-fixture.sql',
  snapshot: 'tests/sql/moderation-acl-snapshot.sql',
  behavior: 'tests/sql/moderation-acl-behavior.sql',
};
const source = Object.fromEntries(Object.entries(files).map(([key, path]) =>
  [key, readFileSync(join(root, path), 'utf8')]));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const digest = (value) => hash(JSON.stringify(value));
const sorted = (rows) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const aclKey = ({ relation, column_name, grantee, grantor, privilege, is_grantable }) =>
  JSON.stringify([relation, column_name, grantee, grantor, privilege, is_grantable]);
const isColumnTarget = (row) => clients.includes(row.role ?? row.grantee)
  && protectedColumns.includes(row.column_name) && ['INSERT', 'UPDATE'].includes(row.privilege);
const isTableTarget = (row) => clients.includes(row.role ?? row.grantee)
  && tables.includes(row.relation) && ['TRUNCATE', 'TRIGGER'].includes(row.privilege);
const isAclTarget = (row) => (row.relation === 'user_preferences' && isColumnTarget(row))
  || (row.column_name === null && isTableTarget(row));
const expectedRemoved = [
  ...clients.flatMap((grantee) => protectedColumns.flatMap((column_name) =>
    ['INSERT', 'UPDATE'].map((privilege) => ({ relation: 'user_preferences', column_name,
      grantee, grantor: 'postgres', privilege, is_grantable: false })))),
  ...clients.flatMap((grantee) => tables.flatMap((relation) =>
    ['TRUNCATE', 'TRIGGER'].map((privilege) => ({ relation, column_name: null,
      grantee, grantor: 'postgres', privilege, is_grantable: false })))),
].map(aclKey).sort();

// Fail closed even if a variable is empty. Child processes additionally receive
// a fresh allowlisted environment and a private empty HOME, never .pgpass,
// pg_service.conf, libpq options, .psqlrc, or the application's .env files.
function forbiddenEnvironment(env) {
  return Object.keys(env).filter((name) => /^(?:PG[A-Z0-9_]*|(?:.*_)?(?:DATABASE|DB|POSTGRES|SUPABASE)(?:_.*)?|DIRECT_URL|CONNECTION_STRING|CONNECTION_URL|PRISMA_.*)$/i.test(name));
}
function assertEnvironment(env) {
  const forbidden = forbiddenEnvironment(env);
  assert.equal(forbidden.length, 0,
    `Refusing external database/credential environment variables: ${forbidden.join(', ')}`);
}
function assertReviewedSource() {
  const sql = source.proposal.replace(/--[^\n]*/g, '');
  assert.match(sql, /^\s*BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.equal((sql.match(/\bREVOKE\s/g) ?? []).length, 2);
  assert(!/^\s*\\/m.test(sql), 'Proposal must not contain psql connection or shell commands');
  assert(!/\b(?:dblink|postgres_fdw|COPY\s+.*\s+PROGRAM)\b/i.test(sql), 'Proposal must be local SQL only');
  assert.equal(expectedRemoved.length, 32);
  assert.equal(new Set(expectedRemoved).size, 32);
}

const driftCases = [
  ['tablewide-insert', 'GRANT INSERT ON public.user_preferences TO authenticated;',
    'hardening_broad_preference_grant_requires_separate_review'],
  ['tablewide-update', 'GRANT UPDATE ON public.user_preferences TO anon;',
    'hardening_broad_preference_grant_requires_separate_review'],
  ['inherited-membership', `GRANT UPDATE (moderation_status) ON public.user_preferences TO acl_inherited;
    GRANT acl_inherited TO authenticated;`,
    'hardening_client_membership_drift'],
  ['set-role-membership', `GRANT UPDATE (moderation_status) ON public.user_preferences TO acl_inherited;
    GRANT acl_inherited TO anon WITH INHERIT FALSE;`,
    'hardening_client_membership_drift'],
  ['public-column-insert', 'GRANT INSERT (moderation_status) ON public.user_preferences TO PUBLIC;',
    'hardening_alternate_grant_source_or_option_drift'],
  ['public-column-update', 'GRANT UPDATE (moderation_until) ON public.user_preferences TO PUBLIC;',
    'hardening_alternate_grant_source_or_option_drift'],
  ['public-table-truncate', 'GRANT TRUNCATE ON public.user_items TO PUBLIC;',
    'hardening_alternate_grant_source_or_option_drift'],
  ['public-table-trigger', 'GRANT TRIGGER ON public.world_events TO PUBLIC;',
    'hardening_alternate_grant_source_or_option_drift'],
  ['column-grant-option', 'GRANT INSERT (moderation_status) ON public.user_preferences TO anon WITH GRANT OPTION;',
    'hardening_alternate_grant_source_or_option_drift'],
  ['table-grant-option', 'GRANT TRIGGER ON public.companions TO authenticated WITH GRANT OPTION;',
    'hardening_alternate_grant_source_or_option_drift'],
  ['alternate-column-grantor', `GRANT UPDATE (moderation_until) ON public.user_preferences TO acl_delegate WITH GRANT OPTION;
    SET ROLE acl_delegate; GRANT UPDATE (moderation_until) ON public.user_preferences TO anon; RESET ROLE;`,
    'hardening_alternate_grant_source_or_option_drift'],
  ['alternate-table-grantor', `GRANT TRUNCATE ON public.item_catalog TO acl_delegate WITH GRANT OPTION;
    SET ROLE acl_delegate; GRANT TRUNCATE ON public.item_catalog TO authenticated; RESET ROLE;`,
    'hardening_alternate_grant_source_or_option_drift'],
  ['wrong-owner', 'ALTER TABLE public.companions OWNER TO acl_other_owner;',
    'hardening_table_owner_or_rls_drift'],
  ['rls-disabled', 'ALTER TABLE public.world_events DISABLE ROW LEVEL SECURITY;',
    'hardening_table_owner_or_rls_drift'],
  ['missing-column-grant', 'REVOKE UPDATE (moderation_until) ON public.user_preferences FROM authenticated;',
    'hardening_column_acl_drift'],
  ['missing-table-grant', 'REVOKE TRIGGER ON public.companion_journal_entries FROM anon;',
    'hardening_table_acl_drift'],
  ['renamed-moderation-column', 'ALTER TABLE public.user_preferences RENAME COLUMN moderation_until TO moderation_deadline;',
    'hardening_moderation_column_drift'],
  ['client-superuser', 'ALTER ROLE anon SUPERUSER;', 'hardening_client_role_drift'],
  ['client-bypassrls', 'ALTER ROLE authenticated BYPASSRLS;', 'hardening_client_role_drift'],
  ['client-createrole', 'ALTER ROLE anon CREATEROLE;', 'hardening_client_role_drift'],
  // These are deliberately POST-REVOKE failures. They prove all 32 original
  // grants survive transaction rollback, not merely that preflight can refuse.
  ['late-service-insert-authority', `REVOKE INSERT ON public.user_preferences FROM service_role;
    GRANT INSERT (user_id,start_on,portable_state,consent_memory,consent_reactions,theme,role,moderation_until)
      ON public.user_preferences TO service_role;`,
    'hardening_service_moderation_authority_changed'],
  ['late-service-update-authority', `REVOKE UPDATE ON public.user_preferences FROM service_role;
    GRANT UPDATE (user_id,start_on,portable_state,consent_memory,consent_reactions,theme,role,moderation_status)
      ON public.user_preferences TO service_role;`,
    'hardening_service_moderation_authority_changed'],
];

function selfTest() {
  assertReviewedSource();
  for (const name of ['PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSWORD',
    'PGOPTIONS', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'PGSSLCERT', 'PGSSLKEY',
    'DATABASE_URL', 'DIRECT_URL', 'DB_HOST', 'POSTGRES_URL', 'SQLALCHEMY_DATABASE_URI',
    'PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.throws(() => assertEnvironment({ [name]: '' }), /Refusing external/);
  }
  assertEnvironment({ PATH: '/usr/bin', HOME: '/tmp/example', GITHUB_RUN_ID: '123',
    MODERATION_ACL_PG_BIN: '/usr/lib/postgresql/17/bin' });
  assert.equal(driftCases.length, 22);
  assert.equal(new Set(driftCases.map(([name]) => name)).size, driftCases.length);
  assert(source.behavior.includes('owner DELETE can reset moderation'));
  assert(source.behavior.includes('new row violates row-level security policy'));
  console.log('PASS: harness source contract, 21 forbidden-environment cases, 32 exact ACL targets, 22 drift cases.');
  console.log('Native PostgreSQL assertions have NOT run in --self-test mode.');
}

const report = { status: 'RUNNING', startedAt: new Date().toISOString(),
  isolation: { database: 'fresh synthetic cluster', tcp: false, credentials: false },
  sources: Object.fromEntries(Object.entries(files).map(([key, path]) => [path, hash(source[key])])),
  checks: [], failures: [] };
let scratch;
let binaries;
let childEnv;
let cleanupDone = false;
let reportDirectoryReady = false;
const port = '55439';
const saveJson = (name, value) => writeFileSync(join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);

function binary(command, args, options = {}) {
  const result = spawnSync(binaries[command], args, {
    env: childEnv, cwd: scratch, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  return result;
}
function mustBinary(command, args, options) {
  const result = binary(command, args, options);
  assert.equal(result.status, 0, `${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
function sql(database, text, allowFailure = false) {
  const result = binary('psql', ['-X', '-w', '-q', '-A', '-t', '-F', '\t',
    '--set=ON_ERROR_STOP=1', '--set=VERBOSITY=verbose',
    '--host', join(scratch, 'socket'), '--port', port, '--username', 'postgres', '--dbname', database],
  { input: `SET statement_timeout='45s'; SET lock_timeout='5s';\n${text}` });
  if (!allowFailure) assert.equal(result.status, 0,
    `Native SQL failed in ${database}: ${result.stderr || result.stdout}`);
  return result;
}
function snapshot(database, name) {
  const result = JSON.parse(sql(database, source.snapshot).stdout);
  if (name) saveJson(`${name}.json`, result);
  return result;
}
function resetRoles() {
  sql('postgres', `ALTER ROLE anon NOSUPERUSER NOCREATEROLE NOBYPASSRLS INHERIT;
    ALTER ROLE authenticated NOSUPERUSER NOCREATEROLE NOBYPASSRLS INHERIT;
    REVOKE acl_inherited FROM anon,authenticated;`);
}
function databaseFor(name) {
  assert.match(name, /^[a-z0-9-]+$/);
  const db = `acl_${name.replaceAll('-', '_')}`;
  assert(db.length < 64);
  resetRoles();
  sql('postgres', `CREATE DATABASE ${db} TEMPLATE template0;`);
  sql(db, source.fixture);
  return db;
}
function logCheck(name, detail = {}) {
  report.checks.push({ name, ...detail });
  console.log(`PASS: ${name}`);
  saveJson('report.json', report);
}
function targetCounts(snap) {
  return { column: snap.acl.filter((row) => row.relation === 'user_preferences' && isColumnTarget(row)).length,
    table: snap.acl.filter((row) => row.column_name === null && isTableTarget(row)).length };
}
function checkAcceptance(database, expectedMismatchCount, artifactName) {
  const result = sql(database, source.acceptance).stdout;
  writeFileSync(join(evidence, `${artifactName}.tsv`), result);
  const rows = result.trim().split('\n').map((line) => line.split('\t'));
  assert.equal(rows.length, 60, 'Acceptance catalog must cover 12 column, 36 table, 12 ordinary grants');
  for (const row of rows) {
    assert([4, 5].includes(row.length), `Unexpected acceptance result: ${row}`);
    assert(['t', 'f'].includes(row.at(-1)) && ['t', 'f'].includes(row.at(-2)));
  }
  assert.equal(rows.filter((row) => row.at(-2) !== row.at(-1)).length, expectedMismatchCount);
}
function successfulRevocation() {
  const db = databaseFor('success');
  const before = snapshot(db, 'success.before');
  assert.deepEqual(targetCounts(before), { column: 8, table: 24 });
  assert.deepEqual(before.acl.filter(isAclTarget).map(aclKey).sort(), expectedRemoved);
  assert(before.column_effective.filter(isColumnTarget).every((row) => row.allowed));
  assert(before.table_effective.filter(isTableTarget).every((row) => row.allowed));
  const captured = sql(db, source.capture).stdout;
  writeFileSync(join(evidence, 'capture-before.tsv'), captured);
  assert.equal(captured.split('\n').filter((line) => line.includes('GRANT ')).length, 32);
  checkAcceptance(db, 32, 'acceptance-before');
  assert.deepEqual(snapshot(db), before, 'Read-only before-capture scripts changed database state');

  sql(db, source.proposal);
  const after = snapshot(db, 'success.after');
  const beforeKeys = new Set(before.acl.map(aclKey));
  const afterKeys = new Set(after.acl.map(aclKey));
  const removed = [...beforeKeys].filter((key) => !afterKeys.has(key)).sort();
  const added = [...afterKeys].filter((key) => !beforeKeys.has(key)).sort();
  assert.deepEqual(removed, expectedRemoved, 'Must remove exactly eight column and 24 table ACL entries');
  assert.deepEqual(added, [], 'No ACL entry may be added');
  assert.deepEqual(targetCounts(after), { column: 0, table: 0 });
  assert(after.column_effective.filter(isColumnTarget).every((row) => !row.allowed));
  assert(after.table_effective.filter(isTableTarget).every((row) => !row.allowed));
  assert.deepEqual(sorted(after.column_effective.filter((row) => !isColumnTarget(row))),
    sorted(before.column_effective.filter((row) => !isColumnTarget(row))),
    'Every ordinary preference/consent/user_id/role and service effective column privilege must be unchanged');
  assert.deepEqual(sorted(after.table_effective.filter((row) => !isTableTarget(row))),
    sorted(before.table_effective.filter((row) => !isTableTarget(row))),
    'Every non-target effective table privilege must be unchanged');
  for (const field of ['catalog', 'roles', 'memberships', 'rows']) {
    assert.deepEqual(after[field], before[field], `Proposal changed ${field}`);
  }
  logCheck('exact-eight-column-and-24-table-revokes', { removed: 32, added: 0 });
  logCheck('ordinary-effective-privileges-and-service-authority-preserved');
  logCheck('rls-policies-owners-triggers-defaults-constraints-and-data-preserved');

  const capturedAfter = sql(db, source.capture).stdout;
  writeFileSync(join(evidence, 'capture-after.tsv'), capturedAfter);
  assert.equal(capturedAfter.split('\n').filter((line) => line.includes('GRANT ')).length, 0);
  checkAcceptance(db, 0, 'acceptance-after');
  assert.deepEqual(snapshot(db), after, 'Read-only after-capture scripts changed database state');
  logCheck('capture-and-acceptance-scripts-read-only-with-exact-results');

  const behavior = sql(db, source.behavior);
  writeFileSync(join(evidence, 'native-behavior.log'), behavior.stdout + behavior.stderr);
  assert.match(behavior.stdout, /native-behavior-passed/);
  assert.deepEqual(snapshot(db), after, 'Behavior fixture did not roll back its test writes');
  logCheck('native-client-moderation-insert-update-denied', { roles: clients, columns: protectedColumns });
  logCheck('native-truncate-trigger-denied-on-all-six-tables', { deniedStatements: 24 });
  logCheck('native-owner-preferences-consent-and-user-id-self-write-work');
  logCheck('native-role-write-delete-and-owner-reassignment-bypasses-denied');
  logCheck('native-cross-owner-and-anonymous-rls-preserved-on-synthetic-fixture');
  logCheck('native-service-moderation-insert-update-retained');

  expectRejected(db, 'repeat-application', 'hardening_column_acl_drift');
  sql('postgres', `DROP DATABASE ${db};`);
}
function expectRejected(database, name, expectedException, prefix = '') {
  const before = snapshot(database, `${name}.before`);
  const failure = sql(database, prefix + source.proposal, true);
  writeFileSync(join(evidence, `${name}.log`), failure.stdout + failure.stderr);
  assert.equal(failure.status, 3, `${name}: psql must fail with ON_ERROR_STOP (not a process crash)`);
  assert(failure.stderr.includes(expectedException),
    `${name}: expected ${expectedException}, received ${failure.stderr}`);
  const after = snapshot(database, `${name}.after`);
  assert.deepEqual(after, before, `${name}: failed proposal partially changed ACLs or database state`);
  if (name.startsWith('late-service-')) {
    assert.deepEqual(targetCounts(before), { column: 8, table: 24 });
    assert.deepEqual(targetCounts(after), { column: 8, table: 24 });
    assert(before.column_effective.filter(isColumnTarget).every((row) => row.allowed));
    assert(after.column_effective.filter(isColumnTarget).every((row) => row.allowed));
    assert(before.table_effective.filter(isTableTarget).every((row) => row.allowed));
    assert(after.table_effective.filter(isTableTarget).every((row) => row.allowed));
  }
  logCheck(`rollback-on-${name}`, { expectedException, beforeHash: digest(before), afterHash: digest(after),
    targetGrantsBefore: targetCounts(before), targetGrantsAfter: targetCounts(after) });
}
async function runDriftCases() {
  for (const [name, mutate, expectedException] of driftCases) {
    await yieldToSignals();
    const db = databaseFor(name);
    sql(db, mutate);
    expectRejected(db, name, expectedException);
    resetRoles();
    sql('postgres', `DROP DATABASE ${db};`);
  }
  const db = databaseFor('wrong-executor');
  expectRejected(db, 'wrong-executor', 'hardening_requires_reviewed_postgres_owner', 'SET ROLE acl_other_admin;\n');
  sql('postgres', `DROP DATABASE ${db};`);
}

function cleanup() {
  if (cleanupDone || !scratch) return;
  cleanupDone = true;
  let stopped = true;
  const data = join(scratch, 'data');
  if (binaries?.pg_ctl && existsSync(join(data, 'postmaster.pid'))) {
    stopped = false;
    for (const mode of ['fast', 'immediate']) {
      const result = binary('pg_ctl', ['-D', data, '-m', mode, '-w', '-t', '20', 'stop']);
      if (reportDirectoryReady) writeFileSync(join(evidence, `shutdown-${mode}.log`), result.stdout + result.stderr);
      if (result.status === 0 || binary('pg_ctl', ['-D', data, 'status']).status === 3) {
        stopped = true;
        break;
      }
    }
  }
  if (reportDirectoryReady && existsSync(join(scratch, 'postgres.log'))) {
    copyFileSync(join(scratch, 'postgres.log'), join(evidence, 'postgres.log'));
  }
  assert(stopped, `Private PostgreSQL shutdown failed; retained private directory for safe recovery: ${scratch}`);
  rmSync(scratch, { recursive: true, force: true });
  assert(!existsSync(scratch), 'Private cluster directory was not removed');
  report.isolation.shutdownAndCleanupVerified = true;
}

async function main() {
  assertEnvironment(process.env);
  assertReviewedSource();
  assert.notEqual(process.getuid?.(), 0, 'Run as a normal user; initdb must never run as root');
  process.umask(0o077);
  const binDir = process.env.MODERATION_ACL_PG_BIN ?? '/usr/lib/postgresql/17/bin';
  assert(isAbsolute(binDir), 'MODERATION_ACL_PG_BIN must be an absolute directory');
  assert(existsSync(binDir), 'PostgreSQL 17 binaries are required; install official PG17 before running native tests');
  const realBinDir = realpathSync(binDir);
  binaries = Object.fromEntries(['initdb', 'pg_ctl', 'postgres', 'psql'].map((name) => {
    const path = realpathSync(join(realBinDir, name));
    assert.equal(dirname(path), realBinDir, `Unexpected ${name} binary outside the explicit binary directory`);
    assert(statSync(path).isFile(), `${name} must be a regular executable file`);
    return [name, path];
  }));
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  assert(!lstatSync(evidence).isSymbolicLink(), 'Evidence directory must not be a symlink');
  assert(realpathSync(evidence).startsWith(`${realpathSync(root)}/`), 'Evidence must stay within this checkout');
  reportDirectoryReady = true;
  scratch = mkdtempSync('/tmp/moderation-acl-');
  chmodSync(scratch, 0o700);
  const home = join(scratch, 'home');
  const socket = join(scratch, 'socket');
  mkdirSync(home, { mode: 0o700 });
  mkdirSync(socket, { mode: 0o700 });
  childEnv = Object.freeze({ PATH: '/usr/bin:/bin', HOME: home, LANG: 'C', LC_ALL: 'C', TZ: 'UTC' });
  report.binaries = {};
  for (const [name, path] of Object.entries(binaries)) {
    const version = mustBinary(name, ['--version']).trim();
    assert.match(version, /\(PostgreSQL\) 17\./, 'Every PostgreSQL binary must be major version 17');
    report.binaries[name] = { path, version, sha256: hash(readFileSync(path)) };
  }
  const data = join(scratch, 'data');
  const init = mustBinary('initdb', ['-D', data, '--username=postgres', '--auth-local=trust',
    '--auth-host=reject', '--encoding=UTF8', '--no-locale', '--no-instructions']);
  writeFileSync(join(evidence, 'initdb.log'), init);
  // Trust applies only to this OS user's 0700 socket directory. No TCP listener,
  // no existing cluster, no hosted URL, and no password are used at any point.
  mustBinary('pg_ctl', ['-D', data, '-l', join(scratch, 'postgres.log'), '-w', '-t', '30',
    '-o', `-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -c ssl=off -c shared_preload_libraries='' -c max_connections=20 -p ${port}`, 'start']);
  await yieldToSignals();
  const isolation = JSON.parse(sql('postgres', `SELECT jsonb_build_object(
    'server_version_num',current_setting('server_version_num')::integer,
    'version',version(),'listen_addresses',current_setting('listen_addresses'),
    'socket_directory',current_setting('unix_socket_directories'),
    'socket_permissions',current_setting('unix_socket_permissions'),
    'data_directory',current_setting('data_directory'),'database',current_database(),
    'current_user',current_user,'server_address',inet_server_addr(),
    'hba',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.rule_number)
      FROM (SELECT rule_number,type,database,user_name,address,auth_method,error FROM pg_hba_file_rules) h));`).stdout);
  assert(isolation.server_version_num >= 170000 && isolation.server_version_num < 180000);
  assert.equal(isolation.listen_addresses, '');
  assert.equal(isolation.socket_directory, socket);
  assert.equal(isolation.socket_permissions, '0700');
  assert.equal(isolation.data_directory, data);
  assert.equal(isolation.database, 'postgres');
  assert.equal(isolation.current_user, 'postgres');
  assert.equal(isolation.server_address, null);
  assert(isolation.hba.every((rule) => !rule.error
    && (rule.type === 'local' ? rule.auth_method === 'trust' : rule.auth_method === 'reject')));
  for (const path of [scratch, home, socket, data, join(socket, `.s.PGSQL.${port}`)]) {
    assert.equal(statSync(path).mode & 0o777, 0o700, `Private permissions required on ${basename(path)}`);
  }
  report.isolation.verifiedSettings = isolation;
  saveJson('isolation.json', isolation);
  logCheck('fresh-pg17-unix-socket-only-cluster-and-private-permissions');
  sql('postgres', `CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEROLE NOBYPASSRLS INHERIT;
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEROLE NOBYPASSRLS INHERIT;
    CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEROLE BYPASSRLS;
    CREATE ROLE acl_delegate NOLOGIN; CREATE ROLE acl_inherited NOLOGIN;
    CREATE ROLE acl_other_owner NOLOGIN; CREATE ROLE acl_other_admin NOLOGIN SUPERUSER;`);
  successfulRevocation();
  await runDriftCases();
  assert.equal(report.checks.length, 35, 'Every native regression check must run');
  report.status = 'PASSED';
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--self-test') {
  selfTest();
} else {
  assert.equal(args.length, 0, 'Only --self-test is accepted; external connections cannot be supplied');
  const interrupted = (signal) => {
    report.status = 'FAILED';
    report.failures.push(`Interrupted by ${signal}`);
    try { cleanup(); } catch (error) { report.failures.push(error.message); }
    report.finishedAt = new Date().toISOString();
    if (reportDirectoryReady) saveJson('report.json', report);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    await main();
  } catch (error) {
    report.status = 'FAILED';
    report.failures.push(error.stack ?? error.message);
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  } finally {
    try { cleanup(); } catch (error) {
      report.status = 'FAILED';
      report.failures.push(error.stack ?? error.message);
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    }
    report.finishedAt = new Date().toISOString();
    if (reportDirectoryReady) saveJson('report.json', report);
    process.removeListener('SIGINT', interrupted);
    process.removeListener('SIGTERM', interrupted);
  }
  if (report.status === 'PASSED') console.log(`PASS: ${report.checks.length} native checks; isolated cluster stopped and deleted.`);
}
