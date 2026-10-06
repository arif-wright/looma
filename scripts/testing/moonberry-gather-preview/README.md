# Moonberry gather recovery browser fixture

Credential-free integration regression for the actual `WorldGameMount.svelte`,
`WorldSession`, `WorldConnection`, Phaser renderer, and Three renderer. Only
`@colyseus/sdk` is aliased to a local synthetic Room/Client. The production ticket
fetch receives a clearly dummy, local-only response. No account, socket, service,
production database, or reward persistence is used.

## Run

Use the repository-supported Node version, install dependencies, and install the
Playwright Chromium browser through the normal project workflow. Then:

```sh
npx playwright test --config scripts/testing/moonberry-gather-preview/playwright.config.ts
```

Focused Svelte and TypeScript check (after the repository’s SvelteKit sync):

```sh
npx svelte-check --workspace . --tsconfig scripts/testing/moonberry-gather-preview/tsconfig.json
```

For manual inspection:

```sh
npx vite --config scripts/testing/moonberry-gather-preview/vite.config.mjs
```

Open `http://127.0.0.1:4178/?renderer=phaser` or `?renderer=three`.
The visible provenance label must remain in screenshots. Fixture controls are
available through `window.__MOONBERRY_FIXTURE__` for local outcome/drop injection.
These controls exist only in this test entry point.

## Coverage and evidence

The original four projects cover Phaser and Three at 1280px desktop and 320px touch layout; additional mobile projects are described below.
Narrow projects send actual touchscreen taps; desktop projects use mouse clicks.
The tests exercise keyboard-first and button-first duplicate suppression,
delayed/unsolicited/duplicate/late replies, accurate holding-limit guidance,
the production 10-second timeout,
disconnect and token reconnect, fresh-room recovery without automatic gather
replay, explicit fresh actions, authoritative proximity, and repeated unmounts.
Each test rejects page exceptions, failed game asset responses, external requests,
and any non-local WebSocket. The only permitted socket is Vite’s local
development client; the synthetic SDK never opens one. HMR updates are disabled
and external fetches are rejected too.

The test clock advances only the local fixture's client-side timeout; there is no
live transport or server-side clock. Rendering uses the ordinary Playwright Chromium launch defaults. No browser
security or graphics override flags are added. Traces, screenshots, and JSON results are written beneath
`artifacts/moonberry-gather/` and are generated evidence, not source files.

A passing fixture demonstrates client integration and UI behavior. It does not
prove real Colyseus reconnection, ticket authentication, database transactions,
server idempotency, inventory delivery, or hardware GPU performance. The check-
Keepsakes link destination is asserted; the real inventory is not loaded here.

## Mobile control layout and interrupted mounting

The fixture compiles `import.meta.env.DEV` as false so the actual production HUD
is visible rather than covered by Three's development-only diagnostic overlay.
The real UI/session/connection/renderers and synthetic transport boundary remain
unchanged. Ten projects cover both original desktop/narrow renderer pairs plus
Three at 320×568, 390×844, 568×320, 667×375, and 844×390, and Phaser at 667×375.
All four original projects and Phaser landscape retain the six gather recovery
scenarios. The five extra Three sizes run the new layout and lifecycle scenarios
only, keeping the existing 20-minute CI budget. This schedules 50 cases: 47
applicable checks and three explicitly inapplicable Three-layout checks on Phaser.

Three-only geometry tests verify that feedback, the gather/portal prompt, the
movement pad, and the camera cluster remain inside the game and do not overlap.
They hit-test buttons, presets and individual link fragments, require 44px touch
controls, emulate phone safe-area insets, tap camera controls repeatedly, cancel
held movement, and navigate the
Keepsakes link to an explicitly synthetic local target, including Back/Forward.
The inventory itself is never loaded or verified. Layout screenshots preserve the actual viewport and include a second scrolled
controls view for landscape; the synthetic label stays visible. Full-page capture
resets Chromium touch emulation in this runtime, so it is not used for layout
evidence. The test asserts that declared touch/coarse-pointer mode stays active. The Three-only layout scenario
is deliberately inapplicable to Phaser; all recovery and lifecycle scenarios run
there unchanged.

A delayed dynamic-import test unmounts the view before either renderer can load.
It checks that no renderer/session, active world registry entry, late resize
observer, or visibility listener is created for that abandoned view, then mounts
and unmounts again and verifies our component listener is removed. The installed
Phaser core retains its own visibility callback after normal game disposal; that
pre-existing library behavior is outside this layout/component-lifecycle change.
