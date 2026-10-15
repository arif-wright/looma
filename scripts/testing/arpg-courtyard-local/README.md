# Local courtyard prototype: approved study D

Base: `751622126a2cd131213bee8accc17eb2ebf65628`.
This is a local implementation and offline proof, not published or runtime-accepted
art. No browser capture is supplied. The original study diagram is a proposal,
not an image of this implementation.

## Exact change

Two low wall arms follow `(1184,616) → (1728,888) → (2016,744)`.
Each is a butt-ended rectangle 16 world pixels wide, extruded vertically by
32 world pixels. There is no miter expansion or end extension. Their overlapping
elbow is the union of those exact two solids. Both outside ends remain open.
This intentionally blocks formerly legal crossings through the arms and elbow.

`townCourtyard.ts` is the single geometry definition for the two swept-circle
solids and all drawn faces. Four area-owned Graphics objects are drawn once:
one foundation and upper layer per arm, 12 quadrilateral fills total. There is
no new image asset or generated texture. Existing perimeter stone colors inform
this restrained vector prototype; painterly polish is not claimed.

An opaque 8 px foundation retains the physical contact cue. Upper faces from
height 8 to 32 use the existing actor-envelope cutaway policy (alpha 0.28), and
the local front edge controls foreground sorting. Both foundations are created
before both upper layers, so equal-depth elbow caps are not painted over by a
later foundation. Back-facing sides and the internal halves of joined end faces are omitted.
Independent polygon clipping verifies that no exposed side or foundation face
overlaps either height-32 cap. The exact two ground rectangles and both top
caps are unchanged, including their shared butt-joint notch. Both opaque foundations now share a depth one below the lesser of the two
upper depths, so a height-8 cap cannot overwrite the other arm's raised end face
when actor-relative depths diverge. Both upper layers retain their existing
per-arm presentation policy. An analytic collision-safe bound also protects the opaque plinth: in the
only region where lowering the opposite foundation could pass it below a hero
(y <= 888), a front-west actor has x < 1625.140873 and a front-east actor has
x > 1830.859127. The opposite footprint is more than 99.281 px away horizontally,
beyond the conservative 64 px actor half-envelope. Joined-end exceptions are
inside a radius-38 solid and therefore cannot be legal actor positions. This is
an analytic geometry argument, separate from the finite actor sample and pixels.
The same existing single-actor presentation helper applies to both arms; the actual drawing/sorting still needs pixel review around the elbow
and each endpoint.

`townCorner.ts` owns creation, per-actor presentation, collision and teardown.
`GameScene.ts`, the ECS, original solids, camera, hero, spawn, shop, gate, prompt,
interaction radius, inputs and area-transition implementation remain unchanged.
The existing scene's swept collision and whole-attempt rollback handle the new
solids, including dash plus same-frame movement. Town destruction releases all
four objects. Dungeons omit them; returning creates a fresh set.

Added per-frame work is bounded to two existing presentation-helper calls, four
depth writes and two alpha writes. Added collision checks cover at most two
four-edge polygons. Graphics command lists are not rebuilt during updates.
This is a source count, not a performance measurement.

## Offline checks

From a repository checkout with its existing TypeScript dependency:

    node --test scripts/testing/arpg-courtyard-local/courtyard.test.mjs

The local isolated copy was tested with existing Node 24.19.0 / TypeScript 5.8.3
via NODE_PATH; nothing was installed. Renderer APIs are mocked. Production scene,
ECS, town owner, wall geometry and collision/presentation helpers are loaded from
the actual TypeScript source using syntax transpilation, not a copied controller.
This is not full semantic TypeScript/Svelte checking or a production build.

Coverage includes:
- Exact reviewed vertices, unchanged dimensions, both endpoint caps, shared
  elbow, all rendered contact/top vertices, local coordinates and ownership.
- Opaque foundation, behind/front/exact-front-edge restoration on each slope,
  inner/outer elbow states, fixed draw commands, failure cleanup and idempotence.
- Actual scene spawn, bounds, 88 perimeter cells, shop and gate placement, 150 px
  inclusive interaction radius, and dungeon/return destruction/recreation.
- Actual ECS walking and swept dash rollback across newly blocked old-free
  crossings, including both arms and the elbow. A rejected dash still consumes
  its original cooldown. Legal destinations do not permit tunneling.
- Forward/reverse end-around walks at 16.667/100/250 ms and open-end dashes at
  16.667/33.333/100/250 ms. These sampled deltas are not an upper frame-time bound.
- Existing gate east dash and exact distance query showing no new exclusion
  inside the 150 px interaction disc for the unchanged radius-38 actor.
- All 948 desktop and 1,823 phone retained original motion intervals plus
  40 checkpoint positions clear the added solids. These include stationary
  intervals; they are not 2,771 distinct routes or a new game run.

The compact fixture records the original source-data SHA-256, selection rule and
full precision coordinates from the independently reviewed enclosure study.
Its old motion/checkpoint data is replay input only, not candidate browser proof.
The former free crossing is separately tested against the unchanged original
shop/facade solids, so removing all town colliders is not used as that control.

## Required next evidence and publication boundary

The prototype stops at independent local review. Publication, a new hosted job,
merge and deployment each remain outside this local implementation approval.
The integration correction explicitly changes the town Graphics contract: the
old two-original invariant is retained as an exact owned partition, and exactly
four independently observed wall Graphics are required. Unknown/missing/extra,
swapped or mistyped Graphics fail. Actual command buffers, state, ownership,
recreation, geometry, depth and fade are checked. Every original image-visibility,
rim and backdrop geometry assertion remains. The exact new application module is added to the existing Vite source allowlist;
all other module/network boundaries remain. The 14 cases, 21 captures, input
controller, thresholds, workflow, toolchain, network policy, credential-free
Auth/transport behavior and database remain unchanged.

Before a future approved publication:
1. Rebase/verify the current head, reconstruct the changed src tree, and repin
   every exact-source guard without weakening its checks. The original fix has
   four pin locations (three workflows plus
   `tests/sql/helpers/game-postgrest-bootstrap.mjs`); base 75162212 additionally
   pins src in `arpg-prompt-timing.yml` and its preservation metadata. The pending
   stationary diagnostic adds its own pins. Inventory the actual future head.
   Any workflow-byte repin also requires a reviewed preservation-manifest update,
   including downstream manifests that preserve that manifest. Keep behavior,
   permissions and exact checks intact; this prototype does not perform repins.
2. Add this explicit offline test command to the approved test list without
   removing old checks. Run full semantic TS/Svelte checks, application/fixture
   builds and Playwright discovery on the complete checkout.
3. Keep the original 14-case/21-capture acceptance intact. Add a separate bounded
   desktop/phone wall suite using real native input: blocked walks and swept
   dashes on both faces and the elbow, both open-end egress paths forward/reverse,
   front/behind restoration, gate approach/departure/return and owned cleanup.
4. Observe the four new Graphics and actual rendered pixels explicitly. The unchanged
   plaza-image visibility observer is not evidence about these new vector walls.
   The added command/state contract proves what was submitted to Graphics, not
   actual rasterized hero visibility.
   Check cap/elbow seams, depth/alpha, hero silhouette, full ground contact,
   contrast, UI coverage and camera framing at each required checkpoint. Do not
   widen old guards or claim the old screenshots show the new geometry.
5. Measure any performance impact only after source identity and native runtime
   checks pass. The separate stationary timing diagnostic is unchanged and has
   its own interpretation limits; these additions do not explain old cadence.

Local browser execution remains prohibited under the existing environment
restriction. No alternative browser flags, permissions or routes were used.
