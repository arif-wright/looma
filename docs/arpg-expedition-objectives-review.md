# Expedition objectives — local presentation slice

## Status and scope

Local candidate based on draft PR18 head `e7b0c975f59e01550c4d19331db45da1fa670e67`. Not published, merged, deployed, or visually verified. Exactly nine repository paths change: four runtime files, four test files, and this review document.

The route adds one labeled, non-interactive Expedition objectives section immediately below the existing canvas. It shows the current floor, actual remaining and defeated/total wardens, the unlocked next action, and the observed return outcome. Missing or inconsistent observations are explicitly unavailable. It also explains the existing untimed town, up-to-90-second expedition, continuing clock during pause, and the per-expedition reset of dungeon hero level and floor objectives.

No lore, quest persistence, companion information, new floors, rewards, equipment, new phase machine, network requests, runtime configuration, or browser storage is added. This is an objectives view, not a saved quest journal.

## Authority and lifecycle

- `expeditionObjectives.ts` derives presentation from only `area`, `floorKills`, and `outcome`. The helper does not know session receipts or grant progression.
- `GameScene` copies and freezes these three scalar values. It emits only when area, kills, outcome, or existing town-status presentation changes. Elapsed time, health, score, XP, and gold do not cause frame-by-frame notifications.
- The optional observer is error-contained in both scene and boot bridge. Its failure cannot interrupt gameplay, departure, or settlement.
- Boot ownership guards suppress obsolete callbacks. A scene observation epoch invalidates an obsolete CREATE callback. Scene shutdown/destruction clears its observation, disables subsequent publication, and removes the existing paired lifecycle listeners.
- The route makes its own detached scalar snapshot. It clears observations at new boot/start, blocked entry, owner change, and unmount, rejects progress while starting/blocked, and hides unavailable/invalid state. A new expedition's actual scene observation establishes its progress.
- Return and local banked gold never establish saved account rewards. Existing `townSession` phases and confirmed receipt handling retain that authority. The original `game-status` text and live region are unchanged; only their placement moves inside the card.

## Accessibility and unchanged playfield

The section has a visible heading and an `aria-labelledby` relationship. It adds no buttons, focus target, keyboard handler, modal, or pause behavior. Text wraps in a single column outside the unchanged game frame.

The objective live region announces floor/objective transitions and an opened exit. Changing remaining counts stay visibly readable and browseable without announcing every kill. It never announces settlement text; the existing game-status live region continues to do that once.

The canvas/container markup and CSS, camera/layout methods, collision, controls, gate interaction radius, expedition transitions, timeout, return rules, reward coordinator, gameplay model, and asset files are unchanged.

## Verification performed

Using official lock-backed packages and the checksum-verified official Node 22.23.3 runtime:

- Focused Vitest execution: 76 passed, zero retries/skips. Objective helper: 20; scene: 40; boot/readiness bridge: 16.
- Existing real-route Svelte/SDK/coordinator DOM harness: 33 passed, zero retries/skips. Auth, transport, scene, and presentation substitutes remain the harness's existing declared test doubles. This is DOM/lifecycle evidence, not real account settlement or Phaser rendering.
- Actual route compiled with Svelte 5.39.8: zero warnings.
- The three changed TypeScript runtime modules and their real imported source passed strict TypeScript 5.9.3 checking, including exact optional properties and unchecked-index protection. The pure helper was also checked separately.
- An independent reviewer replayed the same 76 unit and 33 DOM cases, plus six additional reviewer-only route cases covering stale boot callbacks, blocked entry, malformed progress, retained focus, live-region update behavior, and failed-departure recovery. All passed.
- Eight additional bounded offline check groups passed: malformed/unknown observations, actual two-floor model progression, retreat/rescue distinctions, immutability, changed-script syntax, unchanged gameplay/layout/assets, unchanged key scene methods, and preserved canvas/status markup.

Node 24 exploratory attempts and failures caused by incomplete source restoration are retained separately. Initial unit discovery lacked generated SvelteKit configuration; actual repository configuration and Kit sync resolved it. Initial DOM collection lacked the SDK's unchanged companionReactions dynamic-import source; restoring the exact current source resolved it. No tests were skipped or guards weakened, and no replacement framework or implementation behavior was introduced to conceal those setup failures.

## Remaining limits and integration gate

No browser was launched. Visual composition, actual-phone readability, screen-reader behavior, actual Phaser rendering, real human combat playthrough, and hosted account settlement remain unverified.

This source subset is not a full application checkout. A broader partial TypeScript inspection remains blocked by missing unchanged SDK dependency/type source; it is not a full application diagnostics pass. Full Svelte diagnostics, full app build, all-repository tests, and hosted release checks were not established here.

Existing publication source pins, exact test-count verifiers, workflow lists, and frozen review packages are deliberately unchanged. A later authorized integration pass must reconcile the added tests/new suite and source pins, run the full required gates against the exact candidate, and obtain visual verification before publication. These focused local passes do not establish publication readiness.
