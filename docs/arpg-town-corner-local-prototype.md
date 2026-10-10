# Original town-corner prototype: initial local record

This opening record describes the initial local-only snapshot before the separately approved PR16 preview publication. Later hosted results are recorded below.

This was a local-only addition to the frozen PR16 base c490e95d7d999366d186d63546e526f18f078d48, preserving the existing local hero ground-anchor correction. Nothing was pushed, published, deployed, or merged. Browser execution was denied earlier and was not retried. This is not a playable-scene or screenshot verification claim.

## Scope and assets

The runtime adds three original, unedited RGBA source PNGs under `static/games/arpg/town-corner-v1/`: `town-cobble-floor.png`, `town-corner-shop.png`, and `town-lantern-plinth.png`. The rejected `town-cobble-floor-v2.png` is not integrated. File hashes, dimensions, contacts, scale, placement and ownership are specified in `arpg-town-corner-assets-v1.json`.

`src/lib/games/arpg/assets/townCorner.ts` owns the bounded art slice. The existing `GameScene` queues all three source images through its required-texture readiness gate, constructs the slice only in town, checks the shop foundation during movement, and clears it on area departure, startup failure, scene shutdown, or direct scene destruction.

- One 512×256 cobbled patch is made with the native runtime CanvasTexture API. Its measured source rectangle (64,162,1408,768) is scaled inside an exact 2:1 diamond clip. The PNG bytes are unchanged. It is one patch, not a seamless tile set.
- The full shop PNG is uniformly displayed at 256×256, with measured origin (618/1254,1175/1254). Its front foundation is at tile (16,8), world (1664,568), placing the building body above/right of spawn. Depth is front contact y+20.
- The full lantern PNG is uniformly displayed at 80px high, with measured origin (606/1199,1174/1312), beside the shop at tile (15,8.5), world (1568,552). It is still artwork with no added animation or collider.
- The patch is at tile (15.5,7.5), world (1664,536). Its depth is the top of the existing negative floor band (-161), so overlapping base-floor PNGs cannot overpaint it. Every base floor remains at its original y−1472 depth, and the patch stays below actors, markers and walls.
- The shop's narrow foundation polygon is tested against the moving actor circle continuously, including dash crossings with clear endpoints. The roof is not a collider. The spawn-to-gate corridor is explicitly tested as open.
- Source textures remain game-owned. Area-owned images are destroyed before the one derived canvas texture is removed; repeated clearing is harmless, construction failures clean up, and returning to town recreates the patch. Shutdown and direct-destroy listeners remove one another to avoid retaining stale lifecycle callbacks.

The 28×18 room, 128×64 projection, 1.35 camera zoom, original hero pivot/ring/shadow correction, 90-second expedition cap and session flow are preserved. Existing town service markers remain; the shop is scenery and has no purchasing UI.

## Verification

Passed against the local final code:

- Full root Vitest: 1,036 passing tests, zero failed/pending/todo. This includes 114 ARPG tests and 80 SDK lifecycle/recovery tests; renderer effects are mocked.
- Strict recovery runner: 221 focused unit cases, 130 component-DOM cases and 190 verifier self-tests, with no skips or retries. The 13 dedicated art tests and exact updated per-file counts are included.
- 73 strict actual-scene fixture report/protocol tests.
- Full repository Svelte check: 0 errors, 0 warnings; focused Svelte and TypeScript checks: passed.
- Full application build and strict fixture Vite build: passed. Existing bundle-size, stale browser-data and unresolved unrelated static-asset warnings remain; compilation success is not complete asset or browser verification.
- Discovery and verifier: all 11 declared browser cases present, zero executed.
- Read-only Pillow decode of all three new PNGs and SHA-256 comparison: passed.

The fixture now has 252 required loader PNGs and 253 allowed network PNG paths including the CSS cursor. The generated CanvasTexture is not counted as a network image. The exact helper source is added to the build allowlist; no wildcard or security check was relaxed. Workflows and source/static pins were not changed.

The first DOM attempt used the root Vitest entrypoint and could not resolve `happy-dom`. The repository runner uses its existing separately locked fixture installation; rerunning through that correct entrypoint passed all 130 DOM cases. No dependency installation or lockfile change was required. This snapshot lacks all 250 pre-existing fixture PNGs, so its strict preview asset server would fail closed. A fixture build does not substitute for those bytes.

The three source PNGs total 5,096,297 bytes (5.10 MB compressed), with a decoded RGBA lower bound of 18,873,872 bytes (18.0 MiB). The derived 512×256 canvas adds 524,288 bytes (0.5 MiB) per pixel buffer; browser image, canvas and GPU copies can raise actual memory. Sources are retained by the game texture manager until game destruction. Local checks used Node 24.19.0 and the existing installed dependencies; release workflows still pin Node 22, and were neither repinned nor run.

Remaining review requires an authorized browser environment with the complete baseline assets: inspect actual painterly scale/HUD clearance, walk and dash around all sides of the shop, inspect y-sorting in front/behind, and repeat town → expedition → town plus route shutdown. Floor material scale may need a later reduction to 256×128; the chosen 512×256 is the manifest's starting size, not a visually certified final size. There are no new screenshots or animation claims.


## Approved hosted art preview and responsive correction

The user subsequently approved adding this art preview to the same unmerged draft PR16. Head f1c8f0741b2d511cbf38bae7b47552884f795761 passed all 12 actual-route/SDK/Phaser browser cases, with seven real screenshots. The new 390×844 case means a phone-sized desktop-Chromium viewport, not touch interaction or real-device performance. The actual desktop image shows the painterly shop, lantern and normalized cobbles, and the hero is grounded at its selection ring.

The phone screenshot revealed that the inherited 440×180 HUD and desktop zoom obstructed the art on a 374×280 canvas. The bounded correction uses a compact two-row HUD and bottom action strip, plus narrow-only camera framing. World coordinates, collision, input, art scale, expedition cap and settlement methods remain unchanged. Desktop geometry, labels and zoom restore exactly; same-dimension scene rebuilds invalidate the layout cache. Eighteen dedicated responsive tests raise root coverage to 1,054 and focused coverage to 239.

The historical native-layout comparison also exposed an obsolete whole-static-tree equality assumption. It now pins the original baseline static tree and new candidate static tree separately, and compares all 9,102 existing blob identities, modes and paths unchanged after excluding exactly the three approved new town-corner files. No baseline asset is replaced. Toolchain, permission and network guards remain intact.

Separate Docker Hub unauthenticated pull-rate limits prevented the isolated PostgreSQL scenarios from starting on the first art head. Those are infrastructure failures, not passing tests; no credentials or network bypass were added. The responsive/static-guard correction requires a fresh exact-head hosted run and screenshot review before acceptance. Its source tree is 50406669b90fbf5ec9c65320f8a59d5a18dceae8; static tree remains ce7bf3577bef2eaf68722181ddbd147e93b4f87a.
