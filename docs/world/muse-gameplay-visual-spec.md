# Muse gameplay visual specification

Muse is adapted from the current approved Memvoya companion design direction; Phase 8C does not redesign her. The updated Muse HD gameplay sprite-production sheet is the primary approved visual and animation reference and supersedes the earlier directional sheet. Current approved Muse companion design references remain supporting guidance. Required recognition cues are a purple/lavender body, large expressive eyes, horns, wings, tail, chest crystal, forehead markings, luminous cyan/aether accents, soft magical glow, and chibi proportions.

> **Deprecated source warning:** `static/models/muse.glb` predates the current Muse design direction. It is retained only for compatibility with existing non-Wilds surfaces and must not be used as a canonical reference or as input for production sprite proportions, silhouette, animation, rendered frames, or atlas generation. Do not delete or replace it as part of Phase 8C.

## Approved HD gameplay reference

The updated HD sheet is canonical for gameplay silhouette, proportions, rendering style, palette, native eight-direction appearance, approximate 96 px Classic-camera height, soft circular shadow, ground contact, and cyan/aether glow treatment. Its depicted four-frame idle and six-frame walk grids established the initial validation slice, not a production frame ceiling; approved production deliveries may contain longer direction-specific sequences (including approximately 24 idle frames). It remains a production reference rather than a runtime asset. It is not stored under `static/`, parsed by the runtime, cropped into frames, or treated as an atlas. Its background, grid, labels, panels, spacing, and overall sheet dimensions are non-sprite content. Individual depicted frames guide the final isolated delivery but are not assumed to be pixel-perfect final production frames.

The prior directional sheet is historical supporting context only where it does not conflict with the updated HD sheet. The updated sheet controls when the two differ. Production direction assignment must still be verified against the Wilds world-relative facing contract rather than inferred from panel position alone.

Stable cues to preserve when authoring isolated transparent frames:

- a large rounded head and compact chibi torso with a strong readable silhouette;
- a paired high crescent-horn silhouette whose overlap changes naturally by view;
- broad lateral wing structure with native near/far-wing visibility in diagonal and side views;
- a substantial tapered tail whose attachment, curve, and ground clearance remain spatially coherent through all eight views;
- centered forehead and chest crystals, with placement following the form rather than sliding between directions;
- consistent cyan luminous horn bands, wing edging, crystals, markings, and tail accents;
- stable eye, muzzle, limb, and foot proportions between front, diagonal, profile, and rear views;
- native asymmetric views for all eight directions—no automatic horizontal mirroring.
- HD illustrated/chibi rendering with consistent purple-to-violet forms, blue/cyan crystal accents, restrained luminous markings, and readable value separation at gameplay scale;
- soft circular grounding shadow and stable feet without importing the sheet's rendered floor or background.

The approved reference confirms the existing target of approximately 96 px rendered height in the Classic camera and a companion visibly subordinate to the player. Runtime scale continues to come from reviewed atlas metadata rather than the sheet's canvas measurements.

The current `muse.test-atlas.svg` is a temporary pipeline proof, not approved production artwork. It deliberately includes recognizable color/silhouette cues and visible direction/frame labels. Replace it later with reviewed native-eight-direction frames produced from the correct current model or another approved art-production workflow—not from the deprecated GLB—while retaining `muse.atlas.json` semantics and URL, or updating only the manifest image field. No runtime change should be necessary.

Gameplay target is 2.5 world units tall, roughly 96 px in Classic, with feet at normalized `(0.5, 0.92)`, subordinate nameplate at 2.575 world units, preferred owner distance 1.35 units, and minimum readable spacing 0.8. Production delivery requires 256×256 transparent source frames with each direction's actual ordered count and reviewed FPS/loop metadata. The live temporary atlas intentionally remains at 2 FPS/2 idle frames and 8 FPS/4 walk frames until approved real frames exist.

Every production direction must preserve consistent illustrated/chibi scale, lighting, foot contact, and silhouette. Final directions are native artwork and may not be mirrored unless art direction explicitly approves a specific exception.

The chest crystal `(0.5,0.56)`, forehead `(0.5,0.29)`, and aura `(0.5,0.9)` anchors are reserved for lightweight layers. Phase 8C implements only a restrained cyan aura ring at full quality. No effect changes authority, movement, companion state, memory, or networking.
