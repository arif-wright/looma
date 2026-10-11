# Prompt timing diagnostic, never browser acceptance

Local candidate based on published commit `ea8836649a065b99cabe99d08d680c08058a16e8`.
This is an additive, desktop-only investigation. It does not optimize application
code, relax navigation, replace the original 14 cases/21 captures, or establish a
performance regression. No browser or hosted run has been performed for this
local candidate. Full fixture TypeScript/Svelte checks, bundle build and discovery
remain future hosted checks; local TypeScript transpilation is syntax-only.

## Question and controls

Measure the actual published `updatePortalPromptVisibility` callback and its
invocation count alongside Scene.update spans, PRE_RENDER-to-POST_RENDER spans,
POST_RENDER intervals, native trusted keyboard receipts and the unmodified
Playwright keyboard API calls. Candidate invokes the original callback. Bypass
skips that callback only inside this diagnostic's dedicated bundle. Application
source and the normal acceptance entry/config are unchanged.

Run order is two warmup prefixes (candidate, bypass), then measured A-B-B-A.
Run 1 opens a fresh fixture document. Later runs set the mode/run fragment then
explicitly call page.reload before reading readiness; fragment-only navigation
would otherwise reuse the unmounted document. Each fresh document naturally creates its scene at the
same home position, 1472,536. No teleport, camera reset, clock override, synthetic
DOM input, forced collision or gameplay setter is used. Each scene receives at
least 120 actual post-render warmup frames and a 10-second no-input home window.
Real fresh probes verify stable camera, canvas, HUD, controls and prompt geometry
before/after that window, and measured runs must agree on that geometry. The
prompt is fully visible in both arms at home. Two initial prefixes are reported
as warmups and excluded from comparisons; four runs are too few for broad causal
or statistical claims.

The subsequent prefix follows the existing desktop workload through endcap-front:
rear-front walks/dashes, rear side, rear cutaway, perimeter, rear restoration,
then endcap approach. The eight movement/feedback functions are byte-identical
to the published driver, tested through TypeScript AST extraction. All original
8px arrival, 6500ms waypoint deadline, native fine-step bound and >38px swept
clearance checks remain unchanged. The prefix has 27 declared waypoint targets.
Only the diagnostic checkpoint wrapper changes: it adds phase labels, fresh
read-only probes and up to three diagnostic screenshots. It does not evaluate
prompt-visibility acceptance on the deliberately different bypass arm.

Known original navigation guard errors are retained as `navigation_guard_rejected`
and `incompleteRoute: true`. Unexpected errors/timeouts invalidate collection.
A completed collection is never an acceptance pass. The original acceptance job
must still pass its original first-attempt requirements independently.

## Timing interpretation

- Callback `promptMs` is the raw two-clock-read bracket in BOTH arms, including
  branch/timer overhead and possible preemption; candidate also includes the
  original callback and synchronous callees. `promptExecutedCalls` distinguishes
  execution from bypass. Metric writes and snapshot allocations occur outside
  that bracket. No baseline subtraction is made.
- Duplicate or absent callback/listener counts remain explicit anomalies in
  output rather than discarding the diagnostic observation. Candidate execution
  count must equal observed callback count; bypass execution count must be zero.
- Render span measures main-thread wall time from Core PRE_RENDER to our Core
  POST_RENDER listener, registered before the existing fixture observer. It is
  not GPU execution time and excludes the later fixture post-render inspection.
  POST_RENDER-to-POST_RENDER intervals include that previous fixture work and
  our observer/host scheduling overhead. Scene.update is a separate bracket.
- Bypass also changes prompt visibility and subsequent rendering during movement.
  A total-frame difference cannot be attributed solely to callback computation.
  The common visible-prompt neutral window reduces this rendering confound at
  home; it cannot remove process scheduling, thermal, GC or timer uncertainty.
- Neutral results and shared checkpoint-to-checkpoint phases are separated. Only
  the prefix reached by every measured run is comparable by phase. Unequal tails
  are preserved with `comparable: false`. Even matching phases can have different
  dwell times/trajectories; do not infer causality from pooled moving medians.
- Keyboard summaries cover the whole route including unmatched tails and are
  labeled accordingly. Raw records permit phase-aligned follow-up analysis.
  Host API invocation/completion is not the exact protocol wire-send time.
  Trusted DOM key receipts use the browser clock. Before/after clock samples give
  an offset interval, not an exact one-way transport delay. No extra browser
  round trip is added per key call.
- Report count/min/median/p90/p95/p99/max/mean/total, no arbitrary performance pass
  threshold. Raw per-frame and key records remain available. Actual Phaser,
  renderer/WebGL identity, canvas size, device pixel ratio, loop rates, browser,
  Node and runner context are recorded where available. No CPU/GC/GPU profiler
  is installed, and GPU queries/flushes are not performed.

## Bounds and overhead

One test, one worker, no retries, six sequential page/scene lifecycles. Each
prefix step has a 180-second collection cap; the whole six-run test has a hard
22-minute cap and the job a 30-minute cap. These caps overlap: the test may stop
before all six prefixes exhaust their individual limits. Warmup waits are capped
at 30 seconds each; six neutral windows total 60 seconds. Existing asset/startup,
probe and navigation waits remain bounded. A timeout is incomplete evidence,
never a reason to relax the original driver. Historical desktop prefixes suggest
roughly 8–15 minutes of browser collection for six runs, but this is an estimate,
not a validated runtime or acceptance threshold; install/build time is additional.

Per page, preallocated buffers cap at 18,000 frames, 4,096 key receipts, 128 phase
changes and 16 scene lifecycles (about 3.3MB numeric storage). Hot instrumentation
paths use scalar writes, not per-frame JSON/objects. Node logs cap at 4,096 keyboard
calls per run. Snapshot/result objects and up to 18 diagnostic screenshots are
bounded by six runs. Overflow/invalid samples invalidate collection, including
the unchanged fixture's separate 12,000-record motion-buffer overflow flag. Diagnostic
observation itself adds overhead in both arms; the measurements are not a pristine
uninstrumented baseline. The unchanged published callback retains its own bounded
short-lived allocation sites.

## Isolation and future execution

The new Vite config imports the original config and only prepends the observer
import to `main.ts` in its own bundle; it writes `.timing-build`. Original exact
source allowlist, collaborator aliases, credential-free Auth/session transport,
asset bytes, no-env loading and local-only server boundary are inherited. The
unchanged `guard.ts` enforces same-origin allowlisted GET/HEAD assets, forbids API
network/WebSockets, rejects unexpected console/page errors and checks cleanup.
No session starts, rewards, backend/database calls or real account activity are
allowed. Every run calls real `unmountAll`; snapshots require zero canvases,
Auth callbacks, active scenes and prompt listeners afterward.

The added workflow uses the same pinned actions, Node 22 and locked Playwright
Chromium dependency/install route as acceptance. `contents: read`, disabled
checkout credential persistence and no secrets are retained. It checks the exact
published src/static/supabase trees plus SHA-256 of 37 original acceptance and
toolchain files. No production tree changed, so no original tree repins are
needed. The new files are recorded in the job's source artifact. Outputs and
report names are dedicated `.timing-results` / `arpg-prompt-timing-diagnostic`.

Only local preparation/review is currently authorized. Future execution needs
approval to commit these additive files to the existing draft PR branch and
push. That push triggers the new path-filtered PR workflow AND the repository's
existing applicable workflows, including the original acceptance suite; it is
not a diagnostic-only remote side effect. There is no supported workflow-dispatch
tool in this session. No merge/deploy, new permission, dependency, network scope,
source-tree repin, account or database change is proposed. If the head or pinned
source/fixture changes first, stop and re-review exact identities.

## Commands after an approved push, or in an authorized complete checkout

The workflow defines the authoritative hosted sequence. Offline-only tests:

    node --test scripts/testing/arpg-readiness-preview/prompt-timing*.test.mjs

Separate diagnostic report validation (requires actual first-attempt evidence):

    node scripts/testing/arpg-readiness-preview/prompt-timing-report.mjs scripts/testing/arpg-readiness-preview/.timing-results/diagnostic-results.json

Never feed diagnostic results to the original acceptance verifier or describe a
bypass completion as restoring acceptance. Future findings can justify a separate
bounded fix proposal; they do not authorize changing source or guards by themselves.
