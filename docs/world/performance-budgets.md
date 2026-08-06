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
| Environment foundation draw calls | <20 before actors |
| Deterministic dressing | instanced by asset type |

Development diagnostics show live measurements. Renderer-only density modes are `?worldDensity=5`, `10`, `20`, and `32`. Synthetic entities create no users, messages, auth bypass, or durable data.

Phase 8C.2 diagnostics add active animation/direction, current/total frame, effective FPS, animation update milliseconds, loaded atlas-page count, and estimated decoded RGBA memory. Pages are loaded per active sequence and shared across entities; inactive sequence pages are released. The packer caps a page at sixteen 256 px cells (4 MiB decoded), allowing long sequences without a single oversized texture. Nameplate and environment allocations remain additional, so production art still requires device profiling.

Recent minimum FPS below 40 selects reduced quality (DPR cap 1.35 and half-rate distant visual interpolation). Below 24 selects minimum quality (DPR cap 1.0 and fog disabled). Shadows are already disabled. These changes affect presentation only; input, reconciliation, snapshots, and room correctness remain unchanged.

Phase 8D exposes estimated environment draw calls, visible blocking/interactable props, decoration instances, texture memory, ambient effects, and shared-resource counts on the Three canvas diagnostics dataset. Reduced quality removes full-only flowers; minimum also removes optional grass and motes. Terrain, paths, blockers, and Moonberry stay visible. Actual renderer draw calls remain the final measurement because driver batching and actors vary by device.

Phase 8C.5 adds production environment instance, animated-instance, resident-atlas-page, failed-asset, and animation-update-time diagnostics. No placed instance owns texture pixels. Full quality animates the nearest eligible asset family within 12 world units and caps the resident environment animation cache at one sheet; all other cards use an exact extracted frame-zero texture. Reduced/minimum quality admits no environment animation sheets, and optional flowers, vegetation, Aether Plants, and motes follow their declared quality tiers. Full-resolution terrain/rocks can still exceed the earlier prototype texture target, so optimized derivatives and physical-device measurements remain required before production approval.

At reduced and minimum quality, optional Muse aura is disabled first; animation and identity remain intact. Remote interpolation continues at the established reduced cadence. Phase 8C still requires representative desktop and target mobile measurements at 5/10/20/32 density, no repeated-navigation leaks, successful context restoration, readable billboards at every preset/pitch/yaw, and ≥30 FPS on the agreed mobile floor. Static CI cannot certify GPU/thermal performance; record the panel values from physical target devices before Phase 8D approval.
