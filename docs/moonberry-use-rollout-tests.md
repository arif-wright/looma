# Moonberry rollout wrapper verification

This adds a separate credential-free PostgreSQL 17 job, `rollout-postgres`, to
`.github/workflows/moonberry-share.yml`. It does not execute a hosted migration,
use production data, or change the existing 32 native scenarios, nine observed
waits, or 40 browser cases and their verifier.

## Exact input

- Review-only wrapper: `scripts/sql/review/moonberry-share-v1.sql`
- Wrapper SHA-256: `c2a400f412f3433085f5df12a599ffed9145736e1436ecf0cdcbeabd71a45cf1`
- Embedded product SHA-256: `84732dbc9f0bbd328f400d6c6d5a3f1786df7fb69ef0b9330c7890bfd7aa621f`

The contract gate compares both byte sequences and requires exactly five
`SET LOCAL` statements followed by one atomic `DO`. The wrapper contains no
transaction-control statements. The synthetic runner supplies its own transaction.
The wrapper is a review artifact, not an automatically discovered migration.

## Local static checks

These commands open no database or socket:

```sh
node --check tests/sql/moonberry-rollout-native.mjs
node --check tests/sql/moonberry-rollout-transactions.mjs
node --check tests/sql/helpers/moonberry-rollout-contract.mjs
node scripts/ci/moonberry-share-rollout-verify.mjs --self-test
node scripts/ci/moonberry-share-verify.mjs --self-test
```

## Isolated native run

Run only where PostgreSQL 17 and `ss` are already available and creating a
throwaway local cluster is authorized. CI installs official PGDG packages in its
own fresh runner, without creating a default cluster. Do not install or route to
another database to work around a denied local execution.

```sh
env -i PATH="$PATH" MEMVOYA_PG_TEST_ONLY=1 node tests/sql/moonberry-rollout-native.mjs
node scripts/ci/moonberry-share-rollout-verify.mjs rollout
```

The guarded launcher rejects inherited PostgreSQL connection settings and common
database URLs. It creates private mode-0700 directories, accepts peer-authenticated
Unix-socket connections only, rejects host authentication, disables TCP listening,
checks PostgreSQL major version, and removes the cluster after stopping its server.
The peer-login OS role creates a synthetic `postgres` role; `SET ROLE postgres`
ensures fixture and feature ownership match the wrapper's precondition. No password,
hosted credential, or production capture is supplied.

## Fourteen independently named checks

The exact names live in `tests/sql/helpers/moonberry-rollout-contract.mjs`.
The separate report gate rejects missing, duplicate or substituted scenarios.

1. Synthetic prerequisites: six postgres-owned RLS tables, four source-seeded
   configuration records, hardened consent defaults/nullability and ordinary grants
2. Autocommit loses `SET LOCAL`; the wrapper aborts before feature DDL
3. Five missing/default/nullability consent drift variants abort
4. Incorrect migration role, table owner, disabled RLS and forced RLS abort
5. Each of the four configuration records is independently perturbed and rejected
6. A global postgres creator-default grant aborts before private schema creation
7. An unreviewed public-function grant option aborts
8. Client membership, broad preference writes and protected-column writes abort
9. Only the final function-hash postflight assertion is deliberately changed;
   its late failure rolls back all feature objects and restores the old quantity check
10. A real independent relation lock blocks `ALTER TABLE`; a third session observes
    `pg_blocking_pids` plus an ungranted `AccessExclusiveLock`. SQLSTATE `55P03` must
    occur after 4.5–12 seconds with the wrapper's unchanged 5-second lock timeout.
    Both transactions are rolled back and remaining target-relation locks must be empty
11. A synthetic runner fails after DDL and a history insert; both roll back together
12. Exact wrapper bytes commit with private schema/table/RPC postconditions checked
13. A simulated unknown client result is resolved by a new session reading history
    and checking committed feature state, without resubmitting during reconciliation
14. An explicit negative reapplication test receives the feature-name guard and
    leaves the committed feature/history state unchanged

Failure assertions require the old `CHECK (quantity > 0)`, no private schema, no
feature functions or trigger, and no synthetic history row. Success requires the
new quantity check, postgres ownership, private RLS with no policies, no unexpected
private grants, and authenticated-only execution of the two security-definer RPCs.

## Evidence and limits

CI artifact: `moonberry-share-rollout-<exact PR head SHA>`.
Output directory: `test-results/moonberry-share/rollout/`.

- `rollout-postgres.json`: exact input hashes, applied-source hashes, 14 scenario
  results, real backend blocking evidence, SQLSTATE/duration, synthetic history model,
  database cleanup, and catalog-only success metadata
- `featurePostflight` inside that report is the result of
  `tests/sql/fixtures/moonberry-rollout-postflight.sql`. It includes actual PostgreSQL
  17 receipt columns/defaults/constraints, function identity arguments and definitions,
  exploded private/RPC ACLs and trigger metadata. All rows are from the synthetic DB
- `rollout-cluster.json`: versions, isolated environment/modes, no-TCP check and
  verified server/PID/socket/directory cleanup
- `source.txt`, package list, configuration, server and test logs: reproducibility

The history table is deliberately named `synthetic_migration_runner.history`.
Its version `synthetic-local-v1` is not an actual migration-history version.
Response loss is injected in the harness after it observes a commit; this does not
exercise a real network failure. Local transaction rollback/readback establishes
only this synthetic runner model. **Management API transaction and migration-ledger
coatomicity remain unverified.** Hosted authentication and live rollout remain
outside this credential-free suite.

Static self-tests validate source framing and reject incomplete or unsafe reports;
they are not evidence that PostgreSQL execution passed. Treat the native job as
pending until its reports pass on the exact published commit.
