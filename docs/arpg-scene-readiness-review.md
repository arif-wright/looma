# ARPG scene initialization recovery

Draft-PR preparation candidate, 2026-10-09. The earlier six-file local review
bundle is preserved separately. Base: released main
`b72484bcf7693c4e2ef37a71e5f7dd9e59cfc95c`, root tree
`47730eaac1e62f23c2b2b28beb7583b77e114974`, source tree
`1a4751e650e015656492ece5a484964d79ccee1d`.

## Problem and bounded change

ARPG previously resolved `bootGame` as soon as `Phaser.Game` was constructed.
Phaser loads scene assets and calls `create()` later. The page therefore cleared
its existing 30-second startup deadline and stopped watching startup ownership
before the scene was initialized. A failed image or stalled scene could leave a
nominally live session without the scene needed to play.

`bootGame` now resolves only when its own scene has queued and obtained every
required image, completed scene setup, and received Phaser's scene `CREATE`
event. The page's existing startup timeout, account-change/sign-out handling,
unmount cleanup and explicit new-run recovery remain active until that boundary.
The page and session/reward/backend code are unchanged.

- Each boot owns its scene callbacks, cancellation and renderer. A newer boot or
  matching-container shutdown immediately invalidates the earlier owner and
  rejects its pending promise, including while imports or assets are pending.
- An asset `loaderror`, missing queued texture, or exception in preload/create
  rejects startup. Missing-texture checking matters because Phaser can finish
  image processing after a decode failure without emitting `loaderror`.
- Scene preload/create/update and game-over callbacks ignore obsolete owners.
  Phaser destroys a game on its next frame, so requesting `destroy(true)` alone
  is not sufficient to stop late callbacks.
- Failed, cancelled and replaced scenes cannot resolve readiness or settle a
  newer run. The shared static game-over callback has been removed.
- A fresh retry gets a new scene and renderer. Existing session abandonment and
  daily-limit semantics apply; no failed start is silently replayed.

This implements the separate engine-boundary follow-up described in
`start-session-recovery-review.md`; it does not change that historical release's
evidence or acceptance status.

## Local validation

Run on Node 22 with the locked project and recovery-DOM dependency sets:

```sh
./node_modules/.bin/svelte-kit sync
VITEST=true node node_modules/vitest/vitest.mjs run \
  src/lib/__tests__/arpgBootStartRecovery.spec.ts \
  src/lib/__tests__/arpgBootSceneReadiness.spec.ts \
  src/lib/__tests__/arpgGameSceneReadiness.spec.ts \
  --pool=forks --poolOptions.forks.singleFork=true --retry=0 --allowOnly=false
VITEST=true node node_modules/vitest/vitest.mjs run \
  --pool=forks --poolOptions.forks.singleFork=true --retry=0 --allowOnly=false
node scripts/testing/recovery-dom/node_modules/vitest/vitest.mjs run \
  --config scripts/testing/recovery-dom/legacy.config.mjs --retry=0 --allowOnly=false
npm run check
npm run check:core
npm run build
```

- 29 focused cases pass: 5 retained boot ownership cases, 12 startup-readiness
  cases and 12 real `GameScene` method cases with Phaser effects stubbed.
- The full root unit suite passes: 951 cases in 88 files, none skipped.
- 17 legacy component-DOM cases pass, including the ARPG page's deferred-boot
  timeout, account change, unmount and explicit retry behavior. The boot module
  is mocked in that DOM suite.
- Full Svelte diagnostics: 0 errors and 0 warnings. Core type check and build pass.
  Core types explicitly exclude ARPG; full Svelte diagnostics include it.
- A separate retained regression fixture shows the released constructor-only
  boot resolving with no scene-ready event, while this candidate stays pending
  and can be cancelled. It does not run the real Phaser renderer.
- A read-only Git catalog check enumerates the 249 images actually queued by
  preload and verifies their nonempty blob entries against ARPG subtree
  `ce363d5ff05c8a4a71537bf16d15b85eb1916eb3`, reached from the released root's
  unchanged static tree `93f203a8e01263a0066e1632cf2a6d9bd062de5b`.
  All 249 paths match. The local reconstruction omits these PNG bytes; they were
  not downloaded, decoded or rendered in this task.

The publication candidate extends the existing startup runner and strict unit
selection to 136 cases, including the new 24 ARPG cases. The startup workflow,
recovery native-layout candidate and disposable PostgREST source pins are
updated to the reviewed source tree `c7342a54a765e88007bdfedceced679b3c32a7c1`.
Historical baseline, static/Supabase identities, dependency allowlists and
isolation/privilege guards are preserved.

A new additive `arpg-scene-readiness.yml` workflow composes the actual ARPG route,
SDK and Phaser engine with synthetic Auth/start/leaderboard transport. It
prepares ten browser cases with a native 30-second deadline, actual image
failure/decode failure, cancellation, owner changes and independent retry.
Local build/type/discovery preparation is not browser execution. See
`scripts/testing/arpg-readiness-preview/README.md` for the exact test matrix,
isolation boundary, strict evidence verifier and known texture-key defect.

## Remaining real-engine acceptance

No browser was launched for this candidate. The previously denied local browser
launch was not retried. The earlier 42 maintained-shell startup browser cases use
synthetic engines and do not cover this new boundary.

In a permitted browser environment with the exact candidate and actual Phaser:

1. Hold one real image request pending. Confirm the route remains in startup,
   repeated controls cannot create another session, and the 30-second deadline
   aborts loading with explicit recovery. Releasing the old request must not
   restore the scene or finalize a session.
2. Fail an image download and separately return undecodable image bytes. Confirm
   each rejects startup, the old renderer is eventually removed, and one
   explicit retry creates an independent scene. No automatic session replay.
3. During asset loading, change account, sign out, navigate away and unmount;
   then release old assets. Confirm no old ready/game-over callback, old canvas
   or page cleanup can take over or destroy a newer run.
4. Let actual assets decode and scene initialization complete. Inspect the first
   rendered scene, dungeon/player/HUD, keyboard/pointer controls and a normal
   run/retry. Include narrow/mobile layout and the real input modalities needed
   for any mobile-readiness claim.

Successful boot completion through the owned scene’s `CREATE` listener
establishes initialization only. It does not prove a
first successful render, visual correctness, usability, mobile controls, hosted
Auth, session settlement, reward delivery or post-ready account changes. The
startup deadline still belongs to the route; a direct caller without a signal
must cancel/shut down a stalled boot itself. There is no new independent timeout
inside `bootGame`.

The user authorized publication as a draft PR for real-browser CI validation.
This preparation does not merge, deploy, bypass checks, change credentials or
billing/security settings, apply migrations, or mutate a live database.
