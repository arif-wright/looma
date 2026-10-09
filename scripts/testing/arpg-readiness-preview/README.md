# ARPG town readiness and bounded return through the actual scene

Credential-free desktop Chromium fixture for the actual ARPG route, SDK,
`bootGame`, `GameScene`, Phaser 3.90 and checked-in PNGs. It prepares a draft PR
validation gate; discovery/build alone are not browser execution.

## What stays real

- The ARPG route's town-first startup, explicit departure controls, 30-second
  engine-loading deadline, owner watcher, recovery, navigation and unmount.
- The real town session coordinator and expedition logic. Town loading and time
  in town create no reward session. Only an explicit departure plus a validated
  SDK start response starts an expedition.
- SDK request construction, validation, identity bookkeeping and abandonment.
- Phaser renderer construction, real image download/decoding, scene preload and
  create, texture lookup, render events and eventual game destruction.
- In the bounded return case, native mouse/keyboard input, hero movement, the
  scene's return button and elapsed-time accounting.

Auth notifications, transport, peripheral presentation, state-mutation
destinations and navigation plumbing are synthetic. The fetch shim has no
native fallback. Start requests must match the exact SDK body. The first ten
cases forbid signing, completion, player-state refresh and reward mutations.
Only case eleven enables exact-shape synthetic signing/completion/player-state
responses for `fixture-arpg-1`, with a deliberately non-cryptographic signature
and a zero-value receipt. Changed or extra body fields, mismatched submission
values, extra signing/completion calls and all other fetches fail closed.
The receipt reaches in-memory presentation spies only. It proves client flow,
not server validation, real signing, account rewards or persistence.

Native browser traffic is restricted to local fixture JS/CSS and 250 declared
real images (249 loader PNGs plus the CSS cursor). APIs, off-origin URLs,
undeclared paths and WebSockets are rejected; service workers are blocked.
No credentials or hosted backend are used. The Vite build rejects unexpected
application or live-service imports, while explicitly including the real
`expedition.ts` and `townSession.ts` modules.

`observe-scene.ts` wraps only preload to register event listeners before calling
the real preload exactly once. It never invokes readiness or gameplay callbacks,
emits CREATE, mutates scene state, grants kills, teleports, changes timers or
injects textures. It observes scene fields and control bounds after actual render
events. All gameplay actions use browser mouse/keyboard input. Its eager import
means module-import latency is outside this fixture. Raw Phaser CREATE can
follow a caught create failure, so success requires route state, decoded textures
and real post-create frames together.

## Eleven cases

1. Hold the first floor image. Town stays loading with zero sessions, even after
   a forced disabled-button click. Release to real town readiness, still with
   zero sessions. Explicit departure issues one held start request; repeated
   clicks cannot duplicate it and the scene stays in town until its valid response.
2. Return HTTP 503 for that image; fail town loading and independently retry,
   without creating a session.
3. Return invalid PNG bytes with HTTP 200; require missing decoded texture,
   failure without false readiness, and a fresh successful zero-session retry.
4. Hold an image through the actual 30-second route deadline with the native
   clock. Retry and release the old request; the old scene cannot return.
5. Switch owner during town loading; require the route's Refresh page action.
6. Sign out during town loading; require the route's Sign in action.
7. Unmount during loading and release old assets; no scene/canvas returns.
8. Navigate Back to hub while loading; the obsolete scene remains destroyed.
9. Refresh the same owner's token during loading; preserve the original town
   load without starting a session.
10. Mount a replacement route during loading, then unmount the old route. Its
    scoped cleanup cannot destroy the newer town; neither load starts a session.
11. Idle in town, explicitly depart using the real canvas button, move the hero
    with W, and click the real return button before timeout. Require one unchanged
    sign/complete submission, the zero-value synthetic receipt and continued town
    readiness without another session. Native idle intervals before departure
    and after return each exceed this case's synthetic five-second server cap;
    the real scene clock stays off/frozen in town. This is bounded timer isolation,
    not a 90-second endurance run, a two-floor combat clear or production settlement.

The observation artifact retains the actual browser.version(), loader/scene
observations, route state, strict API bodies, named lifecycle/gameplay checkpoints,
cleanup and console/page errors. Only the exact injected HTTP/decode messages
are allowed in their corresponding cases. Five labeled screenshots cover the
initialized town, HTTP/decode/deadline failures and returned town. Traces remain
available on failure. Current source uses registered floor/wall texture keys;
visual correctness still requires review of a genuinely executed screenshot.

## Local preparation and hosted execution

Use Node 22 and the repository's unchanged locked dependencies:

```sh
npm ci --ignore-scripts
./node_modules/.bin/svelte-kit sync
node node_modules/svelte-check/bin/svelte-check --tsconfig scripts/testing/arpg-readiness-preview/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p scripts/testing/arpg-readiness-preview/tsconfig.json
node --test scripts/testing/arpg-readiness-preview/verify-results.test.mjs
node node_modules/vite/bin/vite.js build --config scripts/testing/arpg-readiness-preview/vite.config.mjs
node node_modules/@playwright/test/cli.js test --config scripts/testing/arpg-readiness-preview/playwright.config.ts --list
node scripts/testing/arpg-readiness-preview/verify-results.mjs discovery scripts/testing/arpg-readiness-preview/.results/discovery-results.json
```

A bundle build can run in this reconstruction without its omitted PNG bytes.
The preview server reads all declared PNGs from `static/` and fails before serving
if any is absent. It never generates substitutes. Before an authorized hosted
run, `.github/workflows/arpg-scene-readiness.yml` must pin the final reviewed
integrated source tree. Refresh its `HEAD:src` pin after any subsequent source
change; never substitute a fixture-only build for that full-tree check.
Keep the static/Supabase pins and locked toolchain checks unchanged unless their
reviewed contents actually change. This fixture adaptation does not edit workflows.
The verifier derives its exact eleven-case count from `cases.mjs`; the workflow
itself has no separate numeric case-count setting.

Only in a permitted environment with the full repository assets:

```sh
./node_modules/.bin/playwright install --with-deps chromium
node node_modules/@playwright/test/cli.js test --config scripts/testing/arpg-readiness-preview/playwright.config.ts
node scripts/testing/arpg-readiness-preview/verify-results.mjs execution scripts/testing/arpg-readiness-preview/.results/browser-results.json
```

There is no executable override, custom security flag or alternate launch. The
locked managed Chromium is required. Native clocks are used; this fixture never
patches requestAnimationFrame or advances Playwright's clock.

The strict verifier requires every declared case, one successful attempt each,
no retries/skips/flakes/errors, isolation, exact session counts, genuine lifecycle
checkpoints, cleanup and the five expected PNG attachments. For the bounded flow
it also requires observed movement, explicit return, frozen town time, matching
submission fields and the exact zero-value presentation payload. Its 72 unit
tests are synthetic report/protocol schema tests, never browser evidence.
Discovery has zero attempts and cannot satisfy execution mode.

## Limits

The local browser denial was not retried. Local preparation executes zero browser
cases. Real image decoding, input delivery and rendering remain unverified until
permitted CI actually runs on the full assets and its artifacts are reviewed.
Any CI result applies only to its exact commit.

A scene CREATE and render event establish lifecycle progress, not visually
correct or fully playable pixels. The added flow is deliberately small; it does
not certify attacks, kill/loot balance, floor transitions, a full-length timeout,
mobile/touch, hosted Auth, real session persistence, server reward settlement,
post-ready account changes or deployment.
