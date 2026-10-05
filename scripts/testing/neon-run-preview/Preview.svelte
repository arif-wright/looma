<script lang="ts">
  import { onMount } from 'svelte';
  import NeonRun from '../../../src/lib/components/games/NeonRun.svelte';
  import { realEngine, lifecycleEngine } from './engines';
  import { goto, navigated } from './navigation';
  import { fixture } from './runtime';
  let pathname = typeof location === 'undefined' ? '/app/games/runner' : location.pathname;
  const createGame = fixture.engine === 'lifecycle' ? lifecycleEngine : realEngine;
  onMount(() => {
    const sync = () => { pathname = location.pathname; };
    const pop = () => { sync(); navigated(); };
    const click = (event: MouseEvent) => {
      const link = (event.target as Element).closest('a');
      if (!link || link.origin !== location.origin || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault(); void goto(link.href);
    };
    window.addEventListener('fixture:navigation', sync);
    window.addEventListener('popstate', pop);
    document.addEventListener('click', click);
    return () => { window.removeEventListener('fixture:navigation', sync); window.removeEventListener('popstate', pop); document.removeEventListener('click', click); };
  });
</script>
<div class="fixture-note">LOCAL NEON RUN REVIEW · SYNTHETIC DATA · {fixture.engine === 'real' ? 'REAL ENGINE' : 'LIFECYCLE TEST ENGINE'}</div>
{#if pathname === '/app/games'}
  <main class="destination"><h1>Play</h1><p>Local destination. No account, database or API is connected.</p><a href="/app/games/runner">Return to Neon Run</a></main>
{:else if pathname === '/app/auth' || pathname.includes('login') || pathname.includes('sign-in')}
  <main class="destination"><h1>Sign in</h1><p>Synthetic destination. Never enter credentials in this fixture.</p></main>
{:else}
  <div id="game-root"><NeonRun {createGame} /></div>
{/if}
<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #080f1f; color: #edf6f3; font-family: 'Segoe UI', system-ui, sans-serif; }
  :global(button), :global(input) { font: inherit; }
  :global(a) { color: #b7e6d5; }
  :global(.sr-only) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }
  .fixture-note { display: flex; align-items: center; justify-content: center; height: 30px; padding: 2px 4px; color: #9db2bb; text-align: center; font-size: 9px; line-height: 12px; letter-spacing: .04em; }
  #game-root { position: fixed; inset: 30px 0 0; overflow: auto; }
  .destination { max-width: 700px; margin: 40px auto; padding: 20px; }
</style>
