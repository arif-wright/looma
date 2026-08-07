# Broadleaf Tree v2 directional impostor

Status: Phase 8C.7 visual-review candidate. Do not remove the Phase 8C.5 Broadleaf fallback until this integration is approved.

## Delivery audit

The requested directory `art-source/world/environment/trees/broadleaf/v2/` was not present. The supplied files were discovered under `art-source/world/environment/production/v1/v2/trees/broadleaf/` and are ingested from there without moving or modifying source pixels.

| Direction | Static source | Static size | Idle source | Sheet layout | Frames |
|---|---|---:|---|---|---:|
| N | `tree_north.png` | 1024² RGBA | `idle/tree_north-spritesheet.png` | 1280², 5×5, 256² cells | 25 |
| NE | `tree_northeast.png` | 1024² RGBA | `idle/tree_northeast-spritesheet.png` | same | 25 |
| E | `tree_east.png` | 1024² RGBA | `idle/tree_east-spritesheet.png` | same | 25 |
| SE | `tree_southeast.png` | 1024² RGBA | `idle/tree_southeast-spritesheet.png` | same | 25 |
| S | `tree_south.png` | 1024² RGBA | `idle/tree_south-spritesheet.png` | same | 25 |
| SW | `tree_southwest.png` | 1024² RGBA | `idle/tree_southwest-spritesheet.png` | same | 25 |
| W | `tree_west.png` | 1024² RGBA | `idle/tree_west-spritesheet.png` | same | 25 |
| NW | `tree_northwest.png` | 1024² RGBA | `idle/tree_northwest-spritesheet.png` | same | 25 |

Every static source has alpha values from 0–255. Every one of the 200 sheet cells is occupied and pixel-distinct. Cells are contiguous with no gutters and use row-major ordering. No blank, duplicate, missing, or malformed frames were detected. The sources are native views; no runtime sequence mirrors or falls back.

Opaque-content bottoms vary by view: N 196–197, NE 196–197, E 199–200, SE 201, S 206, SW 204, W 202–203, NW 198–199 within the 256px cells. A normalized `(0.5, 0.8)` root anchor is the initial review setting. The canvas is stable, but the 10px cross-view content-bottom range requires visual root-contact review. The art contains exposed roots and a faint object-local contact shadow, not the former large grass/dirt terrain island. No pixels were cleaned or normalized.

## Runtime output

The pipeline copies all sources byte-for-byte beneath `/game/environment/v1/props/trees/broadleaf-v2/`. Each authored 1280² direction remains one bounded animation page. It also extracts the exact 256² frame-zero cell for static/LOD fallback. Source and copy SHA-256 values are audited.

The manifest selects asset version 2, `directional-impostor`, eight authored/no-mirror views, world scale 4.3×4.3, ground anchor `(0.5, 0.8)`, renderer shadow 1.6×0.7 at 0.2 opacity, existing collision references, 8 FPS looping idle, deterministic 8% speed variation, and near/mid/far boundaries 12/22. The legacy Broadleaf sources remain available only as deprecated pipeline inputs, not the preferred world visual.

## Direction and animation contract

At yaw 0 the camera occupies world south and selects S. Positive camera yaw walks through S, SE, E, NE, N, NW, W, SW; orbiting the other way produces the requested S, SW, W, NW, N, NE, E, SE sequence. Sector width is 45° with the Phase 8C.6 5° hysteresis.

Animation time is represented as normalized phase. On a direction switch the new sequence evaluates `floor(phase * directionFrameCount)`, so a future unequal-count sequence preserves its relative point rather than restarting. Instance IDs deterministically vary starting phase and rate; nothing is networked.

Near uses the selected full animation page. Mid retains direction and animation eligibility under the current conservative policy; the declared 4 FPS target is available for the subsequent performance-tuning pass. Far retains the selected exact frame-zero fallback and no animation page. At most two environment animation pages are resident, allowing old/new directional transition and two review instances without one texture per frame or instance.

Textures and materials are shared by runtime URL. Direction changes retain the old loaded image until the next static/animation page has decoded, preventing a blank flash. Alpha discard, depth testing, obstruction fading, and the renderer-owned shadow remain enabled. Collision and visual bounds remain separate.

The authored direction and the presentation plane solve separate problems. Because the Wilds camera is orthographic, native view selection uses the camera's backward ground-plane vector, `atan2(-forwardX, -forwardZ) - authoredYaw`. It does not use player position or the point-to-point camera/tree vector; translating the follow camera without changing its view direction therefore cannot rotate a stationary tree. Independently, the Broadleaf plane copies the finalized Three camera quaternion, so every tree remains parallel to the screen plane. Authored instance yaw may offset direction selection but never rotates the presentation plane.

The plane geometry is translated once so its declared top-left image-space ground anchor `(0.5, 0.8)` is the mesh origin. The mesh remains at the stationary server-mapped root point; yaw, pitch, zoom, direction changes, and animation therefore rotate presentation around the root rather than moving it. This differs intentionally from the player/companion yaw-only helper: the environment reuses the same separation between presentation and authored direction, while using full screen-facing orientation because a large tree card made pitch and off-axis divergence visible.

LOD and animation admission use horizontal X/Z distance from the orthographic camera's world focus point. Camera elevation and orbit radius are deliberately excluded; measuring from the physical camera previously classified even a centered Classic-view tree beyond the 12-unit animation radius and kept its frame-zero fallback visible. Direction selection still uses the actual camera position. Animation phase is stable per instance and survives direction changes.

## Visual review

Use the development-only review arrangement:

```text
/app/world?worldEnvironmentReview=broadleaf&worldEnvironmentInspect=broadleaf-v2-review-a
```

Development-only review overrides can be combined with that URL:

- `worldBroadleafDirection=s` forces one of `n,ne,e,se,s,sw,w,nw`.
- `worldBroadleafFps=8` forces a visible rate from greater than zero through 30.
- `worldBroadleafFrame=0` freezes an exact zero-based frame.
- `worldBroadleafLod=near` forces `near`, `mid`, or `far`.
- `worldBroadleafDebug=frames` applies the review defaults: South, 2 FPS, near LOD.

The environment inspector reports tree/player/camera positions, camera forward and target, diagnostic camera-to-tree vector, calculated azimuth, raw and hysteresis-selected sectors, requested and material-resolved frame, normalized phase, UV offset/scale, atlas URL/load state, material texture UUID, animation eligibility, LOD, and active overrides. “GPU frame” changes only when the loaded atlas texture and UV region have actually been assigned to that instance's shader uniforms. `environmentAtlas.ts` is the shared renderer implementation for shader creation and per-instance uniform updates. Textures are shared; each tree owns a distinct shader material/uniform set and independent deterministic phase. These query controls are compiled into development behavior only and do not alter production presentation.

It removes normal decorative clutter and presents two v2 trees near open player space. Add exact camera parameters as needed:

```text
&worldCameraYaw=0&worldCameraPitch=45&worldCameraZoom=1
```

Review yaw 0/45/90/135/180/225/270/315, slow continuous orbit, pitch 30/58, zoom 0.65/1.8, and all presets. The inspector reports asset/version/class, direction/angle, frame/count/FPS, normalized phase, instance offset, anchor, LOD, page, load state, and memory.

## Open visual questions

- Confirm `(0.5, 0.8)` holds the perceived trunk/root contact across the 10px directional bottom variance.
- Confirm clockwise/counterclockwise view order against the actual painted tree landmarks.
- Confirm the faint source contact shadow is object-local and does not read as a biome patch.
- Confirm 4.3 world-unit scale and the existing renderer shadow.
- Confirm 5° hysteresis feels natural; it has not been retuned.
- Representative mobile profiling remains required before activating reduced mid-distance FPS.
