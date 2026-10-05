# Lanternway art implementation candidate

Local-only cosmetic implementation of the approved 2D Lanternway concept. No publication or deployment is included. The persisted game identifier remains `runner`; the route, session history and rewards are not renamed by this skin.

## Direction and deliverables

Golden late-afternoon lantern town, slate/teal mist, stone causeway, broken-waystone hazards and purple crystal shards. The six existing effects have distinct illustrated charms: Shield, Magnet, ×2 Shards, Slow-Mo, Dash, Dream Surge. There are no new abilities or gameplay systems.

The hero and Echo are compact exports of existing canonical east-facing walk frames. Their copied masters are byte-identical to `static/game/sprites/players/male/male.walk.e.p01.png` and `static/game/sprites/companions/echo/echo.walk.e.p01.png`; neither character was repainted. Generated art is limited to the environment, floor, waystone and collectible objects. Image generation used the built-in tool with the approved concept as a reference; source prompts and provenance are included.

- Masters and approved concept: `art-source/games/runner/lanternway/v1/`
- Five runtime WebPs and byte/hash/crop manifest: `static/games/runner/skins/lanternway/`
- Renderer/loader: `src/lib/games/runnerLanternwaySkin.ts`
- Generated atlas coordinates: `src/lib/games/runnerLanternwayAtlas.ts`
- Deterministic export script: `scripts/art/export-lanternway.py` (Pillow)
- Offline review renderer: `scripts/art/render-lanternway-review.mjs` (esbuild and an available `@napi-rs/canvas`)
- Focused tests: `src/lib/__tests__/runnerLanternwaySkin.spec.ts`

Runtime total: **429,150 bytes** across background 178,450; ground 107,052; props 53,696; adventurer 33,388; Echo 56,564. Background is 1280×720; floor 1024×342; prop strip 1024×128; adventurer strip 768×96; Echo strip 960×104. Character strips contain twelve frames with a shared source crop and baseline. No PNG master is loaded at runtime.

## Runtime safety and fairness

The loader requests only the five same-origin skin files. It waits for decode, validates exact atlas dimensions, and gives the shell one complete snapshot. Failure, abort or the four-second timeout returns no partial skin. All image callbacks and pending sources are detached on completion; late promises cannot mutate the settled result. The shell owns cancellation and chooses the full fallback before a round. The renderer restores canvas state and returns false if a draw cannot complete, allowing the engine's primitive fallback to clear and redraw safely.

Simulation, movement, timings, spawn rules, scoring and hitboxes remain owned by the existing engine. The player's visible drawing envelope stays 34×42 logical pixels with its feet at the engine feet position. Painted obstacles use their exact rectangular collision extents, with a quiet solid backing and a thin edge to expose chipped areas. The existing Dash collision offset of 25 is reflected in the runner art so its position stays honest. Echo is decoration without collision. Floor motion uses the engine's accumulated logical world travel, including its existing acceleration and time effects.

Reduced motion freezes optional floor scroll, character cycling, companion bob, shield pulse, dash echo and floating-popup motion. Obstacles and the essential player jump still move. Effects use steady colors rather than flashing overlays. The six text labels remain available in the shell; icons alone are not the sole way to identify an active effect.

## Verification and known limit

At the reviewed checkpoint, all 14 skin tests and 12 engine tests passed, including identical simulation outcomes with loaded skin, primitive fallback and reduced motion. Core TypeScript passed; full Svelte check reported zero errors and zero warnings after the strict test-harness indexing fix. An independent read-only review verified every manifest hash/dimension/byte count, byte-identical re-export of all five WebPs, lossless alpha in the transparent WebP exports, exact canonical character-master provenance and collision-aligned destination envelopes. The maintainability suggestion to consume generated character crop metadata was applied.

`artifacts/runner/lanternway-review/` includes an offline native-canvas exercise of the actual renderer at 960×540 plus mathematical 320px and 390px downscales and a six-pickup reduced-motion fixture. These use synthetic game state. They are **not browser screenshots, mobile-device verification, input testing or live authenticated gameplay**. No browser access was attempted by this art task because an earlier loopback access denial remains in force.

The fixed 960px world preserves equal obstacle warning distance but makes the player about 11×14px and charms about 10×11px on a 320px-wide screen. The actual downscales expose this readability limitation. It is not solved merely by attractive assets or loader tests. A nonblocking landscape-view suggestion and readable CSS-sized HUD can help without changing fairness; landscape/fullscreen must remain optional. A tighter responsive camera would need a separate gameplay review because it could reduce warning time. Enlarging collidable artwork outside its collision envelope was deliberately avoided.

## Reproduction

Run `python3 scripts/art/export-lanternway.py` to reproduce exports and atlas metadata from recorded masters. Run the targeted Vitest tests and the normal repository type/build checks. The offline render command is `node scripts/art/render-lanternway-review.mjs`; it requires the named native-canvas package in the execution environment and does not access the network. Browser verification uses the separately documented isolated runner fixture when authorized.
