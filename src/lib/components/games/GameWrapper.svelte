<script lang="ts">
  import { onMount } from 'svelte';
  import {
    enterFullscreen,
    ensureFallbackLayout,
    isFullscreen,
    requestLandscape
  } from '$lib/games/fullscreen';

  export let gameId: string;
  export let onLoaded: (() => void | Promise<void>) | null = null;

  let containerEl: HTMLDivElement | null = null;
  let overlayVisible = true;
  let activating = false;
  let fullscreenActive = false;
  let hasLoaded = false;

  const updateFullscreenState = () => {
    fullscreenActive = isFullscreen();
  };

  const syncContainerSize = () => {
    if (typeof document === 'undefined' || !containerEl) return;
    const root = document.getElementById('game-root');
    if (root) {
      const rect = root.getBoundingClientRect();
      containerEl.style.width = `${rect.width}px`;
      containerEl.style.height = `${rect.height}px`;
    } else {
      containerEl.style.width = '100vw';
      containerEl.style.height = '100vh';
    }
    ensureFallbackLayout();
  };

  const activateGame = async () => {
    if (!containerEl || activating) return;
    activating = true;
    try {
      await enterFullscreen(containerEl);
      await requestLandscape();
    } catch (err) {
      console.warn('[GameWrapper] fullscreen activation failed', err);
    } finally {
      overlayVisible = false;
      if (!hasLoaded && typeof onLoaded === 'function') {
        await onLoaded();
      }
      hasLoaded = true;
      syncContainerSize();
      updateFullscreenState();
      activating = false;
    }
  };

  onMount(() => {
    syncContainerSize();
    updateFullscreenState();

    const onFullscreenChange = () => {
      updateFullscreenState();
      syncContainerSize();
    };

    const onResize = () => {
      syncContainerSize();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  });
</script>

<div
  id="game-container"
  data-game-id={gameId}
  bind:this={containerEl}
  data-fullscreen={fullscreenActive}
>
  <slot />

  {#if overlayVisible}
    <button
      class="activation-overlay"
      type="button"
      on:click={activateGame}
      disabled={activating}
      aria-live="polite"
    >
      {activating ? 'Starting…' : 'Tap to Start'}
    </button>
  {/if}
</div>

<style>
  #game-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
  }

  .activation-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    font-size: 1.1rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-weight: 600;
    cursor: pointer;
    z-index: 5;
    transition: opacity 160ms ease;
  }

  .activation-overlay:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.8);
    outline-offset: 4px;
  }

  .activation-overlay:disabled {
    cursor: progress;
    opacity: 0.7;
  }
</style>
