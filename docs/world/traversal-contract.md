# The Wilds traversal contract

Status: Phase 8B.2. This contract applies to the `wilds-exploration` map and to every renderer.

## Ownership and source of truth

The Colyseus `WorldRoom` remains authoritative. Clients send normalized input intent; `services/world-server/src/simulation/movement.ts` applies bounded movement, map bounds, and blocking tests. Phaser physics and Three.js objects are presentation and prediction aids only and never approve a move.

The renderer-neutral manifest is `services/world-server/src/world/traversalManifest.json`. It contains the map id and version, walkable bounds, safe spawn, and public circular blocker geometry. `services/world-server/src/world/traversal.ts` validates movement against it. `src/lib/game/traversal.ts` imports the same file for Phaser and Three presentation, so renderers do not maintain independent obstacle coordinates.

Phase 8D adds `src/lib/game/environment/wilds-exploration.environment.json` as a presentation-only companion. A visible solid prop links to an authoritative blocker ID with `collisionRef`. Validation rejects unknown references and forbids visual instances from declaring radii or collision shapes. Decorative fields, paths, effects, and terrain never alter traversal.

## Walkability rules

1. Open ground and roads are walkable.
2. A visible solid prop may block movement when its blocking footprint is declared in the manifest.
3. Invisible blockers are prohibited except for map boundaries, a documented technical safety zone, or temporary development diagnostics.
4. Every persistent non-walkable area must have a visual representation that communicates its footprint reasonably.
5. Interaction radii are not collision. The Moonberry gathering radius remains 58 server units and is not a blocker.

The server treats players as circles of radius 16. A player is blocked when its center overlaps a manifest circle expanded by that radius. Movement is resolved independently on X and Y, allowing sliding without adding a physics engine.

## Current exploration geometry

Walkable center bounds are X `16..944`, Y `16..524`; the boundary is the only intentionally invisible permanent blocker. The safe spawn is `(120, 120)`.

| Manifest id | Visual kind | Center | Radius |
|---|---|---:|---:|
| `tree-northwest` | tree | (128, 78) | 20 |
| `tree-southwest` | tree | (224, 430) | 20 |
| `tree-moonberry` | tree | (800, 110) | 20 |
| `tree-southeast` | tree | (864, 398) | 20 |
| `tree-north` | tree | (352, 78) | 20 |
| `rock-southwest` | rock | (288, 366) | 24 |
| `rock-northeast` | rock | (608, 110) | 28 |
| `rock-southeast` | rock | (704, 398) | 22 |

The old rectangle X `465..615`, Y `212..328` was a Phaser-era prototype obstacle. Expanded by the player radius, it cut across the visible east/west road and had no Three.js representation. It has been removed. The road is now crossable north/south at all unoccupied X positions.

## Spawn and persistence safety

`services/world-server/src/world/maps.ts` uses the same manifest to validate loaded positions. A missing, obsolete, out-of-bounds, or blocker-overlapping position restores to the map spawn. `WorldRoom` also validates its selected spawn candidate before adding a player. Checkpoints remain server-produced from authoritative position; arbitrary client coordinates are never persisted.

## Renderer mapping

- Phaser: server X/Y map directly to Phaser X/Y. Manifest circles create matching visible static placeholder bodies.
- Three.js: server X maps to Three X and server Y maps to Three Z using the documented scale/offset. Manifest circles place the matching tree and rock placeholders. Three physics is not authoritative.
- Camera yaw changes only input translation and presentation. It never rotates or mutates collision geometry.

In development builds, Three shows the walkable boundary, player-expanded blocker rings, safe spawn, and Moonberry interaction radius. This diagnostic group is compiled behind `import.meta.env.DEV` and is absent from normal production presentation.

## Map authoring rules

Add or move collision in the canonical manifest first, give each shape a stable id, and supply a corresponding visible renderer presentation. Keep roads and intended routes clear by at least the blocker radius plus player radius. Validate the spawn and persistence fallback against the revised manifest. Add server tests for both blocked footprints and intended corridors, plus renderer mapping tests. Do not add renderer-only blockers, client-authoritative collision, undocumented safety zones, or interaction areas disguised as collision.
