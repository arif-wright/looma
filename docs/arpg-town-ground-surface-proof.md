# Town paving and perimeter surface proof

Status: bounded local candidate based on PR18 head4545e7ae. No new browser execution has occurred. The earlier14case/19image hosted pass is baseline evidence only. The new fixture requires14cases/21images and219schema tests. Facade surface treatment is documented separately.

## Visual changes

The original worn-paving PNG remains byte-identical (SHA256 a6406fe5761ae2e01ccc5296e3c7622c0e0eeda9e2fc8a6e03ab66af0e886091). It is still a nonperiodic source. The existing128px source quadrant spans four logical cells, mirrored into256×256. No scale, rotation or projection change is made.

A bounded create-time sampler chooses stable integer UV offsets at vertices of a160px triangular grid. Three continuous barycentric weights, sharpened to power6 and normalized, blend those offset samples. Adjacent triangles share vertex hashes and zero-weight opposing vertices. This removes the short exact mirror period without hard patch joins. It does blend different joints in transition regions. It is not new seamless artwork.

The entire896×576 UV field is projected once onto the existing1344×672 ground canvas. The canvas still sits at(128,−168), scale2, depth−161, and uses LINEAR filtering. The original global pixelArt setting, actors and source textures are unchanged.

One102-face Graphics object draws a flat continuous coping on the already blocked ring at depth−160. Its inner edge is the original half-cell interior; its outer edge is the outer extent of the existing perimeter cells. Exact128×64 axes are retained. All solid faces lie wholly in a blocked-ring half-plane, with no vertical overhang onto interior ground. Twelve restrained contact-shadow bands are baked inside the ground clip. The continuous cool edge replaces88isolated legacy town wall images. The wall-cell set, random selection sequence, room bounds, collision calculations and dungeon walls remain unchanged.

## Offline pixel evidence and limits

The review package includes labeled desktop/phone ground-only and perimeter-only diagnostic images. These use the production pure sampler and copied projected coordinates, but Pillow resampling rather than Phaser. They contain no actors or UI and cannot establish runtime readability or renderer seams.

At the old256px UV period, normalized luma correlation falls from1.0 to0.00329 horizontally and0.000249 vertically. Mean luma changes from0.462177 to0.462092; median changes from0.466114 to0.465496. Mean local gradient falls7.2%, from0.06650 to0.06171. Both the art review and implementation review saw reduced dark-diamond repetition and localized softer/doubled fine grout in transitions. No extra blur was added. The candidate is suitable for a bounded same-camera hosted A/B, subject to rejection if actual pixels look muddy.

Shared-edge weight discontinuity measured at an epsilon of1e−7 is at most1.1251e−8. Actual neighboring-pixel luma differences across grid edges stay within ordinary source-stone variation: horizontal-edge mean0.03213 versus interior0.03658; vertical-edge mean0.04368 versus interior0.04117. These are diagnostics, not guarantees of seamless appearance under GPU filtering.

## Creation cost and lifetime

The raw1254×1254 source decodes to approximately6,290,064RGBA bytes, unchanged. The surviving1344×672 ground is3,612,672bytes per canvas/GPU copy, unchanged. The temporary896×576 field is2,064,384bytes per canvas, ImageData or possible GPU copy; the256² source readback is262,144bytes. Allow roughly7.0MB transient texture/readback capacity plus ordinary allocator/Graphics overhead and the already-existing ground/source allocations. Browser/GPU allocation behavior can differ; this is a dimensional upper estimate, not measured heap usage.

The pure Node sampler took226–330ms over five local samples, median238ms. That excludes browser downsampling/upload and does not predict phone or hosted timing. No field or rim is regenerated during update. The temporary material texture is removed immediately after baking; all town images, the rim and the surviving derived texture are released on teardown. Reentry creates distinct owners. Tests cover read/allocation/write, rim naming/depth/drawing and registration failures, with owned-resource rollback.

## Validation and hosted acceptance

Local focused tests pass89/89: TownCorner39, TownSurface17, ExpeditionScene33. The fixture passes219schema/replay tests, TypeScript, bundle build and14case discovery. Discovery executes zero browsers. Combined root/check/build logs and independent review accompany the final package.

The new desktop and phone route leaves the existing rear-back checkpoint for(1368,−8), holds W for700ms, records a fresh post-render perimeter checkpoint/screenshot, and returns to the original route. Independent original wall math requires center y≥0.5*x−706 for the cardinal radius38 probe and a stop within one15fps step of that boundary. Sustained native input, continuous collision checks, fixed zoom, hero/UI clearances and all19prior screenshots remain required. The new rim is independently observed below hero feet and must have fresh ownership after return. Old19image reports fail the updated verifier.

The180s case timeout,6.5s waypoint deadline,8px waypoint tolerance, native clocks, full motion trace and hard overflow failure are unchanged. Recorded-cadence replay still fits its unchanged140s movement-model bound; actual added hosted duration remains unproven.

Required next evidence: actual same-camera ground A/B, both nearest-edge feet views, all existing cutaway/arch views, unchanged collision stops and return ownership, and the complete14case/21capture hosted pass. Camera, colliders, actor scale, navigation, gate/spawn, session/economy and story are unchanged by this slice. Local browser launch, escalation, alternate flags and alternate browsers remain prohibited.
