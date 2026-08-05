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

Phase 8C.2 diagnostics add active animation/direction, current/total frame, effective FPS, animation update milliseconds, loaded atlas-page count, and estimated decoded RGBA memory. Pages are loaded per active sequence and shared across entities; inactive sequence pages are released. The packer caps a page at sixteen 256 px cells (4 MiB decoded), allowing long sequences without a single oversized texture. Nameplate and environment allocations remain additional, so production art still requires device profiling.

Recent minimum FPS below 40 selects reduced quality (DPR cap 1.35 and half-rate distant visual interpolation). Below 24 selects minimum quality (DPR cap 1.0 and fog disabled). Shadows are already disabled. These changes affect presentation only; input, reconciliation, snapshots, and room correctness remain unchanged.

At reduced and minimum quality, optional Muse aura is disabled first; animation and identity remain intact. Remote interpolation continues at the established reduced cadence. Phase 8C still requires representative desktop and target mobile measurements at 5/10/20/32 density, no repeated-navigation leaks, successful context restoration, readable billboards at every preset/pitch/yaw, and ≥30 FPS on the agreed mobile floor. Static CI cannot certify GPU/thermal performance; record the panel values from physical target devices before Phase 8D approval.
