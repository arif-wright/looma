# Renderer comparison and Phase 8B gate

| Area | Phaser | Three.js prototype |
|---|---|---|
| Strengths | Proven Wilds behavior; mature 2D scene/input APIs; lower implementation burden | Native 3D terrain/props, orthographic orbit camera, natural billboards and depth |
| Limitations | Rotating 2.5D world/depth requires custom projection work | More manual lifecycle, asset disposal, UI/input, interpolation, and performance tuning |
| Mobile | Known 2D baseline and safer fallback | WebGL/DPR/thermal load must be measured; DPR is capped at 1.75 |
| Asset pipeline | Existing 2D placeholder workflow | Needs coordinated 3D prop formats/material budgets plus billboard atlas rules |
| Complexity | Existing and stable | Parallel renderer and explicit resource management add maintenance cost |
| Gameplay contracts | Existing authoritative session | Same session and protocol; no forked gameplay logic |

Adopt Three.js only if representative desktop and supported mobile devices meet the documented frame, draw-call, texture-memory, readability, camera usability, lifecycle, and reconnect targets without weakening accessibility or server authority. Phaser remains available throughout evaluation and is selected by default for missing/invalid configuration.

Phase 8B recommendation: proceed only as a measured validation phase, not a renderer replacement. Test low/mid/high mobile hardware, multi-player room capacity, tab suspend/resume, repeated route navigation, WebGL context loss, texture atlasing, and representative environment density. Continue only if the 2.5D presentation benefit justifies the extra asset and lifecycle complexity and the prototype holds at least 30 FPS on the agreed mobile floor. Otherwise retain Phaser and reuse the camera/art findings in 2D.
