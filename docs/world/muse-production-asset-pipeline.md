# Muse production asset pipeline

Status: Phase 8C.2 preparation. No approved production frames are present; runtime still uses the two-idle/four-walk temporary Muse atlas.

## Sources and intake

The updated approved Muse HD gameplay sheet is the primary visual and animation reference, but is not a runtime image or frame source. Never crop its panels or use its grid, labels, background, or canvas dimensions as atlas data. `static/models/muse.glb` is deprecated and prohibited as a production source.

Approved isolated 256×256 transparent PNGs live outside `static/`:

```text
art-source/world/companions/muse/production/v1/
  README.md
  muse.production.json.example
  muse.production.json
  frames/
    idle/<n|ne|e|se|s|sw|w|nw>/muse_idle_<direction>_<NN>.png
    walk/<n|ne|e|se|s|sw|w|nw>/muse_walk_<direction>_<NN>.png
```

Numbers are one-based, at least two digits, contiguous, and ordered. Metadata version 2 declares the actual `frameCount` for every state/direction plus clip FPS/loop defaults and optional direction overrides. Counts may differ and have no tool-imposed maximum. The example uses 24 idle frames per direction to exercise production-scale sequences; its walk count is illustrative until approved art arrives.

## Validate

```bash
npm run world:muse:validate
node scripts/world/muse-assets.mjs validate --source /path/to/approved-muse
```

Validation rejects unapproved/missing metadata, missing directions or indices, unexpected names, non-256×256 images, absent transparency, blank/unreadable images, duplicate decoded pixels, invalid timing, missing pivot/feet/scale, or failure to exclude the deprecated GLB. It validates exactly the metadata-declared inventory and never downsamples a delivery.

## Pack and review

```bash
npm run world:muse:pack
node scripts/world/muse-assets.mjs pack \
  --source art-source/world/companions/muse/production/v1 \
  --output artifacts/world/companions/muse/v1
```

Output is a Phase 8C version 2 manifest plus bounded pages:

```text
artifacts/world/companions/muse/v1/
  muse.atlas.json
  muse.idle.n.p01.png
  muse.idle.n.p02.png        # present when the sequence exceeds 16 frames
  muse.<state>.<direction>.p<NN>.png
```

Each page contains at most sixteen 256 px cells (4096×256 maximum). The manifest lists every frame explicitly in source order across pages and preserves per-direction timing overrides. Runtime loads pages on demand, shares them between entities, and releases unused pages. `artifacts/world/` is gitignored and non-deployable.

Packing is not promotion. Review all frames, page transitions, loop timing, scale, pivots, cameras, yaw angles, memory diagnostics, and 5/10/20/32-entity device performance. Only explicit approval authorizes copying the reviewed manifest/pages beneath `static/game/sprites/companions/muse/`; the tool never promotes them.

## Still required

- approved isolated frames for every declared state/direction, including the full production-length cycles;
- traceable production approval and confirmation against the current Muse design;
- reviewed per-direction counts, FPS, loop behavior, pivot, foot contact, and scale;
- visual confirmation of native horns, wings, tail, crystals, markings, lighting, and silhouette;
- target-device frame-rate, decoded-memory, page-transition, context-restore, and repeated-navigation results;
- explicit promotion authorization.
