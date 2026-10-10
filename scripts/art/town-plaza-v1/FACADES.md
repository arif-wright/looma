# Original plaza facades

These are two new, deliberately unfinished flat-vector facades. They adapt the
code-native projection method of the frozen compact proof, not its dimensions
or any architecture raster. The larger lengths contain repeated window bays;
closed decorative doors remain 20 horizontal world pixels wide and 44 high.

## Reproduce

Requirements: Python 3, offline Inkscape CLI, and Pillow for verification.
From this repository root:

```sh
python scripts/art/town-plaza-v1/author-plaza-facades.py --checkout . --manifest scripts/art/town-plaza-v1/facade-manifest.json
python scripts/art/town-plaza-v1/verify-plaza-facades.py --checkout . --manifest scripts/art/town-plaza-v1/facade-manifest.json --rebuild
```

The scripts may be relocated together. For example, from the repository root
after copying the reviewed scripts into `scripts/art`:

```sh
python scripts/art/author-plaza-facades.py --checkout . --manifest scripts/art/facade-manifest.json
python scripts/art/verify-plaza-facades.py --checkout . --manifest scripts/art/facade-manifest.json --rebuild
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

## Evidence

- `facade-manifest.json`: complete grid vertices, drawn planes and polygons,
  world footprints, exact viewBox, bounds, layer origins and output hashes.
- `facade-hashes.json`: concise exact hashes and pixel-pivot contract.
- `facade-verification.json`: exact-axis, z-split, bounds, alpha, pivot,
  generated-data parity and byte-identical rebuild checks.
- Both new upper PNGs were visually inspected. Roof planes, repeated bays,
  human-scale doors and short-wall shutters are visibly sensible; surface art
  is intentionally an unfinished flat-vector prototype.

No browser was used or launched. No rejected architecture raster was read,
modified, resampled or traced. The frozen proof was left unchanged.
