# World environment asset contract

Status: Phase 8C.6 versioned illustrated-environment contract.

Production assets additionally follow `environment-visual-architecture.md`. Version-2 manifests require an explicit render class, normalized ground anchor, source provenance, and biome-neutral declaration. Major trees require eight authored directional views; rocks require projection-correct ground-prop art. Surrounding biome terrain, terrain islands, baked renderer shadows, and unapproved mirrored views are rejected.

Art direction is governed by `environment-visual-direction.md`. Its referenced concept image is not a runtime asset and has no authority over this manifest's coordinates or the server traversal contract.

`src/lib/game/environment/wilds-exploration.environment.json` is the renderer-neutral presentation manifest for the exploration map. It describes terrain, an irregular path centerline, visible props, deterministic local dressing, the Moonberry interactable, ambient effects, presentation layers, pivots, quality tiers, and explicit prototype/production/fallback status. `src/lib/game/environment/contract.ts` owns validation and deterministic placement.

The contract uses authoritative server coordinates. Server X maps to Three X and server Y maps to Three Z. It does not contain collision radii, movement rules, eligibility, cooldowns, rewards, or persistence rules. Those remain authoritative in `services/world-server/src/world/traversalManifest.json` and the room systems. A solid visual prop may reference an existing server blocker through `collisionRef`; it may never create or modify that blocker.

Layers are ordered: terrain, terrain-detail, low-vegetation, prop, actor, companion, foreground, effect, label. Terrain and paths are walkable. Low vegetation and ambient effects never block. Props with `obstruction: true` must have a visible representation and an existing `collisionRef`. Interaction presentation uses `interactionRef`; the server remains the authority for interaction range and results.

Asset states are explicit: `prototype` is structurally valid temporary geometry or art; `production` is approved runtime art with a resolvable texture under `/game/environment/`; `fallback` is a deliberately selected safe visual. Production entries can additionally declare source-preserving runtime/static paths, a frame grid, FPS/loop/calm timing, world scale, collision policy, lightweight shadow metadata, interaction type, and renderer-only glow. Invalid metadata rejects the whole manifest rather than partially applying ambiguous presentation.

Decoration is renderer-local and deterministic. A field supplies a stable seed, count, bounds, asset choices, and exclusion radius. It is never synchronized or persisted and cannot affect traversal or rewards. The same manifest and seed generate the same placement after navigation, refresh, or context recovery.

The Three implementation in `environmentWorld.ts` shares geometry and materials, instances decorative ground details, keeps one registration per server blocker for obstruction fading, and owns idempotent cleanup. Quality reduction hides optional effects and flowers first, then low vegetation; blockers, terrain, paths, actors, and interactables remain visible.

The Moonberry contract includes a readable interactable silhouette, persistent location, soft aether emphasis, interaction-proximity pulse, and optional ambient motes. Availability, cooldown, inventory outcomes, and reward choice are not visual state and remain server-owned.
