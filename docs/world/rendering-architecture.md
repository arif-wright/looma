# The Wilds rendering architecture

Status: Phase 8A parallel prototype. Phaser remains the production-safe default.

`/app/world` keeps the existing protected SvelteKit route, world-ticket endpoint, `WorldConnection`, Colyseus protocol, persistence, inventory, and companion contracts. The route reads `PUBLIC_WORLD_RENDERER` server-side and passes the normalized value to `WorldGameMount.svelte`; only `three` selects Three.js. Missing and invalid values select `phaser`.

The mount dynamically imports exactly one renderer. A `WorldSession` owns one `WorldConnection`, ticket acquisition, status/diagnostics, snapshots, movement dispatch, gathering, and teardown. Phaser and Three receive that session and own scene objects, visual interpolation, camera/input translation, resize, pause/resume, and disposal. `worldRuntimeRegistry.ts` destroys an older runtime before a replacement starts, protecting navigation and HMR from duplicate rooms.

```text
+page.server.ts -> renderer selection
       |
WorldGameMount.svelte -> WorldSession -> WorldConnection -> Colyseus
       |
       +-- dynamic import worldGame.ts (Phaser)
       `-- dynamic import renderers/three/threeWorld.ts (Three.js)
```

The server, schema, database, reward idempotency, auth, and public companion projection are unchanged. Prediction remains visual; both renderers send normalized intent and reconcile to snapshots.

Lifecycle order is mount host → create session → dynamically create selected renderer → register composite runtime → start connection. Teardown is idempotent and runs renderer disposal before connection disposal. Visibility changes pause rendering only and do not destroy the socket. Navigation destroys the composite once.

Relevant implementation: `src/routes/app/(protected)/world/+page.server.ts`, `src/lib/game/WorldGameMount.svelte`, `src/lib/game/worldSession.ts`, `src/lib/game/worldRuntimeRegistry.ts`, `src/lib/game/worldGame.ts`, and `src/lib/game/renderers/three/threeWorld.ts`.
