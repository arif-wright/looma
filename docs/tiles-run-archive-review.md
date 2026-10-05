# Tiles Run: reversible presentation archive

Local candidate prepared on 2026-10-04 against PR #9 source commit `28ef5a2c9dfb8a67759573a1af0c3f8decacf35e`, exact root tree `4ebf58ab19836facd912fa63a01b3655d1bba168`.

## What changes

- Hide Tiles Run from the game picker, API discovery response, local fallback, static grid append, reward-derived featured choice and Home quick links.
- Preserve the complete reward list. A failed, malformed or empty catalog does not remove successfully loaded history.
- Keep `/app/games/tiles-run` as an archive with an explicit Neon Run link, the existing leaderboard scopes/pagination, earned-achievement access and a reward-history link.
- Use the same authentication-only access rule as the old game route. No new alpha/onboarding/companion requirement is introduced by the archive.
- Keep `/games/tiles-run/embed` as a light notice with an explicit archive link. No automatic redirect, game wrapper, bridge, engine or session start occurs on either archive surface.
- Retain full Tiles catalog metadata, engine/bridge source, cover assets, migrations, UUID/slug identities and all existing history. Neon Run remains its distinct `runner` game.

This is presentation retirement. Direct legacy session API/RPC availability is deliberately unchanged. It is not an enforced backend shutdown, data migration or achievement transfer.

## Shop placeholder follow-up

Read-only inspection of the user-confirmed Project Looma database at 2026-10-04 22:50:57.977677 UTC found:

- `tiles-run-skin-nebula` / Tiles Run – Nebula Skin: active and featured, 120 shards, cosmetic/epic, stackable.
- Exactly one aggregate `shop_inventory` record for that item. This establishes an existing entitlement, not whether it arose from purchase or grant and not a distinct-owner total.
- No owner IDs, inventory rows, purchases, payments or secrets were retrieved. No shop or database mutation was made.

The user subsequently clarified that this is their own test entitlement and no actual skin was implemented. Keep the archive approach; do not add a playable legacy path. A minimal guarded stop-offer SQL proposal and inverse are now included, preserving the test entitlement and its owned-item display. They remain unapplied and require separate live-write approval. See `docs/tiles-nebula-delist-review.md` for the owner-only metadata policy, purchase rejection, concurrency precautions and nine passing isolated SQL checks. Cover assets are also reused by unrelated shop products and remain unchanged.

## Verification

Passed locally:

- Full unit suite: 628 tests across 69 files, including normal/empty/failed/malformed catalog paths, retained Tiles rewards, default/static artwork filtering and old authentication parity.
- Full Svelte/TypeScript check: zero errors and warnings. Core TypeScript check passed.
- Full production build.
- Actual-component server rendering of the archive, legacy notice, default and supplied grids, and four hub catalog states. Historical Tiles rewards remain visible. Fixture rejects session/engine/service imports and any SSR fetch.
- Built route manifest confirms the static archive wins over `[slug]`, legacy embed still resolves, and Neon keeps its original route.
- PostgREST source-contract and harness self-test. Strict source pin refreshed only after independent review; equality assertions and Supabase pin unchanged.
- Updated Playwright suites: nine tests discovered, focused strict TypeScript check passed, diff whitespace check clean.

Not executed: browser hydration/navigation/visual interaction, authenticated seeded E2E, native PostgreSQL concurrency or real PostgREST HTTP for this new candidate. No newly observed Neon start/replay/completion claim is made; its source and shared settlement paths are byte-identical to the base. Existing prepared tests retain direct historical API coverage and add archive reload, scopes/pagination, history, achievements, social links and Back/Forward cases. Never run seeded suites against the live database.

Independent review found and resolved the initial extra onboarding gate, modal focus-return omission and malformed-catalog history fallback. No remaining blocking source issue was found. Browser/device verification remains a release gate.

## Safe rollback / publication

This preparation is local only. Nothing was pushed, merged, deployed or applied to a database. To reverse a published application-only change, revert this candidate's code commit; the preserved identities and data need no reverse SQL. Review and separately approve the guarded shop proposal, and run isolated browser/regression gates before requesting publication approval.
