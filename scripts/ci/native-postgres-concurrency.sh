#!/usr/bin/env bash
# Run only in an approved disposable CI runner. This is not a deployment script.
set -euo pipefail
cd "$(dirname "$0")/../.."
readonly evidence="$PWD/test-results/native-postgres"
mkdir -p "$evidence"
git rev-parse HEAD > "$evidence/source-commit.txt"
git rev-parse HEAD^{tree} > "$evidence/source-tree.txt"
node --version > "$evidence/node-version.txt"
node --check tests/sql/companion-lock-order-concurrency.mjs
node tests/sql/companion-lock-order-concurrency.mjs --self-test

# Use only the official PostgreSQL 17 image. Record its immutable digest and
# actual server version in the evidence, since the maintained major tag moves.
readonly image=postgres:17-bookworm
docker pull "$image" | tee "$evidence/image-pull.log"
docker image inspect "$image" --format '{{json .RepoDigests}}' > "$evidence/image-digests.json"
export MEMVOYA_PG_CONTAINER="memvoya-lock-test-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"
cleanup() {
  local status=$?
  docker logs "$MEMVOYA_PG_CONTAINER" > "$evidence/postgres.log" 2>&1 || true
  # Remove only the throwaway container made by this invocation; no host mounts.
  docker rm --force --volumes "$MEMVOYA_PG_CONTAINER" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

# Network namespace has no external connectivity. No ports, host binds, secrets,
# saved credentials, production connection URLs, or retained volumes are used.
# The image may create an unused anonymous volume; --volumes removes it on exit.
# Both the server and psql run as the container's postgres OS user; Unix sockets
# use peer authentication. Reject all TCP authentication and disable TCP listen.
docker run --detach --name "$MEMVOYA_PG_CONTAINER" \
  --network none --user postgres --entrypoint bash \
  --tmpfs /tmp:rw,size=512m,mode=1777 "$image" -ceu '
    umask 077
    mkdir /tmp/memvoya-pg-socket
    initdb -D /tmp/memvoya-pg-data --username=postgres --auth-local=peer --auth-host=reject --encoding=UTF8 --no-locale
    exec postgres -D /tmp/memvoya-pg-data \
      -c listen_addresses= -c unix_socket_directories=/tmp/memvoya-pg-socket \
      -c unix_socket_permissions=0700 -p 55437
  ' > "$evidence/container-id.txt"
docker inspect "$MEMVOYA_PG_CONTAINER" \
  --format '{"networkMode":{{json .HostConfig.NetworkMode}},"portBindings":{{json .HostConfig.PortBindings}},"binds":{{json .HostConfig.Binds}},"mounts":{{json .Mounts}},"tmpfs":{{json .HostConfig.Tmpfs}}}' \
  > "$evidence/isolation.json"

ready=0
for attempt in {1..60}; do
  if docker exec --user postgres "$MEMVOYA_PG_CONTAINER" \
    pg_isready -h /tmp/memvoya-pg-socket -p 55437 -U postgres -d postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'Disposable PostgreSQL failed to become ready' >&2; exit 1; }
docker exec --user postgres "$MEMVOYA_PG_CONTAINER" \
  psql -X -w -A -t -h /tmp/memvoya-pg-socket -p 55437 -U postgres -d postgres -c "
    SELECT json_build_object(
      'settings',(SELECT json_object_agg(name,setting) FROM pg_settings WHERE name IN ('listen_addresses','unix_socket_directories','unix_socket_permissions','port','data_directory')),
      'authentication',(SELECT json_agg(h) FROM (SELECT type,database,user_name,address,auth_method,error FROM pg_hba_file_rules ORDER BY rule_number) h)
    );" > "$evidence/postgres-isolation.json"
docker exec --user postgres "$MEMVOYA_PG_CONTAINER" \
  stat -c '%U %G %a %n' /tmp/memvoya-pg-socket /tmp/memvoya-pg-socket/.s.PGSQL.55437 \
  > "$evidence/socket-permissions.txt"

# One docker-exec/psql process per harness Session means independent native
# backends. Only harmless app-name/password-file variables enter the container.
readonly wrapper="$evidence/psql-in-container"
cat > "$wrapper" <<'PSQL'
#!/usr/bin/env bash
set -euo pipefail
exec docker exec --interactive --user postgres \
  --env PGAPPNAME --env PGPASSFILE \
  "$MEMVOYA_PG_CONTAINER" psql "$@"
PSQL
chmod 700 "$wrapper"
export PSQL_BIN="$wrapper" MEMVOYA_PG_TEST_ONLY=1
export PGHOST=/tmp/memvoya-pg-socket PGPORT=55437 PGUSER=postgres PGDATABASE=postgres
unset PGPASSWORD PGHOSTADDR PGSERVICE PGSERVICEFILE

# Three independent synthetic databases exercise the same 21 schedules. No npm
# packages or app runtime are loaded, and no hosted application is contacted.
for iteration in 1 2 3; do
  export MEMVOYA_PG_REPORT="$evidence/run-$iteration.json"
  node tests/sql/companion-lock-order-concurrency.mjs 2>&1 | tee "$evidence/run-$iteration.log"
  node --input-type=module - "$MEMVOYA_PG_REPORT" <<'VERIFY'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(report.status, 'PASSED');
assert.match(report.serverVersion, /^PostgreSQL 17\./);
const expectedScenarios = [
  ...['bond', 'recalc', 'tick', 'bonus'].map(kind => `shared rest × ${kind}: parent before stats`),
  ...['tick', 'bonus'].map(kind => `${kind} × bond: no lock inversion`),
  ...['recalc', 'tick', 'bonus'].map(kind => `${kind}: ascending UUID locks with reverse insertion order`),
  ...['activate', 'reorder', 'active-state'].map(kind => `${kind} × tick: roster respects ascending parent order`),
  ...['delete', 'reassign'].map(kind => `activation target ${kind} while waiting fails without deactivating previous companion`),
  'concurrent rest: same UUID replays',
  'concurrent rest: different UUID sees cooldown',
  'rest × placement clear preserves committed snapshots',
  'placement clear × rest fails closed without partial writes',
  'two placements contend for one acquired item quantity',
  'achievement competing success commits reward exactly once',
  'achievement failed transaction rolls back, contender retries once'
];
assert.equal(expectedScenarios.length, 21);
assert.deepEqual(report.checks, expectedScenarios);
assert.equal(new Set(report.checks).size, 21);
assert.equal(report.blockingEvidence.length, 22);
assert.equal(report.manifest.length, 28);
for (const scenario of report.checks) {
  const expectedWaits = scenario === 'achievement failed transaction rolls back, contender retries once' ? 2 : 1;
  assert.equal(report.blockingEvidence.filter(item => item.scenario === scenario).length, expectedWaits);
}
for (const evidence of report.blockingEvidence) {
  assert(report.checks.includes(evidence.scenario));
  assert.equal(evidence.activity.length, 1);
  const waiter = evidence.activity[0];
  assert.equal(waiter.wait_event_type, 'Lock');
  assert(waiter.blockers.length > 0);
  assert(!waiter.blockers.includes(waiter.pid));
  assert(evidence.locks.some(lock => lock.pid === waiter.pid && !lock.granted));
}
console.log(`Verified ${report.checks.length} scenarios and ${report.blockingEvidence.length} observed overlapping waits`);
VERIFY
done
