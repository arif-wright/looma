# Tiles archive local checks

These checks are credential-free and do not launch a browser or contact a service.

1. `npx vitest run src/lib/__tests__/gameDiscovery.spec.ts src/lib/__tests__/gameConfigDiscovery.spec.ts`
2. `node scripts/testing/tiles-archive/ssr-check.mjs`
3. `npm run check && npm run check:core && npm run build`
4. `node scripts/testing/tiles-archive/route-check.mjs`

The SSR fixture renders actual production components and rejects gameplay/service imports and fetch calls. It verifies markup and server-side behavior only, not hydration, focus, scrolling, iframe navigation or actual play. Route checks consume the full production build's generated SvelteKit manifest.

Updated authenticated Playwright cases live in the existing games-tiles-run, games-achievements, branding-games and social-share-ui suites. They are prepared, not executed by the checks above. Use isolated test data and a permitted browser environment; do not point the seeded suites at a live project. The existing historical game/leaderboard/security API suites remain unchanged.
