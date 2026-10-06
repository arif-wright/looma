<script lang="ts">
  import { onMount, tick } from 'svelte';
  import WorldGameMount from '../../../src/lib/game/WorldGameMount.svelte';
  import { fixture } from './fake-colyseus';
  const renderer = new URLSearchParams(location.search).get('renderer') === 'three' ? 'three' : 'phaser';
  let mounted = true;
  onMount(() => {
    fixture.unmount = async () => { mounted = false; await tick(); };
    fixture.mount = async () => { mounted = true; await tick(); };
  });
</script>

<main>
  <p class="fixture-note">Synthetic Moonberry regression · local transport · no account or saved rewards</p>
  {#if mounted}<WorldGameMount serverUrl="ws://synthetic-moonberry.invalid" {renderer} />{/if}
  <nav aria-label="Fixture controls">
    <button onclick={() => fixture.unmount()}>Unmount fixture</button>
    <button onclick={() => fixture.mount()}>Mount fixture</button>
  </nav>
</main>
<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #07131a; color: #effff9; font-family: system-ui, sans-serif; }
  :global(button) { font: inherit; }
  main { max-width: 1200px; margin: 0 auto; padding: 12px; }
  .fixture-note { position: sticky; top: 0; z-index: 10; background: #07131a; font-size: 12px; line-height: 1.5; margin: 0 0 12px; }
  nav { display: flex; gap: 8px; margin-top: 12px; }
  nav button { min-height: 44px; padding: 8px; border: 1px solid #8ba99e; border-radius: 8px; background: #21392f; color: inherit; }
</style>
