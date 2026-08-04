<script lang="ts">
  import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import WorldGameMount from '$lib/game/WorldGameMount.svelte';

  export let data: PageData;
</script>

<svelte:head>
  <title>The Wilds · Memvoya</title>
  <meta
    name="description"
    content="A private preview of The Wilds, Memvoya's authenticated shared world."
  />
</svelte:head>

<section class="world-page" data-testid="world-page">
  <header class="world-header">
    <div>
      <p class="eyebrow">Private preview</p>
      <h1>The Wilds</h1>
      <p class="intro">A shared place to explore with your companion.</p>
    </div>
    <a class="escape-link" href="/app/home">Return Home</a>
  </header>

  {#if data.worldEnabled}
    {#if browser}
      <WorldGameMount serverUrl={data.worldServerUrl} renderer={data.worldRenderer} />
    {:else}
      <div class="world-loading" data-testid="world-loading-state" role="status">
        <p>Preparing The Wilds…</p>
      </div>
    {/if}
    <div class="world-help" data-testid="world-enabled-state">
      <p><strong>Move:</strong> WASD, arrow keys, or the on-screen direction pad.</p>
      {#if data.worldRenderer === 'three'}<p><strong>Camera:</strong> right-drag, wheel, or camera buttons. Press R to reset.</p>{/if}
      <p>Authenticated multiplayer keeps exploration progress and earned rewards safely in sync.</p>
    </div>
  {:else}
    <div class="unavailable" data-testid="world-disabled-state" role="status">
      <p class="unavailable-kicker">The path is quiet for now</p>
      <h2>The Wilds is not available yet.</h2>
      <p>This early world preview is currently closed. Your Memvoya experience is unchanged.</p>
      <a href="/app/home">Continue to Home</a>
    </div>
  {/if}
</section>

<style>
  .world-page {
    width: min(76rem, 100%);
    margin: 0 auto;
    padding: clamp(1rem, 3vw, 2.5rem) 0 2rem;
    color: #f4f1ff;
  }

  .world-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1.5rem;
    margin-bottom: 1rem;
  }

  .eyebrow,
  .unavailable-kicker {
    margin: 0 0 0.35rem;
    color: #a9f3dd;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  h1, h2, p { margin-top: 0; }
  h1 { margin-bottom: 0.4rem; font-size: clamp(2rem, 5vw, 3.5rem); }
  h2 { margin-bottom: 0.7rem; font-size: clamp(1.5rem, 4vw, 2.2rem); }
  .intro, .unavailable p { color: rgba(236, 238, 255, 0.76); }

  .escape-link,
  .unavailable a {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    border: 1px solid rgba(185, 232, 220, 0.32);
    border-radius: 999px;
    padding: 0.65rem 1rem;
    color: #dffff5;
    text-decoration: none;
    white-space: nowrap;
  }

  .escape-link:focus-visible,
  .unavailable a:focus-visible {
    outline: 3px solid #a9f3dd;
    outline-offset: 3px;
  }

  .world-help {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.9rem 0.2rem 0;
    color: rgba(236, 238, 255, 0.76);
    font-size: 0.9rem;
  }

  .world-help p { margin: 0; }

  .unavailable {
    min-height: 24rem;
    display: grid;
    place-content: center;
    justify-items: start;
    padding: clamp(1.5rem, 6vw, 4rem);
    border: 1px solid rgba(185, 232, 220, 0.18);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 70% 20%, rgba(76, 165, 141, 0.16), transparent 18rem),
      rgba(8, 13, 25, 0.72);
  }

  .world-loading {
    min-height: 24rem;
    display: grid;
    place-content: center;
    border: 1px solid rgba(185, 232, 220, 0.18);
    border-radius: 1rem;
    background: rgba(8, 13, 25, 0.72);
    color: rgba(236, 238, 255, 0.76);
  }

  .world-loading p { margin: 0; }

  @media (max-width: 640px) {
    .world-header { align-items: flex-start; flex-direction: column; }
  }
</style>
