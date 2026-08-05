# Muse production frame intake (v1)

This directory is reserved for approved isolated production frames. It is outside `static/`; nothing here deploys to the application automatically. Do not place the concept sheet or frames derived from `static/models/muse.glb` here.

Copy `muse.production.json.example` to `muse.production.json` only when an approved delivery is ready, set its approval identifier and status, then create:

```text
frames/
  idle/{n,ne,e,se,s,sw,w,nw}/muse_idle_<direction>_01.png ... _<declared-count>.png
  walk/{n,ne,e,se,s,sw,w,nw}/muse_walk_<direction>_01.png ... _<declared-count>.png
```

Declare each direction's actual frame count in `muse.production.json`; counts may differ and are not capped or downsampled. The example's 24-frame idle is a production-scale intake example, while its walk counts remain placeholders until approved isolated art arrives. All frames must be isolated 256×256 RGBA PNGs with transparent pixels. The validator rejects missing, unexpected, misnamed, opaque, blank, unreadable, incorrectly sized, and pixel-identical duplicate frames.
