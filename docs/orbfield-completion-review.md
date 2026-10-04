# Shared game-completion review

> Historical client-checkpoint review. The combined local candidate now includes the separately reviewed shared settlement repair described in [game-settlement-review.md](game-settlement-review.md). Baseline findings and prior verification below remain historical evidence; they are not the current server contract.

Reviewed detached PR9 commit `6980690812ed9f96f26a63a4831d70ba6926fbd3` on 2026-10-04. This is a source audit plus local SDK hardening, not evidence that a deployed database has applied these migrations. No hosted database, credentials, accounts, deployment, publication, or fabricated companion history was used.

## Decision

The local Orbfield playable slice can use a truthful practice/completion UI, but the shared completion path is **not safe to describe as atomic, recoverable, replay-safe, or economically release-ready**. Atomic achievement settlement is a separate operation and does not change that conclusion.

No app-only reordering can make several independent database commits atomic. Do not add an automatic retry, award local fallback XP/shards, or show claimed rewards when completion returns an error or no server result.

## Existing sequence and failure boundary

1. SDK signs client-reported score and duration via `/api/games/sign`, then posts them to `/api/games/session/complete`.
2. The route checks authentication, rate limits, hourly grant count, session ownership, started status, nonce, signature, and score/duration/version caps.
3. `fn_game_complete` commits the completed session first (`src/routes/api/games/session/complete/+server.ts:333`).
4. Leaderboard row/refreshes and achievement evaluation follow in independent calls (`:347`, `:376`). The achievement helper's own transaction is atomic; the completion transaction is not.
5. Companion ritual progression may mutate and award before the base reward writes (`:434-447`).
6. `persistRewards` separately inserts `game_rewards`, inserts `game_grants`, and increments profile XP (`src/lib/server/games/rewards.ts:23-60`).
7. `walletGrant` separately inserts the wallet transaction and increases `wallets.balance` (`complete/+server.ts:491`; `20251102_phase10_6_economy.sql:63-71`).
8. Inspection, analytics and server event ingestion run, then the route returns its calculated reward object. The SDK separately sends another `game.complete` event.

A failure after step 3 can leave a completed run with some or none of its rewards. If `game_grants` fails, `game_rewards` already exists. If XP fails, both reward/grant records already exist. If wallet credit fails, XP is already awarded. A lost HTTP response can also conceal an entirely successful award. Every retry is rejected by the started-state test (`complete/+server.ts:194-202`; sign route `:77-78`), so neither client nor operator can infer the unpaid amount safely from a 409.

## High-priority findings

### 1. Completion race and duplicate payment

`fn_game_complete` updates by session ID and owner only; it does not require `status='started'`, claim a winner, or return a settlement receipt (`supabase/migrations/20251101_phase10_games.sql:104-115`). Two requests can both read started, then both call the RPC and execute the reward path. PostgreSQL serializes the row updates, but the second update still succeeds and does not stop its caller's later writes.

`game_scores.session_id` has a unique index, but the route ignores its duplicate error and continues. `game_rewards` and `game_grants` have no equivalent uniqueness. `wallet_tx_ref_idx` is a nonunique lookup index, and `fn_wallet_grant` does not enforce idempotency. The hourly cap is also a separate count-before-write and can be exceeded by concurrent sessions.

### 2. API checks can be bypassed for session state

`fn_game_complete` is security-definer and remains executable by authenticated users (`20251102_adjust_game_rewards.sql:24`). The later privileged-RPC lockdown does not revoke it. A user can directly mark or rewrite their own session's score/duration without calling the API's signature/caps checks. This does not directly grant wallet money, but invalidates the trust of completed-session facts and first-clear/session-count achievements.

The signing endpoint itself verifies bounds on submitted numbers, not gameplay. It never compares duration against `started_at` or replays server-seeded inputs. Calling it makes an HMAC over an accepted client claim; it is not an authoritative game simulation.

### 3. Reward balances are read from a different ledger

The completion wallet grant writes `wallets` / `wallet_tx`. `/api/games/player/state` reads `user_wallets.shards` (`+server.ts:23-28`). The repository defines these as separate tables and has no bridge/synchronization migration. Resolve this contract and prove a reward response agrees with the player's subsequent state before release.

The same player-state endpoint also queries `game_rewards` with an admin client and a filter on an embedded session without an explicit inner join. Verify with two owners that the root reward rows are filtered as intended; a nested filter alone can leave other owners' root rows present with a null child. This is a source-derived isolation risk requiring a real PostgREST/RLS integration test.

### 4. Side effects do not share a stable completion key

The SDK sends only score/duration through the completion API; `success` and `stats` are sent later through the client event. The route already accepts those fields, but this patch intentionally does not change event/reward semantics.

Server ingestion derives a key using a fresh timestamp. Client ingestion supplies neither a timestamp nor an explicit key. Thus server/client `game.complete` emissions do not deduplicate against each other (`src/lib/server/events/idempotency.ts:22-47`). Companion rituals use separate read/update/award operations and lack a per-game-session claim. Treat progression, reactions and memories as separate unverified effects, not evidence of a saved or replayed run.

### 5. Legacy helpers must not accompany authoritative completion

`awardXP` calls the now-410 `/api/xp` route and then updates local XP on failure; `awardShards` updates local currency only (the SDK `awardXP` and `awardShards` helpers). Using either after shared completion would show uncommitted/double local reward state. Orbfield should consume only the completion response. No changes were made to these helpers.

## Bounded local changes

Only `src/lib/games/sdk.ts` and the new `src/lib/__tests__/gameSdkSessionLifecycle.spec.ts` are the SDK changes in this checkpoint:

- `abandonSession(sessionId): void` forgets the local active context and clears the current ID only when it matches. It does not send an abort/completion, affect a newer session, undo rewards, or cancel an already-started request.
- Successful completion uses that same cleanup helper. Start/completion return as soon as their authoritative API result is available; existing optional events and caught reaction processing run in the background, so a stalled event endpoint cannot strand Starting/Saving. A late completion reaction is not pushed while a newer session is active.
- Denied sessionStorage access/read/write cannot turn a successful server completion into a client failure.
- Synchronous optional analytics failures, including blocked localStorage/beacon, cannot turn successful start/completion into failure. Optional completion-event/reaction import/store failures also preserve the committed server response.
- No automatic retry, completed-result cache, backend migration, new reward, or memory/history write was introduced.

Thirteen isolated tests cover silent/idempotent cleanup, newer-session preservation, uncertain-result cleanup without retry, three storage-failure modes, optional analytics failure, exactly-once local counter bookkeeping with the server reward payload, optional reaction import/store failures, never-resolving optional start/completion events, and suppression of an old reaction during a newer active round. They mock network/event boundaries and do not prove database settlement.

## Smallest coherent settlement repair (separate work)

1. Add a service-only database settlement RPC in a reviewed migration. Lock the relevant owner/session in an order compatible with the rest of the economy. Validate owner, nonce, immutable submitted result, active game, numeric bounds, and a defined server-time policy.
2. Use a durable unique session receipt, potentially the existing `economy_transactions` ledger with a game-session key. Freeze the result/reward calculation and relevant companion/streak snapshot. In one transaction: claim, write score/reward/grant records, update XP, grant currency into the chosen canonical wallet, mark the session completed, and save the canonical response.
3. Identical owner+session+result replay returns the stored response without writes. A changed payload conflicts. Replay lookup follows authorization/ownership checks but precedes new-award caps. Legacy completed sessions without a receipt fail closed as unreconciled; do not infer payment or backfill rewards automatically.
4. Replace the route's split writes and revoke the old authenticated completion mutation. A mere conditional update, local mutex, or insert-unique guard does not solve crash recovery across separate commits.
5. Give post-commit effects one stable server-origin completion key. Any effect that changes rewards/ritual progress needs its own durable idempotency/recovery contract. Do not promise full completion atomicity while retaining unrelated nontransactional reward mutations. An initial minimal contract may expose only committed base settlement, with ancillary effects explicitly separate.
6. Make sign/replay handling compatible with durable receipt retrieval; the current SDK re-signs every attempt and the signer refuses completed sessions. Runtime-validate the canonical response rather than relying only on a TypeScript cast.

## Required release gates

- Fault injection after every actual write: session, score, receipt, reward row, grant row, XP, wallet transaction, wallet balance, final receipt. All roll back together, then a clean retry pays once.
- Lost response after commit: identical retry returns the same stored result, with unchanged balances and row counts.
- Independent real PostgreSQL connections: same-session races have one payment; changed-payload races cannot overwrite the winner; different sessions at the final hourly quota cannot exceed it. A queued single-session WASM test is not this evidence.
- Anonymous/authenticated direct RPC denial; cross-user session/receipt denial; inactive title, bad nonce, signature, integer overflow and impossible duration fail without writes.
- Replays after changed companion/streak/catalog/config use the original receipt, not a recalculated award. Completed legacy/partial sessions remain unreconciled without duplicate grants.
- Two-owner PostgREST reward reads reveal only the caller's rewards. Complete then reload player state reflects the canonical wallet and exact committed XP.
- Side-effect replay does not increment rituals twice, duplicate achievements, or add duplicate completion-driven memory/progression. Reactions/storage/analytics failure cannot turn a committed base response into a retryable payment.
- UI: short practice run has no fabricated duration/reward, navigation cleanup preserves a newer run, rapid replay/double submit cannot send duplicate completion, 401/500/lost-response is shown truthfully, and retry/new-run actions never replay an ambiguous old settlement.

Existing `tests/games-security.spec.ts` only asserts sequential replay returns 409; `tests/ui/game-failure-states.spec.ts` mocks failed HTTP responses. The achievement SQL regression validates achievement settlement only. None proves the shared game-completion gates above.

## Verification performed

- `VITEST=true npm run test -- --run src/lib/__tests__/gameSdkSessionLifecycle.spec.ts --maxWorkers=1 --minWorkers=1`: 1 file, 13 tests passed. This is the repository test location for the local SDK changes; the candidate remains uncommitted.
- `git diff --check`: passed for the combined working checkout at the review time.
- `npm run check`: passed on the combined working checkout with 0 errors and 0 warnings after the final SDK/test changes.
- Production build, real PostgreSQL concurrency, deployed PostgREST isolation, and live reward settlement are outside this SDK review; see the separate candidate validation report for build evidence.

Static review of the in-progress Orbfield shell confirmed local cleanup/generation guards, early-run practice handling, no automatic failed-completion retry, no local reward-grant helper calls, and no legacy player-state read. It displays only the confirmed completion response and its ritual updates, avoiding the separate-wallet and owner-filtering risks above. Browser interaction verification belongs to the shell task.
