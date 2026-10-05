# Credential-free Neon Run preview

This isolated fixture imports the actual `NeonRun.svelte` shell and `endlessRunner.ts` engine. Its SDK, audio transport, companion-ritual application and SvelteKit navigation are replaced by local memory-only modules. No application hooks, environment files, credentials, authentication client, database client, real API or real rewards are loaded. Legacy player-state refresh and local wallet/XP updates are forbidden canaries, asserted unused in every browser case.

## Checks and local use

From the repository root, with the repository's existing development dependencies installed:

- `npx svelte-check --tsconfig scripts/testing/neon-run-preview/tsconfig.json`
- `node scripts/testing/neon-run-preview/ssr-check.mjs`
- `npx vite build --config scripts/testing/neon-run-preview/vite.config.mjs`
- `npx playwright test --config scripts/testing/neon-run-preview/playwright.config.ts --list`

Only in an environment where local browser execution is permitted:

- `npx vite --config scripts/testing/neon-run-preview/vite.config.mjs`
- Open `http://127.0.0.1:4178/app/games/runner` for the actual engine with synthetic settlement.
- `npx playwright test --config scripts/testing/neon-run-preview/playwright.config.ts`

A prior cloud-browser loopback denial is recorded for this checkout. It is not retried, bypassed, or worked around here. No development server or browser was started during preparation. Type, build, SSR and discovery checks are not browser-run evidence, and this documentation does not claim the Playwright cases passed. Run the prepared workflow in an approved environment after publication authorization, and review screenshots at actual viewport sizes.

## Evidence boundaries

- `engine.browser.spec.ts` runs the actual engine with untouched gameplay, RNG, timing and input handlers. It observes only the public state callback/getState: focused keyboard jumps; mouse/touchscreen canvas input; visible touch Jump; pause/resume; synthetic blur; unmount cleanup; fixed 960×540 logical geometry; portrait/landscape resize; screenshots and horizontal overflow. Audio events are recorded without playing media.
- `lifecycle.browser.spec.ts` selects a deterministic manually-finished engine to test the actual shell. It verifies explicit start, true submitted stats, six power-up counts, practice no-submit, confirmed server rewards, retry using identical frozen payload/session after mutation of the original engine result, rapid-click singleflight, new-run abandonment, stale async start/completion cleanup, start error/sign-in handling, replay reset, and delayed-start background pause. It does not establish collision or scoring physics.
- `skin.browser.spec.ts` covers loaded Lanternway artwork with the real renderer (passively records actual drawImage asset paths, forwarding every draw unchanged), reduced-motion option forwarding with keyboard gameplay, failed-image fallback and leaving during held preload before any session starts. Its preload-only case freezes the clock; no gameplay evidence uses a fake clock.
- `layout.browser.spec.ts` checks real-engine pause/state/960×540 preservation through optional focus layout, Resume focus, and the nonblocking portrait hint. Explicitly labeled synthetic browser API cases cover supported/rejected/unsupported fullscreen, explicit exit, Back/unmount cleanup, late grants after exit or focus cancellation, and preserving unrelated fullscreen. These mocks do not establish native fullscreen permissions or platform support. No orientation is forced.
- `ssr-check.mjs` renders the actual shell and asserts accessible ready-state markup with no eager session, engine, audio or network work. It does not establish browser lifecycle, touch, layout or focus behavior.
- Twenty-nine browser flows are prepared across four projects (116 cases total). Projects cover 320×844, 390×844, 1280×900 and landscape 844×390. Screenshot/trace evidence and JSON reports go to ignored `.results/`; a listed test is not a passing test.
- The fixture-only 30px review ribbon and minimal font are outside the actual shell. The shell is viewport-constrained and internally scrollable, but this is not the full application layout or authenticated SvelteKit routing.
- The source allowlist rejects unexpected app modules and live-service clients. Vite environment loading and public-directory serving are disabled. Only the five exact Lanternway WebP assets (background, ground, props, adventurer and echo) are served from the production static tree. Browser request guards allow only GET/HEAD at the exact fixture origin and reject `/api/`; app fetch/XHR/beacon attempts fail closed.

## Deterministic scenarios

Append `?engine=lifecycle&scenario=...` to the local URL. Scenarios: `success`, `start-failure`, `unauthorized`, `completion-failure`, `delayed-start`, `delayed-completion`, `practice`, `negative-reward`, `fractional-reward`. The default uses the real engine.

`window.__neonRunFixture` exposes captured local SDK calls, engine/audio events, state observations and ritual updates. Its `finish({score,durationMs,meta})` works only for the explicit lifecycle engine. `configure(scenario)` changes future mock calls. `release('start'|'completion')` settles deferred responses, deliberately even after navigation to test stale-result guards. `finishedSource` lets tests mutate the original engine-owned result after submission without mutating the shell's frozen retry copy.

Synthetic settlement returns 37 XP and 11 shards, deliberately unrelated to the 84-score, 4-collected-shard test result. Caps require 1000ms and allow 60000ms. These are fixture values, not production reward rates/caps. No local XP/wallet award occurs. Practice is 250ms and never calls completion; standard lifecycle results are 8000ms with explicit distance and per-power-up metadata.

## Prepared CI only

`.github/workflows/neon-run-browser.yml` prepares credential-free Node 22 Chromium execution with read-only repository permission, no persisted checkout credentials and no application secrets. It records commit/tree plus fixture and relevant production source hashes. Reports and separate viewport screenshot/trace artifacts retain for 30 days. This is a local workflow candidate, not a published or executed workflow.

Remaining manual QA in an approved browser: inspect every mobile/desktop capture; Tab/Enter through Start, play area, Jump, Pause/Resume and results; genuinely hide/restore the tab; inspect keyboard focus after completion; verify portrait/landscape and scrolling to results; test native fullscreen entry/exit/rejection and browser/OS dismissal on supported devices. Real account settlement and authenticated navigation are separate from this isolated fixture.
