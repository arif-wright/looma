# Explorable town plaza prototype

This draft inherits PR17 head `e73cad94f07309c1a126e5f2aa76bca5ab126db2`.
It is a separate prototype, not a merge or live replacement. The architecture
is deliberately unfinished original vector blockout art.

## Bounded gameplay changes

- Retain the 28×18 town, spawn `(1472,536)`, original shop/lantern, open entrance
  `(1728,664)`, 150-world-pixel gate interaction range, and expedition/session rules.
- Add two four-cell-by-one-cell buildings. Their rendered bases and solid convex
  footprints derive from one exact `P(u,v,z)=(64(u-v),32(u+v)-z)` authoring function.
  Closed building doors are decorative and have no interaction or interiors.
- The same continuous radius-38 circle test blocks ordinary movement and a
  230-pixel dash through each foundation. A blocked dash rolls back position and
  velocity and still consumes cooldown. Roof silhouettes are never colliders.
- Keep the direct spawn/gate route and alternate front, flank and rear routes.
  Unit and independent geometric checks do not establish how movement feels.

## Exploration and visibility

Each new building has an opaque foundation image and a separate upper image.
The one town hero controls a local front-edge depth correction, avoiding a
single distant-corner depth that hides a hero in front of a long face. An upper
layer overlapping a conservative hero envelope fades to 0.28 when the hero is
behind it and returns to 1 outside that occlusion. Foundation alpha remains 1.
The original shop uses its unchanged raster and measured foundation with the
same conservative cutaway policy. All images belong to the town visit; source
textures remain game-owned, and the derived ground is destroyed on exit.

The camera follows exploration at a fixed viewport-dependent zoom. It does not
shrink the town to show every building. Peripheral roofs/walls can crop as they
are revealed by movement. Initial and returned 374px phone/1068px desktop views
retain the reviewed hero/entrance context. On gate approach, direction-aware
framing fits the hero, arch and prompt outside UI. Town screens below 1024px wide
or 480px tall use compact strips; dungeon layout is unchanged. Town follow is
immediate so a valid dash cannot leave the hero behind the camera's smoothing.

Paving uses the original revised material through the existing mirrored, filtered
continuous-ground painter. All previous static files remain unchanged. Authoring,
source SVGs, exact layer pivots, hashes and reproduction instructions are in
`scripts/art/town-plaza-v1/FACADES.md` and its manifest.

## Acceptance limits

Local unit checks cover swept collision, actual ECS rollback, cutaway recovery,
cleanup/reentry, asset geometry and camera bounds. Svelte diagnostics and fixture
TypeScript cover the scene; the narrower core TypeScript config excludes ARPG.
Actual renderer acceptance requires the separate hosted Playwright run with real
assets and native keyboard input. Its synthetic Auth/session/receipt transport
cannot prove hosted authentication or production rewards. Phone-sized viewport
coverage does not establish touch controls, device performance or phone playability.
Occlusion, composition and movement feel remain subject to actual hosted pictures
and traces; deterministic geometry does not make the art painterly or finished.
