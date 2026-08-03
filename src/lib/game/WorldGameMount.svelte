<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import { fitWorldViewport } from './config';
  import { GameLifecycle, type GameRuntime } from './lifecycle';
  import type { ConnectionStatus } from './protocol';
  import type { GatherResult } from './protocol';

  export let serverUrl: string | null = null;

  type Direction = 'up' | 'down' | 'left' | 'right';
  type RuntimeWithTouch = GameRuntime & { setTouchDirection: (x: number, y: number) => void; interact: () => void };

  let host: HTMLDivElement;
  let viewport: HTMLDivElement;
  let runtime: RuntimeWithTouch | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let activeTouch: Direction | null = null;
  let status = 'Loading the local world…';
  let loadError = false;
  let connectionStatus: ConnectionStatus = 'offline';
  let gatherPrompt = false;
  let gathering = false;
  let gatherResult: GatherResult | null = null;
  $: connectionLabel =
    connectionStatus === 'connected' ? 'Multiplayer connected' :
    connectionStatus === 'connecting' ? 'Connecting…' :
    connectionStatus === 'reconnecting' ? 'Reconnecting…' :
    connectionStatus === 'unauthorized' ? 'Session required' :
    connectionStatus === 'unavailable' ? 'Multiplayer unavailable' : 'World offline';

  const lifecycle = new GameLifecycle(async (target) => {
    const { createWorldGame } = await import('./worldGame');
    runtime = createWorldGame(target, {
      serverUrl,
      onConnectionStatus: (nextStatus) => (connectionStatus = nextStatus),
      onGatherPrompt: (visible) => (gatherPrompt = visible),
      onGatherResult: (result) => {
        gathering = false;
        gatherResult = result;
      }
    });
    return runtime;
  });

  const resize = () => {
    if (!viewport || !host) return;
    const bounds = viewport.getBoundingClientRect();
    const fitted = fitWorldViewport(bounds.width, bounds.height);
    host.style.width = `${fitted.width}px`;
    host.style.height = `${fitted.height}px`;
    lifecycle.resize(fitted.width, fitted.height);
  };

  export const pause = () => lifecycle.pause();
  export const resume = () => lifecycle.resume();
  export const destroy = () => lifecycle.destroy();

  const setDirection = (direction: Direction | null) => {
    activeTouch = direction;
    const vector =
      direction === 'up'
        ? { x: 0, y: -1 }
        : direction === 'down'
          ? { x: 0, y: 1 }
          : direction === 'left'
            ? { x: -1, y: 0 }
            : direction === 'right'
              ? { x: 1, y: 0 }
              : { x: 0, y: 0 };
    runtime?.setTouchDirection(vector.x, vector.y);
  };

  const handleVisibility = () => {
    if (document.hidden) pause();
    else resume();
  };

  const gather = () => {
    if (!runtime || gathering || connectionStatus !== 'connected') return;
    gathering = true;
    gatherResult = null;
    runtime.interact();
  };

  const gatherMessage = (result: GatherResult) => {
    if (result.status === 'success') return `Gathered ${result.quantity ?? 1} ${result.itemTitle ?? 'Moonberry'}.`;
    if (result.status === 'cooldown') {
      const ready = result.cooldownUntil ? new Date(result.cooldownUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
      return ready ? `The Moonberry bush is resting until ${ready}.` : 'The Moonberry bush is still resting.';
    }
    if (result.status === 'inventory_full') return 'Your Moonberry holding limit is full. Make room before gathering again.';
    if (result.status === 'out_of_range') return 'Move closer to the Moonberry bush.';
    if (result.status === 'unavailable') return 'Gathering is temporarily unavailable.';
    return 'The Moonberry could not be gathered. Please try again.';
  };

  onMount(async () => {
    try {
      await lifecycle.mount(host);
      status = 'The Wilds is ready.';
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(viewport);
      resize();
      document.addEventListener('visibilitychange', handleVisibility);
      if (document.hidden) pause();
    } catch (error) {
      console.error('[world] Phaser failed to mount', error);
      loadError = true;
      status = 'The Wilds could not start in this browser.';
      lifecycle.destroy();
    }
  });

  onDestroy(() => {
    if (browser) document.removeEventListener('visibilitychange', handleVisibility);
    resizeObserver?.disconnect();
    resizeObserver = null;
    runtime = null;
    lifecycle.destroy();
  });
</script>

<div class="world-viewport" bind:this={viewport} data-testid="world-game-mount">
  <div class="world-canvas" bind:this={host} aria-hidden="true"></div>
  <p class="sr-only" aria-live="polite">{status}</p>
  <p class="connection-status" class:connected={connectionStatus === 'connected'} aria-live="polite">
    {connectionLabel}
  </p>
  {#if connectionStatus === 'unauthorized'}
    <div class="auth-state" role="alert">
      <p>Your Memvoya session could not authorize multiplayer.</p>
      <a href="/app/auth">Sign in again</a>
    </div>
  {/if}

  {#if gatherPrompt && !loadError}
    <div class="interaction-prompt">
      <p>Moonberry bush · Press E or tap to gather</p>
      <button type="button" disabled={gathering || connectionStatus !== 'connected'} on:click={gather}>
        {gathering ? 'Gathering…' : 'Gather Moonberry'}
      </button>
    </div>
  {/if}

  {#if gatherResult}
    <div class:success={gatherResult.status === 'success'} class="gather-result" role="status" aria-live="polite">
      <strong>{gatherMessage(gatherResult)}</strong>
      {#if gatherResult.reaction}<p>{gatherResult.reaction}</p>{/if}
      {#if gatherResult.status === 'success'}<a href="/app/inventory">View in Keepsakes</a>{/if}
    </div>
  {/if}

  {#if loadError}
    <div class="load-error" role="alert">
      <p>{status}</p>
      <a href="/app/home">Return Home</a>
    </div>
  {:else}
    <div class="touch-controls" aria-label="Touch movement controls">
      <button
        type="button"
        aria-label="Move up"
        class:active={activeTouch === 'up'}
        on:pointerdown={() => setDirection('up')}
        on:pointerup={() => setDirection(null)}
        on:pointercancel={() => setDirection(null)}
        on:pointerleave={() => setDirection(null)}>↑</button
      >
      <button
        type="button"
        aria-label="Move left"
        class:active={activeTouch === 'left'}
        on:pointerdown={() => setDirection('left')}
        on:pointerup={() => setDirection(null)}
        on:pointercancel={() => setDirection(null)}
        on:pointerleave={() => setDirection(null)}>←</button
      >
      <button
        type="button"
        aria-label="Move down"
        class:active={activeTouch === 'down'}
        on:pointerdown={() => setDirection('down')}
        on:pointerup={() => setDirection(null)}
        on:pointercancel={() => setDirection(null)}
        on:pointerleave={() => setDirection(null)}>↓</button
      >
      <button
        type="button"
        aria-label="Move right"
        class:active={activeTouch === 'right'}
        on:pointerdown={() => setDirection('right')}
        on:pointerup={() => setDirection(null)}
        on:pointercancel={() => setDirection(null)}
        on:pointerleave={() => setDirection(null)}>→</button
      >
    </div>
  {/if}
</div>

<style>
  .world-viewport {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: min(70vh, 45rem);
    min-height: 22rem;
    overflow: hidden;
    border: 1px solid rgba(180, 242, 224, 0.22);
    border-radius: 1rem;
    background: #09131c;
    touch-action: none;
  }

  .world-canvas {
    display: grid;
    place-items: center;
    max-width: 100%;
    max-height: 100%;
  }

  .world-canvas :global(canvas) {
    display: block;
    max-width: 100%;
    max-height: 100%;
  }

  .touch-controls {
    position: absolute;
    left: max(1rem, env(safe-area-inset-left));
    bottom: max(1rem, env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: repeat(3, 3.25rem);
    grid-template-rows: repeat(2, 3.25rem);
    gap: 0.35rem;
  }

  .touch-controls button {
    display: grid;
    place-items: center;
    border: 1px solid rgba(224, 255, 246, 0.42);
    border-radius: 0.8rem;
    background: rgba(8, 20, 28, 0.82);
    color: #effff9;
    font-size: 1.35rem;
    font-weight: 700;
    backdrop-filter: blur(8px);
    user-select: none;
  }

  .touch-controls button:first-child { grid-column: 2; }
  .touch-controls button:nth-child(2) { grid-column: 1; grid-row: 2; }
  .touch-controls button:nth-child(3) { grid-column: 2; grid-row: 2; }
  .touch-controls button:nth-child(4) { grid-column: 3; grid-row: 2; }
  .touch-controls button.active { background: rgba(69, 160, 132, 0.9); }

  .connection-status {
    position: absolute;
    top: 0.85rem;
    right: 0.85rem;
    z-index: 2;
    margin: 0;
    padding: 0.45rem 0.7rem;
    border: 1px solid rgba(224, 255, 246, 0.28);
    border-radius: 999px;
    background: rgba(8, 20, 28, 0.82);
    color: #f7dca4;
    font-size: 0.78rem;
    backdrop-filter: blur(8px);
  }

  .connection-status.connected { color: #a9f3dd; }

  .auth-state {
    position: absolute;
    z-index: 3;
    top: 3.8rem;
    right: 0.85rem;
    max-width: 18rem;
    padding: 0.7rem 0.85rem;
    border-radius: 0.75rem;
    background: rgba(34, 15, 27, 0.94);
    color: #ffe7ef;
    font-size: 0.82rem;
  }

  .interaction-prompt {
    position: absolute;
    z-index: 3;
    left: 50%;
    bottom: max(1rem, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.65rem 0.8rem;
    border: 1px solid rgba(220, 200, 255, 0.5);
    border-radius: 0.85rem;
    background: rgba(25, 17, 43, 0.94);
    color: #f4edff;
  }
  .interaction-prompt p { margin: 0; font-size: 0.8rem; }
  .interaction-prompt button {
    border: 0;
    border-radius: 0.65rem;
    padding: 0.55rem 0.75rem;
    background: #9e7de0;
    color: #120d1d;
    font-weight: 700;
  }
  .interaction-prompt button:disabled { opacity: 0.55; }

  .gather-result {
    position: absolute;
    z-index: 4;
    top: 3.8rem;
    left: 50%;
    width: min(26rem, calc(100% - 2rem));
    transform: translateX(-50%);
    padding: 0.8rem 1rem;
    border: 1px solid rgba(255, 215, 160, 0.4);
    border-radius: 0.8rem;
    background: rgba(34, 24, 26, 0.95);
    color: #fff2dc;
    text-align: center;
  }
  .gather-result.success { border-color: rgba(170, 242, 214, 0.55); background: rgba(13, 45, 39, 0.96); }
  .gather-result p { margin: 0.4rem 0; }
  .gather-result a { color: #c7f7e8; }
  .auth-state p { margin: 0 0 0.35rem; }
  .auth-state a { color: #ffd0df; }

  .load-error {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
    background: #09131c;
    color: #effff9;
  }

  .load-error a { color: #a9f3dd; }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .touch-controls { display: none; }
  }

  @media (max-width: 640px) {
    .world-viewport {
      height: min(62vh, 34rem);
      min-height: 19rem;
      border-radius: 0.75rem;
    }
  }
</style>
