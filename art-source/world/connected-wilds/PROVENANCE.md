# Connected Wilds illustration sources

Created 2026-10-05 for the user's requested Wilds visual upgrade and connected levels. Both images were generated with the built-in image generation tool, saved locally, inspected as real pixels, and copied byte-for-byte into runtime assets. No existing production character artwork was regenerated, mirrored, recolored or cropped.

## Lantern portal

- Immutable source: `lantern-portal-original.png`
- Runtime: `static/game/world/connected-wilds/lantern-portal.png`
- Actual dimensions: 1161 × 1355, RGBA, transparent exterior and central opening
- Runtime grounding: normalized foot anchor `(0.5, 0.92)`; height 143 world pixels in Phaser
- The arch is a travel marker, not a collision barrier. Interaction range and destination come only from the shared authoritative area manifest.

Final generation prompt:

“Use case: stylized-concept. Asset type: transparent isolated production game environment sprite. Primary request: a beautiful small magical garden portal for a cozy illustrated fantasy game, a rounded ancient pale-stone arch wrapped in deep emerald ivy and tiny violet moonberries, one warm golden hanging lantern on each side, a softly luminous translucent blue-lilac opening with a few tiny stars. Front view with slight top-down view of the base, grounded oval stone threshold, centered entire arch including top and bottom in the frame with ample transparent margin. Rich hand-painted storybook fantasy art, warm magical Moonlit Conservatory atmosphere, nuanced painterly texture and charming rounded silhouette. The portal must still read at 110 pixels tall. Keep the center opening visibly open; no wall, no surroundings, no characters, no text, no watermark. Genuine transparent background.”

## Lantern cottage

- Immutable source: `lantern-cottage-original.png`
- Runtime: `static/game/world/connected-wilds/lantern-cottage.png`
- Actual dimensions: 1377 × 1142, RGBA, transparent exterior
- Runtime grounding: normalized foot anchor `(0.5, 0.87)`; height 3.35 × each authoritative cottage blocker radius
- Used only for Hollow's `cottage-hollow-west` and `cottage-hollow-east` circles. Decorative windows/doors imply no entering or housing mechanic.

Final generation prompt:

“Use case: stylized-concept. Asset type: isolated production environment sprite for a cozy illustrated fantasy game. A tiny utterly charming woodland cottage, front view with slightly elevated top-down perspective, full roof and building and foundation visible, rounded compact silhouette. Pale warm stone walls, rich teal-green shingle roof with a rounded gable, tiny chimney, curved carved wooden door, two warmly glowing golden windows, a hanging amber lantern beside the door, small ivy trailing on the side and a low circular stone doorstep. Detailed hand-painted storybook fantasy art, cozy warm light, nuanced painterly texture and crisp readable silhouette matching an HD chibi roleplaying game. No surroundings or background, no lawn patch, no fence, no characters, no text, no watermark, no cast background shadow. Entire cottage centered with generous transparent margins on all sides. Genuine transparent background. Sprite readable at 130 pixels high.”

## Reused production assets

Existing audited environment assets under `static/game/environment/v1` supply grass, dirt, broadleaf/evergreen trees, rocks, flowers, tufts, aether plants and Moonberry. Existing production manifests under `static/game/sprites/players/{male,female}` and `static/game/sprites/companions/{muse,echo}` supply the canonical animated chibi pixels. All frame lists, explicit directional mappings and foot anchors are respected by the Phaser presentation helper; only runtime display scale changes.

Reference concepts in the repository remain reference-only and were not copied into runtime backgrounds.
