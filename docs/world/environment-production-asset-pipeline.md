# Production environment asset pipeline

Status: Phase 8C.5 production-kit integration.

## Source boundary

Approved immutable sources live under `art-source/world/environment/production/v1/`. Runtime copies live under `static/game/environment/v1/`. `scripts/world/environment-assets.mjs` validates the expected source inventory, dimensions, alpha characteristics, occupied animation cells, and duplicate frames, then copies every PNG byte-for-byte. It writes `asset-audit.json` containing source/runtime paths, dimensions, transparency, frame count, and SHA-256 provenance.

Commands:

```bash
npm run world:environment:validate
npm run world:environment:prepare
npm run test:world-assets
```

The preparation command is deterministic and may overwrite runtime copies, but never source artwork. It does not resize, recolor, compress, redraw, or regenerate pixels. For each approved animation sheet it additionally extracts the exact top-left 256×256 frame-zero cell as a static/distance fallback; tests compare every extracted scanline to the corresponding source pixels.

## Discovered production sources

| Asset | Source | Dimensions | Alpha | Frames |
|---|---|---:|---|---:|
| Grass Base 01 | `terrain/grass_base_01.png` | 1254×1254 | no | 1 |
| Grass Base 02 | `terrain/grass_base_02.png` | 1254×1254 | no | 1 |
| Dirt Path | `terrain/dirt_path.png` | 1254×1254 | no | 1 |
| Grass/Path Transition | `terrain/grass_path_transition.png` | 1254×1254 | no | 1 |
| Broadleaf static | `trees/broadleaf/tree.png` | 1024×1024 | yes | 1 |
| Broadleaf idle | `trees/broadleaf/idle/tree-spritesheet.png` | 1280×1280 | yes | 25 |
| Evergreen static | `trees/evergreen/evergreen.png` | 1024×1024 | yes | 1 |
| Evergreen idle | `trees/evergreen/idle/evergreen-spritesheet.png` | 1280×1280 | yes | 25 |
| Large Rock | `rocks/large_rock_01.png` | 1024×1024 | yes | 1 |
| Medium Rock | `rocks/medium_rock_01.png` | 1024×1024 | yes | 1 |
| Grass Tuft static/idle | `vegetation/grass-tuft/` | 1024² / 1280² | yes | 1 / 25 |
| Flower Cluster static/idle | `vegetation/flower-cluster/` | 1024² / 1280² | yes | 1 / 25 |
| Aether Plant static/idle | `magical/aether-plant/` | 1024² / 1280² | yes | 1 / 25 |
| Moonberry static/idle | `magical/moonberry/` | 1024² / 1280² | yes | 1 / 25 |

All six animation sources are PNG sheets, not video. Each is a complete 5×5 grid of 256×256 cells. Every cell is occupied and pixel-distinct. Runtime ordering is explicitly defined as row-major, indices 0–24. This is pipeline metadata, not a claim that timing metadata was supplied with the art.

## Registry and placement

`src/lib/game/environment/wilds-exploration.environment.json` is the renderer-neutral registry and composition data. Stable IDs such as `tree.broadleaf`, `rock.large`, `vegetation.grass-tuft`, `magical.aether-plant`, and `interactable.moonberry` carry runtime paths, static fallback paths, frame grid, reviewed FPS/loop values, world scale, pivot, collision policy, shadow, interaction type, quality requirements, and optional renderer effects.

Map instances reference stable IDs plus server-space X/Y, scale, rotation, variant-ready identity, and an authoritative `collisionRef` only where the server already defines a blocker. Decorative fields create deterministic local placements and never create server entities.

## Animation policy

Animated cards share one sheet texture and plane geometry per asset. Per-instance shader uniforms select a frame without cloning texture data. A stable instance-ID hash chooses starting phase, small bounded speed variation, and calm timing. Artwork is never mirrored. Reduced/minimum quality and distant rendering use the exact extracted frame-zero texture. Full quality admits only the nearest animated asset family and keeps at most one decoded 1280² animation sheet resident; changing proximity disposes the previous sheet. Animation changes no gameplay or network state.

## Known source limitations

- FPS, loops, calm periods, pivots, world scale, and shadow dimensions were not supplied as sidecar metadata; current values are explicit integration settings requiring visual review.
- Terrain seamless tiling is not certified. The renderer preserves proportions and repeats rather than stretches, but seam and repetition review remains required.
- `grass_path_transition.png` is opaque rather than an alpha edge mask. It is rendered as a wider underlay beneath the path; a dedicated transparent edge asset would offer better blending control.
- Sheets are large single pages (approximately 6.25 MiB decoded each), so the runtime cache is intentionally bounded to one active environment animation sheet. Future approved packing/compression can permit more simultaneous ambient animation without changing registry or placement architecture.
- Full-resolution terrain and rock sources still place the environment near/above the earlier 32 MiB prototype texture target depending on active overlays. Approved optimized runtime derivatives and target-device profiling remain release blockers; this pass does not silently resample the art.
- Static masters are preserved and copied. Animated assets use pixel-identical extracted frame zero as their low-quality/distance fallback.
