# Neon Run local repair candidate

## Source and scope

Baseline: `arif-wright/looma` commit `b804421646f915fc8dc48f8c4f0b31e1b7ea82d3`, root tree `a3910822d4e2b9a33d76d05236633a42079ec7f5`. This is a local-only candidate. No push, PR update, merge, deployment, live SQL, account, real gameplay, credential, or spending action is part of this work.

The runner route now mounts its own session shell directly. The generic `GameWrapper`, other games, shared SDK, server completion/sign/event handlers, and Supabase migrations remain unchanged. The current atomic session receipt flow is reused.

## Lifecycle and truthful results

- Mounting opens no session and starts no gameplay; it may preload the five cosmetic assets. Starting, saving and retrying are single-flight at the shell boundary. Every new run gets a fresh generation and server session.
- Early losses remain real short runs. Runs below the server's minimum active duration show **Practice run** and make no completion request. No duration padding, waiting screen, fake survival, or speculative award.
- The HUD reads the engine's authoritative score, active duration, distance and pickups. Slow-Mo's simulation time and Dream Surge's score multiplier are reflected without a second wall-clock score approximation.
- Failed/unknown completion keeps the same frozen result, nested power-up counts and SDK session. **Retry saving** resubmits the same payload/session so the existing immutable receipt can be recovered. The shell does not call XP/shard award helpers or legacy local progression listeners. Only the confirmed response is displayed.
- Retry context is page-local. Explicitly starting again or leaving drops local retry bookkeeping; it does not reverse a server save. Reload recovery is not added by this candidate.
- Collision is reported as `success: false`; only reaching the server's maximum run duration is success. This corrects the old `score > 0` victory classification. Settlement formulas and caps are unchanged.
- Navigating away or unmounting invalidates pending continuations, removes the engine and releases local session state. Late start responses are abandoned locally; late save responses cannot overwrite a new page or apply ritual UI state.
- Blur or hidden-tab events pause play. Backgrounding during a pending start produces a paused run when startup completes. Returning to the tab does not automatically resume or jump.

## Engine changes and preserved rules

The gravity, jump velocity, base speed, acceleration, obstacle size/rate ranges, pickup probabilities, hitboxes, shield behavior and all six power-up durations/effects remain the original values. The six types are Shield, Magnet, Double Shards, Slow-Mo, Dash and Dream Surge. This candidate is not a difficulty rebalance.

Three explicit correctness changes affect how the original rules are applied:

1. **Stable world geometry.** Every display uses a logical 960×540 world. Previously CSS viewport dimensions changed warning distance (especially on narrow phones), player position and ground height, including during a jump on resize. Now the canvas is CSS-scaled while the simulation stays fixed. At 320px width the 34×42 player hitbox renders approximately 10–11×13px; artwork detail/readability at that scale still requires actual browser captures. Fixed geometry alone does not certify mobile visual quality.
2. **Two clocks.** Active bounded frame time determines run duration and the server's maximum-duration stop. Slow-Mo scales a separate simulation clock used for physics, spawn progression and score. Paused or dropped-background time is never counted. A stalled frame is capped at 50ms to avoid teleporting through obstacles or inflating results. Power-up timers retain their existing active-frame-time countdown.
3. **Authoritative distance.** Displayed distance accumulates the same world movement used by the engine (including Slow-Mo and Dream Surge), replacing the independent `wall time × 0.18` estimate. It remains a game distance stat, not an extra payout.

Keyboard handling is canvas-scoped. Space/ArrowUp work while focused; repeats, modifiers and paused input are ignored. A single primary-pointerdown handler replaces the old engine/component pointer, touch and click overlap. An accessible Jump button uses the same engine action. No double-jump is introduced.

Pause cancels RAF rather than spinning an idle loop. Resume schedules one frame and resets its time origin. Reset stops the run and clears counters, world objects and power-up state; a new explicit start is required. Destroy is terminal and removes inputs and frames. Maximum duration and collision each emit one completion.

## Optional focused and fullscreen views

Focus view is an explicit local layout choice, never automatic. It hides explanatory header/footer space, keeps readable HUD/buttons, and letterboxes the unchanged 960×540 canvas with `object-fit: contain`. Landscape receives a compact toolbar and play panel; portrait shows a nonblocking suggestion to turn the phone sideways. Ordinary portrait still has very small in-play characters. Larger canonical character portraits on the intro establish identity without misrepresenting collision bounds during play.

A Fullscreen button appears only when the browser advertises support. It makes a native request only after an explicit click, with focus-only layout and a clear message if the request fails. Orientation is never locked or requested. Leaving, closing focus view, or unmounting exits only fullscreen owned by this shell. A late fullscreen grant after navigation or canceled view intent is released using the captured original target. Unrelated fullscreen elements are not touched. Pause/resume and the active session are independent of view mode; background blur still pauses and never auto-resumes.

The browser fixture includes an 844×390 landscape project and explicitly synthetic Fullscreen API success/rejection/unsupported/late-grant cases. These test shell logic in a future browser run; they do not certify native fullscreen support or device orientation behavior.

## Verification and boundaries

The final archived evidence records the exact file hashes, test outputs and independent review. The integrated candidate passes 654 Vitest tests across 71 files, full Svelte check (0 errors/0 warnings), core typecheck and production build. Fixture Svelte check, SSR, production build and 116-case discovery across four viewports pass; none of those 116 browser cases has been executed locally. The mechanics-only checkpoint passed 639 Vitest tests across 70 files, 9 existing world asset tests, full Svelte check (0 errors/0 warnings), core typecheck, production build and `git diff --check`. Twelve new deterministic real-engine cases cover all six naturally collected power-ups, score math with effects, early collision, fixed-width parity, pause/input/reset/destroy, the exact server cap, and loaded-art/fallback/reduced-motion state equality. Fourteen skin tests cover image loading/cancellation/dimension checks, all six source crops, collision-aligned drawing, reduced motion and failure fallback. The independent reviewer separately passed 130 SDK/settlement/event tests, core typecheck and engine lifecycle assertions with no actionable findings.

The credential-free fixture imports the real NeonRun shell and engine, with explicit memory-only SDK/audio/navigation mocks and a separately labeled deterministic lifecycle engine. It has source import and browser request allowlists. Typecheck, SSR, build and discovery are preparatory checks; they do not prove a browser run.

**Browser execution remains unrun in this local environment.** An existing explicit cloud-browser loopback denial is respected. The prepared CI workflow must be published/run only after separate authorization. Inspect 320px, 390px, desktop and landscape screenshots, real keyboard/touch/pause/resize/cleanup, same-session retry and interrupted flows before claiming browser or mobile readiness. Authenticated hosted gameplay and live reward/database probes remain separate, unexecuted gates.

The test-only PostgREST bootstrap strictly pins the complete `src` tree. After independent review, this candidate updates that pin to `8c73a1c899b8fe3eb43380393e795b825589a4a3`. The unchanged Supabase tree and whole-tree equality requirement must remain intact; the pin update is not a live SQL operation or evidence that the native/PostgREST suites ran locally.

## Lanternway art

The draw-only skin uses five runtime WebPs (429,150 bytes total), including reused canonical adventurer/Echo walk frames, generated town/ground artwork and six distinct pickup symbols. A four-second abortable all-or-nothing loader validates exact atlas dimensions and decoding before opening a session. Failure keeps the original primitives playable; images never swap mid-run. Motion preference suppresses decorative bob/animation/ground scrolling without changing physics. See `docs/neon-run-lanternway-art.md` and its manifest/provenance for source hashes, crop bounds and offline render evidence. Offline native-canvas compositions and mathematical 320px/390px downscales are explicitly not browser screenshots or mobile verification.
