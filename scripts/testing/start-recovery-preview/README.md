# Focused start-recovery browser fixture

Status on 2026-10-09: **first hosted execution failed; corrected fixture pending
rerun**. The unchanged matrix contains 42 Playwright cases: 21 for NeonRun and 21 for GameShell/Orbfield, in one desktop-only
1280 × 900 Chromium project. No mobile/touch/native viewport coverage is claimed.
No case is marked passed. This fixture does not establish that the recovery
candidate is ready to ship.

This local candidate is rebased onto deployed release commit
`f314771573264e75267df68f56709a2dccf1c9ea`, tree
`b4a7a1fb53d929e0beb4cfad6b6304f8a3a87d00`. It inherits the release
package manifest and both lockfiles unchanged, including exact Playwright 1.57.0.
The original browser-readiness package used Playwright 1.56.0; its results and
managed-browser provenance do not describe this rebased candidate.

## What is real, and what is synthetic

The fixture imports the candidate's actual `src/lib/components/games/NeonRun.svelte`,
`src/lib/games/GameShell.svelte`, and `src/lib/games/sdk.ts`, including real
`watchGameOwner`, owner-aware start requests, aborts, request/body deadlines,
completion signing and local session bookkeeping. There is no replacement SDK.

Both maintained skin loaders and the nine original checked-in Lanternway/Moonlit
WebPs are used unchanged. Vite serves/emits only these explicit image paths.
The optional post-load gate is synthetic: the real loader has already decoded
its original artwork, but its result is held to exercise cancellation while the
shell is still awaiting preload. The gate is not evidence of real image-network
cancellation or decoding behavior. No substitute assets are used.

Auth, page owner, transport, navigation destination, audio, event delivery,
analytics, companion/state collaborators, and engine are local test doubles.
The rendered page owner stays `owner-a`; synthetic Auth can report `owner-b` or
signed-out state. The engine is deliberately a **fake lifecycle engine**. It does
not run Phaser, physics, collisions, movement, or animation. The fixture ribbon
labels this visibly. Tests of rewards mean “the real SDK and shell handled a
synthetic response and did not call the recorded local player-state collaborator,”
not real backend settlement or actual player-store integration.

All three permitted SDK requests (start, sign, complete) are intercepted in
memory. No native-fetch fallback exists. Hung transports intentionally observe
but ignore AbortSignal until explicitly released, so late replies exercise the
real SDK's stale-response exclusion. Synthetic session/nonce strings are
fixture-only identifiers, not credentials. No actual authentication, account,
Supabase, backend, service or deployment is connected.

## Isolation boundaries

- A separate built Vite/Svelte preview binds only `127.0.0.1:4279`, with strict port
  checking and no existing-server reuse. It never uses reserved port 4178.
- `envDir: false`, `publicDir: false`, no SvelteKit application config or `.env`
  loading. Filesystem serving is limited to this fixture, explicit app-source
  files, and installed dependencies. Secret/key/git paths remain denied.
- An application-module allowlist rejects unexpected app imports. Supabase,
  Stripe and Phaser runtime dependencies are rejected.
- The server denies `/api` and `/api/*`; in-memory fetch accepts only the three
  exact POST paths. Unexpected fetches fail and are recorded.
- Playwright routes reject every external HTTP request, every non-GET/HEAD
  request, every app API network request and all WebSockets. Service workers are
  blocked. Browser execution rebuilds the exact fixture, then uses Vite preview
  so no development client or HMR WebSocket is injected. The WebSocket guard
  remains unchanged. Page errors and forbidden requests fail tests.
- The refresh test checks the old page's recorded blocked attempts, state calls,
  engine/events, and aborted start before reloading, so navigation cannot erase
  those assertions. It then requires exactly one same-URL main-frame document
  request and replacement of an old-document marker. This works independently
  of clock-mocked Performance entries. Outer request/error observations survive reload.

No production source or other fixture is modified by this fixture. Generated
builds and evidence stay under `.build/` and `.results/` here.

## Case matrix (42 cases; corrected fixture awaiting hosted rerun)

Each maintained shell has the same 21 cases:

1. 30-second start fetch timeout, uncertainty copy, focus, no auto-replay, late reply
2. 30-second successful response-body timeout, same recovery checks
3. 30-second error response-body timeout, same recovery checks
4. Repeated-click guard, explicit new start, late original response, new session/nonce completion
5. Successful original session/nonce preserved through completion
6. Exit navigation cancels pending start and ignores late response
7. Unmount cancels pending start and ignores late response
8. Account switch during pending start, Refresh page label
9. Sign-out during pending start, Sign in label
10. Same-owner token refresh stays pending; synthetic blur pauses game on arrival
11. Owner change during explicit artwork gate prevents session request
12. Unmount during explicit artwork gate prevents session request
13. First Auth event reports B during A's preload and must not adopt B
14. Initial owner mismatch before Start fails closed
15. Auth setup unavailable: shell renders and start fails closed
16. Initial Auth never arrives: 30-second deadline, no session request
17. Refresh page causes real document reload with no automatic start
18. Already signed out: local Sign in navigation, no session request
19. Short practice run: no signing, completion or local reward calls
20. Account switch after timeout blocks explicit new start before another API attempt
21. Sign-out after timeout blocks explicit new start before another API attempt

Tests install and pause `page.clock` before navigation. The installed 1.57.0
client/server implementations expose the same awaited install/pause/runFor APIs.
Its clock source replays installation and paused state in new documents and
awaits any in-progress automatic timer drain before manual advancement. This is
source-level compatibility evidence; the corrected navigation/reload check awaits
a new hosted run.

The tests await the mounted shell, actual artwork decode, start phase, request
count and fetch/body readiness
before advancing 29,999 ms then 1 ms. The Auth-only timeout separately waits for
the second subscription. There are no arbitrary `waitForTimeout` sleeps. The
four-deadline no-auto-replay observation period begins only after confirmed timeout.

The repeat-click case intentionally dispatches three DOM click events in one
task, exercising the handler's singleflight guard beyond browser disabled-button
hit testing. A synthetic blur tests the shell background handler; it is not
proof of native OS tab visibility handling.

## Verified local preparation stages

- Node 22.20.0
- Svelte check: 0 errors, 0 warnings
- TypeScript no-emit: passed
- Eight Node-only fixture-control self-tests: passed
- Vite production fixture build: passed
- Playwright 1.57.0 discovery: 42 cases in one browser test file, **zero executed**
- Inherited Playwright 1.57.0 Node-only clock regression control: passed
- Corrected fixture browser execution: **NOT RUN**; prior hosted revision failed all 42 cases
- Local browser launch/screenshots: **NOT RUN**; see hosted failure evidence below
- Real engine, real Auth/backend, production route and deployment checks: **NOT RUN**

The inherited clock regression control uses the installed Playwright clock source
with a controlled FIFO embedder and ordinary Node timers. It verifies serialized
manual/automatic advancement, continuing timers/frames and monotonic timestamps.
It is not Chromium execution or application acceptance.

The eight self-tests cover fetch/body gates, release-after-abort controls, distinct
synthetic identities, forbidden-fetch rejection, Auth sequencing/teardown,
preload gate release, and fake-engine lifecycle. They run in Node, not a browser
or DOM. They validate fixture controls only, not the SDK, shells or the 42 browser
cases. Existing candidate DOM/SDK suites are independent evidence.

Preparation diagnostics can include a missing generated root SvelteKit tsconfig
warning when the full application has not been synced; this standalone fixture
uses its own tsconfig. Build diagnostics include outdated browser-data advisories
and one expected static/dynamic import chunking notice for the unified synthetic collaborator.
They are not browser runtime evidence and dependencies were not changed.

## Safe preparation commands (no browser launch)

From the candidate repository root:

```sh
NODE_BIN=/workspace/scratch/105963ff4370/memvoya-recovery/node-runtime/node_modules/node/bin/node \
  bash scripts/testing/start-recovery-preview/verify-static.sh
```

The script uses the installed dependencies and writes logs in this fixture's
`.results/`. List-only JSON is named `discovery-results.json`; its 42 skipped
entries reflect discovery and are not browser executions. A list-only run never
writes `browser-results.json`. The script performs Svelte/TypeScript checks, the
eight control self-tests, the build, then `playwright test --list`. It never installs or downloads anything
and never calls browser launch. Equivalent individual commands are inside it.

## Future browser execution gate

**Do not run these browser commands in the current container.** The parent has
verified that `/usr/bin/chromium` 154.0.8037.57 cannot launch here because creating
a socket is denied (`Operation not permitted`), including through an approved
retry. Do not repeat that launch or weaken security settings/flags. Preparation
and passing control tests do not remove this blocker.

In a separately permitted browser environment, with this candidate and the
locked dependencies available, the default command is:

```sh
node node_modules/@playwright/test/cli.js test \
  --config scripts/testing/start-recovery-preview/playwright.config.ts
```

The default uses the Playwright-managed browser selected by the installed locked
Playwright version. For this checkout, Playwright 1.57.0 expects Chromium
143.0.7499.4, revision 1200 (including the matching headless shell). This is
**not** the system Chromium 154.0.8037.57.
No browser is auto-downloaded, autodetected or silently substituted by the fixture.
If a browser is missing, the run must report that blocker.

An already-permitted environment can explicitly opt into its approved system
browser using an absolute path:

```sh
START_RECOVERY_BROWSER_EXECUTABLE=/absolute/path/to/approved/chromium \
  node node_modules/@playwright/test/cli.js test \
  --config scripts/testing/start-recovery-preview/playwright.config.ts
```

This optional executable setting is not permission to launch a browser in a
restricted environment and is not a workaround for the current denial. The
config supplies no custom browser arguments or security-bypass flags. System
browser runs must record the actual executable/version separately and cannot
be presented as locked managed-Chromium evidence.

A genuine run must execute all 42 cases with zero failures, skips, or unexpected
requests; retain `.results/browser-results.json`, failure traces/artifacts and
the attached synthetic observation reports. Timeout and synthetic-receipt
screenshots are captured for both shells during actual execution. Review them
before making rendering claims. Any fix requires rerunning checks against the
final candidate. Even a successful future synthetic-browser run leaves real
Auth/backend, actual engine and production/deployment validation as separate
gates.


## First hosted execution and fixture correction

Draft PR #14 at `a0f8cd2d23cb52d5387314c5990ab345b8ef39de` executed all 42 cases
in startup workflow `37940551705`. All failed the strict WebSocket guard because
Vite's development client attempted local HMR connections despite `hmr: false`.
The two Refresh cases also used navigation Performance entries that Playwright's
clock deliberately returns as an empty list. Hosted focused units (112) and DOM
cases (104) passed. These failures establish fixture problems, not a product
regression or successful browser acceptance.

The correction serves a freshly rebuilt preview, preserves local/API/network
isolation, and checks real document replacement instead of mocked Performance.
The original case matrix, strict no-WebSocket guard and no-retry policy remain
unchanged. A new hosted run is required before claiming browser acceptance.
