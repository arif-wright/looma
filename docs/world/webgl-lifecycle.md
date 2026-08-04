# WebGL lifecycle and recovery

The composite runtime owns one selected renderer and one `WorldSession`. Navigation/HMR activates the new composite only after destroying the previous one; start/destroy are idempotent. Visibility changes pause/resume animation without closing the Colyseus room. Route teardown removes listeners, canvas, diagnostics, geometries, materials, textures, animation frames, and the session exactly once.

On `webglcontextlost`, the renderer prevents the browser's default terminal handling, marks presentation lost, and shows a recoverable UI while retaining the authenticated session. No ticket is reacquired and no room is joined. On `webglcontextrestored`, pixel ratio and viewport projection are restored, Three.js resumes rendering, and the UI clears. If the network independently fails, the existing `WorldConnection` recovery policy applies.

Development exposes `window.__MEMVOYA_WORLD_THREE__.loseContext()` and `.restoreContext()` for Playwright/manual recovery verification. The hook is absent from production builds and contains no credentials or synchronized payloads. Development logs only lifecycle labels.

Manual checks: enter/leave `/app/world` repeatedly and confirm one canvas/room; hide/show the tab; use the context hook; restore; verify movement and the same multiplayer session continue; then navigate Home and confirm the hook/canvas disappear.
