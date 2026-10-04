# Companion lock-order native concurrency gate

## Verification status

**Native suite: NOT RUN.** This execution environment rejects PostgreSQL's private Unix-socket creation with `Operation not permitted`, including one sandbox-reviewed start. No alternate transport was attempted.

Prepared PostgreSQL binaries: **17.11 (Debian 17.11-0+deb13u1)**, from the official [Debian package archive](https://deb.debian.org/debian/pool/main/p/postgresql-17/). Both `postgres --version` and `psql --version` worked, and `initdb` completed. No native server started.

Local checks completed:
- Node syntax checks for the harness and both helper modules
- SQL literal/identifier quoting and psql ERROR/SQLSTATE frame self-tests
- All 28 migration pieces in the bootstrap (26 full migrations, two explicitly bounded historical extracts) applied to isolated PGlite
- Synthetic care → item acquisition → placement fixture and roster/rest SQL result shapes exercised in PGlite

These checks do **not** establish independent-session behavior, lock scheduling, or absence of deadlocks. A successful native run is still required before rollout.

## Run in an approved disposable local environment

Requirements: native PostgreSQL 17, `psql` on PATH (or `PSQL_BIN`), Node 20+, a dedicated peer-authenticated Unix-socket cluster, and its superuser. No Node package installation is needed. Do not point this suite at production, a hosted database, or an existing application database.

```sh
MEMVOYA_PG_TEST_ONLY=1 \
PGHOST=/absolute/path/to/private/socket \
PGPORT=55437 \
PGUSER=agent \
PGDATABASE=postgres \
node tests/sql/companion-lock-order-concurrency.mjs
```

The harness refuses TCP/remote hosts, requires explicit test-only opt-in, disables password-file loading, rejects PGPASSWORD, and creates a uniquely named `memvoya_lock_order_*` database. It retains that synthetic database for inspection, rather than dropping data automatically. The cluster's standard test roles are created only if absent; no live role or user credentials are used.

Output: `test-results/companion-lock-order-concurrency.json`, or `MEMVOYA_PG_REPORT`. The JSON includes server version, exact migration SHA-256 values, passed checks, observed blocker PIDs and lock modes, and any failure. Independent `psql` processes use independent backend PIDs. PostgreSQL statement/lock timeouts and a process watchdog prevent a broken schedule from hanging indefinitely.

```sh
node --check tests/sql/companion-lock-order-concurrency.mjs
node tests/sql/companion-lock-order-concurrency.mjs --self-test
```

## What the suite establishes when it passes

21 deterministic overlapping-session scenarios:
1. Shared rest against single bond, batch bond, tick, and daily bonus (four cases)
2. Tick and daily bonus against bond, with exact resulting stats (two cases)
3. Ascending UUID acquisition for batch bond, tick, and bonus with descending physical insertion/creation order (three cases)
4. High-UUID active companion → low-UUID target, reverse caller reorder `[high, low]`, and active-state delegation against tick (three cases)
5. Activation loses its high-UUID target to a committed deletion or owner reassignment while waiting, rejects with `not_owner`, and leaves the previously active low-UUID companion unchanged (two cases)
6. Same rest request UUID returns the immutable replay; a different UUID sees the committed cooldown (two cases)
7. Rest then clear preserves acquisition/placement snapshots; clear then rest returns no seat without creating a receipt (two cases)
8. Competing placements cannot consume one item twice (one case)
9. Concurrent achievement success grants once; a downstream wallet failure rolls back the first claim/points/receipt and allows its waiting contender to succeed exactly once (two cases)

Schedules use explicit transactions and observed `pg_blocking_pids`/`pg_stat_activity` lock waits, not elapsed sleeps as evidence. An initial companion lock anchors the exact parent-lock phase shared by the real RPCs. For ascending-order tests, a third session must still acquire the higher companion and its stats with `NOWAIT` while the contender waits on the lower UUID. Roster tests also assert requested slot/active-state semantics after both transactions finish.

All gameplay functions, triggers, RLS policies, and economy ledger definitions come from the real migration files. Only Supabase authentication/roles, unrelated prerequisite tables, synthetic users, and a test-only downstream-failure trigger are fixtures. The two historical extracts are explicitly bounded and hashed. The new forward migration is applied after the unchanged feature migrations and historical bond ACL blocks; this is a disposable test bootstrap, not a deployment recipe.

## Local preparation evidence

The attempted private cluster used only a Unix socket, port number 55437, `listen_addresses = ''`, peer authentication, host authentication rejected, and socket directory mode 0700. Exact failure:

```text
could not create Unix socket for address "/workspace/shared/memvoya-postgres-runtime-20261004/socket/.s.PGSQL.55437": Operation not permitted
FATAL: could not create any Unix-domain sockets
```

No test result may be labeled a native concurrency pass until the native JSON report says `PASSED` and contains observed blocking evidence for every scenario.
