# ADR-001: Phaser ownership and Svelte lifecycle

- Status: accepted for Stage 1
- Date: 2026-08-02

## Context

SvelteKit renders on the server, while Phaser requires browser APIs and owns an imperative canvas/game loop. Svelte navigation and Vite hot reload can remount components without a full page refresh. An unguarded Phaser constructor can therefore break SSR or leave duplicate canvases, listeners, and animation loops.

The repository's existing ARPG dynamically imports Phaser and explicitly destroys its active game (`src/lib/games/arpg/main.ts`). Stage 1 needs the same safety as a reusable component with resize, pause and resume behavior.

## Decision

- `/app/world` remains under the existing protected route and app shell.
- The server evaluates `PUBLIC_WORLD_ENABLED`; disabled markup does not instantiate `WorldGameMount`.
- `WorldGameMount.svelte` imports `worldGame.ts` only from `onMount` through a dynamic `import()`.
- `GameLifecycle` owns asynchronous mount generations and idempotent resize/pause/resume/destroy forwarding.
- `worldGame.ts` owns the Phaser instance. A `Symbol.for` global registry destroys any prior world instance before creating another, including across hot-module replacement.
- The Phaser game uses a fixed 960×540 logical world with `Phaser.Scale.FIT`; Svelte sizes the containing viewport while preserving aspect ratio.
- `ResizeObserver` refreshes scale. `visibilitychange` sleeps/wakes the game loop. Svelte `onDestroy` disconnects observers/listeners and destroys Phaser.
- Touch controls remain accessible HTML buttons outside the canvas and feed the same normalized movement intent as the keyboard.

## Consequences

SSR never evaluates Phaser for a disabled route and does not instantiate it for an enabled route. Navigation and hot reload retain at most one active world instance. Game code remains testable at the configuration/lifecycle boundary without requiring a canvas in Vitest. The HTML control layer provides an accessible escape path even though the game canvas itself is visual.

The global registry intentionally permits only one Wilds instance per browser realm. Stage 1 does not support multiple simultaneous world canvases. A hard browser/process failure may bypass cleanup, but the page reload clears the realm.
