# Synthetic keepsake story preview

This isolated Vite fixture imports the actual Inventory, Sanctuary and story components. It uses invented objects, companions and Journal entries; it imports no app hooks, authentication, environment files or database client. Do not use it to test placement/rest mutations.

From the repository root:

- `npx vite --config scripts/testing/keepsake-story-preview/vite.config.mjs`
- Open `http://127.0.0.1:4176/app/inventory?item=10000000-0000-0000-0000-000000000002#keepsake-story`
- `/mobile` wraps the actual view in a 390px iframe for narrow-layout review.
- `npx playwright test --config scripts/testing/keepsake-story-preview/playwright.config.ts`

The fixture simulates browser history and Svelte navigation callbacks. It is a component preview, not a substitute for real SvelteKit routing/authenticated end-to-end QA. Its browser suite is prepared but not executed in the restricted review environment. Browser Back restoration of Sanctuary's exported SvelteKit snapshot must additionally be exercised in a permitted local authenticated test environment using synthetic users.

Additional manual checks: 320px width; keyboard Tab/Enter through disclosure, Journal, close, and card links; focus on story open and collection close; browser Back from a story opened after selecting a different Sanctuary card; desktop 1280px; repeated read links never place/remove/rest; changing active companion does not retarget existing Journal links.
