# ARPG readiness, native plaza exploration and viewport evidence

Credential-free desktop Chromium fixture, including phone-sized viewport cases,
for the actual ARPG route, SDK,
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
cases and the phone-sized preview forbid signing, completion, player-state refresh
and reward mutations.
Only cases eleven, thirteen and fourteen enable exact-shape synthetic signing/completion/player-state
responses for `fixture-arpg-1`, with a deliberately non-cryptographic signature
and a zero-value receipt. Changed or extra body fields, mismatched submission
values, extra signing/completion calls and all other fetches fail closed.
The receipt reaches in-memory presentation spies only. It proves client flow,
not server validation, real signing, account rewards or persistence.

Native browser traffic is restricted to local fixture JS/CSS and 258 declared
real images (257 loader PNGs plus the CSS cursor). APIs, off-origin URLs,
undeclared paths and WebSockets are rejected; service workers are blocked.
No credentials or hosted backend are used. The Vite build rejects unexpected
application or live-service imports, while explicitly including the real
`expedition.ts`, `townSession.ts` and `assets/townCorner.ts` modules. The worn-paving source replaces the prior material URL under the same loader key; four exact foundation/upper facade PNG URLs are added. Source modules townPlaza.ts and assets/townFacadeData.ts are explicitly allowed. Existing shop, lantern and entrance remain allowlisted. The superseded small cobble patch is no longer queued or allowlisted.
The real scene derives its continuous ground plane from the approved material
PNG without fixture-generated substitute art.

`observe-scene.ts` wraps only preload to register event listeners before calling
the real preload exactly once. It never invokes readiness or gameplay callbacks,
emits CREATE, mutates scene state, grants kills, teleports, changes timers or
injects textures. It observes scene fields and control bounds after actual render
events. All gameplay actions use browser mouse/keyboard input. Its eager import
means module-import latency is outside this fixture. Raw Phaser CREATE can
follow a caught create failure, so success requires route state, decoded textures
and real post-create frames together.

## Fourteen cases

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
    and after return each exceed this case's synthetic twenty-second server cap;
    the real scene clock stays off/frozen in town. This is bounded timer isolation,
    not a 90-second endurance run, a two-floor combat clear or production settlement.
    Capture a desktop canvas close-up of the new town art before departure.
12. Load the real scene at a 390×844 viewport with zero session starts. Require
    all 257 source textures, the instantiated ground/shop/lantern/entrance objects, a
    nonempty canvas within the viewport width, and no horizontal document overflow.
    After actual render, require HUD/control panels and visible text within the
    canvas, the hero ground point clear of both panels, and the full shop bounds
    inside the unobstructed band between them. The new entrance and its live
    gate-label bounds must also fit the same clear band. Require a portrait
    canvas at least 480 CSS pixels tall, with visible hero alpha bounds at least
    12×24 CSS pixels and entrance alpha bounds at least 60×60 CSS pixels. These
    modest display-size floors do not certify playability or aesthetics.
    Capture the full phone-sized viewport. This runs desktop Chromium without
    mobile-device or touch emulation; it does not establish phone playability.

13–14. Desktop1280×900 and phone-sized390×844 native exploration: walk into the
rear and endcap foundations, activate three real directional dashes whose full
230px rays intersect a facade but whose endpoints clear it, walk around reachable
sides to rear/side cutaways, restore their opacity in front, approach the gate from
east and south, press E at the original gate, then use the real return control.
Require a single bounded synthetic expedition and newly owned town images on
return. The original twelve cases above remain, with only exact asset-count and
approved source/asset allowlist updates.

The original twelve cases keep full per-render observations. The added cases request expensive full geometry/alpha probes only after native keys are released. Each checkpoint must carry a new request ID and request/response timestamps from a later real POST_RENDER frame; stale cached geometry cannot pass. Initial creation and area transitions still obtain actual full state. Every frame continues to supply a lightweight motion/dash/intent sample.

The added observer records a bounded (maximum12,000 entries, overflow fails)
post-render movement trace, real ECS dash cooldown/direction, and stable WeakMap
identities for the five named town images. Every consecutive town movement segment
must clear all three independent radius38 footprints. Dash evidence requires an
observed cooldown activation and an isolated crossing ray, so an endpoint-only
collision implementation cannot pass. Checkpoints retain source pivots, scale,
front/behind depth, opaque foundations, translucent upper layers, alpha restoration,
fixed camera zoom, measured hero size and actual UI/entrance/prompt bounds. A bounded read-only alpha diagnostic samples every third opaque hero source pixel against higher-depth images at their actual transforms: at least half must retain50% transmission, and mean transmission must remain at least40%. This catches an additional opaque layer hiding the hero while the target roof correctly reports0.28alpha. It is an analytical source/depth check, not framebuffer pixel proof. World
positions and expected polygons are independently transcribed constants; no
production collision or camera helper is imported as the acceptance oracle.

Twelve additional PNG captures show each viewport at the rear front, rear cutaway,
endcap cutaway, eastern gate approach, the gate threshold and returned town. Captures are paired
atomically with their observed movement checkpoint. The original seven required
PNG captures are preserved, giving nineteen required attachments. Appearance,
pixel occlusion, paving quality and navigation feel still require actual screenshot
review; object alpha and geometry do not prove final composited pixels. Synthetic
schema factories are imported only by verifier tests, never browser code.

The observation artifact retains the actual browser.version(), loader/scene
observations, route state, strict API bodies, named lifecycle/gameplay checkpoints,
cleanup and console/page errors. Only the exact injected HTTP/decode messages
are allowed in their corresponding cases. Seven labeled screenshots retain the
existing initialized-town, HTTP/decode/deadline and returned-town captures, and
add desktop-canvas and 390×844 art previews. Ground checks require exactly one
derived plane and entrance, zero legacy town floor images or oversized geometric
markers, unchanged gate contact, and opaque native-canvas samples at five points
on the hero-to-gate line. The same checks run after returning and idling in town.
These samples establish bounded coverage, not seamlessness or artistic quality.
The actual derived-ground texture must report LINEAR filtering before departure
and after return; this is checked independently of the production painter. Visual observations record the actual
viewport, canvas bounds, document width, decoded art keys, and real hero/shop/
lantern/floor/entrance position, origin, scale and depth. Checks preserve the measured shop
foot anchor and floor-below-actors ordering; they do not certify pixel-perfect
occlusion or artistic quality. Traces remain available on failure. Actual
screenshot review is still required, including cropped HUD or controls at narrow
widths even when the page itself does not overflow. The strengthened phone gate
projects real object bounds with Phaser’s actual post-render camera matrices;
it does not use the production viewport-layout helper as its geometry oracle.
For readable-size checks, already decoded hero/entrance frames are copied at
1:1 into detached analysis canvases. Cached alpha≥32 pixel bounds are projected
through the real object and camera transforms. These canvases never enter the
DOM or Phaser texture manager, and never replace scene pixels. Transparent
256×256 hero-frame padding therefore cannot satisfy the visible-size checks.

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
The verifier derives its exact twelve-case count from `cases.mjs`; the workflow
itself has no separate numeric case-count setting.

Only in a permitted environment with the full repository assets:

```sh
./node_modules/.bin/playwright install --with-deps chromium
node node_modules/@playwright/test/cli.js test --config scripts/testing/arpg-readiness-preview/playwright.config.ts
node scripts/testing/arpg-readiness-preview/verify-results.mjs execution scripts/testing/arpg-readiness-preview/.results/browser-results.json
```

There is no executable override, custom security flag or alternate launch. The
locked managed Chromium is required. The bounded movement/return case has a
120-second test budget so both native town-idle intervals exceed the synthetic
twenty-second cap, with headroom for software-rendered frames and browser input.
The two additive exploration cases each allow 180 seconds for native movement and one bounded return. Other original test budgets are unchanged. Native waypoint steering sends bounded single-key pulses, then confirms a neutral-input frame before reading position. It keeps the8world-pixel per-axis target, now enforced again at settled checkpoints. Offline15/30/60fps checks and a provenance-pinned replay of the failed hosted47ms cadence with delayed feedback exercise convergence; even independent8px endpoint errors leave41.14px minimum clearance against radius38 solids. The6.5second per-waypoint deadline still fails on a real stall. Native clocks are used; this fixture never
patches requestAnimationFrame or advances Playwright's clock.

The strict verifier requires every declared case, one successful attempt each,
no retries/skips/flakes/errors, isolation, exact session counts, genuine lifecycle
checkpoints, cleanup and the nineteen expected PNG attachments. For the bounded flow
it also requires observed movement, explicit return, frozen town time, matching
submission fields and the exact zero-value presentation payload. Its 196 unit
tests are synthetic report/protocol schema tests, never browser evidence.
Discovery has zero attempts and cannot satisfy execution mode.

## Limits

The persistent local-browser denial remains in force: no local launch,
escalation, alternate flags or alternate browser was attempted. Local preparation
executes zero browser cases. PR17 e73cad94's twelve passing hosted cases are
baseline evidence only. The first larger-plaza hosted run at a728b7f7 passed the original twelve cases but failed both new cases: desktop steering overshot while waiting for feedback, and the entrance hid the phone hero at the threshold. This repair keeps all safety/readability gates, adds two threshold captures, and requires a new authorized hosted run against its exact commit. Its architecture is an unfinished
code-native projection prototype, not completed painterly town art. Peripheral
architecture may intentionally leave the viewport as the hero explores.

A scene CREATE and render event establish lifecycle progress, not visually
correct or fully playable pixels. The added flow is deliberately small; it does
not certify attacks, kill/loot balance, floor transitions, a full-length timeout,
real-phone rendering/performance, touch interaction, hosted Auth, real session persistence, server reward settlement,
post-ready account changes or deployment.
