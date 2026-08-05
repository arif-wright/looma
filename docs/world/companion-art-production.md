# Companion sprite art production

Preferred source pipeline:

```text
approved current 3D model
→ fixed orthographic render camera
→ 8 directional views
→ idle/walk animation render
→ transparent frame export
→ atlas packing
→ metadata generation/validation
→ Three.js HD sprite runtime
```

Only an explicitly approved current model or approved frame-production workflow may enter this pipeline. Repository presence does not establish visual authority: `static/models/muse.glb` is an old, deprecated Muse model and is prohibited as a source for Wilds production sprite art, proportions, silhouette, animation, or atlases.

Use a 256×256 transparent source cell for Muse, fixed orthographic camera when an approved current model is used, identical camera position/focal length, consistent neutral lighting, no baked background or ground plane, no frame-to-frame camera movement, and consistent silhouette scale. Supply N, NE, E, SE, S, SW, W, NW natively. Supply every approved frame without downsampling and declare each direction's actual count and timing; direction counts may differ. Foot contact must remain aligned to the declared feet point even when the body bobs.

Approved isolated frames enter through `art-source/world/companions/muse/production/v1/`; they never enter `static/` automatically. Run `npm run world:muse:validate` before packing and `npm run world:muse:pack` only after validation succeeds. Packing writes review artifacts outside the deployable tree. See `muse-production-asset-pipeline.md` for the exact intake and promotion process.

The updated Muse HD gameplay sprite-production sheet is Muse's primary approved visual/animation target and supersedes the earlier directional sheet. It defines the intended native views, initial animation reference, illustrated/chibi treatment, palette, scale, shadow, and glow character. It is still not a runtime input. Never automatically crop the sheet, infer frame rectangles from its grid, ship its labels/background/panels, or copy its overall canvas dimensions into metadata. Produce isolated transparent frames through the approved workflow. Direction names must be assigned using the Wilds world-facing contract and reviewed in-engine; panel position alone is not runtime mapping.

Keep outline thickness and value contrast readable when displayed at 80–110 px for companions. Put glow that materially defines the character in the color frame, but export broad aura, shimmer, and ambient particles separately where possible. Do not bake opaque shadow blobs into frames; the renderer provides a shared ground shadow. Maintain clean alpha edges without colored matte bleed.

Before delivery, validate every frame at Classic/Wide/Close, all yaw angles, dark/light terrain, 1×/2× DPR, reduced quality, and 5/10/20/32 entity density. Confirm atlas bounds, stable feet, no accidental mirroring, consistent silhouette, and that file names/manifest id are versioned.
