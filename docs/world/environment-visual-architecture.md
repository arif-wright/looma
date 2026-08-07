# Environment visual architecture

Status: Phase 8C.6 illustrated hybrid 2.5D contract. This phase does not change map geometry, server authority, collision, persistence, or production pixels.

## Repository audit

- `cameraController.ts` supplies orthographic presets, smooth follow/orbit, continuous yaw, and constrained pitch/zoom. `threeWorld.ts` alone translates camera-relative input.
- Players and companions use `HdSpriteEntity`: upright animated cards, shared atlas caching, feet anchors, unlit color, labels, and separate shadows.
- `environmentWorld.ts` builds X/Z terrain and path geometry, shared illustrated cards and shadows, deterministic local animation phase, renderer-only motes, quality filtering, bounded animation-page residency, obstruction fading, diagnostics, and disposal.
- The v1 manifest owns visual placement, never collision. Blocking instances reference `WORLD_TRAVERSAL`; visual size is not an authoritative footprint.
- Phase 8C.5 trees, rocks, and vegetation are single-view cards. Rocks also rotate toward the camera. Existing tree/rock pixels contain terrain patches and inconsistent baked lighting, so they are prototype/reference assets under this contract.
- Transparent cards depth-test but do not depth-write; alpha below 0.025 is discarded. Obstructing props fade along the camera-to-player ray.

Retained: renderer-neutral coordinates, collision references, unlit textures, shared resources, deterministic animation offsets, quality states, static fallbacks, obstruction fading, diagnostics, and teardown. Changed: camera envelope, versioned presentation metadata, render classes, rock orientation, terrain filtering, directional-view foundation, explicit anchors/provenance/LOD, and inspector detail.

## Camera envelope

Yaw remains continuous through 360°. Pitch, measured above the X/Z plane, is clamped to 30°–58°. The lower bound avoids card-edge/horizon exposure; the upper bound stays far from the 90° overhead collapse. Classic is 45°, Adventurer 38°, Wide 55°, and Close 42°. Zoom remains 0.65–1.8.

The development review matrix is Classic/Adventurer; pitch 30°/58°; yaw 0°/45°/90°/180°; zoom 0.65/1/1.8. In development, `?worldCameraYaw=45&worldCameraPitch=58&worldCameraZoom=1` opens an exact review state; values remain clamped. Existing diagnostics and canvas datasets record it. Straight overhead is unsupported.

## Data-driven render classes

| Class | Use | Runtime behavior |
|---|---|---|
| `terrain-surface` | biome ground, paths, transitions | horizontal mesh, repeated sRGB texture |
| `directional-impostor` | major trees/future structures | upright card plus camera-relative authored-view selection |
| `upright-billboard` | flowers and selected vegetation | yaw-facing upright card |
| `ground-prop` | rocks, logs, low solids | stable horizontal plane; never spins toward camera |
| `ground-detail` | tiny terrain contact detail | ground-oriented non-blocking detail |
| `fx-decorated-prop` | Aether Plant/Moonberry | visible base plus separately budgeted effects |
| `particles` | restrained motes | renderer-only shared effect |

V1 manifests pass through one compatibility resolver. V2 production assets must explicitly declare `renderClass`, `groundAnchor`, and `provenance`; filenames never select behavior and `threeWorld.ts` has no asset-specific branches.

## Directional impostors and animation

Production trees should use eight authored views. Four plus mirroring is not the default because silhouette, branches, roots, and baked lighting reveal reflection. Mirroring is permitted only per asset/direction with art approval.

The resolver divides the camera-relative object angle into eight 45° sectors and retains the previous view for another 5° at boundaries. Object rotation is subtracted. Selection is renderer-only and never networked. Existing one-view trees report direction but render the upright temporary fallback.

All directional views share one stable instance animation clock, so orbiting never restarts animation. Instance hashes provide phase and bounded speed variation. Direction pages/materials are shared. Near uses full animation; mid retains direction at reduced update/FPS; far uses a representative static direction. Current one-page residency remains until directional assets are profiled.

Directional selection is not billboard orientation. Selection uses camera azimuth relative to the stationary prop. The presentation plane separately yaws about world Y so its normal faces the camera, with no pitch rotation. The group remains at its server-mapped X/Z point and the plane offset keeps the declared ground anchor planted. Environment LOD uses horizontal X/Z distance rather than full camera distance, so camera height cannot disable a nearby animation.

## Representation decisions

Rocks use `ground-prop`: a horizontal, camera-independent plane with a stable footprint. It is predictable through 360° yaw and cannot become edge-on within the pitch envelope. Replacement art must be composed for this projection; collision remains a separate server circle.

Grass tufts and flowers use upright billboards for animation readability. Aether Plant and Moonberry use `fx-decorated-prop`; base art must work without glow. Crossed planes are deferred because they double transparent overdraw and require intersection-specific art. Dense tiny static details may use `ground-detail`.

## Terrain and biomes

Terrain exclusively owns ground appearance. Composition is base terrain + path/terrain type + transition/blend + ground detail + props + magical effects. Reusable props cannot carry surrounding grass, dirt, snow, sand, or biome floor. A biome changes terrain layers, not tree/rock identity.

The current widened opaque transition strip is temporary. The recommended production approach keeps the renderer-neutral centerline and uses authored alpha/grayscale edge masks in a lightweight two-texture blend shader. This supports organic paths and future biomes without redesigning the map. Required art is seamless base surfaces, path fills, and neutral transition-mask/brush families. Full splat-map editing is deferred.

Terrain uses sRGB, repeat wrapping, mipmaps, trilinear minification, linear magnification, and conservative anisotropy. Repeat density is configuration, never a source-pixel rewrite.

## Grounding, shadows, depth, and collision

Every v2 asset has normalized `groundAnchor`: feet for actors, root center for trees, footprint center for rocks, and root/base for vegetation. Anchors stay in world space and never use camera-specific pixel offsets. Visual bounds, anchor, shadow, and collision are separate.

Shadows are shared renderer effects, never baked terrain islands. Actors, trees, rocks, Moonberry, and substantial vegetation may opt in; tiny details normally do not. Quality may disable decorative shadows.

Props retain depth testing. Cutouts use a small alpha discard; translucent/fading cards avoid depth writes to prevent rectangular occlusion. Opaque ground props may later use an art-reviewed alpha-test/depth-write policy. Render order expresses visual layer intent, not collision. Obstruction fading remains renderer-only.

## Lighting and art standard

Illustrated art targets neutral daylight from upper-left/front-left (approximately northwest, 35°–45° elevation), soft broad shadows, open-sky fill, restrained highlights, readable midtones, and no crushed blacks. Saturation stays rich but below magical emissive accents. Do not bake heavy ambient darkness or terrain-colored bounce into reusable props. Review actors, terrain, and props together at Classic 45°. Runtime remains unlit and does not numerically repair inconsistent art.

## Animation, effects, and performance

Metadata supports variable frame counts, FPS, loops, calm intervals, rate variation, static fallback, and future directional/multi-page atlases. Animation remains local. Shared texture/material caching and deterministic clocks are mandatory; LOD eviction and teardown dispose resources.

LOD is metadata-driven: near = full direction/animation/optional FX; mid = direction plus reduced animation/FX; far = static direction, no particles, reduced updates. Defaults are 12 and 22 visual units pending device profiling. Full/reduced/minimum remains the global budget. Effects stay pooled, sparse, optional, and independent of base visibility.

## Replacement art requirements

Broadleaf Tree v2 and Evergreen v2: eight native directions; transparent terrain-neutral canvas; identical dimensions, padding, scale, and root anchor; stable silhouette/lighting; identical idle counts/timing per direction; static representatives; no surrounding dirt/grass; no mirroring without approval.

Large Rock v2 and Medium Rock v2: transparent terrain-neutral ground-prop projection; no terrain island; stable footprint-center anchor; consistent world lighting; sufficient padding; optional tiny attached moss only; separate visual/collision dimensions; no camera-facing assumption.

All sources require lossless transparent PNGs and sidecar metadata specifying provenance, dimensions, ground anchor, scale reference, lighting, direction/frame naming, mirroring permission, shadow policy, and alpha rules. Source masters stay outside `static/`; runtime derivatives remain isolated under the environment path.

## Remaining temporary debt

- Phase 8C.5 tree/rock art is biome-dependent and not v2 production art.
- Trees have one view; directional selection currently uses the temporary visual fallback.
- The path transition is opaque/rectangular rather than mask-blended.
- Ground-plane rocks require review with projection-correct v2 art.
- Directional multi-page loading is contracted but inactive without approved views.
- LOD thresholds, anisotropy, shadow sizes, and animation budgets need mobile profiling.
