# Connected Wilds Phaser presentation

Local implementation candidate, 2026-10-05. Not a publication or live-service verification.

## Presentation

The default Phaser scene now renders Moonberry Grove and Lantern Hollow using existing production character/environment assets plus two newly generated, inspected, alpha-backed illustrations: a lantern portal and cottage. Grove has a narrow, organic forest path and Moonberry spur; Hollow has a warm village plaza and cottage paths. Blocker images come from the same map-local authoritative circles used by client prediction. Transparent canopy overlap gently fades around the local player. The accessible native mount owns the upper-left area title/status; the canvas retains only its small bottom-right area index and in-world portal/actor labels to avoid overlapping duplicate headers.

Player feet use the authority's radius-16 circle and axis-separated movement rejection. The selected area's bounds and blocker collection replace the old fixed Grove prediction geometry. World points remain server-space 960 × 540; display fitting remains the existing Phaser/Svelte lifecycle.

All production actor direction maps, pivots, exact frame ordering and declared FPS are honored. Atlas pages are loaded on demand per visible art/direction/state and shared between actors. Cold inactive pages are evicted immediately toward a soft 16 MiB decoded-RGBA actor-cache target. Currently displayed pages and every page of an active full sequence stay pinned, so live art can exceed the target. Reduced motion requests only its fixed frame’s page. No production character is arbitrarily recolored, rotated, mirrored, or redrawn. Unsupported companion species retain an explicitly labeled fallback rather than adopting another species' art.

Map transitions snap the local actor, remove former-area remote actors/residents, clear follower trails and release held movement input. Players, their companions and residents render only in their own area. Residents are always labeled `Name · Resident` and never added to the human roster. They use authoritative NPC positions, not decorative browser-only wandering.

E prioritizes the nearby portal over gathering. Both prompts use authoritative snapshot proximity; the server still decides whether an action succeeds. `setConnectionActive(false)` freezes prediction and releases touch state. A separate physical-key guard suppresses held movement/interaction keys until a real keyup followed by a fresh keydown. Native repeat events cannot restore movement after transition, disconnect/reconnect, or a Phaser key reset; keys first pressed while inactive are also suppressed until release. Reduced motion stops decorative motes, portal pulsing and sprite animation; it also removes actor interpolation. Real art failures preserve visible scene/actor fallback with explicit unavailable copy.

## Focused verification

- `VITEST=true npx vitest run src/lib/__tests__/worldPhaserPresentation.spec.ts --maxWorkers=1 --minWorkers=1`: 4 passing tests (area filtering, both blocker sets, map-local prediction, world bounds and safe portal arrival).
- `VITEST=true npx vitest run src/lib/__tests__/worldPhaserInputAndCache.spec.ts --maxWorkers=1 --minWorkers=1`: 7 passing tests (held/repeated movement and interaction suppression across travel/reconnect, inactive input, byte-based cold-page eviction, variable page sizes and live-page protection).
- `node scripts/testing/connected-wilds-preview/art-audit.mjs`: checks source/runtime byte equality, exact dimensions, substantial alpha and visible image pixels; SHA-256 receipt checked in beside sources.
- `npm run test:world-assets`: all 9 canonical asset pipeline tests pass.
- The latest full `npm run check` after held-key/cache review passed with 0 errors and 0 warnings. Rerun aggregate verification after any later integration edits.

## Local visual fixture

Run `node scripts/testing/connected-wilds-preview/serve.mjs`, then open the printed local URL. This uses the actual `WorldScene` and production asset paths with clearly labeled synthetic snapshots. No accounts, persistence, authority or rewards are connected. It includes same-area and other-area players/residents to inspect filtering, switching, native keyboard movement, companions, and responsive fit.

Canvas diagnostic attributes expose area, visible player/resident/follower counts, radius-manifest blocker count, local position, facing, art load, connection state and reduced-motion state. They contain presentation state only.

Rendered browser verification was blocked in this executor: direct Chromium launch failed at its socket permission boundary, and the supported cloud browser reported `net::ERR_BLOCKED_BY_CLIENT` for the local fixture URL. Neither restriction was retried or bypassed. Actual source pixels were inspected, but screenshots and interactive desktop/mobile rendering remain unverified until a permitted browser session is available.

Unrun Playwright cases are included at `scripts/testing/connected-wilds-preview/presentation.spec.ts`. They cover production image responses, same-map filtering, explicit Resident labels and movement, authoritative portal prompts/E priority, lost input on disconnect/reconnect, dynamic reduced motion, both areas at 320/390/844/1280 pixels, and repeated round-trip cleanup. Run only in a permitted browser environment with `npx playwright test --config scripts/testing/connected-wilds-preview/playwright.config.ts`. They have not been claimed as passing.

The temporary visual-fixture development server was stopped after verification attempts. No local listener is intentionally left running.

## Memory limits and measured asset-size estimates

The previous 24-page history could retain roughly 96 MiB when pages are 4096 × 256 × 4 bytes. It is replaced by a byte-based 16 MiB actor-cache target with no three-second cold-page grace. Page eviction uses actual manifest dimensions. The target is soft because currently displayed pages and pages required to play active sequences must remain available; it is not a total scene budget or a measured GPU limit.

The existing 25-frame S idle sequence for each canonical body/Muse/Echo is 6.25 MiB decoded RGBA across its two pages. Three simultaneously distinct active sequences therefore require 18.75 MiB even with no history; four require 25 MiB. Larger mixed-direction/state crowds can require more. In-flight requests and the previously displayed page while a new direction loads can add temporary overlap. Labels, masks, rendering buffers, browser-side image copies and driver overhead are additional.

Summing width × height × 4 for the 12 fixed scenery PNGs currently loaded by Phaser gives about 35.50 MiB before actors. Full-resolution source art therefore already exceeds the old 32 MiB prototype scene target. This candidate does not claim that target, a mobile frame-rate floor, GPU memory compliance, or leak-free physical-device performance. Optimized approved runtime derivatives and actual desktop/mobile profiling remain required before visual-performance approval. Source pixels are preserved in this change.

Canvas diagnostics now expose loaded actor-page count, estimated decoded actor MiB, protected active/displayed MiB and the soft cache target. These values are manifest-based allocation estimates, not GPU measurements.
