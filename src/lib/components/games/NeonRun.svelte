<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { createEndlessRunner } from '$lib/games/endlessRunner';
  import type { LoomaGameInstance, LoomaGameResult } from '$lib/games/types';
  import type { GameSessionResult } from '$lib/games/sdk';

  export let ready = false;

  const dispatch = createEventDispatcher<{ gameOver: GameSessionResult }>();

  let canvasEl: HTMLCanvasElement | null = null;
  let stageEl: HTMLDivElement | null = null;
  let game: LoomaGameInstance | null = null;
  let resizeAttached = false;
  let paused = false;
  let running = false;

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
  };

  const ensureGame = () => {
    if (game || !canvasEl) return;
    resizeCanvas();
    game = createEndlessRunner({
      canvas: canvasEl,
      onGameOver: handleGameOver
    });
  };

  const handleGameOver = (result: LoomaGameResult) => {
    if (!running) return;
    running = false;
    paused = true;
    const rawScore = Math.max(0, Math.floor(result.score ?? 0));
    const xpReward = rawScore;
    const shardReward = Math.floor(rawScore / 10);

    dispatch('gameOver', {
      score: rawScore,
      durationMs: result.durationMs,
      success: rawScore > 0,
      rewards: {
        xp: xpReward,
        shards: shardReward
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
    game?.start();
  } else {
    destroyGame();
  }

  export function pause() {
    paused = true;
    game?.pause?.();
  }

  export function resume() {
    paused = false;
    game?.resume?.();
  }

  export function reset() {
    paused = false;
    running = false;
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
</style>
