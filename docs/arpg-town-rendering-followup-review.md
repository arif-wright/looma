# Town rendering correction after hosted 8607613

## Observed defect and scope

The exact hosted 8607613 preview passed all 12 actual-engine cases, but its desktop and 390×844 screenshots exposed two presentation failures that the prior numeric gates did not reject: noisy, aliased cobbles and a phone view with an excessively small hero and entrance. Gate placement and its prompt were visible. Passing lifecycle/geometry checks was not sufficient visual acceptance.

The published source, tests, workflows and review records were preserved before edits. The local source tree was independently computed as `efe4c7243a29f28f17bd82dc7524d68bcc025353` and compared byte-for-byte with that frozen copy. The new corrections use the existing PNG bytes only. There are no new assets, plot props, lore, levels, controls, collision or session changes.

## Ground diagnosis and correction

The game intentionally retains global `pixelArt: true`. The installed Phaser source confirms that this disables antialiasing and calls `CanvasPool.disableSmoothing()`. Therefore both generated 2D canvases inherited disabled image smoothing. The 1254×1254 material was reduced to 128×128 with nearest-neighbor sampling before another isometric transform and ground upscaling. That made high-frequency texture detail dominate the actual screenshot.

- `paintTownMaterial` and `paintTownGround` now explicitly set `imageSmoothingEnabled=true` and `imageSmoothingQuality='high'` inside their own saved context state. Both restore the prior state on success and on drawing exceptions. This does not change the canvas pool or other textures.
- Only the generated ground texture receives Phaser `FilterMode.LINEAR` (0), after its final refresh. Original hero, actor, shop, lantern, entrance and dungeon textures retain their existing filtering; global pixelArt remains unchanged.
- Each 128px source quadrant now spans 4×4 logical cells, giving an 8×8-cell mirrored period. Material pixels per logical cell are now 32 instead of 64. This doubles linear stone size without changing source pixels or derived texture dimensions.
- The temporary mirrored canvas remains 256×256 and the ground remains 1344×672 at scale 2. Clip, extent, origin, depth, texture lifetime and memory estimates remain unchanged. Mirrored addressing continues to match opposite samples; this does not certify the final filtered appearance or symmetry.

This explicitly supersedes the original art manifest's runtime recommendation of 2×2 source cells, a 4×4 mirrored period and 64 material pixels/cell. That manifest remains a historical record; no original art source is modified.

## Phone canvas diagnosis and correction

The old 374×280 canvas reserved 130px for HUD, controls and spacing. Its 150px playfield had to fit a 428-world-pixel-high town box, so camera zoom became about 0.3505. Even though the padded 256px hero texture was large enough geometrically, its actual alpha silhouette was tiny.

The actual route now adds only this narrow portrait rule: at viewport width ≤640px and portrait orientation, `.arpg-container` uses a 3:4 aspect ratio. At 390×844, a 374px-wide canvas becomes approximately 499px high. The existing renderer computes zoom from this real container size; no arbitrary camera zoom is added. With the same framing box it becomes width-limited at 342/470, approximately 0.7277, a little over twice the previous zoom.

The existing 16:9 desktop rule and 4:3 medium/short-landscape rule remain. Desktop camera 1.35, world coordinates, bounds, spawn, gate/contact, collision, art scales and all controls remain unchanged. The page is taller, so content below the game can require scrolling. This is portrait layout support only; no touch controls or real-phone playability claim is added.

## Verification and remaining acceptance

New renderer-mocked tests start with inherited disabled/low-quality smoothing, assert filtered settings during material and ground draws, and confirm restoration for successful and failing draws. They also assert LINEAR is applied only to the derived ground after refresh, the updated affine material span, exact route CSS media scoping, and enough real portrait canvas area for the unchanged town/entrance/prompt frame.

Before final retesting, the directly focused suites passed 78 tests: 24 town-ground, 23 viewport and 31 scene tests. The strict fixture is independently strengthened to inspect the actual derived ground filter, real canvas height and alpha-visible hero/entrance bounds through the post-render camera. Those checks complement screenshot review; they do not replace it.

Final local checks passed against source tree `3b267bb0b00f14a48b057300da5462bf503517ab`:

- Full root Vitest: 1,072 passing tests in 93 files.
- Strict recovery: 257 focused units, 130 component-DOM cases and 190 verifier tests, with no skips or retries.
- Full Svelte diagnostics: 0 errors, 0 warnings; core TypeScript passed.
- Production application build passed. Existing stale browser-data, bundle-size and unresolved unrelated static-asset warnings remain; no dependencies were changed.

No local browser was launched. Logs and the exact changed-source list are preserved under `validation/rendering-fix` in the local review workspace. A new exact-source hosted run and inspection of its actual desktop/phone screenshots are still required before calling the rendering correction visually accepted. Existing 8607613 screenshots remain evidence of the earlier defect.
