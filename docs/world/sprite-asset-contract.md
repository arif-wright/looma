# Wilds HD sprite asset contract

Status: Phase 8C.3. Runtime parser: `src/lib/game/sprites/assetContract.ts`.

Each entity asset consists of one JSON manifest and one or more transparent atlas pages. Production files should use WebP or PNG; the Phase 8C SVG atlases are explicitly temporary pipeline fixtures. Put companions under `static/game/sprites/companions/<canonical-kind>/` and players under `static/game/sprites/players/<visual-id>/`. A final Muse manifest and its pages may replace the temporary files without renderer architecture changes.

The required direction order is clockwise world order: `n, ne, e, se, s, sw, w, nw`. A direction declares its provenance as `authored`, `mirrored-from-<direction>`, or `temporary-fallback`. Mirroring is performed only by the production packer from an explicitly declared approved source; the runtime never mirrors. Muse's asymmetric horns, wings, and tail make implicit mirroring unsafe.

Reference-sheet panels never define atlas cells. Only isolated transparent production frames packed into the declared image and the reviewed JSON coordinates are runtime assets. Do not derive coordinates, dimensions, direction mappings, or pivots automatically from a concept-sheet layout.

Version 2 requires `idle` and `walk`, declares atlas `pages`, and gives every rendered direction an explicit ordered `frames` array of `{ page, column, row }`. A clip supplies default FPS/loop behavior; any direction may override either. Counts are derived from each array, may differ by state and direction, and have no arbitrary runtime maximum. No frame is sampled, skipped, or downsampled by the importer. Version 1 single-image manifests remain readable and are normalized into the same explicit sequence model for the temporary assets.

Each animation also declares frame width/height, normalized pivot and feet points, display height in world units, and optional shadow, effect anchors, label anchor, and owner-spacing guidance. Additional named states can be added; unsupported states fall back to idle.

A temporary fallback instead declares an empty frame list, `source: "temporary-fallback"`, `temporary: true`, and an explicit `fallbackDirection`. Resolution preserves the requested gameplay facing and changes only the selected artwork. Fallbacks cannot chain, and no nearest-direction algorithm exists. Muse has no temporary direction fallback: walk NE is authored and walk NW mirrors it. Echo currently declares `walk.ne → walk.e` and `walk.nw → walk.w` until native Echo walk-NE artwork is supplied.

Atlas coordinates use a top-left image origin. Normalized points also use top-left `(0,0)` and bottom-right `(1,1)`. Runtime UV conversion accounts for WebGL's bottom-left texture origin. Metadata is rejected if a required direction is absent, a frame extends outside the image, native directions are false, timing is invalid, or idle/walk is missing. Failed metadata or image loading uses the configured safe fallback and never blocks the world session.

Current temporary version 1 assets retain their actual two-frame idle and four-frame walk sequences. Those counts are test-fixture data, not production limits. The production packer emits version 2 pages of at most sixteen 256 px frames (4096 px wide) and preserves exact source order across page boundaries.
