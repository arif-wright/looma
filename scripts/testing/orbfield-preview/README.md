# Synthetic Orbfield preview

This isolated Vite fixture imports the **actual GameShell and Orbfield engine**. SDK, companion rituals and SvelteKit navigation are replaced with local memory-only modules. Legacy player-state refresh and application are forbidden canaries, and every browser case requires zero calls and updates. No application hooks, credentials, environment files, authentication, database client or real API is loaded. The app's authenticated Playwright setup is not imported.

## Run in an approved local environment

From the repository root, with the repository's existing development dependencies installed:

- `npx vite --config scripts/testing/orbfield-preview/vite.config.mjs`
- Open `http://127.0.0.1:4177/app/games/dodge` for the real engine and mocked rewards.
- `npx vite build --config scripts/testing/orbfield-preview/vite.config.mjs`
- `node scripts/testing/orbfield-preview/ssr-check.mjs`
- `npx svelte-check --tsconfig scripts/testing/orbfield-preview/tsconfig.json`
- `npx playwright test --config scripts/testing/orbfield-preview/playwright.config.ts --list`
- `npx playwright test --config scripts/testing/orbfield-preview/playwright.config.ts`

Use only a browser/local origin this environment permits. A prior cloud-browser loopback access denial is known for this checkout. That denial is not retried, bypassed, or worked around by this fixture. Build, SSR and test-discovery results are **not** browser-run evidence. Do not claim these Playwright cases passed unless their report was produced by a permitted browser execution.

## Evidence boundaries

- `engine.browser.spec.ts` uses the actual engine, observes only its public state callback, and exercises keyboard movement, real touchscreen input with CSS-to-canvas coordinate scaling, touch time warp, pause/resume, navigation cleanup, and screenshot/overflow checks.
- `lifecycle.browser.spec.ts` uses the actual shell with an explicitly selected deterministic manually-finished engine. It tests intro, server reward presentation, repeated start/replay, error recovery, honest short practice rounds, stale async results, navigation, and synthetic window blur while a session start is pending (paused resolution and explicit Resume without stealing focus). It does **not** prove collision or scoring physics.
- `ssr-check.mjs` renders the actual shell on the server and checks accessible ready-state markup and absence of eager engine/session work. It does **not** prove browser lifecycle, layout, touch, focus, or rendering.
- The original 12 browser flows plus 4 skin flows are discovered at 320×844, 390×844 and 1280×900: 48 cases total. Browser runs attach screenshots and traces under this fixture's ignored `.results/` directory.
- `#game-root` is constrained to the viewport and GameShell runs with `fullScreen=true`, so narrow-screen scrolling is tested inside the shell. The 30px synthetic-review ribbon and minimal global font are fixture-only; this is not the full app layout.
- All browser requests are guarded: only GET/HEAD to the fixture's exact loopback origin are allowed; API paths, external calls, mutations and uncaught page errors fail the suite. Global app fetch/XHR/beacon calls fail closed too. Build config disables `.env` loading.

## Deterministic lifecycle scenarios

Append `?engine=lifecycle&scenario=...` to the local Orbfield URL. Valid scenarios: `success`, `start-failure`, `completion-failure`, `delayed-start`, `delayed-completion`, `practice`, `negative-reward`, `fractional-reward`. The default uses the real engine.

The test-only `window.__orbfieldFixture` exposes captured calls, engine events, player-state and ritual updates; `finish({score,durationMs,meta})` is usable only for the lifecycle engine. `configure(...)` changes future calls and `release('start'|'completion')` settles pending mock responses. Delayed responses are not canceled automatically, intentionally testing the shell's stale-response protection.

Synthetic reward response: 37 XP and 11 shards. The slice deliberately makes no legacy player-state refresh and applies no browser-side XP or wallet update; it displays only the confirmed completion response and applies the returned ritual list. Session caps require 1000ms and allow up to 180000ms. These are fixture values, **not production reward rates or caps**. Lifecycle results use an 8000ms round; practice uses 250ms. SDK calls and session IDs never leave browser memory.

Manual follow-ups in a permitted browser: inspect all viewport screenshots; Tab/Enter through start, canvas, warp, pause/resume and results; hide/restore the tab during play; test portrait/landscape change and scroll-to-result inside the constrained shell. Authenticated end-to-end testing with synthetic accounts is separate from this credential-free component preview.

## Prepared CI workflow

`.github/workflows/orbfield-browser.yml` prepares a credential-free Node 22 Chromium run with 30-day source identity, text/JSON reports and separate per-viewport screenshot/trace artifacts. It supplies no application secrets, uses read-only repository permission, disables persisted checkout credentials, and records commit/tree plus fixture and relevant production source hashes. It is local-only until the user authorizes publication; this preparation is not a workflow execution result.


## Moonlit skin coverage

The fixture narrowly serves the four actual WebP files from `static/games/dodge/skins/moonlit/`; it does not expose the full application static tree. The renderer module is explicitly allowlisted. Normal real-engine and lifecycle flows wait for decoded artwork, and manual `finish` waits for a playing phase.

`skin.browser.spec.ts` adds loaded-art intro and real-engine screenshots, an orientation change with unchanged logical geometry/state, reduced-motion warp, failed-image fallback, and navigation during held image preload. The held-preload test uses DOMContentLoaded so the browser does not wait for intentionally delayed image requests before the test can act.

Discovery/build results are not executed browser evidence. Run the prepared CI workflow against the candidate commit after publication authorization, then inspect captures at actual 320px/390px/desktop sizes.
