# Facing and animation contract

`FacingDirection` is `n | ne | e | se | s | sw | w | nw`. Facing is computed from world-plane motion after camera-relative input becomes normalized world intent. Server X maps to visual X and server Y maps to visual Z; north is negative Z. Camera yaw never participates in facing classification. Therefore rotating away from the cardinal Classic view changes only screen projection: an entity moving north remains `n` at every camera yaw.

The clockwise sectors are centered on N, NE, E, SE, S, SW, W, NW. Each sector is 45° wide with boundaries at 22.5°, 67.5°, 112.5°, 157.5°, 202.5°, 247.5°, 292.5°, and 337.5°. Classification uses `atan2(worldX, -worldZ)` and nearest-sector rounding. Motion below the noise threshold retains the last non-zero facing, preventing idle reset and snapshot jitter.

`PlayerVisualState` is the input contract for Phase 8C:

- entity ID; authoritative/current, previous, and render world positions
- facing and `idle | moving`
- normalized visual movement magnitude
- local/remote marker
- public display name and handle
- companion owner association
- connected/reconnecting presentation state

It excludes memories, journal text, hidden traits, prompts, tickets, roles, email, and other sensitive account data. Phase 8B draws a direction label and upright arrow on each billboard. Phase 8C may replace only that presentation with frame selection; it must not change facing or authority semantics.

Remote facing derives from meaningful changes between synchronized world targets. Local facing derives from camera-transformed world intent. Both preserve the last meaningful direction while idle. Phase 8C maps the value to native atlas rows in `n, ne, e, se, s, sw, w, nw` order; it never mirrors a missing direction.

Animation presentation supports `idle` and `walk`. Motion hysteresis enters walk at 0.025 and exits at 0.012. Selecting the current state does not reset time; facing changes retain the current animation progress; entering a different state starts its first frame. Remote snapshots and companion trail interpolation use the same classifier independently. Animation state is not synchronized or trusted by the server.

At the default yaw of 0°, the screen/world relationship is intentionally direct: N is screen up, E is screen right, S is screen down, and W is screen left. At other user-selected camera yaws, camera-relative controls are transformed into the same world axes before facing is classified.
