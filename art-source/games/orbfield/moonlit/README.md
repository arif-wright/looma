# Moonlit Conservatory artwork

Approved Orbfield art direction for Memvoya, October 4, 2026. The original generated PNG masters are kept here; runtime derivatives are in `static/games/dodge/skins/moonlit/`.

## Provenance

The built-in image-generation tool created the concept and three separate source assets. No stock asset pack, external paid service, or new 3D model was used.

The concept references the existing repository art:

- `static/assets/muse_background.png`
- `static/assets/gifts/gift-crystal-common-glow-pebble.png`
- `art-source/world/companions/muse/production/v1/frames/idle/s/muse_idle_s_01.png`

Muse’s runtime portrait is an export of that exact existing canonical frame. It is not a generated replacement. Echo’s existing sprites and Root’s background were inspected for stylistic consistency, but neither was substituted into this Muse skin.

The source filenames correspond to these generation requests:

- `moonlit-conservatory.png`: a top-down painted twilight garden background, dark lavender stone/moss clearing, flowers and warm brass lanterns around the outside, no characters, hazards, HUD, or text. Use the approved concept as the style reference. Keep the center quiet and readable.
- `pearl-wisp.png`: one centered round pearlescent crystal player sphere, cyan/lilac reflections, pale perimeter and simple value masses readable at 24px, true transparency, no platform, rings, character or text. Use the approved concept as the style reference.
- `thorn-mote.png`: one centered compact coral/amber thorn-seed crystal, eight pointed thorns, dimensional painted material, strong danger silhouette readable at 16px, true transparency, no long tail, ground shadow, face or text. Use the approved concept as the style reference.

The approved concept is preserved in the separate art-candidate delivery bundle. It is concept art rather than a screenshot of the implementation.

## Export contract

Run `python3 scripts/art/export-orbfield-skin.py` with Pillow installed. This only trims transparent margins, downsamples, and compresses; it does not repaint or generate art. Source masters remain intact. Runtime WebP preserves genuine alpha. Very faint edge pixels are excluded by the documented sprite trim boxes; collision geometry never derives from alpha bounds.

The four runtime assets total 119,692 bytes and approximately 2.65MB of decoded RGBA-equivalent image textures. This excludes the existing 2.07MB game canvas and browser overhead. There is no second cached canvas or per-frame filter/blur. `runtime-manifest.json` records dimensions, hashes, and exact memory scope.

## Geometry and appearance

- Logical canvas remains 960 × 540.
- Pearl sprite is drawn into the original 24 × 24 player diameter, over the original radius-12 pale collision body and a thin boundary ring.
- Entire thorn sprite is drawn into the original 16 × 16 hazard diameter. A warm radius-8 backing disc makes the round collision boundary visible through the concave gaps.
- Canonical Muse is a cosmetic satellite and a larger HUD portrait. It has no hitbox; this is explained in the controls text.
- Background uses an undistorted cover crop with a full-field dark veil, including the bright edge lanterns.
- Optional warp pulse and very small companion bob respond to the current reduced-motion preference. No camera shake, flashes, extra RAF loop, particles, or randomness are introduced.

Fine art detail remains limited by the unchanged mobile world scale: approximately 7.5px player and 5px hazard on a 320px viewport. The larger HUD portrait and visual legend preserve character identity and explain the silhouettes. Actual-size browser review remains required before publication.
