<script lang="ts">
  import NeonRun from '../../../src/lib/components/games/NeonRun.svelte';
  import GameShell from '../../../src/lib/games/GameShell.svelte';
  import { createEndlessRunner, createOrbfield } from './engines';
  import { pathname } from './navigation';
  import { fixture } from './runtime';
  let mounted = true;
  fixture.unmount = () => { mounted = false; };
</script>
<div class="fixture-note">LOCAL START RECOVERY · SYNTHETIC AUTH / TRANSPORT · FAKE ENGINE · ORIGINAL ART</div>
{#if !mounted}
  <main><h1>Fixture unmounted</h1></main>
{:else if $pathname === '/app/games'}
  <main><h1>Play</h1><p>Synthetic navigation destination. No backend is connected.</p></main>
{:else if $pathname === '/app/auth'}
  <main><h1>Sign in</h1><p>Synthetic destination. Never enter credentials in this fixture.</p></main>
{:else}
  <div id="game-root">
    {#if fixture.kind === 'neon'}
      <NeonRun createGame={createEndlessRunner} />
    {:else}
      <GameShell title="Orbfield" description="Guide your pearl wisp and dodge the thorns." gameId="orbfield" createGame={createOrbfield} />
    {/if}
  </div>
{/if}
<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #080f1f; color: #edf6f3; font-family: system-ui, sans-serif; }
  :global(button) { font: inherit; }
  :global(.sr-only) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  .fixture-note { position: fixed; z-index: 10000; inset: 0 0 auto; min-height: 30px; padding: 6px; background: #10252d; text-align: center; color: #c4e5ea; font-size: 10px; }
  #game-root { position: fixed; inset: 30px 0 0; overflow: auto; }
  main { margin: 60px auto; max-width: 700px; padding: 20px; }
</style>
