# Muse production frame intake (v1)

This directory is reserved for approved isolated production frames. It is outside `static/`; nothing here deploys to the application automatically. Do not place the concept sheet or frames derived from `static/models/muse.glb` here.

Copy `muse.production.json.example` to `muse.production.json` only when an approved delivery is ready, set its approval identifier and status, then create:

```text
frames/
  idle/{n,ne,e,se,s}/muse_idle_<direction>_01.png ... _<declared-count>.png
  walk/{n,ne,e,se,s}/muse_walk_<direction>_01.png ... _<declared-count>.png
```

Declare each authored direction's actual frame count in `muse.production.json`; counts may differ and are not capped or downsampled. The packer creates NW/W/SW through explicitly approved horizontal mirrors. Muse now has authored NE idle and walk frames; neither direction uses TEMP artwork. All frames must be isolated 256×256 RGBA PNGs with transparent pixels. The validator rejects missing, unexpected, misnamed, opaque, blank, unreadable, incorrectly sized, and pixel-identical duplicate frames.

For the approved 5×5 production-sheet delivery matching the explicit filenames in `scripts/world/muse-assets.mjs`, run `npm run world:muse:ingest`. It reads cells in row-major order, rejects non-contiguous or mismatched populated cells, and writes isolated frames without resizing, sampling, background removal, or other image synthesis. Then validate and pack normally.
