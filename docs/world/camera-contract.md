# Ragnarok-style camera contract

The camera follows the local predicted/reconciled player and cannot free-fly. It uses an orthographic projection, continuous yaw, constrained pitch, constrained zoom, and target-based interpolation for yaw, pitch, zoom, and follow. Authoritative correction is absorbed by player reconciliation plus exponential camera following. Camera-target lag is capped at 2.5 visual units so smoothing cannot leave the player far from center.

Initial prototype tuning:

| Setting | Value |
|---|---:|
| Default yaw | 0° cardinal alignment |
| Default pitch | 45° |
| Pitch range | 25°–65° |
| Default zoom | 1.0 |
| Zoom range | 0.65–1.8 |
| Camera distance | 18 visual units |
| Maximum target lag | 2.5 visual units |

These are evaluation values, not final art-direction commitments. At yaw 0°, the camera is south of the target looking north: authored north reads as screen up and east as screen right. Right-drag changes target yaw/pitch using preset sensitivity, wheel changes target zoom, and R or the reset UI sets target values back to the selected preset's cardinal yaw. Reset is interpolated, not snapped. The touch camera buttons avoid competing with movement gestures. Canvas pointer handling prevents context menus and wheel scrolling while operating the camera; Return Home remains ordinary accessible navigation.

Movement is camera-relative only at the input translation boundary. Forward means away from the camera in the ground plane. The translated vector is normalized and sent as the existing server X/Y intent. Camera state never enters the protocol and never changes server authority.

## Presets

| Preset | Default yaw | Pitch | Zoom | Follow rate | Orbit px sensitivity | Pitch px sensitivity |
|---|---:|---:|---:|---:|---:|---:|
| Classic | 0° | 45° | 1.00 | 8 | 0.007 | 0.005 |
| Adventurer | 0° | 35° | 1.18 | 10 | 0.0065 | 0.0045 |
| Wide | 0° | 55° | 0.78 | 6 | 0.008 | 0.0055 |
| Close | 0° | 42° | 1.50 | 11 | 0.006 | 0.004 |

Selecting or resetting a preset returns smoothly to its documented yaw. The user may then orbit continuously through the full 360° range; diagonal views are a camera choice, never baked into authored map placement.

The selected preset is a non-sensitive browser-local preference (`memvoya.world.camera-preset`). No database row is created.

## Obstruction

Environment props opt in through a renderer-only obstruction registry. Every fourth frame, a ray is tested only against registered props between the camera and local target. Hit props ease toward 0.28 opacity and restore toward 1.0 when clear. This never moves a prop or changes server collision. Placeholder trees and rocks are registered independently with non-shared materials.
