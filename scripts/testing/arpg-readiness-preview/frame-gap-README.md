# Stationary frame-gap diagnostic

Local additive proposal against `751622126a2cd131213bee8accc17eb2ebf65628`.
This continues the timing investigation without changing the application, original
acceptance suite, published prompt diagnostic, geometry, movement or frame clock.
It does not repeat prompt-versus-bypass: the actual prompt callback is enabled in
every run. The original 14 acceptance cases and 21 captures remain independent.

## Evidence motivating this measurement

The prior diagnostic's small Scene.update and Core PRE_RENDER-to-POST_RENDER
spans did not cover the entire game callback. Exact Phaser 3.90 Game.step invokes
renderer.preRender (including framebuffer clear) before Core PRE_RENDER, and the
existing fixture observer runs after the old timestamp. Native RAF timestamps
also precede callback-entry performance.now; subtracting small nested spans from
a frame interval cannot identify a bottleneck.

Phaser's initial cooldown caps smoothed delta near the 60fps target for its first
120 loop frames, then a ten-frame history adapts to actual cadence. Earlier
acceptance steering and warmed diagnostic steering therefore used different
movement-delta regimes. This proposal uses no movement, so native input feedback
and route divergence cannot confound the frame-gap measurement.

## What executes

Six genuinely fresh documents: warmup light/detailed, then measured L-D-D-L.
Later runs explicitly reload the same allowed /preview route after setting the
mode/run fragment; hash-only navigation would reuse the prior document. Runtime
identity is asserted. Each run performs a real pre-collection geometry probe,
then arms a single browser promise:

1. Record exactly 30 post-create collection frames as `early`. These are not
   engine frame zero; native frame/cooldown fields expose the observed post-smoothing cooldown.
2. Wait for ten consecutive focused, visible, zero-cooldown frames as `settling`.
   This permits the smoothing history to turn over without changing it.
3. Record at least ten seconds of focused, visible, zero-cooldown native frames
   as `settled`, then stop collecting automatically.

There are no keyboard calls, navigation, screenshots, probes, DOM geometry reads,
WebGL identity queries or repeated browser polling during collection. Real probe
geometry before/after must match, including canvas/camera/HUD/control/prompt
bounds. Every recorded frame must remain at the actual home position 1472,536
with zero intent, visible document and valid town state. Trusted movement-key
receipts must be zero. The post-create early window can already be partly or
fully unclamped on fast/startup-variable runs; the report exposes the observed
positive-cooldown count rather than inventing a common engine-frame-zero comparison.
The cooldown is read after smoothing/decrement: its last clamped tick has value
zero, so zero alone does not prove that tick was unclamped. The first settled
frame follows the ten-zero-frame settling sequence and full history turnover.

## Light versus detailed, and exact boundaries

Both modes have the same fixed numeric storage, Game.step timing wrapper,
POST_RENDER counter, native RAF time, raw/smoothed delta, native frame index,
cooldown, focus/visibility and player-state reads. The Game.prototype.step wrapper
is installed before any Game is constructed and before Game.start binds it;
installing a loop.callback wrapper too early could be overwritten. Offline tests
exercise binding before and after Scene.init.

Detailed mode adds only two one-time wrappers: the actual instance's
renderer.preRender and the complete existing fixture POST_RENDER callback. Light
returns the original observer callback unchanged and does not wrap preRender.
The dedicated Vite transform changes only observer registration syntax, preserving
the existing callback body byte-for-byte/AST-identically; its receiver, three native
event arguments, return and thrown error remain intact. It never bypasses the
observer. Scene cleanup restores preRender and removes the added scene/game/key
listeners. The Game prototype wrapper is document-scoped and falls through when
no active collecting context exists.

Each frame stores absolute entry/exit times, not merely durations:
- `start` / `end`: immediately around the original Game.step call, including all
  original rendering and POST_RENDER callbacks. In detailed mode it also includes
  the two nested wrappers' overhead. Context lookup/reset precedes `start`.
- `preStart` / `preEnd`: detailed-only actual renderer.preRender, including clear.
- `observerStart` / `observerEnd`: detailed-only full original fixture callback.
- `hookEnd`: timestamp after numeric writes/state reads, before the final scalar
  timestamp write and any completion resolution. `hookEnd-end` exposes that tail.
- `engineTime`: unchanged native RAF timestamp passed to Game.step, not a freshly
  sampled callback-entry clock. `engineFrame`, `rawDelta` and `engineDelta` are
  the actual native engine values, read without modification.

Reported inter-callback gap is next `start` minus prior `hookEnd`. It can contain
TimeStep housekeeping, remaining hook overhead and other browser/compositor/process
work. It is not a pure idle interval. Renderer and observer spans are nested
inside Game.step, so never add them as independent costs. Light/detailed differences
are descriptive overhead controls on the same job, not statistical proof or a
complete uninstrumented baseline. No GPU timers, gl.finish/flush, profiler, renderer
flags, resolution setting, RAF override or delta change is introduced. This can
partition synchronous callback work from gaps but cannot prove GPU versus scheduler
causality. Tail statistics include count/min/median/p90/p95/p99/max/mean; there is
no arbitrary performance pass threshold.

## Bounds and source/transport preservation

Each collection has a 45-second native watchdog. Six collections therefore have
at most 270 seconds of timed collection; setup/asset waits are additional. The
single test is capped at eight minutes and the job at twenty minutes, with one
worker and zero retries. Expected collection is roughly two to four minutes at
previous observed cadences, not a guarantee. Each page has at most 8,000 rows of
24 Float64 fields (1,536,000 bytes), no per-frame JSON/array creation in the added
recorder. Snapshots allocate only after collection. Overflow, invalid samples,
missing/multiple native steps or observers, non-neutral state, focus loss or timeout
invalidate evidence rather than relaxing a guard. The original fixture's independent
12,000-motion cap is checked too.

The original Vite config is inherited: same exact application-module/asset allowlist,
no .env loading, collaborator aliases, credential-free transport and local-only
4281 origin. Original guard.ts enforces allowed GET/HEAD requests, rejects network
API/WebSocket/off-origin traffic and checks error/cleanup observations. No sessions,
rewards or account/database calls are allowed. Every block truly unmounts and must
finish with no active context, Auth callback or canvas. The 52-file preservation
manifest pins the original 37 acceptance/toolchain files and all 15 published
prompt-diagnostic files. Existing src/static/supabase tree pins remain exact; no
repin is required because all additions are outside those trees.

The new job uses the same pinned actions, Node 22, lockfiles, dependency install,
Playwright-managed Chromium and read-only permission as the prior approved jobs.
It adds no permission, secret, dependency or network allowance. Its own build/results
and artifact names are separate. A future approved commit/push to the draft PR
would run the new path-filtered workflow plus existing applicable PR workflows;
that is remote execution and is not authorized by local preparation. No merge or
deploy is proposed.

## Verification status

Only offline unit/schema/lifecycle/source-preservation and syntax checks are run
locally. Mock times are explicitly fabricated, not browser observations. The local
checkout is a reconstructed subset: full semantic TypeScript/Svelte checking,
bundle build, Playwright discovery and real browser lifecycle/performance remain
unrun. Future hosted execution must pass its configured checks before collection.
Independent local review and exact patch/source identities accompany the proposal.

Offline tests in a complete checkout:

    node --test scripts/testing/arpg-readiness-preview/frame-gap.test.mjs

Native first-attempt diagnostic report validation:

    node scripts/testing/arpg-readiness-preview/frame-gap-report.mjs scripts/testing/arpg-readiness-preview/.frame-gap-results/diagnostic-results.json
