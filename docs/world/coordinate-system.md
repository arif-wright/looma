# World coordinate mapping

The authoritative server remains a two-dimensional plane. Three.js maps it as follows:

| Meaning | Server | Three.js |
|---|---|---|
| Horizontal east/west | X | X |
| Horizontal north/south | Y | Z |
| Presentation elevation | none | Y |

The map is centered visually and uses 32 server units per Three visual unit:

```text
worldX = (serverX - WORLD_WIDTH / 2) / 32
worldZ = (serverY - WORLD_HEIGHT / 2) / 32
serverX = worldX * 32 + WORLD_WIDTH / 2
serverY = worldZ * 32 + WORLD_HEIGHT / 2
```

Terrain is at visual Y=0. Props and sprite anchors use small positive Y offsets solely to prevent z-fighting/sinking. There is no authoritative elevation. Input translation rotates the camera-relative vector into server X/Y, normalizes it, and sends only that intent. Collision, bounds, velocity, persistence, and proximity remain server-owned.

## Cardinal authored orientation

The authored world is cardinal and is never rotated around Three Y to manufacture an isometric view:

- North: decreasing server Y / decreasing Three Z
- South: increasing server Y / increasing Three Z
- East: increasing server X / increasing Three X
- West: decreasing server X / decreasing Three X

At the Classic yaw of 0°, north projects toward screen top, south toward screen bottom, east toward screen right, and west toward screen left. The terrain plane's `rotation.x = -90°` only lays it horizontally; it does not rotate the map compass. The raised prototype road is aligned along Three X, so it reads east/west in the cardinal view. Camera orbit may produce diagonal presentation without changing authored positions or the server mapping.
