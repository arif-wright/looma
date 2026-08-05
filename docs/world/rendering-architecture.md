# The Wilds rendering architecture

Status: Phase 8B.2 parallel prototype. Phaser remains the production-safe default.

`/app/world` keeps the existing protected SvelteKit route, world-ticket endpoint, `WorldConnection`, Colyseus protocol, persistence, inventory, and companion contracts. The route reads `PUBLIC_WORLD_RENDERER` server-side and passes the normalized value to `WorldGameMount.svelte`; only `three` selects Three.js. Missing and invalid values select `phaser`.

The mount dynamically imports exactly one renderer. A `WorldSession` owns one `WorldConnection`, ticket acquisition, status/diagnostics, snapshots, movement dispatch, gathering, and teardown. Phaser and Three receive that session and own scene objects, visual interpolation, camera/input translation, resize, pause/resume, and disposal. `worldRuntimeRegistry.ts` destroys an older runtime before a replacement starts, protecting navigation and HMR from duplicate rooms. WebGL loss pauses only presentation; its existing `WorldSession` remains active and is not rejoined during context restoration.

```text
+page.server.ts -> renderer selection
       |
WorldGameMount.svelte -> WorldSession -> WorldConnection -> Colyseus
       |
       +-- dynamic import worldGame.ts (Phaser)
       `-- dynamic import renderers/three/threeWorld.ts (Three.js)
```

The server, schema, database, reward idempotency, auth, and public companion projection are unchanged. Prediction remains visual; both renderers send normalized intent and reconcile to snapshots. `PlayerVisualState` is a renderer-neutral animation input containing public identity, world/render positions, facing, movement state, companion association, and connection state—never private companion or account data.

Traversal presentation has one canonical, server-owned public manifest: `services/world-server/src/world/traversalManifest.json`. The server consumes it for authoritative movement, spawn, and persisted-position validation. `src/lib/game/traversal.ts` exposes the identical static data to both renderers. Phaser creates visible static placeholder bodies from its circles; Three places the corresponding visible tree/rock placeholders after server-X/Y to Three-X/Z conversion. Neither renderer may invent permanent blocker geometry or make collision authoritative. The road and open terrain have no collision entries.

Three's development-only collision overlay renders walkable bounds, player-expanded blocking rings, the spawn, and interaction range. It is diagnostic presentation, has no physics role, and is excluded when `import.meta.env.DEV` is false.

Phase 8C replaces Three's canvas direction cards with `HdSpriteEntity`. Yaw-only planes consume native-eight-direction atlas contracts while labels remain separate camera-facing sprites. `HdSpriteResources` owns shared plane/shadow/aura geometry plus reference-counted manifest and atlas-page caches. Version 2 manifests carry ordered, variable-length per-direction sequences and metadata timing; entities load only the active sequence's bounded pages and own only shader UV/opacity state, label texture, animation timer, and root transform. Phaser remains unchanged as rollback. Temporary version 1 Muse/player SVG atlases prove backward-compatible loading and frame selection; production art uses version 2 pages.

Lifecycle order is mount host → create session → dynamically create selected renderer → register composite runtime → start connection. Teardown is idempotent and runs renderer disposal before connection disposal. Visibility changes pause rendering only and do not destroy the socket. Navigation destroys the composite once.

Relevant implementation: `src/routes/app/(protected)/world/+page.server.ts`, `src/lib/game/WorldGameMount.svelte`, `src/lib/game/worldSession.ts`, `src/lib/game/worldRuntimeRegistry.ts`, `src/lib/game/worldGame.ts`, `src/lib/game/renderers/three/threeWorld.ts`, `src/lib/game/traversal.ts`, and `services/world-server/src/world/traversal.ts`.
