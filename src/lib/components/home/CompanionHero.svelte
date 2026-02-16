<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';
  import type { MuseVisualMood } from '$lib/companions/museVisuals';

  export let name = 'Mirae';
  export let species = 'Muse';
  export let avatarUrl: string | null = null;
  export let closenessState: 'Distant' | 'Near' | 'Resonant' = 'Near';

  const dispatch = createEventDispatcher<{ open: Record<string, never> }>();

  $: intensity = closenessState === 'Distant' ? 0.68 : closenessState === 'Resonant' ? 1.06 : 0.9;
  let visualMood: MuseVisualMood = 'calm';
  $: visualMood = closenessState === 'Distant' ? 'low' : closenessState === 'Resonant' ? 'bright' : 'calm';
</script>

<section class="core" aria-label="Companion model" style={`--core-intensity:${intensity};`}>
  <div class="core__halo"></div>
  <div class="core__model-wrap">
    <button class="core__model-button" type="button" on:click={() => dispatch('open', {})} aria-label={`Open ${name} details`}>
      <MuseModel
        class="core__model"
        poster={avatarUrl ?? undefined}
        visualMood={visualMood}
        glowEnabled={true}
        glowScale={intensity}
        motionScale={intensity}
        transparent={true}
        autoplay={true}
        eager={true}
        minSize={0}
      />
    </button>
  </div>
  <h2>{name}</h2>
  <p>{species}</p>
</section>

<style>
  .core {
    position: relative;
    width: min(82vw, 28rem);
    margin: 0 auto;
    text-align: center;
    padding-top: 0.4rem;
  }

  .core__halo {
    position: absolute;
    inset: 8% 10% auto;
    height: clamp(9rem, 26vw, 14rem);
    border-radius: 999px;
    background: radial-gradient(circle, rgba(255, 203, 148, calc(0.34 * var(--core-intensity))), rgba(255, 203, 148, 0) 72%);
    filter: blur(28px);
    pointer-events: none;
    animation: haloBreath 10s ease-in-out infinite;
  }

  .core__model-wrap {
    position: relative;
    width: clamp(12rem, 46vw, 20rem);
    aspect-ratio: 1 / 1;
    margin: 0 auto;
    filter: drop-shadow(0 20px 42px rgba(18, 14, 45, 0.42));
    animation: modelFloat 9.2s ease-in-out infinite;
  }

  .core__model-button {
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }

  .core__model-button:focus-visible {
    outline: 2px solid rgba(231, 238, 252, 0.8);
    outline-offset: 6px;
    border-radius: 1.4rem;
  }

  .core :global(.core__model.muse-shell) {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border: none;
    border-radius: 1.6rem;
    background: radial-gradient(circle at 50% 42%, rgba(245, 234, 209, 0.16), rgba(28, 28, 58, 0.05) 66%, rgba(11, 12, 24, 0));
  }

  .core :global(.core__model .muse-aura) {
    opacity: calc(0.84 * var(--core-intensity));
  }

  .core :global(.core__model .muse-viewer) {
    border-radius: 1.6rem;
  }

  h2 {
    margin: 0.4rem 0 0;
    font-family: var(--home-font-display, 'Sora', 'Avenir Next', 'Segoe UI', sans-serif);
    font-size: clamp(2rem, 6.4vw, 3.25rem);
    line-height: 1;
    letter-spacing: -0.02em;
    color: rgba(248, 243, 232, 0.96);
    text-shadow: 0 8px 28px rgba(39, 31, 79, 0.36);
  }

  p {
    margin: 0.2rem 0 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.11em;
    color: rgba(221, 230, 244, 0.78);
  }

  @keyframes modelFloat {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-6px) scale(1.015); }
  }

  @keyframes haloBreath {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.08); opacity: 1; }
  }
</style>
