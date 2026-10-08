// Creates and destroys its own isolated native PostgreSQL cluster. Never accepts a database URL.
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, chmod, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
assert.equal(process.env.MEMVOYA_PG_TEST_ONLY, '1', 'Set MEMVOYA_PG_TEST_ONLY=1 explicitly to permit a disposable local cluster');
for (const key of Object.keys(process.env)) {
  assert(!key.startsWith('PG') && !['DATABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL'].includes(key), `Remove inherited ${key}; this launcher accepts no connection settings`);
}
// Executable location only; connection settings remain forbidden above.
const bin = process.env.MEMVOYA_PG_BIN || '/usr/lib/postgresql/17/bin';
assert(isAbsolute(bin) && /\/postgresql\/17\/bin$/.test(bin), 'Use an absolute PostgreSQL 17 binary directory');
const node = process.execPath;
// Separate rollout evidence; existing transaction/browser reports are never overwritten.
const output = resolve(root, 'test-results/moonberry-share/rollout');
await mkdir(output, { recursive: true });
const temporary = await mkdtemp('/tmp/mv-moonberry-rollout-');
await chmod(temporary, 0o700);
const data = join(temporary, 'data'), socket = join(temporary, 'socket'), home = join(temporary, 'home');
await mkdir(socket, { mode: 0o700 }); await mkdir(home, { mode: 0o700 });
const user = spawnSync('/usr/bin/id', ['-un'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }).stdout.trim();
const port = '55440';
const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home,
  TZ: 'UTC', LC_ALL: 'C', PGHOST: socket, PGPORT: port, PGUSER: user, PGDATABASE: 'postgres', PGPASSFILE: '/dev/null',
  PSQL_BIN: join(bin, 'psql'), MEMVOYA_PG_TEST_ONLY: '1', MEMVOYA_MOONBERRY_REPORT: join(output, 'rollout-postgres.json'),
  MEMVOYA_MOONBERRY_CLUSTER_ROOT: temporary };
const report = { startedAt: new Date().toISOString(), status: 'RUNNING', bin, node, temporary,
  environmentAllowlist: Object.keys(env).sort(), noHostedCredentials: true, transactionsStarted: false, cleanup: {} };
// Never leave a previous successful transaction report beside a failed launch.
await writeFile(env.MEMVOYA_MOONBERRY_REPORT, JSON.stringify({ status: 'NOT_RUN', startedAt: report.startedAt,
  reason: 'Waiting for isolated native cluster startup', checkCount: 0, failureCount: 0,
  checks: [], failures: [], blockingEvidence: [] }, null, 2) + '\n');
let initialized = false, startAttempted = false, pid;
const run = (file, args, log) => {
  const result = spawnSync(file, args, { env, encoding: 'utf8', cwd: root, timeout: 60_000 });
  const text = `${result.stdout || ''}${result.stderr || ''}`;
  if (log) return writeFile(join(output, log), text).then(() => { assert.equal(result.status, 0, `${file}: ${text}`); return text; });
  assert.equal(result.status, 0, `${file}: ${text}`); return text;
};
try {
  report.postgresVersion = run(join(bin, 'postgres'), ['--version']).trim();
  report.psqlVersion = run(join(bin, 'psql'), ['--version']).trim();
  report.nodeVersion = run(node, ['--version']).trim();
  assert.match(report.postgresVersion, /^postgres \(PostgreSQL\) 17\./);
  assert.match(report.psqlVersion, /^psql \(PostgreSQL\) 17\./);
  await run(join(bin, 'initdb'), ['-D', data, '--auth-local=peer', '--auth-host=reject', '--no-locale', '--encoding=UTF8', `--username=${user}`], 'native-initdb.log');
  initialized = true;
  const config = `\nlisten_addresses = ''\nport = ${port}\nunix_socket_directories = '${socket}'\nunix_socket_permissions = 0700\nmax_connections = 30\nshared_buffers = '16MB'\nlogging_collector = off\nlog_statement = 'all'\nlog_connections = on\nlog_disconnections = on\nlog_lock_waits = on\ndeadlock_timeout = '10ms'\nlog_line_prefix = '%m [%p] %a %u@%d '\ntimezone = 'UTC'\n`;
  await writeFile(join(data, 'postgresql.conf'), (await readFile(join(data, 'postgresql.conf'), 'utf8')) + config);
  await writeFile(join(output, 'native-postgresql.conf'), await readFile(join(data, 'postgresql.conf')));
  await writeFile(join(output, 'native-pg-hba.conf'), await readFile(join(data, 'pg_hba.conf')));
  startAttempted = true;
  await run(join(bin, 'pg_ctl'), ['-D', data, '-l', join(output, 'native-server.log'), '-w', 'start'], 'native-start.log');
  pid = Number((await readFile(join(data, 'postmaster.pid'), 'utf8')).split('\n')[0]); report.serverPid = pid;
  report.directoryModes = { cluster: (await stat(data)).mode & 0o777, socket: (await stat(socket)).mode & 0o777 };
  const tcp = run('/usr/bin/ss', ['-ltnp', `sport = :${port}`]);
  assert.equal(tcp.trim().split('\n').length, 1, 'Disposable PostgreSQL must not have a TCP listener');
  report.tcpListenerCheck = tcp.trim();
  const log = [];
  report.transactionsStarted = true;
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(node, [join(root, 'tests/sql/moonberry-rollout-transactions.mjs')], { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { process.stdout.write(data); log.push(data.toString()); });
    child.stderr.on('data', data => { process.stderr.write(data); log.push(data.toString()); });
    child.on('error', reject); child.on('exit', resolveExit);
  });
  await writeFile(join(output, 'native-test.log'), log.join(''));
  assert.equal(exitCode, 0, 'Native transaction assertions failed; see rollout-postgres.json');
  report.status = 'PASSED';
} catch (error) { report.status = 'FAILED'; report.error = error.stack; process.exitCode = 1; }
finally {
  try {
    // pg_ctl start can fail after spawning a server. Inspect its actual state
    // even when the start command did not return success, before removing data.
    if (startAttempted) {
      const beforeStop = spawnSync(join(bin, 'pg_ctl'), ['-D', data, 'status'], { env, encoding: 'utf8', timeout: 10_000 });
      assert([0, 3].includes(beforeStop.status), 'Cannot establish cluster status for cleanup');
      if (beforeStop.status === 0) {
        pid ||= Number((await readFile(join(data, 'postmaster.pid'), 'utf8')).split('\n')[0]);
        await run(join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], 'native-stop.log');
      }
    }
    report.cleanup.serverStopped = true;
    if (pid) { let exists = true; try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') exists = false; else throw error; } assert.equal(exists, false); }
    report.cleanup.serverPidAbsent = true;
    if (initialized) {
      const status = spawnSync(join(bin, 'pg_ctl'), ['-D', data, 'status'], { env, encoding: 'utf8', timeout: 10_000 });
      assert.equal(status.status, 3, 'Cluster still running');
      report.cleanup.pgCtlStatus = status.status;
    }
    let socketExists = true; try { await stat(join(socket, `.s.PGSQL.${port}`)); } catch (error) { if (error.code === 'ENOENT') socketExists = false; else throw error; }
    assert.equal(socketExists, false); report.cleanup.socketRemoved = true;
    await rm(temporary, { recursive: true, force: true });
    let directoryExists = true; try { await stat(temporary); } catch (error) { if (error.code === 'ENOENT') directoryExists = false; else throw error; }
    assert.equal(directoryExists, false); report.cleanup.syntheticClusterDeleted = true;
  } catch (error) { report.cleanup.error = error.stack; report.status = 'FAILED'; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  if (!report.transactionsStarted) await writeFile(env.MEMVOYA_MOONBERRY_REPORT, JSON.stringify({
    status: 'NOT_RUN', startedAt: report.startedAt, finishedAt: report.finishedAt,
    reason: 'Isolated native cluster did not become available; see rollout-cluster.json and native-server.log',
    checkCount: 0, failureCount: 0, checks: [], failures: [], blockingEvidence: []
  }, null, 2) + '\n');
  await writeFile(join(output, 'rollout-cluster.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
