# Town ground and entrance cleanup: local review

## Scope and evidence boundary

This is a new local workspace based on the preserved town-art preview. It does not modify the published a1489ad evidence or claim that those screenshots show the changes below. No code or art has been pushed, published, deployed or merged. No live service, database, security, billing, permission, dependency or toolchain change is included.

The actual a1489ad desktop and 390×844 screenshots were inspected before implementation. They showed large opaque legacy floor joins, one isolated nonseamless cobble diamond, two giant service circles and labels for unfinished services. The new slice replaces those town-only presentation elements. Existing place names remain provisional; this adds no lore, story props, new floors or services.

## Implementation contract

### Continuous ground

- The town retains its 28×18 logical grid, 128×64 projection, origin (1152,-200), 88 border collision cells and room bounds `(0,-168)–(2944,1310)`.
- Town no longer places the opaque `floor_` image grid. Dungeon floors retain their original code path. The wall loop and its original bounds/collision bookkeeping are unchanged.
- The new ground source is an opaque 1254×1254 original top-down cobble material. It is not natively seamless. Measured opposite-edge RGB mean absolute differences are 15.14 horizontally and 15.50 vertically.
- `paintTownMaterial` downsamples the original into four 128×128 quadrants of a temporary 256×256 canvas, reflecting the right and bottom quadrants. Adjacent and wrapped integer edge samples match exactly. One source square covers 2×2 logical cells; the mirrored period covers 4×4 cells. This addressing method does not assert that browser filtering or mirror repetition is visually invisible.
- `paintTownGround` performs one repeated CanvasPattern fill through the exact 2:1 affine transform and a four-sided clip. It covers only interior tile edges `(0.5,0.5)–(26.5,16.5)`, not the boundary wall cells.
- The derived ground CanvasTexture is 1344×672, displayed at scale 2 with origin (0,0), world position (128,-168), world extent 2688×1344 and depth -161. It remains below every original actor, marker and wall.
- The temporary material is released immediately after ground rasterization. The ground is created once when town content is constructed, never during update frames. Area departure destroys its images before releasing its texture. Startup failure, shutdown, direct scene destruction and partial construction use the same guarded cleanup; returning creates a fresh surface.
- The archived original cobble source, painter and hash test remain unchanged. It is no longer queued or displayed. Original shop and lantern source bytes, placement, measured pivots, scales and narrow swept foundation collision remain unchanged.

### Entrance

- The new transparent original entrance is a low neutral stone arch/stairhead with an amber lamp, no sign, text or story symbol. Its 1536×1024 source is unchanged.
- Its measured threshold contact is source (666,826), origin (666/1536,826/1024). The lower right pillar's alpha extremum is deliberately not used as the contact. Uniform scale 110/780 produces an approximately 115×110 visible footprint; full untrimmed display bounds are approximately 217×144.
- The contact remains at gate tile (18,9), world (1728,664), depth 684. It adds no collider. The exact original 150px interaction radius and spawn-to-gate walking/dash corridor are preserved.
- Town removes both unfinished-service circles and labels, and replaces its cyan entrance ellipse with this source image. Dungeon entrance/stair markers remain unchanged. The shop remains scenery.
- The prompt is a concise single line, `E · Enter ruins`, with bounded retry/wait/unavailable states. It is at world (1728,704), 13px Arial with small dark padding. Compact-only inverse-zoom scale keeps the font readable at approximately 13 screen pixels; desktop scale remains 1. No new map name or lore is introduced.

### Compact framing

- Desktop camera zoom remains exactly 1.35 and desktop HUD/control geometry is unchanged. Spawn, all world positions, art scales, movement, collision, 90-second expedition timing and session/settlement flow are unchanged.
- Compact-only framing expands from the old hero/shop box to `left=-40, right=430, top=-216, bottom=212`, relative to spawn. This includes the complete untrimmed entrance, contact and a conservative 120×24-screen-pixel prompt budget between the HUD and controls.
- At the 374×280 canvas in a 390×844 page, town zoom changes from 150/272 (about 0.5515) to 150/428 (about 0.3505). The hero is visibly smaller in exchange for keeping the shop, route and entrance readable together. This tradeoff needs real screenshot review before publication.
- Geometry tests cover the 390×844 page's canvas, narrower canvases and short landscape. They are not renderer, real-phone, touch or performance evidence.

## Asset bytes and memory

New original sources:

- `town-cobble-material-v1.png`: 1254×1254, RGB, 3,732,759 compressed bytes; SHA-256 `526eb5f6e3424f29bef03a6714d7482d8401d940638884eb0c885ea194bfe436`.
- `town-ruins-entrance-v1.png`: 1536×1024, RGBA, 1,886,715 compressed bytes; SHA-256 `98ccc4b0ff921b241be233b07f9bcd09bc35d005ea8913483b4210ed302ed15d`.

Budget lower bounds, using RGBA browser/GPU representations:

- Ground source: 6,290,064 bytes (5.999 MiB).
- Entrance source: 6,291,456 bytes (6 MiB).
- Reused shop and lantern sources: 12,582,416 bytes (12 MiB).
- All four runtime town sources: 25,163,936 bytes (24 MiB) per full decoded RGBA copy. The archived 6 MiB cobble source is no longer downloaded/decoded for this scene.
- Persistent 1344×672 ground: 3,612,672 bytes (3.445 MiB) per pixel buffer. The installed Phaser CanvasTexture constructor also retains an ImageData buffer. Canvas plus ImageData is approximately 6.89 MiB; adding one WebGL texture makes approximately 10.34 MiB (10,838,016 bytes), before cache/driver overhead.
- Temporary 256×256 mirror material: 262,144 bytes (0.25 MiB) per pixel buffer, released after painting; its ImageData and possible native GPU copy make approximately 0.75 MiB across those three representations during construction.

The ImageData accounting was checked against the installed Phaser source. Source images, decoded CPU buffers, copies retained by the browser and mipmaps/driver allocations can increase actual memory. These figures are accounting bounds, not measured device/GPU usage. No full-resolution four-quadrant mirrored atlas is allocated.

## Verification

Passed against the final source:

- 88 directly focused ground/scene/readiness/viewport tests, with renderer effects mocked.
- All 1,066 root unit tests in 93 files, no failed/skipped/pending/todo cases.
- Strict recovery runner: 251 focused units, 130 component-DOM tests and 190 verifier tests, no skips or retries.
- Full Svelte check: 0 errors and 0 warnings. Core TypeScript and fixture TypeScript passed.
- Full production application build passed with the existing stale browser-data, bundle-size and unresolved unrelated static-asset warnings. No dependency or lockfile change was made.
- Independent read-only source review found no actionable defect and separately passed all 144 ARPG tests. It checked both original PNGs/hashes, the clip and transform, wall/collision/gate invariants, ownership/rollback, reentry and scene destruction.

Commands used the existing installed Node 24.19.0 environment; hosted workflows continue to pin their existing Node 22 toolchain. Logs and the three runtime-source SHA-256 values are preserved in the local validation directory. These are local results only.

The strict actual-engine fixture is separately updated for the exact 253 queued source images and 254 allowlisted PNG paths including the cursor, the measured entrance, actual camera-projected entrance/prompt bounds, lack of legacy town floor images/large service ellipses, and read-only alpha samples along the hero-to-gate ground corridor. Its report/schema tests and build/discovery do not execute a browser.

No local browser launch was attempted: the earlier browser/socket denial was respected. An authorized exact-source hosted preview is still required to inspect source filtering, mirror symmetry, ground density, entrance contact, depth/occlusion, prompt clearance, visual balance, repeated town → expedition → town and shutdown. Published a1489ad screenshots certify their historical source only, not this new slice.
