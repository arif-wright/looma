# Three.js renderer prototype

Enable the existing world flag and select the renderer:

```dotenv
PUBLIC_WORLD_ENABLED=true
PUBLIC_WORLD_RENDERER=three
PUBLIC_WORLD_SERVER_URL=http://localhost:2567
```

Restart the SvelteKit dev server after changing public environment variables. `phaser` is the default and rollback value. The browser never imports Three.js when Phaser is selected, and never imports Phaser when Three is selected.

The prototype creates one WebGL renderer, one scene, and an orthographic player-following camera. It includes a terrain plane, raised path, placeholder trees and rocks, lightweight lighting/fog, a Moonberry Grove marker, and upright canvas-textured sprites for players and companions. Remote players interpolate to snapshots. Local prediction reconciles toward authoritative snapshots. Companion visuals are keyed by owner player ID and do not change the safe synchronized data contract.

Controls:

- Move: WASD, arrows, or the touch direction pad.
- Gather: E or the interaction button when in range.
- Camera: right-drag to smoothly orbit/change pitch; wheel adjusts target zoom; R smoothly resets.
- Presets: Classic, Adventurer, Wide, and Close from the camera control.
- Touch camera: compact rotate, zoom, reset, and preset controls. One-finger movement stays reserved for the direction pad.

In development, the overlay reports renderer, FPS/recent minimum, draw calls, triangles, players, billboards, DPR, quality, pitch, zoom, preset, local facing, obstructions, WebGL context, and connection status. Add `?worldDensity=5`, `10`, `20`, or `32` for renderer-only synthetic billboards. They never join a room or enter synchronized state.

Preliminary budgets are 75 draw calls, 32 MB texture memory, 64 active billboards (32 players plus companions), device-pixel-ratio capped at 1.75, 60 FPS desktop and 30 FPS supported mobile. Phaser is the immediate fallback if WebGL support, frame rate, thermal behavior, or memory is unacceptable. Actual device measurements are required before Phase 8B; the panel supplies measurements rather than embedding unverified numbers in this document.

Players now use obvious eight-direction labels/arrows as animation placeholders. Companions follow a buffered owner trail rather than a camera-dependent offset. No final assets, shadows, physics engine, database changes, protocol changes, or gameplay systems were added.
