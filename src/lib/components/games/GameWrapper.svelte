<script lang="ts">
  import { onMount } from 'svelte';

  export let gameId: string;
  export let onLoaded: (() => void | Promise<void>) | null = null;

  onMount(() => {
    if (typeof onLoaded === 'function') {
      void onLoaded();
    }
  });
</script>

<div id="game-container" data-game-id={gameId}>
  <slot />
</div>

<style>
  #game-container {
    position: relative;
    width: 100%;
    height: 100%;
  }
</style>
