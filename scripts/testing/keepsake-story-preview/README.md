# Synthetic keepsake story preview

This isolated Vite fixture imports the actual Inventory, Sanctuary and story components. It uses invented objects, companions and Journal entries; it imports no app hooks, authentication, environment files or database client. Do not use it to test placement/rest mutations.

From the repository root:

- `npx vite --config scripts/testing/keepsake-story-preview/vite.config.mjs`
- Open `http://127.0.0.1:4176/app/inventory?item=10000000-0000-0000-0000-000000000002#keepsake-story`
- `/mobile` wraps the actual view in a 390px iframe for narrow-layout review.
- `npx playwright test --config scripts/testing/keepsake-story-preview/playwright.config.ts`

The fixture simulates browser history and Svelte navigation callbacks. It is a component preview, not a substitute for real SvelteKit routing/authenticated end-to-end QA. Its three browser flows run in the isolated `Keepsake Story Browser` GitHub Actions workflow at 320px, 390px and 1280px widths (nine Chromium cases). The separate config does not load the app’s authenticated global setup, and the workflow supplies no application secrets. All browser HTTP requests are restricted to the loopback fixture and GET/HEAD; attempted external or mutation requests and uncaught page errors fail the suite. Browser Back restoration of Sanctuary's exported SvelteKit snapshot must additionally be exercised in a permitted local authenticated test environment using synthetic users.

The workflow uploads the exact source commit/tree and relevant file hashes, a text log, a machine-readable JSON report, screenshots and per-test traces for 30 days. Visual results are split into one artifact per viewport to keep downloads bounded; the report/source artifact is separate. These are synthetic component-browser results, not hosted authentication, live database, real SvelteKit routing or snapshot-restoration evidence. The original restricted local-browser denial is not retried or bypassed by this workflow.

Remaining manual checks: keyboard Tab/Enter through Journal, close, and card links; focus on collection close; browser Back from a story opened after selecting a different Sanctuary card; repeated read links never place/remove/rest; changing active companion does not retarget existing Journal links.

Screenshot scope: the fixture uses its own minimal global styling, not the production app layout. Journal is a destination placeholder and the three flows exercise Inventory/story interaction; they do not exercise Sanctuary mutations or SvelteKit snapshot capture/restore.
