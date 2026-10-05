# Atomic shared game settlement: local review candidate

Prepared 2026-10-04 on PR #9 base `6980690812ed9f96f26a63a4831d70ba6926fbd3`, on top of the local Orbfield playable candidate. Nothing in this checkpoint has been published, applied to a hosted database, merged, or deployed. No account gameplay, private user rows, keys, credentials, historical reward repair, new service, keepsake, or Journal memory was used or created.

## What changes

`20261004194345_settle_game_sessions_atomically.sql` introduces one service-only, security-invoker command. It verifies the owner/session/nonce, takes a shared per-owner transaction lock, and settles the session, score, base reward/grant rows, profile XP, canonical `wallets`/`wallet_tx`, eligible achievements, and existing daily play ritual in one PostgreSQL transaction. Any exception rolls back the entire settlement. Existing reward formulas and amounts remain unchanged.

The canonical result is stored in the existing `economy_transactions` ledger under `(owner, 'game_session', 'game-session:<session UUID>')`. An identical owner/result replay returns that frozen result. Changed score, duration, nonce, version, success, or stats conflicts. Replays do not recalculate companion/streak/catalog/tuning, spend the hourly quota again, or repeat optional effects. Completed or partially paid legacy sessions without a canonical receipt fail closed; this patch never infers what they were paid.

Unique indexes defend session reward rows, session grant keys, and game wallet references. A duplicate already present causes migration failure rather than deletion or repair. One per-owner lock covers the hourly quota across different sessions and the complete first-clear/session-count evaluation. The existing achievement settlement helper acquires this same advisory lock before catalog/claim/points/wallet locks, preventing inversion when several game achievements race an independent achievement award. Its identity, formula, security mode, ownership, and grants are preserved.

The old `fn_game_complete` API execution grants are revoked, including service-role direct use. It previously allowed users to overwrite completed facts without the API's signature/caps. Current code uses the new command exclusively.

## Compatibility and reward truth

- Base formulas remain `clamp(floor(score/100),1,100)` XP and `clamp(floor(score/50),1,200)` shards. Existing companion tiers (1, 1.02, 1.05, 1.08, 1.10), JavaScript positive `Math.round`, streak calculation including today's completion, and binary-floating `Math.floor` behavior are preserved. A 9,400-case currency / 500-case XP SQL comparison covers the existing formula ranges.
- Active-companion selection keeps the existing owned-companion fallback order. Eligibility for the daily play ritual is preserved even if the fallback is inactive; affection/trust only go to an active owned companion.
- The daily play ritual remains XP20, shards3, affection1, trust1, once per UTC date. It has a protected daily ledger claim because its old progress row is owner-writable. Resetting/deleting the progress row cannot pay it again. Already completed/claimed historical rows are not backfilled. The old helper passed a non-UUID daily key to a UUID wallet RPC and silently lost shard credit; this repair uses the actual session UUID and stores the date/key in metadata, allowing the intended existing 3-shard award to commit.
- The ritual's existing derived emotional snapshot is updated in the same transaction. It preserves momentum/volatility/milestones and creates no care event, acquisition, or memory. Ritual display progress is clamped so owner-written malformed progress cannot poison a committed receipt.
- Game achievement rule kinds and amounts are retained. Weekly rank uses the equivalent current score-table aggregate, including this transaction's score, instead of depending on a separately refreshed materialized view. Bond-level achievements continue through their existing caller.
- New submissions must report an integer-normalized nonnegative score and positive duration within current catalog caps. Duration cannot exceed elapsed server time plus a two-second tolerance. Paused/short practice play is not padded to earn rewards. This is a plausibility bound, not proof of client gameplay or authoritative anti-cheat.
- Private hourly/streak/achievement conversion settings remain server-supplied; none is accepted from the request body. Postgres validates numeric bounds before committing. A wallet with a non-shards currency fails closed rather than producing a false shards receipt.

## API, client, and event behavior

The shared completion route revalidates Auth before using its service client, validates ownership/nonce/signature, and checks a stored receipt before new-award restrictions. The signer can re-sign the exact saved score/duration/nonce/version for response recovery. Legacy unreceipted completion remains an explicit conflict. Runtime receipt validation rejects malformed or inconsistent reward results.

The SDK forwards success/stats, coalesces identical in-flight completion calls, rejects changed concurrent payloads, and deep-freezes the first normalized result and elapsed duration through uncertain failures. Explicit abandonment releases only local retry context. There is no automatic retry, no local fallback reward, and no new UI retry button in the Orbfield slice; existing callers can safely retry the same concrete submission. Optional storage/analytics/reaction failure still cannot invalidate confirmed completion.

Player state reads canonical `wallets.balance`, not the separate legacy `user_wallets.shards`. Reward history uses the authenticated client, existing RLS, and an explicit inner session-owner join. Missing/malformed XP, wallet/history errors, and missing schema fail closed; no in-memory balance is invented.

Leaderboard refresh, anomaly inspection, analytics, notifications, and event delivery are bounded, caught post-commit effects. They never award base/achievement/ritual money or alter the receipt. A response is returned after at most 1.5 seconds waiting for these optional effects. Identical replay does not repeat them.

Both server and client `game.complete` events are converted inside event ingestion to the same authenticated owner's committed receipt facts and stable session key. Client-supplied event facts/keys cannot replace the committed result, and a pre-settlement/foreign/legacy-unreceipted event cannot claim the completion key. This prevents double progression from two competing senders. Existing event-ingest claims are still at-most-once, best-effort: a crash after its claim can omit optional effects. This patch does not promise durable event/reaction/notification recovery or atomicity of all downstream progression.

## Read-only live prerequisite evidence

Catalog-only and aggregate-only checks against the existing Memvoya project confirmed:

- The expected games, economy, companion/ritual/emotional, and achievement table/function shapes exist, including the atomic achievement helper and unique economy idempotency index.
- `fn_add_points`, `fn_award_game_xp`, `fn_wallet_grant`, and `fn_settle_achievement_reward` are denied to anonymous/authenticated roles and executable by service role. The legacy `fn_game_complete` is currently executable by all three roles.
- Duplicate groups: session reward rows 0; session game-grant keys 0; game-session wallet references 0.
- Existing game-session economy receipts 0; completed sessions without one 133. These are aggregate counts, not an audit of individual payment correctness. They are not selected for repair.

Recheck these prerequisites immediately before any authorized live migration. The aggregate read is a point-in-time observation, not permission to change the project or a guarantee that no old writer is still active.

## Local evidence and remaining gates

Final local verification on Node 24.19.0:

- 597 Vitest tests passed across 66 files, including API85, SDK34, and canonical event11.
- 10 PostgreSQL/WASM SQL groups passed, including 18 injected write faults and 9,900 reward arithmetic parity comparisons.
- `npm run check`: 0 errors, 0 warnings; `npm run check:core` passed.
- Vercel-adapter production build passed; 9 world-asset tests passed.
- Independent review found no remaining blocking defect within this candidate's scope and reproduced the 130 focused tests, whitespace check, native-harness self-test/syntax, and CI shell syntax.
- Migration SHA-256 reviewed: `03786539053ba230294f69994883ebccdf7950777d8e3b8b6d13c4f693e5a9da`.
- Browser/authenticated/PostgREST/native concurrency execution is not included in those passes.

See packaged logs for command output. Local SQL regression runs the real targeted migrations in PostgreSQL/WASM, with synthetic identities only. It verifies complete rollback at 18 write stages, clean retry, lost-response replay, immutable inputs, changed tuning, owner isolation, roles, UTC ritual claims, legacy fail-closed cases, quota semantics, and amount parity. It is not independent-backend concurrency evidence.

`tests/sql/game-settlement-concurrency.mjs` and its new isolated CI workflow prepare eight native PostgreSQL schedules with nine observed blocking waits: same-session replay; competing changed result; different sessions at final quota; failed settlement with a waiting retry; independent achievement/game contention in both directions; companion parent/stats lock ordering in both directions. The runner uses an unnetworked disposable official PostgreSQL 17 container, Unix sockets, no host mounts, secrets or deployed app. Syntax, self-test, rejected-host checks and sequential fixture smoke were checked. Native PostgreSQL/CI execution is **not run in this environment** because PostgreSQL and Docker are unavailable.

Outstanding before any production-readiness claim:

1. Execute native concurrency workflow for the exact published candidate, reviewing the report and isolated-image digest.
2. Authenticated two-owner PostgREST integration: one successful completion followed by canonical XP/wallet reload, cross-owner session/receipt/history denial, direct old/new RPC denial, identical lost-response recovery, changed-payload conflict.
3. Real authenticated Orbfield play through mobile/keyboard input, pause, practice, completion, replay/navigation and error states. Synthetic fixture tests do not prove hosted Auth/config/schema or account play.
4. Verify the shared completion behavior in the other games. Their pre-existing UI/local-award helpers and iframe contracts are not repaired by this bounded shared-server change.
5. Verify leaderboard/notification/analytics behavior separately. Their delivery is optional and not part of the atomic payout contract.

## Exact proposed live approval delta

This checkpoint proposes, but does not authorize:

1. Publish the reviewed local source/test changes to the intended branch/PR and run isolated CI, with no production secrets/services.
2. During a coordinated window, prevent/drain old game-completion writers; recheck catalog, child-RPC ACLs, receipt/index prerequisites and aggregate duplicates; apply **only** `20261004194345_settle_game_sessions_atomically.sql` to the existing Memvoya database.
3. That migration adds three unique payout guards and one hourly-count index, creates the service-only game settlement RPC, revokes the old completion RPC's API grants, and adds the shared first advisory lock to the existing achievement settlement helper. It does not change reward amounts, historical sessions, existing grants, balances, consent settings, or introduce a new hosted service.
4. Deploy the matched API/SDK/event-ingest/player-state code; verify authenticated owner isolation and real activity completion before reopening completion traffic.

The SQL and matched server cannot be rolled out independently while old writers are serving: the old route would hit the revoked RPC, while the new route requires the new command. Prefer reviewed roll-forward. Do not blindly restore the old split-write route after new receipts exist. Historical repair, new user rewards/items/memories, merges, deployment, production tests/accounts and additional services remain separate approvals.
