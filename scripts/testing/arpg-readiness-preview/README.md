# ARPG startup through the actual scene

Credential-free desktop Chromium fixture for the actual ARPG route, SDK,
`bootGame`, `GameScene`, Phaser 3.90 and checked-in PNGs. It prepares a draft PR
validation gate; discovery/build alone are not browser execution.

## What stays real

- The ARPG route's automatic start, disabled/repeated start control, 30-second
  engine-loading deadline, owner watcher, recovery action, navigation cleanup
  and unmount behavior.
- SDK start validation, identity bookkeeping and abandonment.
- Phaser renderer construction, its image download/decoding pipeline, the real
  scene's preload/create, texture lookup and eventual game destruction.

Only Auth notifications, start/leaderboard transport, peripheral presentation,
state mutation destinations and navigation plumbing are synthetic. The fetch
shim has no native fallback. Signing/completion/reward requests are forbidden.
Native browser traffic is restricted to the local fixture's built JS/CSS and
250 declared real images (249 loader PNGs plus `cursor_gauntlet_blue.png`
for the CSS cursor); APIs, off-origin URLs, undeclared paths and WebSockets
are rejected. Service workers are blocked. No credentials or hosted backend is
used. The Vite build rejects unexpected application or live-service imports.

`observe-scene.ts` wraps only preload to register event listeners before calling
the real preload exactly once. It never invokes a readiness callback or emits
CREATE. Its eager import means module-import latency is outside this fixture.
The recorded `createAt` is a raw Phaser event: Phaser may emit CREATE after the
scene's create method caught a failure. Successful readiness therefore requires
both the actual route's live state and real decoded-texture/event observations.

## Ten cases

1. Hold the first floor image before navigation/autostart. The actual route must
   stay Starting with one session until release, then become live after real
   scene initialization. This catches the old constructor-only handoff.
2. Return HTTP 503 for that image; require startup failure and independent retry.
3. Return invalid PNG bytes with HTTP 200; require missing decoded texture,
   failure without false route readiness, and a successful fresh retry.
4. Hold an image through the actual 30-second route deadline using the native
   clock. Retry and release the old request; the old scene cannot return.
5. Switch owner during asset loading; require the route's Refresh page action.
6. Sign out during loading; require the route's Sign in action.
7. Unmount during loading and release old assets; no scene/canvas returns.
8. Navigate Back to hub while loading; obsolete scene remains destroyed.
9. Refresh the same owner's token during loading; keep the original start.
10. Mount a replacement route while the old route is loading, then unmount the
    old route. Its scoped cleanup cannot destroy the newer live scene.

The guard retains actual browser.version(), scene/loader observations, route
state, API attempts, cleanup and console/page errors. Only exact injected HTTP
503/decode messages in their corresponding cases are allowed console errors.
Cleanup failures are attached before the test fails. Four labeled screenshots
capture the initialized view and the HTTP, decode and deadline failure screens.
Traces are retained on failure.

## Local preparation and hosted execution

Use Node 22 and the repository's unchanged locked dependencies:

```sh
npm ci --ignore-scripts
./node_modules/.bin/svelte-kit sync
node node_modules/typescript/bin/tsc --noEmit -p scripts/testing/arpg-readiness-preview/tsconfig.json
node --test scripts/testing/arpg-readiness-preview/verify-results.test.mjs
node node_modules/vite/bin/vite.js build --config scripts/testing/arpg-readiness-preview/vite.config.mjs
node node_modules/@playwright/test/cli.js test --config scripts/testing/arpg-readiness-preview/playwright.config.ts --list
node scripts/testing/arpg-readiness-preview/verify-results.mjs discovery scripts/testing/arpg-readiness-preview/.results/discovery-results.json
```

A bundle build can run in the local reconstruction without its omitted PNG
bytes. The preview server reads all declared PNGs from `static/` and fails before
serving if any is absent. It never generates substitutes. The CI workflow uses
a full checkout and pins the reviewed source, static assets and Supabase trees.

Only in a permitted environment with the full repository assets:

```sh
./node_modules/.bin/playwright install --with-deps chromium
node node_modules/@playwright/test/cli.js test --config scripts/testing/arpg-readiness-preview/playwright.config.ts
node scripts/testing/arpg-readiness-preview/verify-results.mjs execution scripts/testing/arpg-readiness-preview/.results/browser-results.json
```

There is no browser executable override, custom security flag or alternate
launch. The locked managed Chromium is required. Native clocks are used; this
fixture never patches requestAnimationFrame or advances Playwright's clock.

The strict verifier requires all ten declared cases, one successful attempt
each, no retries/skips/flakes/errors, isolation observations, cleanup, expected
session counts and the four PNG attachments. Discovery has zero attempts and
cannot satisfy the execution mode. Its own unit tests are synthetic report
schema tests, never evidence that a browser ran.

## Limits

The local browser denial was not retried. Local preparation executed zero
browser cases; hosted draft-PR CI is the next execution gate. Real image decoding
and rendering are unverified until that gate actually runs and its artifacts
are reviewed. Any later CI result applies only to its exact commit.

The existing floor/wall texture-key mismatch is deliberately unchanged: preload
registers `floor_0`/`wall_0` keys, while the room builder selects URL strings.
Phaser can substitute missing textures despite successful initialization. The
success screenshot is explicitly labeled with this known visual defect.

A scene CREATE and a subsequent render event establish lifecycle progress,
not visually correct or playable pixels. This gate does not certify gameplay,
mobile/touch controls, hosted Auth, real session persistence, reward settlement,
post-ready account handling, or deployment. New dungeon/town features belong
to a separate change.
