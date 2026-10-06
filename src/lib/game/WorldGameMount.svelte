<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import { fitWorldViewport } from './config';
  import { GameLifecycle, type GameRuntime } from './lifecycle';
  import type { ConnectionDiagnostic, ConnectionStatus } from './protocol';
  import type { GatherResult } from './protocol';
  import { getWorldArea, type WorldPortal, type WorldArea } from './areas';
  import type { WorldRenderer } from './rendererSelection';
  import { activateWorldRuntime, releaseWorldRuntime } from './worldRuntimeRegistry';
  import type { CameraPresetName } from './renderers/three/cameraController';
  import type { ThreeWorldRuntime, WebglContextStatus } from './renderers/three/threeWorld';

  export let serverUrl: string | null = null;
  export let renderer: WorldRenderer = 'phaser';

  type Direction = 'up' | 'down' | 'left' | 'right';
  type RuntimeWithTouch = GameRuntime & {
    setTouchDirection: (x: number, y: number) => void;
    interact: () => void;
    enterPortal: () => void;
    orbitCamera?: (yaw: number, pitch: number) => void;
    zoomCamera?: (delta: number) => void;
    resetCamera?: () => void;
    selectCameraPreset?: (preset: CameraPresetName) => void;
    simulateContextRestore?: () => void;
  };

  let host: HTMLDivElement;
  let viewport: HTMLDivElement;
  let runtime: RuntimeWithTouch | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let mountGeneration = 0;
  let activeTouch: Direction | null = null;
  let status = 'Loading The Wilds…';
  let loadError = false;
  let connectionStatus: ConnectionStatus = 'offline';
  let connectionDiagnostic: ConnectionDiagnostic | null = null;
  let gatherPrompt = false;
  let area = getWorldArea();
  let portalPrompt: WorldPortal | null = null;
  let travelling = false;
  let portalMessage = '';
  let gathering = false;
  let gatherResult: GatherResult | null = null;
  let contextStatus: WebglContextStatus = 'ready';
  let cameraPreset: CameraPresetName = 'classic';
  $: connectionLabel =
    connectionStatus === 'connected' ? 'Multiplayer connected' :
    connectionStatus === 'connecting' ? 'Connecting…' :
    connectionStatus === 'reconnecting' ? 'Reconnecting…' :
    connectionStatus === 'unauthorized' ? 'Session required' :
    connectionStatus === 'unavailable' ? 'Multiplayer unavailable' : 'World offline';

  const lifecycle = new GameLifecycle(async (target) => {
    const generation = mountGeneration;
    const { WorldSession } = await import('./worldSession');
    const createRenderer = renderer === 'three'
      ? (await import('./renderers/three/threeWorld')).createThreeWorld
      : (await import('./worldGame')).createWorldGame;
    // Never start a session or activate a renderer for a view removed during import.
    if (generation !== mountGeneration) return { resize() {}, pause() {}, resume() {}, destroy() {} };
    const session = new WorldSession(serverUrl, {
      onStatus: (nextStatus) => {
        connectionStatus = nextStatus;
        if (nextStatus !== 'connected') { travelling = false; setDirection(null); }
      },
      onDiagnostic: (diagnostic) => (connectionDiagnostic = diagnostic),
      onPortalStart: () => { travelling = true; portalMessage = ''; setDirection(null); },
      onPortalResult: (result) => {
        travelling = false;
        portalMessage = result.status === 'success' ? `Arrived in ${getWorldArea(result.mapId).name}.`
          : result.status === 'out_of_range' ? 'Move closer to the lantern portal.'
          : result.status === 'cooldown' ? 'The portal is settling. Try again in a moment.'
          : 'The portal is temporarily unavailable. Please wait for the connection or try again.';
      },
      onGatherResult: (result) => {
        gathering = false;
        gatherResult = result;
      },
      onGatherStart: () => { gathering = true; gatherResult = null; }
    });
    const rendererRuntime = createRenderer(target, {
      session,
      onPortalPrompt: (portal) => (portalPrompt = portal),
      onAreaChange: changeArea,
      onGatherPrompt: (visible) => (gatherPrompt = visible),
      onContextStatus: (nextStatus) => (contextStatus = nextStatus),
      onCameraPreset: (nextPreset) => (cameraPreset = nextPreset)
    });
    let destroyed = false;
    const cameraRuntime = rendererRuntime as Partial<ThreeWorldRuntime>;
    const mountedRuntime: RuntimeWithTouch = {
      resize: rendererRuntime.resize,
      pause: rendererRuntime.pause,
      resume: rendererRuntime.resume,
      setTouchDirection: rendererRuntime.setTouchDirection,
      interact: rendererRuntime.interact,
      enterPortal: rendererRuntime.enterPortal,
      ...(cameraRuntime.orbitCamera ? { orbitCamera: cameraRuntime.orbitCamera } : {}),
      ...(cameraRuntime.zoomCamera ? { zoomCamera: cameraRuntime.zoomCamera } : {}),
      ...(cameraRuntime.resetCamera ? { resetCamera: cameraRuntime.resetCamera } : {}),
      ...(cameraRuntime.selectCameraPreset ? { selectCameraPreset: cameraRuntime.selectCameraPreset } : {}),
      ...(cameraRuntime.simulateContextRestore ? { simulateContextRestore: cameraRuntime.simulateContextRestore } : {}),
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        rendererRuntime.destroy();
        session.destroy('world component teardown');
        releaseWorldRuntime(mountedRuntime);
      }
    };
    activateWorldRuntime(mountedRuntime);
    runtime = mountedRuntime;
    session.start();
    return mountedRuntime;
  });

  function changeArea(next: WorldArea) {
    area = next;
    gatherPrompt = false;
    setDirection(null);
  }

  const resize = () => {
    if (!viewport || !host) return;
    const bounds = viewport.getBoundingClientRect();
    const fitted = fitWorldViewport(bounds.width, bounds.height);
    host.style.width = `${fitted.width}px`;
    host.style.height = `${fitted.height}px`;
    lifecycle.resize(fitted.width, fitted.height);
  };

  const diagnosticMessage = (diagnostic: ConnectionDiagnostic) => {
    const suffix = diagnostic.statusCode ? ` (${diagnostic.statusCode})` : '';
    if (diagnostic.code === 'client_outdated') return 'A newer Wilds version is ready. Reload this page to continue. [W-UPDATE]';
    if (diagnostic.code === 'configuration_missing') return 'The world server URL is not configured. [W-CONFIG]';
    if (diagnostic.code === 'ticket_rejected') return `Your world authorization was rejected${suffix}. [W-AUTH]`;
    if (diagnostic.code === 'ticket_unavailable') return `The world authorization service did not respond successfully${suffix}. [W-TICKET]`;
    if (diagnostic.code === 'ticket_malformed') return 'The world authorization response was invalid. [W-TICKET-DATA]';
    if (diagnostic.code === 'join_failed') return `The realtime server could not complete matchmaking${suffix}. [W-JOIN]`;
    if (diagnostic.code === 'connection_closed') return `The realtime server closed the connection${suffix}. [W-CLOSE]`;
    return `Realtime recovery was exhausted${suffix}. [W-RECOVERY]`;
  };

  export const pause = () => { setDirection(null); lifecycle.pause(); };
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
    if (!runtime || !gatherPrompt || portalPrompt || gathering || travelling || connectionStatus !== 'connected') return;
    runtime.interact();
  };

  const enterPortal = () => {
    if (!runtime || !portalPrompt || travelling || connectionStatus !== 'connected') return;
    runtime.enterPortal();
  };

  const gatherMessage = (result: GatherResult) => {
    if (result.status === 'unconfirmed' || result.status === 'failure') return 'We couldn’t confirm that gather. Check your Keepsakes before trying again.';
    if (result.status === 'success') return `Gathered ${result.quantity ?? 1} ${result.itemTitle ?? 'Moonberry'}.`;
    if (result.status === 'cooldown') {
      const ready = result.cooldownUntil ? new Date(result.cooldownUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
      return ready ? `The Moonberry bush is resting until ${ready}.` : 'The Moonberry bush is still resting.';
    }
    if (result.status === 'inventory_full') return 'You’ve reached the Moonberry holding limit.';
    if (result.status === 'out_of_range') return 'Move closer to the Moonberry bush.';
    if (result.status === 'unavailable') return 'Gathering is temporarily unavailable.';
    return 'Gathering is temporarily unavailable.';
  };

  onMount(async () => {
    const generation = ++mountGeneration;
    try {
      await lifecycle.mount(host);
      // A lazy renderer can finish loading after navigation has removed this view.
      if (generation !== mountGeneration) return;
      status = 'The Wilds is ready.';
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(viewport);
      resize();
      document.addEventListener('visibilitychange', handleVisibility);
      if (document.hidden) pause();
    } catch (error) {
      if (generation !== mountGeneration) return;
      console.error(`[world] ${renderer} renderer failed to mount`, error);
      loadError = true;
      status = 'The Wilds could not start in this browser.';
      lifecycle.destroy();
    }
  });

  onDestroy(() => {
    mountGeneration += 1;
    if (browser) document.removeEventListener('visibilitychange', handleVisibility);
    resizeObserver?.disconnect();
    resizeObserver = null;
    runtime = null;
    lifecycle.destroy();
  });
</script>

<div class="world-viewport" bind:this={viewport} data-testid="world-game-mount" data-renderer={renderer}>
  <div class="world-canvas" bind:this={host} aria-hidden="true"></div>
  <p class="sr-only" aria-live="polite">{status}</p>
  <div class="area-label" data-testid="world-area" aria-live="polite">
    <strong>{area.name}</strong><span>Two trails · one quiet world</span>
  </div>
  <p class="connection-status" class:connected={connectionStatus === 'connected'} aria-live="polite">
    {connectionLabel}
  </p>
  {#if import.meta.env.DEV}<p class="renderer-label">Renderer: {renderer}</p>{/if}
  {#if connectionDiagnostic && (connectionStatus === 'unavailable' || connectionStatus === 'unauthorized' || connectionStatus === 'offline')}
    <div class="connection-diagnostic" role="alert">{diagnosticMessage(connectionDiagnostic)}
      {#if connectionDiagnostic.code === 'client_outdated'}<button type="button" on:click={() => window.location.reload()}>Reload The Wilds</button>{/if}
    </div>
  {/if}
  {#if connectionStatus === 'unauthorized'}
    <div class="auth-state" role="alert">
      <p>Your Memvoya session could not authorize multiplayer.</p>
      <a href="/app/auth">Sign in again</a>
    </div>
  {/if}
  {#if renderer === 'three' && contextStatus !== 'ready'}
    <div class="context-state" role="status" aria-live="polite" data-testid="webgl-recovery-state">
      <p>{contextStatus === 'lost' ? 'The world display paused after a graphics interruption.' : 'Restoring the world display…'}</p>
      {#if contextStatus === 'lost'}<button type="button" on:click={() => runtime?.simulateContextRestore?.()}>Restore display</button>{/if}
    </div>
  {/if}

  {#if portalPrompt && !loadError}
    <div class="interaction-prompt portal-prompt" data-testid="world-portal-prompt">
      <p>Lantern portal · Press E or tap</p>
      <button type="button" disabled={travelling || connectionStatus !== 'connected'} on:click={enterPortal}>
        {travelling ? 'Travelling…' : `Enter ${portalPrompt.targetName}`}
      </button>
    </div>
  {/if}
  {#if portalMessage}<p class="portal-result" role="status" aria-live="polite">{portalMessage}</p>{/if}

  {#if gatherPrompt && !portalPrompt && !loadError}
    <div class="interaction-prompt">
      <p>Moonberry bush · Press E or tap to gather</p>
      <button type="button" disabled={gathering || travelling || connectionStatus !== 'connected'} aria-busy={gathering} on:click={gather}>
        {gathering ? 'Gathering…' : 'Gather Moonberry'}
      </button>
    </div>
  {/if}

  {#if gatherResult}
    <div class:success={gatherResult.status === 'success'} class="gather-result" role="status" aria-live="polite">
      <strong>{gatherMessage(gatherResult)}</strong>
      {#if gatherResult.reaction}<p>{gatherResult.reaction}</p>{/if}
      {#if gatherResult.status === 'success' || gatherResult.status === 'unconfirmed' || gatherResult.status === 'failure' || gatherResult.status === 'inventory_full'}<a href="/app/inventory">View in Keepsakes</a>{/if}
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
    {#if renderer === 'three'}
      <div class="camera-controls" aria-label="Camera controls">
        <button type="button" aria-label="Rotate camera left" on:click={() => runtime?.orbitCamera?.(-0.18, 0)}>↶</button>
        <button type="button" aria-label="Reset camera" on:click={() => runtime?.resetCamera?.()}>R</button>
        <button type="button" aria-label="Rotate camera right" on:click={() => runtime?.orbitCamera?.(0.18, 0)}>↷</button>
        <button type="button" aria-label="Zoom camera out" on:click={() => runtime?.zoomCamera?.(-0.15)}>−</button>
        <button type="button" aria-label="Zoom camera in" on:click={() => runtime?.zoomCamera?.(0.15)}>+</button>
        <label>
          <span class="sr-only">Camera preset</span>
          <select aria-label="Camera preset" value={cameraPreset} on:change={(event) => runtime?.selectCameraPreset?.(event.currentTarget.value as CameraPresetName)}>
            <option value="classic">Classic</option>
            <option value="adventurer">Adventurer</option>
            <option value="wide">Wide</option>
            <option value="close">Close</option>
          </select>
        </label>
      </div>
    {/if}
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

  .area-label { position: absolute; top: .85rem; left: .85rem; z-index: 2; display: grid; gap: .2rem; max-width: 48%; padding: .55rem .75rem; border: 1px solid #c7dcb442; border-radius: .8rem; background: #142a25dd; color: #fff4d8; pointer-events: none; }
  .area-label strong { font-size: .95rem; }
  .area-label span { font-size: .65rem; color: #c5d4b8; }
  .portal-result { position: absolute; z-index: 3; top: 4.5rem; left: 50%; transform: translateX(-50%); width: min(27rem, calc(100% - 2rem)); margin: 0; padding: .6rem .8rem; border-radius: .8rem; background: #142a25ed; color: #fff1c8; text-align: center; font-size: .8rem; }
  .portal-prompt { border-color: #e5c47490; background: #2a2417f0; }
  .portal-prompt button { background: #ecd69a; }
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

  .renderer-label {
    position: absolute;
    top: 3.25rem;
    right: 0.9rem;
    z-index: 2;
    margin: 0;
    color: rgba(239, 255, 249, 0.7);
    font: 0.68rem/1 monospace;
  }

  .camera-controls {
    position: absolute;
    right: max(1rem, env(safe-area-inset-right));
    bottom: max(1rem, env(safe-area-inset-bottom));
    display: grid;
    grid-template-columns: repeat(3, 2.7rem);
    gap: 0.35rem;
  }

  .camera-controls label { grid-column: 1 / -1; }

  .camera-controls button {
    min-width: 2.7rem;
    min-height: 2.7rem;
    border: 1px solid rgba(224, 255, 246, 0.42);
    border-radius: 0.7rem;
    background: rgba(8, 20, 28, 0.82);
    color: #effff9;
    font-weight: 700;
  }

  .camera-controls select {
    width: 100%;
    min-height: 2.7rem;
    border: 1px solid rgba(224, 255, 246, 0.42);
    border-radius: 0.7rem;
    padding: 0 0.45rem;
    background: rgba(8, 20, 28, 0.9);
    color: #effff9;
  }

  .context-state {
    position: absolute;
    z-index: 6;
    inset: 50% auto auto 50%;
    width: min(25rem, calc(100% - 2rem));
    transform: translate(-50%, -50%);
    border: 1px solid rgba(169, 243, 221, 0.45);
    border-radius: 0.9rem;
    padding: 1rem;
    background: rgba(8, 20, 28, 0.96);
    color: #effff9;
    text-align: center;
  }
  .context-state p { margin: 0 0 0.7rem; }
  .context-state button { border: 0; border-radius: 0.6rem; padding: 0.55rem 0.8rem; background: #a9f3dd; color: #07131a; font-weight: 700; }

  .connection-diagnostic {
    position: absolute;
    z-index: 4;
    top: 4.25rem;
    right: 1rem;
    width: min(25rem, calc(100% - 2rem));
    margin: 0;
    border: 1px solid rgba(255, 188, 207, 0.32);
    border-radius: 0.75rem;
    padding: 0.65rem 0.8rem;
    background: rgba(26, 11, 23, 0.92);
    color: #ffd6e2;
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .connection-diagnostic button { display: block; margin-top: .5rem; min-height: 44px; padding: .5rem .75rem; border: 1px solid #ffe7bd; border-radius: .5rem; background: #ffe7bd; color: #172b28; font-weight: 700; }

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
  .interaction-prompt { max-width: calc(100% - 2rem); box-sizing: border-box; }
  .interaction-prompt button { min-height: 44px; flex-shrink: 0; }
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
    .area-label { top: .5rem; left: .5rem; padding: .4rem .5rem; max-width: 45%; }
    .area-label strong { font-size: .78rem; }
    .area-label span { display: none; }
    .connection-status { top: .5rem; right: .5rem; padding: .4rem .5rem; max-width: 45%; font-size: .67rem; }
    .renderer-label { top: 2.8rem; }
    .interaction-prompt { bottom: 8rem; width: calc(100% - 1rem); max-width: 23rem; justify-content: space-between; padding: .45rem .55rem; gap: .4rem; }
    .interaction-prompt p { font-size: .7rem; }
    .interaction-prompt button { max-width: 62%; padding: .45rem .6rem; font-size: .75rem; }
    .portal-result { top: 3.2rem; font-size: .72rem; }

    .world-viewport {
      height: min(62vh, 34rem);
      min-height: 19rem;
      border-radius: 0.75rem;
    }

    /* Reserve the taller camera cluster and keep both pads independently tappable. */
    .world-viewport[data-renderer='three'] { min-height: calc(25rem + env(safe-area-inset-bottom)); }
    .world-viewport[data-renderer='three'] .touch-controls {
      left: max(6px, env(safe-area-inset-left));
      bottom: max(6px, env(safe-area-inset-bottom));
      grid-template-columns: repeat(3, 44px);
      grid-template-rows: repeat(2, 44px);
      gap: 2px;
    }
    .world-viewport[data-renderer='three'] .camera-controls {
      right: max(6px, env(safe-area-inset-right));
      bottom: max(6px, env(safe-area-inset-bottom));
      grid-template-columns: repeat(3, 44px);
      gap: 2px;
    }
    .world-viewport[data-renderer='three'] .camera-controls button,
    .world-viewport[data-renderer='three'] .camera-controls select { min-width: 44px; min-height: 44px; }
    .world-viewport[data-renderer='three'] .interaction-prompt {
      bottom: calc(max(6px, env(safe-area-inset-bottom)) + 136px + 12px);
    }
  }

  @media (min-width: 480px) and (max-height: 500px) and (pointer: coarse) {
    /* A shorter, wider camera strip leaves room for feedback in phone landscape. */
    .world-viewport[data-renderer='three'] { min-height: calc(19rem + env(safe-area-inset-bottom)); }
    .world-viewport[data-renderer='three'] .touch-controls {
      left: max(6px, env(safe-area-inset-left));
      bottom: max(6px, env(safe-area-inset-bottom));
      grid-template-columns: repeat(3, 44px);
      grid-template-rows: repeat(2, 44px);
      gap: 2px;
    }
    .world-viewport[data-renderer='three'] .camera-controls {
      right: max(6px, env(safe-area-inset-right));
      bottom: max(6px, env(safe-area-inset-bottom));
      grid-template-columns: repeat(5, 44px);
      gap: 2px;
    }
    .world-viewport[data-renderer='three'] .camera-controls button,
    .world-viewport[data-renderer='three'] .camera-controls select { min-width: 44px; min-height: 44px; }
    .world-viewport[data-renderer='three'] .interaction-prompt {
      bottom: calc(max(6px, env(safe-area-inset-bottom)) + 90px + 12px);
      width: calc(100% - 1rem);
      max-width: 23rem;
      justify-content: space-between;
      padding: .45rem .55rem;
      gap: .4rem;
    }
    .world-viewport[data-renderer='three'] .interaction-prompt p { font-size: .7rem; }
    .world-viewport[data-renderer='three'] .interaction-prompt button { max-width: 62%; padding: .45rem .6rem; font-size: .75rem; }
    .world-viewport[data-renderer='three'] .gather-result {
      top: 3.2rem;
      padding: .4rem .75rem;
      font-size: .85rem;
      line-height: 1.3;
    }
    .world-viewport[data-renderer='three'] .gather-result p { margin: .25rem 0; }
  }
</style>
