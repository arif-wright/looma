# Environment production handoff

Phase 8D does not ship final environment art. Artists can prepare approved assets against this structure without changing world behavior:

The approved style target is documented in `environment-visual-direction.md`, referencing `art-source/world/environment/references/3bf40675-74cc-4a44-bff9-fffa7e249a19.png`. That image is reference-only: do not ship it, use it as a background, crop assets from it, or derive map/collision coordinates from its composition.

```text
static/game/environment/wilds-exploration/v1/
  terrain/grass-base.webp
  terrain/path-edge.webp
  props/tree-01.webp
  props/rock-01.webp
  props/grass-tuft-01.webp
  props/flower-01.webp
  interactables/moonberry-grove.webp
  effects/aether-mote.png
```

Files are expected to be transparent PNG or lossless WebP for props/interactables/effects, sRGB, premultiplied-alpha safe, tightly but consistently framed, and free of labels or baked UI. Terrain textures must tile cleanly. Keep a stable ground-contact point across variants. Record normalized pivot X/Y, authored pixel dimensions, intended world width/height, layer, and whether the image can visually obscure an actor. Do not encode collision shapes in art metadata.

Recommended initial source targets are 512–1024 px tileable terrain swatches, 256×384 tree cards, 256×192 rocks, 128×128 ground details, and 256×256 Moonberry artwork. These are production-source targets, not permission to upscale or fabricate art. Runtime texture budgets and device testing may require separately approved derivatives.

For every delivery:

1. Place approved files under the versioned directory above.
2. Change only the matching asset definition in the environment manifest: set `status` to `production`, `renderer` to `billboard` or the approved surface mode, add `/game/environment/...` texture, and retain an explicit prototype fallback during rollout.
3. Run manifest validation, unit tests, build, and browser network checks.
4. Inspect ground contact, actor overlap, camera rotation, every camera preset, reduced/minimum quality, WebGL context recovery, and repeated navigation.
5. Confirm every visible solid aligns with its existing authoritative blocker. Collision changes require a separate server-reviewed traversal change.

Acceptance requires no missing textures, no matte halos, correct alpha, correct pivot, stable scale, readable Moonberry state, no invisible blockers, no new collision metadata, deterministic decoration, and GPU measurements within `performance-budgets.md`. Production assets must remain substitutable by manifest data; renderer code must not branch on individual filenames.

Visual acceptance also compares isolated assets and the assembled slice against the approved qualities in `environment-visual-direction.md`: painterly grass variation, organic path transitions, strong foliage and rock silhouettes, composed vegetation pockets, clear traversal, restrained cyan/violet aether accents, environmental grounding, and a distinctive Moonberry silhouette. Similarity of painted object placement is neither required nor permitted as an authoring source.

Still missing at Phase 8D foundation: all approved terrain, path, foliage, tree, rock, Moonberry, and ambient-effect art; art-direction sign-off; target-device GPU captures; and approved compressed derivatives.
