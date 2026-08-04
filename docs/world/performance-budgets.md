# Three renderer performance budgets

| Metric | Prototype budget |
|---|---:|
| Desktop target | 60 FPS |
| Supported mobile floor | 30 FPS |
| Draw calls | ≤75 |
| Texture memory | ≤32 MB |
| Synchronized billboards | ≤64 |
| DPR cap | 1.75 |
| Obstruction raycast | registered props, every fourth frame |

Development diagnostics show live measurements. Renderer-only density modes are `?worldDensity=5`, `10`, `20`, and `32`. Synthetic entities create no users, messages, auth bypass, or durable data.

Recent minimum FPS below 40 selects reduced quality (DPR cap 1.35 and half-rate distant visual interpolation). Below 24 selects minimum quality (DPR cap 1.0 and fog disabled). Shadows are already disabled. These changes affect presentation only; input, reconciliation, snapshots, and room correctness remain unchanged.

Phase 8C requires representative desktop and target mobile measurements at 5/10/20/32 entity density, no repeated-navigation leaks, successful context restoration, readable billboards at every preset/pitch/yaw, and ≥30 FPS on the agreed mobile floor. Static CI cannot supply device GPU measurements; record diagnostics from physical devices before approval.
