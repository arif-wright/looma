# Muse production asset pipeline

Status: Phase 8C.3 corrected. The original nine sheets were reclassified as Echo. Ten approved Muse sheets are now ingested into 250 isolated authored frames, validated, packed, and promoted under `static/game/sprites/companions/muse/`.

## Approved animation matrix

| State | N | NE | E | SE | S | SW | W | NW |
|---|---|---|---|---|---|---|---|---|
| Idle | Authored | Authored | Authored | Authored | Authored | Mirrored from SE | Mirrored from E | Mirrored from NE |
| Walk | Authored | Authored | Authored | Authored | Authored | Mirrored from SE | Mirrored from E | Mirrored from NE |

Mirroring happens once during packing and produces ordinary runtime atlas frames. The renderer never mirrors, rotates, generates, interpolates, or warps artwork. N and S are never mirrored.

Muse now has complete approved authored N/NE/E/SE/S idle and walk sources. NW/W/SW are the approved packed mirrors; there is no Muse direction-level TEMP fallback.

## Source intake

Only isolated reviewed 256×256 transparent PNG frames may be used. The approved sheet remains visual guidance; never crop its panels or infer atlas cells from its layout. `static/models/muse.glb` is deprecated and prohibited.

```text
art-source/world/companions/muse/production/v1/
  muse.production.json
  frames/
    idle/{n,ne,e,se,s}/muse_idle_<direction>_<NN>.png
    walk/{n,ne,e,se,s}/muse_walk_<direction>_<NN>.png
```

Metadata explicitly marks every matrix cell as `authored`, `mirrored`, or `temporary-fallback`. Only authored entries carry `frameCount` and require source files. Frame numbers are one-based, at least two digits, contiguous, and ordered. Counts and timing remain metadata-driven and are never downsampled.

## Validate and pack

```bash
npm run world:muse:ingest
npm run world:muse:validate
npm run world:muse:pack
```

The ingest command accepts only the ten explicitly named Muse 1280×1280 5×5 production sheets. It reads populated cells in row-major order and requires their count to match approved metadata. It does not resize, sample, interpolate, key backgrounds, or process reference sheets.

Custom paths:

```bash
node scripts/world/muse-assets.mjs validate --source /path/to/approved-muse
node scripts/world/muse-assets.mjs pack --source /path/to/approved-muse --output artifacts/world/companions/muse/v1
```

Validation rejects missing approval/provenance, the deprecated GLB, missing or unexpected frames, invalid dimensions/alpha, blank or duplicate frames, invalid timing/pivots, undeclared derivation, rejected direction mappings, and chained fallbacks.

Packing horizontally mirrors only the approved NE→NW, E→W, and SE→SW mappings. It emits version 2 metadata plus pages of at most sixteen 256 px frames:

```text
artifacts/world/companions/muse/v1/
  muse.atlas.json
  muse.idle.n.p01.png
  muse.idle.n.p02.png
  muse.<state>.<direction>.p<NN>.png
```

Muse Walk NE is authored and Walk NW is packed as its approved horizontal mirror. Echo retains the earlier explicit Walk NE→E and NW→W direction fallbacks until native Echo NE walk art is supplied.

## Development inspection

Run Three.js locally and use either:

```text
/app/world?worldMuseAnimation=walk.ne
__MEMVOYA_WORLD_THREE__.forceMuseAnimation('walk.nw')
__MEMVOYA_WORLD_THREE__.forceMuseAnimation(null)
```

The diagnostics show companion identity and canonical archetype, requested and resolved manifest URLs, asset status, current atlas page, requested combination, resolved combination, provenance, fallback reason, last loading error, current/total frame, FPS, pages, and decoded memory. Non-sensitive asset state is also exposed through `data-muse-*` attributes on the Three canvas for deployed-browser inspection. The override is development-only and changes neither `FacingDirection`, movement input, `WorldSession`, network state, authority, nor companion trails.

Established Muse species/seed values (`muse`, `mirae`, `lumina`, `harmonizer`, `looma`, and a legacy missing species) are canonicalized to `muse` when the world ticket is issued. The renderer repeats the alias resolution defensively and requests `/game/sprites/companions/muse/muse.atlas.json`. A Muse manifest must declare `status: production`.

The TEMP player atlas is used only when a production companion manifest or its initial texture page cannot load, decode, or validate.

## Promotion record

The corrected Muse pack contains 32 bounded PNG pages and a version 2 manifest. The reclassified Echo pack contains 28 pages. Only the active direction's pages are retained at runtime. Physical-device visual review, final timing tuning, and density measurements remain release follow-ups rather than claims made by CI.
