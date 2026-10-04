# Orbfield playable slice review

> Historical client-checkpoint review. The combined local candidate now includes the separately reviewed shared settlement repair described in [game-settlement-review.md](game-settlement-review.md). Baseline findings and prior verification below remain historical evidence; they are not the current server contract.

Date: 2026-10-04. Local candidate based on draft PR #9 head `6980690812ed9f96f26a63a4831d70ba6926fbd3`. This is a source and local-test checkpoint, not publication, deployment, authenticated gameplay evidence, or an atomic game-settlement repair.

## Choice and actual inventory

The current Play catalog contains four artwork-backed game cards:

- **Orbfield** (`/app/games/dodge`): a real canvas dodge engine through `GameShell.svelte`. Smallest existing engine (227 lines at the baseline), but its shell had mismatched jump instructions, inert difficulty/audio controls, no mobile warp button or keyboard movement, no displayed server rewards, and a start-error path that removed the canvas and its retry controls.
- **Neon Run** (`/app/games/runner`): a real runner through `NeonRun.svelte` and `GameWrapper.svelte`, with a larger power-up/audio/progression surface. The shared wrapper's old local award helpers and completion handling need separate review.
- **Tiles Run** (`/app/games/tiles-run`): a real iframe runner through the dynamic route, message bridge and shared wrapper. Resize resets engine state; iframe pause/restart/trust and completion paths need dedicated coverage. Its existing browser test injects a completion message rather than proving normal gameplay.
- **ARPG** (`/app/games/arpg`): a larger Phaser combat scene with its own session flow and substantial assets. Not the smallest mobile-first repair.

`Astro Match` remains in the hub's fallback/config history; the generic non-Tiles route displays a “Mini-game sandbox”, not a complete matching game. The hub appends static cards even when config is empty, so card visibility is not a backend availability check. The separately flagged `/app/world` Wilds route has its own realtime service and rollout gates and is outside this slice.

No catalog card, API endpoint, passing unauthenticated smoke, or READY preview establishes that a game is fully functional.

## Bounded source changes

- Preserve Orbfield's existing route, session SDK and server completion endpoint.
- Show a real start action and persistent play area. Retry only failed starts, with generation/phase guards for double clicks, stale responses and leaving the page.
- Map pointer coordinates correctly at mobile/CSS scales, clamp them inside the play area, support captured touch dragging and focused arrow/WASD movement.
- Expose the existing three-charge time warp as a visible touch/keyboard action. Remove audio/difficulty controls the old engine did not implement.
- Add pause/resume, automatic pause on hidden/background windows, bounded frame steps, one terminal callback and listener/animation cleanup.
- Use a one-minute round within returned server duration caps, with enemies aimed at current position. Score measures actual active survival time; using warp does not subtract score.
- Keep short collisions as practice. Do not wait after death or inflate duration to qualify for rewards.
- Show only a nonnegative integer reward response confirmed by the existing server. Preserve returned companion-ritual updates; do not issue a second XP/shard award in the browser.
- Do not add a player-state refresh: its legacy wallet source and root reward-row owner filtering need separate verification. Show this round’s confirmed response only.
- On ambiguous completion errors, retain the local score and explain that the result is unconfirmed. A new round gets a new session; the previous submission is never blindly retried.
- Add a local-only SDK context cleanup and guard optional storage, analytics and reaction failures so they do not disguise an already successful server result as a failed completion.

## Companion and item truth

This preserves the existing completion/ritual integration. A returned companion bonus may be shown as a bonus, without claiming that the companion identity was frozen for the whole round. No new emotional inference, absence penalty, service, inventory, item grant or Journal memory is introduced.

There is no direct Orbfield-to-keepsake grant in the current source. The existing Play Spark is derived from a later chapter, not an immediate game reward. A future activity keepsake must use the existing `item_catalog`, exact `user_items` acquisition and consent-respecting Journal, with consistent transactional provenance. This patch never claims an unpersisted play memory or fabricates historical ownership.

## Acceptance covered by this candidate

- Real-engine deterministic unit tests: scaled/clamped pointer, touch lifecycle, keyboard/diagonal motion, blur cleanup, bounded warp charges, pause/resume, long frames, collision, timed finish, single completion and destroy cleanup.
- SDK unit tests: local abandonment without external writes, preserving a newer context, blocked storage/analytics/reaction failures after success, normal bookkeeping and ambiguous failure handling.
- A credential-free Vite fixture imports the actual GameShell and actual engine. Lifecycle tests use a separately labelled deterministic engine and mocked SDK; the real-engine browser test covers input, pause and teardown separately.
- Fixture build/SSR/discovery and aggregate check results are recorded in the accompanying validation logs. Browser discovery is not execution.

## Explicit remaining gates

1. The shared game-completion route is non-atomic and not replay-safe. Session completion, achievements, ritual, XP, grant rows and wallet credit remain split writes. Concurrent requests and partial failures need a reviewed database settlement command and receipt, not an app-only retry. See `orbfield-completion-review.md`.
2. Direct authenticated RPC permissions, duplicate-event handling, the separate wallet read/write sources and server-side validation of client gameplay claims remain release concerns.
3. The synthetic browser workflow is prepared but not executed locally because the earlier loopback browser restriction is respected. No browser access restriction is bypassed. Mobile layout, actual keyboard/focus, Back/Forward and repeated click evidence still need execution in a permitted environment.
4. No real authenticated owner/test-account playthrough, hosted Auth/PostgREST/schema check, production write, migration, merge or deployment occurred.
5. Existing started server sessions abandoned by practice/exit have no cancellation endpoint. Local context is released without inventing a completion; this patch does not promise server-side cancellation or energy recovery.
6. This is not a fully verified play → keepsake → Sanctuary → memory loop. Publication and any settlement/memory expansion require their own reviewed checkpoint.

## Final local verification

The final production-code candidate passed on local Node 24.19.0:

- 480 Vitest tests across 64 files, including 15 real-engine and 13 SDK tests.
- 9 world-asset tests.
- `npm run check`: 0 errors and 0 warnings.
- `npm run check:core` and the Vercel-adapter production build.
- Isolated fixture typecheck: 0 errors and 0 warnings; actual-shell SSR and fixture build passed.
- Playwright discovery: 36 cases across 320/390/1280 widths. **Browser execution not run.**
- Independent review reproduced and then verified fixes for backgrounding during a pending start and multi-touch pointer ownership. No remaining high/medium candidate-code issue was identified within the reviewed scope.
- Final whitespace validation passed. No dependency, lockfile, server endpoint, migration or production configuration change is part of this candidate.

The prepared CI targets Node 22; this local result does not claim that exact-runtime CI passed. The archive records the baseline commit, candidate source-tree hash, complete patch, changed-file hashes and validation logs so the local checkpoint can be reconstructed and reviewed before any publication.
