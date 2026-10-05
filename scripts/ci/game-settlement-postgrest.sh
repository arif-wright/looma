#!/usr/bin/env bash
# Disposable CI-only HTTP boundary verification. Never accepts hosted endpoints.
set -euo pipefail
cd "$(dirname "$0")/../.."
readonly evidence="$PWD/test-results/game-settlement-postgrest"
mkdir -p "$evidence"
git rev-parse HEAD > "$evidence/source-commit.txt"
git rev-parse HEAD^{tree} > "$evidence/source-tree.txt"
git status --short > "$evidence/source-status.txt"
sha256sum tests/sql/game-settlement-postgrest.mjs tests/sql/helpers/game-postgrest-bootstrap.mjs \
  tests/sql/helpers/game-settlement-fixture.mjs tests/sql/helpers/native-postgres.mjs \
  scripts/ci/game-settlement-postgrest.sh .github/workflows/game-settlement-postgrest.yml \
  supabase/migrations/20261004194345_settle_game_sessions_atomically.sql > "$evidence/source-sha256.txt"
node --check tests/sql/game-settlement-postgrest.mjs
node tests/sql/game-settlement-postgrest.mjs --self-test
node tests/sql/game-settlement-postgrest.mjs --source-contract "$PWD" "$evidence/source-query-contract.json"
node --version > "$evidence/host-node-version.txt"

# Official vendor images only; PostgreSQL pinned to the digest verified by the
# preceding native run. Fixed PostgREST patch version, with resolved digest saved.
readonly pg_image='postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652'
readonly api_image='postgrest/postgrest:v12.2.12'
readonly node_image='node:22.23.3-bookworm-slim'
for image in "$pg_image" "$api_image" "$node_image"; do
  docker pull "$image" >> "$evidence/image-pull.log"
  docker image inspect "$image" --format '{"id":{{json .Id}},"digests":{{json .RepoDigests}}}' >> "$evidence/image-digests.jsonl"
done
readonly suffix="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"
export MEMVOYA_PG_CONTAINER="mv-http-pg-$suffix"
readonly api="mv-http-api-$suffix" runner="mv-http-node-$suffix"
cleanup() {
  local status=$?
  trap - EXIT
  if docker exec "$runner" cat /tmp/postgrest-report.json > "$evidence/report.pending.json" 2>/dev/null; then
    mv "$evidence/report.pending.json" "$evidence/report.json"
  else
    rm -f "$evidence/report.pending.json"
  fi
  docker logs "$MEMVOYA_PG_CONTAINER" > "$evidence/postgres.log" 2>&1 || true
  docker logs "$api" > "$evidence/postgrest.log" 2>&1 || true
  for container in "$api" "$runner" "$MEMVOYA_PG_CONTAINER"; do
    docker rm --force --volumes "$container" >> "$evidence/cleanup.log" 2>&1 || true
  done
  # Do not archive Docker environment/config objects or any authentication file.
  exit "$status"
}
trap cleanup EXIT

# One namespace, loopback only. No published ports or host mounts. The API and
# client join this network=none namespace: there is no outside network interface.
# The only TCP HBA exception is this throwaway authenticator/database on loopback;
# the bootstrap superuser still uses private peer-authenticated Unix sockets.
docker run --detach --name "$MEMVOYA_PG_CONTAINER" --network none --user postgres \
  --entrypoint bash --tmpfs /tmp:rw,size=512m,mode=1777 "$pg_image" -ceu '
    umask 077
    mkdir /tmp/memvoya-pg-socket
    initdb -D /tmp/memvoya-pg-data --username=postgres --auth-local=peer --auth-host=reject --encoding=UTF8 --no-locale
    printf "host memvoya_postgrest_test mv_api_authenticator 127.0.0.1/32 trust\n" > /tmp/hba
    cat /tmp/memvoya-pg-data/pg_hba.conf >> /tmp/hba
    mv /tmp/hba /tmp/memvoya-pg-data/pg_hba.conf
    exec postgres -D /tmp/memvoya-pg-data -c listen_addresses=127.0.0.1 \
      -c unix_socket_directories=/tmp/memvoya-pg-socket -c unix_socket_permissions=0700 -p 55437
  ' > "$evidence/postgres-container-id.txt"
ready=0
for attempt in {1..60}; do
  if docker exec --user postgres "$MEMVOYA_PG_CONTAINER" pg_isready -h /tmp/memvoya-pg-socket -p 55437 -U postgres -d postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'Disposable PostgreSQL failed to start' >&2; exit 1; }
readonly wrapper="$evidence/psql-in-container"
cat > "$wrapper" <<'PSQL'
#!/usr/bin/env bash
set -euo pipefail
exec docker exec --interactive --user postgres --env PGAPPNAME --env PGPASSFILE \
  "$MEMVOYA_PG_CONTAINER" psql "$@"
PSQL
chmod 700 "$wrapper"
export PSQL_BIN="$wrapper" MEMVOYA_PG_TEST_ONLY=1 PGHOST=/tmp/memvoya-pg-socket PGPORT=55437 PGUSER=postgres PGDATABASE=postgres
unset PGPASSWORD PGHOSTADDR PGSERVICE PGSERVICEFILE
node tests/sql/helpers/game-postgrest-bootstrap.mjs --fixture "$evidence/fixture.json" --report "$evidence/bootstrap.json" | tee "$evidence/bootstrap.log"
docker exec --user postgres "$MEMVOYA_PG_CONTAINER" psql -X -w -A -t -h "$PGHOST" -p "$PGPORT" -U postgres -d postgres -c "
 SELECT json_build_object('settings',(SELECT json_object_agg(name,setting) FROM pg_settings WHERE name IN ('listen_addresses','unix_socket_directories','unix_socket_permissions','port')),
 'authentication',(SELECT json_agg(h) FROM (SELECT type,database,user_name,address,auth_method,error FROM pg_hba_file_rules ORDER BY rule_number) h));" > "$evidence/postgres-isolation.json"

docker run --detach --name "$runner" --network "container:$MEMVOYA_PG_CONTAINER" \
  --user 1000:1000 --env HOME=/tmp --env MEMVOYA_POSTGREST_TEST_ONLY=1 \
  --tmpfs /tmp:rw,size=64m,mode=1777 "$node_image" node -e 'setInterval(()=>{},100000)' > "$evidence/node-container-id.txt"
docker exec --interactive "$runner" sh -c 'cat > /tmp/http-test.mjs' < tests/sql/game-settlement-postgrest.mjs
docker exec --interactive "$runner" sh -c 'cat > /tmp/fixture.json' < "$evidence/fixture.json"
# The random JWT signing key is made inside this disposable container. It never
# enters a host file, env var, command argument, log, repository, or artifact.
docker exec "$runner" node /tmp/http-test.mjs --init

docker create --name "$api" --network "container:$MEMVOYA_PG_CONTAINER" --user 1000:1000 \
  "$api_image" /bin/postgrest /api-config/postgrest.conf > "$evidence/postgrest-container-id.txt"
# A tar stream copies the private config directly between disposable containers.
# --archive retains uid 1000 and restrictive directory/file modes. No host file.
docker exec "$runner" tar -C /tmp -cf - api-config | docker cp --archive - "$api:/"
docker start "$api" >/dev/null
for container in "$MEMVOYA_PG_CONTAINER" "$runner" "$api"; do
  docker inspect "$container" --format '{"name":{{json .Name}},"networkMode":{{json .HostConfig.NetworkMode}},"portBindings":{{json .HostConfig.PortBindings}},"binds":{{json .HostConfig.Binds}},"networks":{{json .NetworkSettings.Networks}}}' >> "$evidence/container-isolation.jsonl"
done
node --input-type=module - "$evidence/container-isolation.jsonl" <<'VERIFY'
import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
const rows=readFileSync(process.argv[2],'utf8').trim().split('\n').map(JSON.parse);
assert.equal(rows.length,3); assert.equal(rows[0].networkMode,'none');
for(const r of rows){assert(!r.binds?.length);assert(!r.portBindings||!Object.keys(r.portBindings).length);}
for(const r of rows.slice(1)) assert.match(r.networkMode,/^container:/);
console.log('PASS: only shared unnetworked namespace; no published ports or host binds');
VERIFY
docker exec "$api" /bin/postgrest --version > "$evidence/postgrest-version.txt"
docker exec "$runner" node /tmp/http-test.mjs 2>&1 | tee "$evidence/http-test.log"
docker exec "$runner" cat /tmp/postgrest-report.json > "$evidence/report.json"
node tests/sql/game-settlement-postgrest.mjs --verify-report "$evidence/report.json"
