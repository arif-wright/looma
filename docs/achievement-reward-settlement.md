# Atomic achievement reward settlement

## Local-only status

This unpublished forward migration and application patch replace the shared evaluator's split reward writes. No hosted SQL, function invocation, data repair, credentials, deployment, push or permission changes have been performed. SQL tests use synthetic owners in an isolated PGlite database.

## Transaction and trust boundary

`fn_settle_achievement_reward(uuid, uuid, integer, jsonb)` commits the following as one PostgreSQL transaction:

1. Read and hold the active protected catalog row; derive nonnegative points and shards using the existing private server conversion factor.
2. Insert the existing `user_achievements` claim using its unique `(user_id, achievement_id)` key.
3. Insert an idempotent receipt in the existing `economy_transactions` ledger, source `achievement`, key `achievement:<catalog UUID>`. No duplicate ledger/table or new currency is introduced.
4. Call the existing points and wallet grant functions.
5. Mark the receipt applied with the authoritative result.

Every error escapes the function, rolling back claim, receipt, points, wallet transaction and wallet balance. The application no longer logs-and-continues a points error or deletes an already-paid claim after a shard error. It does not issue compensating requests.

The unique claim serializes concurrent attempts. A competing successful transaction leaves an unlock, so a later attempt returns `already_unlocked` without any reward writes. A failed transaction leaves no claim or receipt and can be retried. If the network response is lost after commit, the retry is also a no-op. The result uses current database catalog amounts, rather than a potentially stale TypeScript catalog cache. A receipt without its unlock is inconsistent and fails closed; this function does not silently reconstruct it or pay again.

The new function is `SECURITY INVOKER`, uses an empty `search_path` with qualified application objects, and is executable only by `service_role` (plus its database owner). Function creation and ACL restriction are in one migration transaction. It grants no table access and changes no other function permissions. Service-role DML privileges on the existing tables are a prerequisite, not newly granted here.

The RPC is settlement, not a new eligibility API. Existing server callers remain responsible for authenticated ownership and eligibility:

- Bond sync verifies the session with Auth `getUser()`, rejects owner mismatch before privileged access, and uses server-calculated levels, the three named bond tiers, global active catalog entries and their thresholds.
- Game completion keeps its existing authenticated session ownership, game result validation and rule evaluation.
- The private environment's existing `ECON_ACH_POINT_TO_SHARDS` conversion factor is the only reward multiplier passed to SQL. No request-supplied amount or multiplier is forwarded. Points are re-read inside SQL; metadata cannot override them.

No endpoint, browser privilege, currency, monetization behavior, data collection or emotional profiling is added. Notifications and unrelated game rewards are outside this transaction.

## Legacy and rollout limitations

- Existing unlocks are conservative no-ops, with or without a new receipt. An unlock alone does not establish whether points/shards were paid under the old writer. No existing rows are rewritten, backfilled or relabeled by this migration.
- The old shard-failure path could pay points and delete the claim. A missing legacy unlock therefore does not prove nonpayment either. The new receipt cannot reconstruct that history. Any suspected historical unpaid/partially paid rewards need a separate evidence-based review and approved repair plan. Do not run a blanket replay or compensation sweep.
- An orphan receipt (applied or unapplied) blocks settlement rather than inferring which history is correct. Investigate separately.
- Guarantees apply to calls through this new writer. Drain/stop older split-writer instances as part of a separately approved coordinated release; mixing both versions does not provide all-or-nothing rewards.
- Deploy the approved migration before the application version. If the RPC is absent or privileges are insufficient, the application fails closed instead of falling back to split writes. Roll back application and database only through a reviewed plan; restoring the old writer restores its defects. The migration itself makes no historical data changes.
- The repository's older achievement migration creates `fn_add_points` with default PUBLIC execution, and the checked-in 20260612 RPC lockdown does not revoke it. This patch deliberately does not reconcile that separate security migration/history gap or claim current hosted ACLs. Verify the separately managed containment and catalog/table privileges before release. The isolated suite confirms the *new RPC* is client-denied and that this migration preserves every other tested ACL.
- A game completion can already persist its session before achievement evaluation and catch later achievement failure. Preserving the existing `first_clear` rule (`completedSessionsForGame === 1`) means a future session may not requalify. This patch makes settlement retry-safe; it does not add durable scheduling or guarantee eventual delivery of every failed game achievement. Bond achievements remain reevaluable on a later sync.

## Verification

- `src/lib/__tests__/achievementSettlement.spec.ts`: one-RPC contract; trusted returned amounts; configured factor; no-op cache; error and malformed response retry; lost-response retry; two overlapping application calls. RPC responses are mocked here.
- `src/lib/__tests__/bondAchievementCaller.spec.ts`: the real bond/care call chain with mocked network clients retains owner/foreign-owner/Auth and catalog rule checks, ignores forged request fields, and expects atomic failure/retry behavior. The former partial-failure characterization assertions were replaced.
- `tests/sql/achievement-rewards.mjs`: executes the actual catalog, points and wallet migrations, the existing ledger DDL and new forward migration against isolated PGlite. Tests successful/zero-point grants; reapplication and unchanged unrelated ACLs; trusted catalog/config amounts; duplicate/lost-response retries; all six write-stage rollbacks plus first balance insert failures; legacy/orphan no-repair behavior; owner-scoped idempotency; invalid input and unsafe numeric ranges; real points overflow rollback; direct anon/authenticated calls, forged foreign owner, catalog writes and claim writes denied.

Run the SQL test with `PGLITE_MODULE=file:///path/to/@electric-sql/pglite/dist/index.js node tests/sql/achievement-rewards.mjs` from the repository root. The tested PGlite version is 0.5.8. It is a temporary test dependency, not an application dependency.

PGlite is single-session. The queued-overlap test and mocked overlapping application calls **do not establish competing-session lock behavior**. Native PostgreSQL and `psql` were unavailable here. Before separately approved release, rehearse two concurrent native PostgreSQL sessions for the same user/achievement, including one failing transaction, and verify one claim, one applied receipt, one points increment and one shard grant. Also verify real hosted role permissions, deployed catalog and exact migration/application revision with an authorized test owner. No such live test was performed.

## References

- [Supabase database functions](https://supabase.com/docs/guides/database/functions): invoker/definer behavior, permission restriction and transactions.
- [PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html): unique conflict handling and partial-index predicate inference.
- [Supabase changelog](https://supabase.com/changelog): reviewed current changes; no dependency or platform upgrade is included.
