<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { createEndlessRunner } from '$lib/games/endlessRunner';
  import type { LoomaGameInstance, LoomaGameResult } from '$lib/games/types';

  const dispatch = createEventDispatcher<{ gameOver: LoomaGameResult }>();

  let canvasEl: HTMLCanvasElement | null = null;
  let stageEl: HTMLDivElement | null = null;
  let game: LoomaGameInstance | null = null;
  let resizeAttached = false;

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
    game?.destroy();
    game = null;
  };

  const startGame = () => {
    if (!canvasEl) return;
    destroyGame();
    resizeCanvas();
    game = createEndlessRunner({
      canvas: canvasEl,
      onGameOver: (result) => dispatch('gameOver', result)
    });
    game.start();
  };

  export function restart() {
    startGame();
  }

  onMount(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    resizeAttached = true;
    startGame();

    return () => {
      if (resizeAttached) {
        window.removeEventListener('resize', resizeCanvas);
        resizeAttached = false;
      }
      destroyGame();
    };
  });
</script>

<div class="runner-stage" bind:this={stageEl}>
  <canvas bind:this={canvasEl} class="runner-surface" aria-label="Neon Run canvas"></canvas>
</div>

<style>
  .runner-stage {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
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
</style>
