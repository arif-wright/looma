# Player visual placeholder specification

The directional player atlas is intentionally labeled `TEMP` and is not a final Memvoya avatar design. It exists solely to prove that players use the same atlas, animation, grounding, label, cache, and yaw-only billboard architecture as companions.

The placeholder is 3.1 world units tall, approximately 120 px in Classic, with feet at `(0.5,0.94)`, two-frame 2 FPS idle, four-frame 8 FPS walk, and native direction rows. Local and remote entities reuse the same texture. Remote movement derives from interpolated visual displacement; local movement derives from normalized world intent and authoritative reconciliation.

A future player atlas can replace the image/manifest URL without changing synchronization or animation state. Avatar customization, equipment layers, palette swaps, permanent silhouette decisions, and combat states are explicitly deferred.
