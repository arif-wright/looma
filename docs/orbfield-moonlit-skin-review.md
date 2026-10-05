# Orbfield Moonlit Conservatory: local review

The user approved the Moonlit Conservatory concept. This candidate implements that direction with actual illustrated sprites and background art, and leaves the dodge simulation and reward settlement unchanged.

## Scope

- New lightweight renderer and bounded local-image preload.
- Approved painted background, pearl player, amber thorn hazards, and canonical Muse portrait.
- Matching intro, HUD, controls, visual legend, pause/results styling.
- No camera, world size, speed, collision radius, score, spawning, duration, reward, API, database, or publication changes.

The source base is PR #9 head `1a3f7c4a51682830fd19948d4ed46d9b15849536`, represented locally by the existing exact-fb417fe checkout plus the test-only PostgREST release gate. Product code is identical to `fb417fe4839d400d5b7e8afad008f2c408e6fff1` before these changes.

## Loading and cleanup

Four same-origin image assets preload on component mount. Start waits for the bounded preload before creating a server session. A load/decode error preserves usable assets and selects a stable high-contrast fallback for missing ones. No asset changes during a round. The loader has a four-second cap, clears handlers/timers, cancels pending requests on unmount, and ignores late decode callbacks. Existing generation-token checks prevent late navigation from creating a session or engine. Reduced-motion preference is read without adding listeners.

## Verification

- Focused engine/skin unit tests: 26 passing, including deterministic loaded-versus-fallback simulation parity.
- Full repository unit suite: 608 passing across 67 files.
- Full Svelte/TypeScript check: 0 errors, 0 warnings.
- Core TypeScript check: passed.
- Isolated component Svelte check: 0 errors, 0 warnings.
- Server-render check: passed; no session, network, or engine start during SSR.
- Isolated preview build: passed with all four actual runtime assets included.
- Full production build: passed.
- Independent code/art review: no blocking simulation or lifecycle issue; source anchors, transparency, asset sizes, and collision-disc alignment checked.
- Browser cases: 48 discovered across 320px, 390px, and desktop, including 12 new loaded-art/failure/reduced-motion/orientation/preload-navigation cases. They have not run for this candidate.

The previously denied local browser route was not retried or bypassed. The prepared credential-free CI workflow is the next verification route after publication is authorized. It serves only the four allowlisted art assets, checks that real artwork decoded, and includes the renderer/assets in source identity output. Existing lifecycle tests now explicitly wait for decoded artwork and a playing phase.

## Remaining release gates

1. Execute the prepared browser workflow against the exact candidate commit.
2. Inspect actual-size phone/desktop screenshots and the real-engine/paused/warp/fallback/orientation captures. The concept board is not implementation evidence.
3. Confirm hazard/player separation at 320px, edge-entry contrast, and Muse overlap readability.
4. Check replay, touch drag, keyboard focus, pause/resume and leaving during asset load in the browser evidence.
5. Measure frame time on a representative phone before making performance claims. Current implementation has one image draw and veil per background frame, no extra canvas cache or blur.

No code or assets have been pushed, merged, or deployed by this local task.
