# Isolated two-owner PostgREST gate

This test-only gate targets the product source reviewed at `fb417fe4839d400d5b7e8afad008f2c408e6fff1`, root tree `9636660534f1d6031b6e6e58edb3d5d0f1d850a9`. Test additions change the final root tree. The bootstrap now strictly asserts independently reviewed Neon Run lifecycle/Lanternway `src` tree `8c73a1c899b8fe3eb43380393e795b825589a4a3` and unchanged `supabase` tree `c81fbae8e9873b717791288aefbae5d252c5ea6a`. The Moonlit skin, Tiles archive and subsequent bounded Neon Run lifecycle/Lanternway candidate leave shared settlement code, history query contracts and the Supabase tree unchanged. The Neon Run review covers engine-authoritative HUD/duration, honest practice, frozen same-session retry, fixed logical geometry, art fallback and optional focused/fullscreen ownership cleanup; its browser fixture is prepared but unexecuted locally. See `docs/neon-run-review.md` for exact verification limits. The archive review includes authentication parity, discovery/history separation and no session start at either legacy URL. The original product commit/tree remain historical provenance; update these strict pins only after reviewing a later product revision.

## Execution and evidence

Run `bash scripts/ci/game-settlement-postgrest.sh` only in a disposable Docker-capable CI runner. The GitHub workflow checks out the exact PR head, uses read-only repository permission, and archives source commit/tree, source hashes, query-contract guards, exact migration/extract manifest, native server/API versions, resolved official image digests, redacted container isolation metadata, ten HTTP assertion groups and teardown logs. A successful workflow requires both execution and independent report verification. Preparation/self-tests or a PostgreSQL/WASM smoke pass do not establish HTTP integration.

PostgreSQL runs with `--network none`. PostgREST and the Node HTTP client join that same isolated namespace; both servers listen only on loopback. No host binds or published ports exist. Administrative SQL uses a private peer-authenticated Unix socket. Only the synthetic database and non-superuser, NOINHERIT authenticator have a loopback-only test HBA exception. All containers and anonymous volumes are removed on exit.

The JWT signing key is random, generated in a disposable client container, copied directly to the disposable API container through a tar stream, and never saved in host files, command arguments, environment variables, GitHub secrets, reports or artifacts. Tokens are short-lived and synthetic; no hosted project or actual user credential is involved.

## Covered HTTP behavior

1. Signed owner tokens genuinely select different rows; anonymous, invalid-signature and expired-token requests fail.
2. Both owners settle a game through the service-only HTTP RPC, then reload canonical XP, wallet and embedded reward history. Starting balances differ and both owners have real reward rows, making negative checks non-vacuous.
3. Unfiltered and explicitly cross-owner sessions, rewards, grants, wallets, wallet ledgers and settlement receipts are isolated in both directions by real source RLS.
4. The exact canonical wallet and inner-joined reward-history query shapes execute through PostgREST. The source guard checks current application query strings. Service receipt reads use both owner and session filters; mismatched owner/session returns no receipt.
5. Anonymous and authenticated callers cannot invoke new settlement, achievement settlement, XP award or wallet grant. The legacy completion RPC is denied even to service role.
6. Privileged settlement itself rejects mismatched owner/session.
7. The client deliberately destroys a successful HTTP completion response before reading its body. Reading the durable receipt and repeating the identical request returns the same receipt and does not increase any payout count or balance.
8. Changed score, stats or success on a retry produce `game_settlement_conflict` and preserve all saved state. PostgREST returns SQL `P0001` as HTTP 400; mapping this to the application route's 409 is a separate tested API-layer responsibility.
9. Direct owner and cross-owner table updates fail under the fixture's SELECT-only authenticated table grants, and service snapshots remain unchanged.

## Exact scope and limitations

The real targeted settlement migrations, explicit historical extracts, game/wallet/receipt RLS, relational foreign keys and service-only function ACLs run on native PostgreSQL behind real PostgREST v12.2.12. Synthetic infrastructure supplies Supabase-like roles, `auth.users`, `auth.uid()` JSON-claims compatibility, minimal prerequisite relations, table read grants and fixture rows. The manifest distinguishes full source files, exact extracts, synthetic infrastructure and assumptions.

This is not a hosted Supabase Auth sign-in, end-to-end SvelteKit request, signature/HMAC or browser playthrough. It does not establish live schema/ACL drift, production configuration, full historical migration replay, leaderboard/notification/analytics delivery or authenticated gameplay. The already reviewed native concurrency suite remains separate.

`player_stats` uses the real repository SQL view, including its historical default view-owner security, and is exercised with the application's owner filter. No stronger confidentiality policy is invented; this gate does not certify arbitrary cross-owner view queries. `fn_add_points` retains its source-default PUBLIC EXECUTE privilege; its separately managed live ACL remains a rollout prerequisite outside this gate's privileged-RPC claims. Direct table-write tests establish table-ACL denial under declared fixture grants, not independently added write-policy protection.

No product, migration, dependency, hosted account, security setting or deployment changes are included. Keep PR9 draft and require separate coordinated SQL/application rollout approval.
