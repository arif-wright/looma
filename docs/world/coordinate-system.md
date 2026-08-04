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
