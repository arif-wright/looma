# Controlled S4 walking-frame observation

This separate two-case fixture selects one exact legal pose and a paused real
South walk frame 4. It produces one same-frame canvas PNG for desktop 1280×900 and
one for phone 390×844. It is controlled visual evidence, never native movement or
an additional acceptance route. Existing 14-case/21-capture readiness, 2-case/36-
capture native courtyard and2-case/12-capture idle visual suites stay unchanged.

## Exact narrow claim

The actor is assigned to (2007.5,698.5), with zero input/velocity/dash/attack. The
real eight-frame South walking animation is selected, then its fifth AnimationFrame
(array index 4, native index 5) is paused. A temporary **instance-only** shadow of
GameScene.updateHeroAnimation suppresses normal neutral-input idle selection.
The receipt discloses both the coordinate discontinuity and that suppression.
The original own-property descriptor is restored, or the temporary shadow deleted,
on scene/game cleanup. A foreign replacement owner is never overwritten.

The radius 38 actor has east-wall clearance 38.6592286002: only 0.6592286002 spare.
One pixel south is already collision-invalid. There is no±8 navigation envelope.
The actual source PNG is the existing knight_armed_walk_S_270.0_4.png, Git blob
`e386dc09da706c6b7ac3e6028918e968a22a7632`. Source pixel (132,135) has
RGBA (26,23,27,232). At scale 1/origin (128,128), its center projects to world
(2012,706), strictly inside east-upper fill 56, color 0x92866f, at depth 908 and
object alpha 0.28. Hero depth is 718.5. There is exactly one colored body-edge
sample among 61 existing three-pixel-grid source samples. This is not broad body
readability. The known neighboring alpha 254 source pixel is recorded separately.

## Observation, limits and failure conditions

The selected texture, native animation frame, pause state, transforms and neutral
input are checked on every observed native render. Settling requires three
consecutive stable camera comparisons, with tolerance 0.01 and at most 64 native
frames. The overall selected-frame observation cap is 128. PRE_RENDER records the
prior observer object; POST_RENDER requires its replacement on that same native
frame, a strictly later timestamp after assignment, and no repeated object/time.
The old motion schema is unchanged. Receipts link each selected frame to its
fresh original observer publication and carry the native frame identifier.

One fresh neutral probe is allowed, after settling. The existing object, camera,
source-alpha, Graphics-command and UI observations are read in the same POST_RENDER
callback as synchronous canvas.toDataURL. The real renderer, camera, drawing-
buffer settings, art and physics are not changed. Unknown/replaced scene, player,
sprite, camera, wall owner, source/frame or animation state fails closed. A scene
shutdown while pending or before consuming the capture fails and removes hooks.

Each case has a 180-second timeout; settling/capture polls retain 15-second bounds.
One request and one PNG are permitted per case. PNG dimensions are at most 2048
per axis, at most 2,500,000 pixels and 8,000,000 base64 characters. Complete JSON
attachments are bounded at 16,000,000 base64 characters; no truncation or hash-only
receipt substitutes for complete evidence. Existing decoded-command/source/sample
limits remain unchanged. No new keyboard/mouse controller or active movement runs.

The verifier decodes the entire same-frame PNG and records exactly 25 raw RGBA
pixels in a 5×5 region around the measured sample projection. It records actual
CSS/logical/backing transforms and backing-pixel centers. It does **not** compare
against a reference render or compute measured composited transmission. The 0.72
foreground transmission is the analytic fill model, distinct from source alpha
232/255. The paint-edge margin is only 0.524582472 world pixels, so mixed edge,
filtering and antialiasing behavior require manual examination of real hosted PNGs.
No exact blended RGB or pixel-identical alpha claim is made.

## Commands and evidence boundaries

The added Node suite is `walk-frame.test.mjs`. It exercises lifecycle doubles,
coherent positive/negative report schemas, same-frame PNG decoding, preservation,
and the unchanged actual visibility observer using the exact source PNG and
production wall creation commands. Synthetic schema PNGs are generated only in
memory and never saved or labeled as browser evidence.

Future separately authorized hosted invocation uses
`walk-frame.playwright.config.ts`, then `walk-frame-verifier.mjs` with discovery
or execution and the corresponding `.results/walk-frame-*-results.json`. The
locked browser, credential-free collaborators, shared Vite build, outbound
allowlist, isolation and cleanup guard are reused. No publication workflow or
source/preservation pins are prepared in this author stage. The historical
preservation maps need reviewed exact-hash updates for the three additive shared
fixture changes before a prospective publication can pass those old guards.

No local browser, Playwright discovery/execution, full Svelte build or native
render was run. Focused semantic TypeScript and offline source/pixel calculations
are not a substitute for those future checks. Required acceptance remains:
actual S4 identity/same-frame source and fill observations, two real captures,
strict report verification and manual raster review, with all old suites intact.
