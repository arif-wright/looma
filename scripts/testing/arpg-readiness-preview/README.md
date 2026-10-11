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
sides to rear/side cutaways, visit the original northern collision ring, restore their opacity in front, approach the gate from
east and south, press E at the original gate, then use the real return control.
Require a single bounded synthetic expedition and newly owned town images on
return. The original twelve cases above remain, with only exact asset-count and
approved source/asset allowlist updates.

At each viewport, the added perimeter leg starts behind the rear facade at
(1368,210), approaches(1368,-8), holds native W for700ms, and returns to the
previous route. The independent original room/radius38 formula requires the
settled center to stop at y=0.5*x−706 within one15fps movement step. Sustained
post-render north intent must be observed. The case retains its180s budget,
6.5s waypoint deadline,8px target, full swept checks and strict hero/UI visibility.
One active owned Graphics rim must remain at depth−160, beneath the hero's foot
shadow, with an unchanged transform, no legacy town wall sprites, and a new
object identity after return. This drawing never supplies the collision oracle.

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

Fourteen additional PNG captures show each viewport at the rear front, rear cutaway,
nearest legal perimeter contact, endcap cutaway, eastern gate approach, the gate threshold and returned town. Captures are paired
atomically with their observed movement checkpoint. The original seven required
PNG captures are preserved, giving twenty-one required attachments. Appearance,
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
The two additive exploration cases each allow 180 seconds for native movement
and one bounded return. Other original test budgets are unchanged. Native waypoint
steering sends single-key pulses capped at240ms, reserves16worldpx on longer
moves, then obtains a fresh neutral POST_RENDER position in one read-only browser
request. Fine pulses start at16ms; an observed zero-displacement pulse alone ramps
the next hold up to48ms, bounded by remaining distance. Input is released before
feedback is read. Successful released moves do not send five redundant key-ups;
error and outer-case paths retain exhaustive cleanup.

The8world-pixel per-axis target and6.5second per-waypoint deadline are unchanged.
A final released position is checked before deadline rejection, fixing the second
hosted phone failure that had already reached its target. Every lightweight
motion/dash sample, hard overflow failure and fresh checkpoint request/response
remain intact. Offline15/30/60fps checks and provenance-pinned47/64/22ms cadence
replays cover delayed neutral feedback, startup delta clamping, event/frame phase
and hypothetical missed pulses. The second hosted trace actually showed movement
for every navigation press; its failure was dominated by redundant traced reads.
The replay keeps native scheduling assumptions explicit and cannot prove browser
success. Independent8px endpoint errors still leave41.14px minimum clearance
against radius38 solids. The fixture never patches requestAnimationFrame or
advances Playwright's clock.

The strict verifier requires every declared case, one successful attempt each,
no retries/skips/flakes/errors, isolation, exact session counts, genuine lifecycle
checkpoints, cleanup and the twenty-one expected PNG attachments. For the bounded flow
it also requires observed movement, explicit return, frozen town time, matching
submission fields and the exact zero-value presentation payload. Its 254 unit
tests are synthetic report/protocol schema tests, never browser evidence.
Discovery has zero attempts and cannot satisfy execution mode.

## Limits

The persistent local-browser denial remains in force: no local launch,
escalation, alternate flags or alternate browser was attempted. Local preparation
executes zero browser cases. PR17 e73cad94's twelve passing hosted cases are
baseline evidence only. The first larger-plaza hosted run at a728b7f7 passed the original twelve cases but failed both new cases: desktop steering overshot while waiting for feedback, and the entrance hid the phone hero at the threshold. The second head a446a031 again passed the original twelve but exhausted waypoint deadlines before either entrance-cutaway check. Desktop made slow progress through seven pulses; phone reached its target in the final released sample but rejected it after the deadline. The later4545e7ae run passed all14cases and19captures, including the arch cutaway. Those unchanged baseline results do not certify this surface candidate. The new candidate preserves those19captures and adds2perimeter views, with all21required for acceptance. A new authorized hosted run is required. Its architecture is an unfinished
code-native projection prototype, not completed painterly town art. Peripheral
architecture may intentionally leave the viewport as the hero explores.

A scene CREATE and render event establish lifecycle progress, not visually
correct or fully playable pixels. The added flow is deliberately small; it does
not certify attacks, kill/loot balance, floor transitions, a full-length timeout,
real-phone rendering/performance, touch interaction, hosted Auth, real session persistence, server reward settlement,
post-ready account changes or deployment.


## Bounded trace-observability experiment after d873f298

The surface candidate's first hosted run (38102814074, attempt 1) passed 13 of
14 cases. The desktop exploration failed at the existing (1200,260) waypoint,
before the new perimeter leg. Phone exploration passed all its checkpoints.
Only 15 of the required 21 captures exist, so the complete report remains rejected.

The desktop trace measured a median 102.4 ms between native POST_RENDER samples.
Each final requested 16 ms fine keypress consumed one actual 22.0–22.73 px
movement frame. The released position oscillated around y=247.45 and y=269.82,
skipping the unchanged y=252..268 target band. Neutral feedback was correct;
keys were consumed and no collision caused this stall. A longer deadline alone
would not reliably resolve that quantization.

That 48.5-second desktop case also recorded 475 automatic screencast frames,
474 JPEG resources totaling 38,666,615 bytes, and 234 DOM snapshots. The next
bounded experiment disables only automatic trace screenshots and snapshots,
while retaining failure action/event/source tracing. This may reduce diagnostic
capture overhead; causality and improved native cadence remain unproven until
another hosted run. In Playwright 1.57.0, snapshots:false also disables the trace's
HAR/network-resource collection. That diagnostic detail is lost. The fixture's
own complete blocked/request/API observations, exact network/asset allowlists,
loader/decode observations and source/asset hashes remain enforced independently;
no acceptance verifier reads HAR or trace network resources. Native action/event
and source records remain, along with the explicit JSON evidence and PNGs.
No runtime rendering or game setting is changed.

The ordinary failure screenshot and all 21 explicitly attached required PNGs
remain enabled, as do every fresh probe, lightweight motion sample, overflow
guard, continuous collision/dash check, hero visibility/UI bound and synthetic
protocol assertion. Native steering, the 6.5-second waypoint deadline, 8 px
per-axis target, 180-second case budget and no-retry policy are unchanged.


## Bounded native chord correction after ca701a53

The trace-only experiment still failed the desktop route at(1200,260), ending
(1201.037,250.382). It improved this single run's median frame interval from
102.4 to94.8ms and phone case time from98.558 to55.655s, but the frame quantum
remained20.53–20.90px. That still skips the16px-wide target band. Runner load
was not controlled, so the comparison does not establish a causal performance
improvement. Both failed whole reports remain rejected.

The fixture now recognizes two opposite, released16ms fine pulses that both
skip the unchanged8px target on one axis. The other axis must already be within
8px. At the farther bracket endpoint, a single native Playwright chord changes
the movement lattice. Installed1.57 keyboard.press delivers lateral-down,
primary-down, primary-up, lateral-up sequentially. The controller makes no
claim of simultaneous delivery or exact16ms consumption. It keeps the normal
fresh neutral POST_RENDER feedback, and all actual movement samples and sweeps.

Before that chord, a convex envelope is built for0–2 rendered frames in each
leading-cardinal, diagonal, and trailing-cardinal phase. Its per-frame bound is
max(24,1.25×observed fine displacement); supported observed quanta are greater
than16 and at most24px, yielding bounds24–30px. Both lateral directions are
checked against the independently transcribed radius38 solids and original
room. The entire hull must be clear, including either-direction containment.
If neither direction fits, the case fails before issuing an unsafe nudge.
Actual neutral chord feedback must also lie within its selected envelope before
another command can be sent. Remaining lateral error uses ordinary feedback
steering. No production collision helper, position setter, timer change or
alternative movement input is used.

The new replay retains exact cardinal traces from runs38102814074 and38103713681
and explicitly models sequential prefix/diagonal/suffix frames, including
missed chords and alternating measured step sizes. Four native event acknowledgments
are charged at a conservative100ms each even if a phase consumes no update,
followed by the existing neutral-frame read. Both observed wide-clearance failures converge in the stated
single-diagonal-frame models before the unchanged6.5s deadline. Extra diagonal
frames may instead fail that deadline. The alternating d873 step-jitter model
also exhausts6.5s; the corresponding ca701 jitter model converges. This is deliberately bounded support:
constant20.9px full-route stress can still exhaust the deadline at the perimeter;
constant22.36px stress reaches a shop/endcap passage where no safe envelope
fits and is rejected. Those model limits are tests, not claimed browser passes.
All actual routes, named checkpoints,21 PNG requirements,14 cases, collision,
visibility, network and lifecycle gates stay intact. Full hosted execution is
still required to accept this candidate.
