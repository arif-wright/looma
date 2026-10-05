# Bond reward caller containment compatibility

## Scope and status

Local-only caller repair, prepared from the existing PR9 working-tree snapshot supplied for published revision `178aeb5`. The source tree and separate unpublished care-qualification work are unchanged. No SQL, grants, keys, dependencies, remote branches, deployment, or production data are changed by this patch.

The caller-only repair described here is now complemented by [atomic achievement settlement](achievement-reward-settlement.md). That local forward patch replaces the split writes below; historical payment ambiguity remains unresolved. Live containment and release require their own approval and verification.

## Exact application boundary

1. `recalculateBondsForPlayer` calls the supplied session client's `auth.getUser()` before accessing the existing service-role client. An Auth error, absent user, thrown Auth request, missing owner, or owner mismatch prevents all privileged bond operations.
2. Recalculation uses the verified user's ID. The resulting database-calculated bond level is the only eligibility input to the private achievement helper.
3. Only this private bond-achievement helper uses the existing server-side evaluator with `supabaseAdmin`. This covers the protected catalog, own reward-claim lookup and the service-only atomic settlement RPC. Care/tick writes and milestone-event access remain on their session client. No generic reward endpoint, client-supplied amount, or browser-visible credential is introduced.
4. Eligibility remains limited to the three named bond achievements and their code thresholds. The helper additionally requires a finite positive calculated level, a global `bond_level` catalog entry, and satisfaction of its configured threshold. Points come from that protected catalog row; shard conversion uses the existing server configuration.
5. Reconnect now supplies its authenticated session client to bond synchronization rather than its independently privileged data client. The helper must never accept a service-role client as proof of an end-user identity.
6. The existing `$lib/server` module boundary keeps the credential-bearing imports out of browser bundles. The code reuses the established lazy server client and does not read, copy, generate, change, or return a credential.

The service-role database credential is inherently broad. This patch narrows its *application call site* behind verified ownership; it does not claim to introduce a restricted database role. The catalog must remain unwritable by ordinary clients. Existing ownership/reward-source integrity in other tables and RPCs is outside this small patch.

## Why not change only the points client?

The repository's achievement migration enables RLS on `user_achievements` with an authenticated SELECT policy, without an authenticated insert policy. Granting clients the ability to claim arbitrary achievements would weaken security. Keeping the protected claim and reward together inside the owner-bound server evaluator preserves that boundary without opening new privileges.

## Historical failure semantics and current settlement

The caller-only baseline inserted `user_achievements`, called `fn_add_points`, then granted shards in separate requests. Points errors could leave an unpaid unlock; shard errors could delete an already-paid unlock and permit duplicate points on retry.

The [new atomic settlement patch](achievement-reward-settlement.md) supersedes those behaviors for future calls through its writer. Its single service-only database transaction commits claim, points, shards and an existing-ledger receipt together. Errors leave no partial reward state; retries do not pay a committed claim twice.

Auth and eligibility handling remain unchanged. Historical unlocks remain conservative no-ops: neither an existing nor missing legacy claim proves past payment. Do not automatically backfill/replay suspected legacy failures. See the settlement document for rollout, ACL verification and first-clear retry limitations.

## Verification

Local tests execute the real bond service, evaluator, private shard-factor selection, and (for request-payload coverage) real care route against mocked network clients. They cover:

- authenticated-owner award with denied session-client RPC access;
- rejection of foreign owners, missing users, Auth errors and stale-user/error combinations;
- thrown Auth requests and direct recalculation without an owner;
- real care-route unauthenticated and foreign-companion rejection;
- forged owner/amount/level/achievement request fields ignored;
- trusted catalog amount and server-calculated level;
- global/active/allowlisted bond eligibility;
- threshold behavior for all three bond tiers;
- reconnect client wiring with distinct admin and session clients, plus its existing failed-side-effect reporting;
- repeated successful calls and duplicate claim conflicts;
- recalculation and claim-insert failures;
- atomic reward failures and clean retry without extra points or shards;
- conservative no-op for an already-unlocked legacy claim.

The caller network stubs do not prove live grants, RLS behavior, competing-transaction safety, or hosted Auth behavior. The separate settlement SQL suite tests transaction failures and restricted execution in isolated PGlite; native competing-session verification remains outstanding. No credentialed live reward request was made. Aggregate check/build results are recorded in the accompanying local verification report.

After any separately approved release, verify with a dedicated authorized test owner that session clients cannot execute `fn_add_points`, the server can, and a fresh eligible bond claim is credited correctly. Verify the exact deployed revision and permissions rather than inferring them from this unit suite.

## Reference guidance

- [Supabase Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser): use the authenticated server response for user identity.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys): elevated keys bypass RLS and belong only in server components with their own authorization checks.
- [Supabase changelog](https://supabase.com/changelog): reviewed for relevant current changes before implementation; no API-key or Auth dependency upgrade is included here.
