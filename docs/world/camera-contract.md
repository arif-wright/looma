# Ragnarok-style camera contract

The camera follows the local predicted/reconciled player and cannot free-fly. It uses an orthographic projection, continuous yaw, constrained pitch, constrained zoom, and interpolated target/zoom changes.

Initial prototype tuning:

| Setting | Value |
|---|---:|
| Default yaw | 45° |
| Default pitch | 45° |
| Pitch range | 25°–65° |
| Default zoom | 1.0 |
| Zoom range | 0.65–1.8 |
| Camera distance | 18 visual units |
| Target smoothing | 0.12/frame |

These are evaluation values, not final art-direction commitments. Right-drag changes yaw and pitch, wheel changes zoom, and R or the reset UI restores all defaults. The touch camera buttons avoid competing with movement gestures. Canvas pointer handling prevents context menus and wheel scrolling while operating the camera; Return Home remains ordinary accessible navigation.

Movement is camera-relative only at the input translation boundary. Forward means away from the camera in the ground plane. The translated vector is normalized and sent as the existing server X/Y intent. Camera state never enters the protocol and never changes server authority.
