# Muse frame validation checklist

Use this checklist with `npm run world:muse:validate`. Automated success is necessary but not sufficient for art approval.

## Delivery and provenance

- [ ] Delivery reproduces the updated approved Muse HD gameplay sprite-production sheet as the primary target.
- [ ] The earlier directional sheet was not used to override any updated HD-sheet decision.
- [ ] `static/models/muse.glb` was not used.
- [ ] Concept/reference sheets were not cropped or shipped as frames.
- [ ] `muse.production.json` contains a traceable `sourceApprovalId`, identifies the updated sheet in `primaryVisualReference`, and has `status: "approved"`.

## Automated frame contract

- [ ] Authored source frames exist for idle N/NE/E/SE/S and walk N/E/SE/S.
- [ ] Derived idle NW/W/SW and walk W/SW match their explicitly approved horizontal mirror sources.
- [ ] Walk NE contains the approved authored frames and walk NW declares the approved mirror of NE; neither direction uses the TEMP sprite or a temporary direction fallback.
- [ ] Every authored direction contains exactly its metadata-declared frame count (24+ is supported).
- [ ] The delivery was not downsampled to the temporary atlas's two-idle/four-walk counts or the reference grid's four/six examples.
- [ ] Every filename follows `muse_<state>_<direction>_<NN>.png`.
- [ ] Every file is a readable 256×256 PNG with visible and transparent pixels.
- [ ] No unexpected PNGs, missing indices, or pixel-identical duplicate frames exist.
- [ ] Idle/walk pivot, feet, scale, timing, and loop metadata validate.

## Visual review

- [ ] Scale, lighting, outline weight, palette, and silhouette are consistent across directions.
- [ ] Rendered Classic-camera height is approximately 96 px after metadata scaling.
- [ ] Cyan/aether glow remains readable and restrained, and the soft circular shadow matches the approved target.
- [ ] Horn, near/far wing, tail, forehead crystal, chest crystal, markings, limbs, and feet remain spatially coherent.
- [ ] No direction is mirrored unless a specific exception is approved and documented.
- [ ] Feet remain stable through each cycle without sinking, skating, or floating.
- [ ] Idle loops without a visible seam; walk has clear contact/passing poses and loops cleanly.
- [ ] Transparent edges have no matte fringe and no baked background or opaque ground shadow.

## Runtime review before promotion

- [ ] Generated manifest parses with the Phase 8C contract.
- [ ] Inspector confirms requested NE/NW world-facing remains unchanged while only walk artwork resolves to E/W.
- [ ] Diagnostics distinguish authored, mirrored, and temporary-fallback cells.
- [ ] Every ordered frame is reachable, and multi-page transitions loop at the reviewed FPS without a hitch.
- [ ] Loaded-page count and decoded texture-memory diagnostics remain within the agreed device budget.
- [ ] Muse is readable in Classic, Adventurer, Wide, and Close at representative yaw/pitch.
- [ ] Owner spacing, label, shadow, aura anchor, and reduced-quality behavior remain correct.
- [ ] 5/10/20/32 density measurements meet agreed budgets on desktop and target mobile.
- [ ] Context restore and route re-entry do not duplicate textures, canvases, or sessions.
- [ ] Promotion into `static/` has explicit approval.
