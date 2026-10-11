# Original plaza facades

These are two deliberately unfinished, textured code-native facades. They adapt
the projection method of the frozen compact proof, not its dimensions or any
architecture raster. The larger lengths contain repeated window bays;
closed decorative doors remain 20 horizontal world pixels wide and 44 high.

## Reproduce

Requirements: Python 3, offline Inkscape CLI, and Pillow for verification.
From this repository root:

```sh
python scripts/art/town-plaza-v1/author-plaza-facades.py --checkout . --manifest scripts/art/town-plaza-v1/facade-manifest.json
python scripts/art/town-plaza-v1/verify-plaza-facades.py --checkout . --manifest scripts/art/town-plaza-v1/facade-manifest.json --rebuild
```

The four Python files and frozen invariant JSON form one authoring toolset. The
SVG material references are relative to the repository layout, so retain the
`static/games/arpg/town-plaza-v1` and `art-source/arpg/town-surface-v1` paths.
Run the bounded negative/positive contract checks with:

```sh
python scripts/art/town-plaza-v1/test-facade-surfaces.py
```

The frozen proof is not needed for regeneration. Its source path and SHA-256
are provenance metadata. Add `--original-proof-source PATH` to the verifier
when that original Python file is available to verify it is unchanged.

## Geometry and import contract

- All art, solid footprints and cutaway planes derive from
  `P(u,v,z) = (64(u-v), 32(u+v)-z)`.
- Both grid bodies have length 4, depth 1, and `t=-4..0`, `d=-1..0`.
- Rear: axis u, contact `(1496,432)`, wall 96, ridge rise 24.
- Endcap: axis v, contact `(1728,376)`, wall 72, ridge rise 16.
- Foundation vertices are at `z=0..8`; upper vertices are at `z=8..ridge`.
- Foundation and upper PNGs use the same integer-aligned SVG viewBox and
  pixel dimensions for each facade. There is no crop difference or letterbox.
- Resolution is exactly 2 source pixels per world pixel. Import at scale 0.5
  with each generated `originX`/`originY`; do not infer a bottom-center pivot.
- Rear source is 656×544, contact pixel `(520,536)`.
- Endcap source is 656×480, contact pixel `(136,472)`.
- Five upper major-plane polygons match the drawn walls, gable and roof planes.
- No floor diamond, cast shadow, perspective convergence or silhouette-based
  collision approximation is authored.

`townFacadeData.ts` is derived data. Do not hand-edit its footprint constants.
Use the script to make future geometry changes. Full and split SVG originals
are retained beside the four runtime PNGs in `static/games/arpg/town-plaza-v1`.
Only the four PNG URLs in the generated descriptors need loading at runtime.

The foundation texture has fully opaque interiors with antialiased silhouette
edges. Runtime cutaway must leave the foundation sprite at alpha 1 and fade only
the upper sprite. Texture verification alone does not establish runtime alpha
or actor visibility; the engine and hosted movement tests establish that.

## Finite surface-material contract

The original facade verifier prohibited every raster input. This surface pass
replaces that blanket rule with an exact two-file, hash-pinned allowlist. Both
are newly generated original flat diffuse materials, not perspective building
images. No rejected architecture raster is read, traced, warped or resampled.

| Input under `art-source/arpg/town-surface-v1/` | SHA-256 |
| --- | --- |
| `roof-clay-diffuse-v1.png` | `c97f3741cf4df20975011a999be57c55d6f640ec6f96b4e786d7255739795da4` |
| `plaster-limewash-diffuse-v1.png` | `72b2fc6432342ab01c916471e16dcb87225fdb96de5966fb2fd4936890971516` |

Both inputs retain their native 1254×1254 RGB bytes. Opposite edges are not equal;
these are finite surface samples, **not seamless repeating textures**. Each long
plane uses one full source width over 256 world pixels (4.8984375 source texels
per world pixel), with no long-axis phase or internal wrap. Short-axis crops and
short-wall crops remain wholly inside the native image. There is no repeat,
mirror addressing, material repair, external URI or runtime material load.

`facade_surfaces.py` projects source corners from the same exact grid as each
wall/roof. Each material image and normal face tint lives in its own fixed SVG
group, clipped 1.25 world pixels inside the corresponding existing upper plane.
Roof courses, recesses and sparse timber wear are original vector details. Only
two selected window panes use muted amber; there is no bloom or light system.
The four-cell bodies, door apertures, major planes and source bounds remain fixed.

The verifier independently reconstructs every clip, material choice and affine
placement. It rejects unknown paths/hashes, input symlinks, extra image nodes,
remote URLs, changed placement, missing/widened clips, opacity/filter/script/CSS
injection and transformed native geometry. Root, native-layer and native-polygon
attributes are exact allowlists; native fill paints must be literal RGB colors. Mutation tests include a changed
upper alpha pixel and changed foundation RGB after rehashing the ordinary output
manifest, proving that those changes still fail the frozen independent baseline.

`facade-invariants-v1.json` pins the accepted 4545e7ae geometry/import contract,
upper/foundation alpha masks, complete foundation file bytes and runtime data.
Its SHA-256 is `e954a64b82e2d0f5c269f885f6f450b44a7bbc1605e9798f1f153485dbd55ad6`.
No output alpha is repaired after rendering: offline SVG export naturally retains
all alpha bytes. Both foundation SVG/PNG pairs and `townFacadeData.ts` remain
byte-identical to the accepted baseline. Only the two full SVGs and their two
upper SVG/PNG pairs change. Runtime still loads exactly four facade PNGs.

## Evidence and limits

- `facade-manifest.json`: complete grid vertices, drawn planes and polygons,
  world footprints, exact viewBox, bounds, layer origins, material source records,
  finite affine/clip placements and output hashes.
- `facade-hashes.json`: concise exact hashes and pixel-pivot contract.
- `facade-verification.json`: exact-axis, z-split, bounds, full alpha-mask,
  foundation-byte, pivot, generated-data parity and deterministic rebuild checks.
- `test-facade-surfaces.py`: 43 positive/negative contract checks.
- Offline native and desktop/phone-scale inspection shows a quieter roof,
  worn plaster and restrained recess/trim detail. This is an incremental material
  improvement; it remains visibly geometric and is not finished concept artwork.

These checks do not replace hosted Phaser screenshots or movement/visibility
acceptance. No browser was used or launched for authoring. Runtime camera,
collisions, cutaway alpha, navigation, interactions and rewards are unchanged by
these assets. The prior proof, original material bytes and rejected architecture
rasters remain unchanged.
