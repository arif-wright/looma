<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { createEndlessRunner } from '$lib/games/endlessRunner';
  import type { LoomaGameInstance, LoomaGameResult, LoomaPowerupState } from '$lib/games/types';
  import type { GameSessionResult } from '$lib/games/sdk';

  export let ready = false;

  const dispatch = createEventDispatcher<{ gameOver: GameSessionResult }>();

  let canvasEl: HTMLCanvasElement | null = null;
  let stageEl: HTMLDivElement | null = null;
  let game: LoomaGameInstance | null = null;
  let resizeAttached = false;
  let paused = false;
  let running = false;
  let hudFrame: number | null = null;
  let hudStartTime = 0;
  let hudAccumulated = 0;
  let scoreDisplay = 0;
  let distanceDisplay = 0;
  let shardsDisplay: number | null = null;
  let shardsCollected = 0;
  const defaultPowerupState: LoomaPowerupState = {
    shield: false,
    magnet: 0,
    doubleShards: 0,
    slowMo: 0,
    dash: 0,
    dreamSurge: 0
  };
  const defaultPowerupUsage = {
    shield: 0,
    magnet: 0,
    doubleShards: 0,
    slowMo: 0,
    dash: 0,
    dreamSurge: 0
  };
  let activePowerups: LoomaPowerupState = { ...defaultPowerupState };
  let powerupsUsed = { ...defaultPowerupUsage };
  let hudVisible = false;

  const resizeCanvas = () => {
    if (!canvasEl) return;
    const host = stageEl ?? canvasEl.parentElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || window.innerWidth));
    const height = Math.max(1, Math.floor(rect.height || window.innerHeight));
    canvasEl.width = width;
    canvasEl.height = height;
  };

  const destroyGame = () => {
    game?.destroy?.();
    game = null;
    paused = false;
    running = false;
    activePowerups = { ...defaultPowerupState };
    powerupsUsed = { ...defaultPowerupUsage };
  };

  const handleShardCollected = (count: number) => {
    shardsCollected = count;
  };

  const handlePowerupState = (state: LoomaPowerupState) => {
    activePowerups = { ...defaultPowerupState, ...state };
  };

  const ensureGame = () => {
    if (game || !canvasEl) return;
    resizeCanvas();
    game = createEndlessRunner({
      canvas: canvasEl,
      onGameOver: handleGameOver,
      onShardCollected: handleShardCollected,
      onPowerupState: handlePowerupState
    });
  };

  const stopHudLoop = () => {
    if (hudFrame !== null) {
      cancelAnimationFrame(hudFrame);
      hudFrame = null;
    }
  };

  const startHudLoop = () => {
    hudAccumulated = 0;
    hudStartTime = performance.now();
    hudVisible = true;
    const loop = () => {
      if (!running) {
        return;
      }
      if (!paused) {
        const elapsed = performance.now() - hudStartTime;
        const total = hudAccumulated + elapsed;
        scoreDisplay = Math.floor(total * 0.012);
        distanceDisplay = Math.floor(total * 0.18);
      }
      hudFrame = requestAnimationFrame(loop);
    };
    hudFrame = requestAnimationFrame(loop);
  };

  const handleGameOver = (result: LoomaGameResult) => {
    if (!running) return;
    running = false;
    paused = true;
    hudAccumulated += performance.now() - hudStartTime;
    const rawScore = Math.max(0, Math.floor(result.score ?? 0));
    const xpReward = rawScore;
    const shardReward = shardsCollected;
    powerupsUsed = {
      shield: result.meta?.shield_powerups ?? 0,
      magnet: result.meta?.magnet_powerups ?? 0,
      doubleShards: result.meta?.double_powerups ?? 0,
      slowMo: result.meta?.slowmo_powerups ?? 0,
      dash: result.meta?.dash_powerups ?? 0,
      dreamSurge: result.meta?.dream_powerups ?? 0
    };
    scoreDisplay = rawScore;
    distanceDisplay = Math.floor(((result.durationMs ?? 0) * 0.18));
    shardsDisplay = shardReward;
    stopHudLoop();
    activePowerups = { ...defaultPowerupState };

    dispatch('gameOver', {
      score: rawScore,
      durationMs: result.durationMs,
      success: rawScore > 0,
      rewards: {
        xp: xpReward,
        shards: shardReward,
        powerupsUsed
      },
      extra: result.meta ?? undefined
    });
  };

  const handleJump = (event?: Event) => {
    event?.preventDefault?.();
    if (!ready || paused || !running) return;
    game?.playerJump?.();
  };

  const handlePointerJump = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    handleJump(event);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleJump(event);
    }
  };

  $: if (ready) {
    ensureGame();
    paused = false;
    running = true;
    shardsDisplay = null;
    shardsCollected = 0;
    activePowerups = { ...defaultPowerupState };
    powerupsUsed = { ...defaultPowerupUsage };
    scoreDisplay = 0;
    distanceDisplay = 0;
    game?.start();
    startHudLoop();
  } else {
    hudVisible = false;
    stopHudLoop();
    destroyGame();
    shardsCollected = 0;
  }

  export function pause() {
    paused = true;
    hudAccumulated += Math.max(0, performance.now() - hudStartTime);
    game?.pause?.();
  }

  export function resume() {
    paused = false;
    hudStartTime = performance.now();
    game?.resume?.();
  }

  export function reset() {
    paused = false;
    running = false;
    hudAccumulated = 0;
    hudVisible = false;
    scoreDisplay = 0;
    distanceDisplay = 0;
    shardsCollected = 0;
    shardsDisplay = null;
    activePowerups = { ...defaultPowerupState };
    stopHudLoop();
    destroyGame();
  }

  onMount(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('keydown', handleKeyDown);
    resizeAttached = true;

    return () => {
      if (resizeAttached) {
        window.removeEventListener('resize', resizeCanvas);
        resizeAttached = false;
      }
      window.removeEventListener('keydown', handleKeyDown);
      stopHudLoop();
      destroyGame();
    };
  });
</script>

<div class="runner-stage" bind:this={stageEl}>
  <canvas bind:this={canvasEl} class="runner-surface" aria-label="Neon Run canvas"></canvas>
  <div
    class="runner-input-layer"
    role="presentation"
    on:click|preventDefault={handlePointerJump}
    on:touchstart|preventDefault={handlePointerJump}
    on:pointerdown|preventDefault={handlePointerJump}
  ></div>
  {#if hudVisible}
    <div class="nr-hud">
      <div class="nr-hud-item">
        <span class="nr-label">Score</span>
        <span class="nr-value">{scoreDisplay.toLocaleString()}</span>
      </div>
      <div class="nr-hud-item">
        <span class="nr-label">Distance</span>
        <span class="nr-value">{distanceDisplay} m</span>
      </div>
      <div class="nr-hud-item">
        <span class="nr-label">Shards</span>
        <span class="nr-value">{(shardsDisplay ?? shardsCollected).toLocaleString()}</span>
      </div>
      {#if activePowerups.shield || activePowerups.magnet > 0 || activePowerups.doubleShards > 0 || activePowerups.slowMo > 0 || activePowerups.dash > 0 || activePowerups.dreamSurge > 0}
        <div class="nr-hud-badges">
          {#if activePowerups.shield}
            <span class="nr-hud-badge shield">Shield</span>
          {/if}
          {#if activePowerups.magnet > 0}
            <span class="nr-hud-badge magnet">Magnet</span>
          {/if}
          {#if activePowerups.doubleShards > 0}
            <span class="nr-hud-badge x2">x2 Shards</span>
          {/if}
          {#if activePowerups.slowMo > 0}
            <span class="nr-hud-badge slowmo">Slow-Mo</span>
          {/if}
          {#if activePowerups.dash > 0}
            <span class="nr-hud-badge dash">Dash</span>
          {/if}
          {#if activePowerups.dreamSurge > 0}
            <span class="nr-hud-badge dream">Dream Surge</span>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .runner-stage {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .runner-surface {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
    background: transparent;
    display: block;
  }

  .runner-input-layer {
    position: absolute;
    inset: 0;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    z-index: 2;
  }

  .nr-hud {
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 0.4rem 0.9rem;
    background: rgba(3, 12, 24, 0.55);
    border-radius: 1rem;
    box-shadow: 0 0 22px rgba(60, 250, 255, 0.25);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    animation: fadeIn 280ms ease-out;
    font-family: 'Inter', system-ui, sans-serif;
    z-index: 3;
  }

  @media (max-width: 640px) {
    .nr-hud {
      font-size: 0.9rem;
      gap: 0.6rem;
    }
  }

  .nr-hud-item {
    display: flex;
    flex-direction: column;
    min-width: 70px;
  }

  .nr-hud-badges {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .nr-hud-badge {
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #04060f;
    font-weight: 600;
  }

  .nr-hud-badge.shield {
    background: linear-gradient(90deg, #38bdf8, #22d3ee);
  }

  .nr-hud-badge.magnet {
    background: linear-gradient(90deg, #c084fc, #a855f7);
    color: #fdf4ff;
  }

  .nr-hud-badge.x2 {
    background: linear-gradient(90deg, #fde047, #f97316);
  }

  .nr-hud-badge.slowmo {
    background: linear-gradient(90deg, #38bdf8, #1d4ed8);
    color: #e0f2fe;
  }

  .nr-hud-badge.dash {
    background: linear-gradient(90deg, #fef08a, #facc15);
    color: #78350f;
  }

  .nr-hud-badge.dream {
    background: linear-gradient(90deg, #f472b6, #a855f7);
    color: #fff;
  }

  .nr-label {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.65);
  }

  .nr-value {
    font-size: 0.95rem;
    font-weight: 600;
    color: #7cfbff;
    text-shadow: 0 0 8px rgba(124, 251, 255, 0.6);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, -6px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
