<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { bootstrapEmbed } from '$lib/games/tiles-run/embed';

  let canvasEl: HTMLCanvasElement | null = null;
  let teardown: (() => void) | null = null;

  onMount(() => {
    if (!canvasEl) return;
    const bridge = bootstrapEmbed(canvasEl);
    teardown = bridge.destroy;
    return () => {
      teardown?.();
      teardown = null;
    };
  });

  onDestroy(() => {
    teardown?.();
    teardown = null;
  });
</script>

<svelte:head>
  <title>Tiles Run</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</svelte:head>

<div id="root">
  <canvas id="game" bind:this={canvasEl}></canvas>
  <div class="hint">Click / Space to jump — survive to score.</div>
</div>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    height: 100%;
    background: #070d1a;
    color: #d6e1ff;
    font-family: system-ui, -apple-system, sans-serif;
  }

  :global(body) {
    overflow: hidden;
  }

  :global(:root) {
    color-scheme: dark;
  }

  #root {
    display: grid;
    place-items: center;
    height: 100vh;
    width: 100vw;
    position: relative;
  }

  #game {
    width: min(92vw, 1200px);
    aspect-ratio: 16 / 9;
    background: #0b1324;
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }

  .hint {
    position: fixed;
    top: 12px;
    left: 12px;
    color: #9db4ff;
    font-size: 12px;
    line-height: 1.4;
    opacity: 0.6;
    pointer-events: none;
  }
</style>
