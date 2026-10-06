# Moonberry Share: synthetic local browser fixture

This harness imports the real inventory route, `MoonberryShare`, and `KeepsakeStory` components. It does not clone their markup. All identities, stacks, companions, receipts, and Journal rows are deterministic synthetic data. The transport adapter is in memory with a separate synthetic session-storage record for reload tests. It is not a substitute for native PostgreSQL transaction tests or hosted acceptance.

## Safety boundary

- `window.fetch` accepts only the synthetic `/api/items/moonberry/share` operation and never calls the network.
- Playwright blocks every origin except `http://127.0.0.1:4182`, and every actual request method except GET/HEAD.
- The fixture uses no credentials, connected accounts, real user data, hosted services, or hosted mutations.
- Every screen has a sticky SYNTHETIC LOCAL TEST label; screenshot attachments and JSON transport logs identify synthetic evidence.
- Never bypass environment restrictions to run this fixture.

## Commands

In a permitted environment, from the repository root:

    ./node_modules/.bin/playwright install chromium
    ./node_modules/.bin/playwright test --config scripts/testing/moonberry-use-preview/playwright.config.ts --list
    ./node_modules/.bin/vite build --config scripts/testing/moonberry-use-preview/vite.config.mjs --outDir ../../../test-results/moonberry-share/fixture-build
    ./node_modules/.bin/svelte-check --tsconfig scripts/testing/moonberry-use-preview/tsconfig.json
    ./node_modules/.bin/playwright test --config scripts/testing/moonberry-use-preview/playwright.config.ts

The browser configuration uses Playwright-managed Chromium and the real browser runtime. Vite serves loopback port 4182; it refuses to reuse an existing listener. Two projects cover desktop 1280×900 and narrow 320×844. The GitHub route uses `playwright install --with-deps chromium`. Browser installation or an alternate executable is never a workaround for an environment denial. Discovery (`--list`) and static compilation do not start the browser.

## Coverage prepared

Cancel and focus; explicit companion selection; same-turn double activation/single-flight; quantity-zero acquisition identity; failure uncertainty; timeout; lost committed response; no automatic reload mutation; exact same-key replay; different target blocking; stale receipt quantity versus refreshed current quantity; unmount/remount with late response; exact story and Journal link; Back navigation; depletion/refill identity; reaction/memory disabled; mismatched and unauthorized response; terminal empty response; refresh failure; local-only confirmed-request cleanup after storage failure; missing-stack recovery; account-owner guard; malformed storage fail-closed; honest stale-stock labelling.

Each executed test will attach a synthetic transport log and screenshots. No screenshot is fabricated when execution is unavailable.

## Verification status, 2026-10-06

Browser acceptance is **NOT_RUN**. Chromium failed before page creation because its local IPC socket was denied, including a reviewed escalation attempt. The supported cloud browser separately returned `net::ERR_BLOCKED_BY_CLIENT` for the localhost fixture URL. No assertion ran in a browser and no screenshot was produced. Exact blocker evidence is `artifacts/moonberry-use/browser-execution-status.json`.

Test discovery and compilation are separate checks. See `artifacts/moonberry-use/browser-tests-discovery.log`, `browser-fixture-build.log`, and `browser-fixture-types.log` for actual results. A successful build is not a passed browser test.

## Published review verification

The scoped `.github/workflows/moonberry-share.yml` runs this fixture against the exact pull-request head SHA, without production secrets, accounts or deployment. It uploads new evidence from `test-results/moonberry-share/`, including the JSON result, traces, synthetic transport attachments and any real screenshots. The report gate requires all 40 cases to actually pass with no skips or retries. Existing `artifacts/moonberry-use/` blocked-run evidence is retained unchanged. GitHub execution is pending until an actual run for the published head finishes; even a passing synthetic run is not hosted/authenticated acceptance or rollout approval.
