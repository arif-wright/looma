# Moonberry share: independent SQL review and native verification status

Reviewed 2026-10-06 against the local candidate based on main
`160b0a15a59befd2fa085b2a5384954f1efcaba5`. SQL candidate SHA-256:
`84732dbc9f0bbd328f400d6c6d5a3f1786df7fb69ef0b9330c7890bfd7aa621f`.

## Result

**Native database assertions are blocked and have not run.** This is not a
database pass, a production-readiness claim, or authorization to publish/apply
the candidate. The SQL candidate was unchanged by this review.

The existing PostgreSQL 17.11 binaries and `initdb` worked. The normal escalated
invocation of the guarded launcher still failed at 04:23:29 UTC while creating
its private Unix socket with `Operation not permitted`. No PostgreSQL server
became available and the transaction harness did not start. The launcher used
an explicit environment allowlist, disabled TCP, configured local peer auth and
host rejection, and used synthetic local data only. Cleanup checks passed:
`pg_ctl status` returned 3, no socket remained, and the temporary cluster was
deleted. No alternative listener or route around the restriction was attempted.

Historical reports referred to PGlite under `/tmp`; that installation and an
equivalent current workspace installation were unavailable. No replacement
package was installed and no embedded SQL assertions are claimed.

## Checks actually executed

All eight static/guard groups passed:

1. JavaScript syntax: native launcher
2. JavaScript syntax: native transaction suite
3. JavaScript syntax: Moonberry migration fixture
4. JavaScript syntax: native psql helper
5. Launcher rejects a missing explicit disposable-cluster guard before startup
6. Launcher rejects inherited `PGHOST` before startup
7. Launcher rejects inherited `DATABASE_URL` before startup
8. psql framing, primary error-message parsing and SQL quoting helper assertions

These do not parse or execute candidate SQL. Evidence is in
`artifacts/moonberry-use/native-static-checks.log`.

## Static review findings

- The request lock is owner/request scoped. The grove lock uses the exact
  namespace of `fn_world_gather_moonberry` and precedes inventory reads/locks.
  The native suite must establish that a waiting call sees the newly committed
  stock, rather than infer it from sequential calls.
- Successful and depleted receipts retain both target IDs independently of
  target deletion. Replay checks those IDs before current target lookup and
  returns only the minimal historical result. Refill cannot turn an old empty
  receipt into another consumption or make an old quantity current stock.
- Companion and acquisition locks are `FOR NO KEY UPDATE`, in companion-first
  order. The weaker lock is compatible with foreign-key key-share locks; it
  still conflicts with concurrent target update/deletion. No new writes to
  progression, care, bond, wallet or achievement tables appear in the function.
- Existing consent rows are locked `FOR SHARE` before decrement, receipt and
  optional Journal insertion. Explicit true is required; absent or null rows
  do not create a memory/reaction. A first-time concurrent preferences insert
  cannot create memory for a call that observed no preferences row.
- The function has no exception handler swallowing write errors. Receipt or
  Journal errors propagate to roll back its decrement and other writes. Caller
  rollback also needs the newly added native assertion.
- Owner checks occur inside the security-definer function; the search path is
  empty and new RPC execution is revoked from PUBLIC, anon and service_role.
  Receipt tables are in an ungranted private schema with RLS enabled. Actual
  hosted ACLs/default privileges and authentication remain unverified.
- The history RPC requires a receipt, exact ownership/targets and current true
  memory consent. Journal prose and metadata are owner-editable, so the private
  receipt establishes event identity, not immutable prose. Ordinary archive
  visibility is applied by the existing application story loader; it is not a
  database-level restriction in this SQL suite.

### Remaining schema/operational conditions

The source lacks a complete authoritative migration for the consent columns.
The candidate intentionally refuses absent or incorrectly typed consent fields;
the fixture explicitly supplies synthetic fields. Hosted reconciliation is a
release blocker, not permission to infer that schema.

The zero-quantity guard validates inventory inserts and changes to quantity or
item ID. It does not run when a privileged operator changes catalog identity,
kind or capabilities. Reclassifying an already-depleted Moonberry can therefore
invalidate the intended zero-stack catalog invariant without touching the
inventory row. Ordinary users have no catalog mutation grant in the fixture.
Catalog stability, or a separately reviewed catalog-edit guard, must be part of
a future rollout. No broader catalog mutation behavior was added here.

## Native harness improvements

The transaction suite now prepares **29 scenarios with nine independently
observed lock-wait checks**. Added cases cover concurrent same-key substitution
of either acquisition or companion, successful-receipt replay after refill,
empty-receipt target binding after refill, and rollback by the caller after a
successful function return. Error assertions use psql's framed primary error
message so they do not depend on stderr/stdout delivery order.

The launcher now writes an explicit NOT_RUN transaction report before starting,
preventing a stale successful artifact from surviving a failed launch. These
launcher changes were syntax/guard checked; a permitted successful cluster
startup is still needed to exercise their full lifecycle.

Prepared scenarios include last-unit races, same-key replay and target binding,
gather/use ordering in both directions and at the stock cap, depletion/refill,
owner/auth/input/ACL denials, atomic receipt/Journal failures, explicit rollback,
consent states and concurrent changes, deleted targets/Journal entries, exact
receipt-backed story identity and six-row history limits. Every scenario is
NOT_RUN in the current native report. The full list and final source hashes are
in `artifacts/moonberry-use/native-postgres.json`.

## Evidence and rerun contract

- Failed launcher and verified cleanup: `artifacts/moonberry-use/native-cluster.json`
- PostgreSQL failure: `artifacts/moonberry-use/native-server.log`
- Explicit transaction status: `artifacts/moonberry-use/native-postgres.json`
- Static/guard output: `artifacts/moonberry-use/native-static-checks.log`
- Reviewed final SQL/test hashes: `artifacts/moonberry-use/native-final-source.sha256`
- Earlier failures retained: `artifacts/moonberry-use/prior-socket-block/`

Run `tests/sql/moonberry-use-native.mjs` only in an approved environment that
permits its private Unix socket, with `MEMVOYA_PG_TEST_ONLY=1` and no inherited
PG/hosted connection settings. The portable launcher uses the current Node
executable and `/usr/lib/postgresql/17/bin` by default; `MEMVOYA_PG_BIN` may select
an absolute installed PostgreSQL 17 binary directory, never a connection target.
It writes new evidence under `test-results/moonberry-share/native/`, preserving
the blocked-run evidence above. Do not supply a database URL or weaken the
listener/authentication guards. Completion requires all 29 native scenarios to pass, nine observed
backend lock waits, source hashes unchanged during that run, and confirmed
cluster cleanup. The exact-head GitHub route is described in
`moonberry-use-review.md`; adding the route does not establish a native pass.
Ordinary archive/UI checks and hosted schema/authenticated acceptance are
separate verification stages.

Reference semantics were checked against PostgreSQL 17's
[locking documentation](https://www.postgresql.org/docs/17/explicit-locking.html),
[transaction isolation documentation](https://www.postgresql.org/docs/17/transaction-iso.html)
and Supabase's [database functions guidance](https://supabase.com/docs/guides/database/functions).
