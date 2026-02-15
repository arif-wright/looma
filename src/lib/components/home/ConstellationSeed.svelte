<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let id = 'seed';
  export let label = 'Action';
  export let description = '';
  export let icon: 'warmth' | 'spark' | 'companion' | 'ritual' | 'mission' = 'spark';
  export let href = '/app/home';
  export let relevance = 0.5;
  export let x = 50;
  export let y = 50;
  export let exploreMode = false;
  export let visible = false;
  export let companionName: string | null = null;

  const dispatch = createEventDispatcher<{ follow: { id: string; href: string } }>();

  $: brightness = Math.max(0.2, Math.min(1, relevance + (exploreMode ? 0.28 : 0)));
  $: dynamicLabel = id === 'companion' && companionName ? `Visit ${companionName}` : label;
</script>

<button
  type="button"
  class={`seed ${exploreMode ? 'seed--explore' : ''} ${visible ? 'seed--visible' : ''}`}
  style={`left:${x}%; top:${y}%; --seed-bright:${brightness};`}
  on:click={() => dispatch('follow', { id, href })}
  aria-label={`Open ${dynamicLabel}`}
>
  <span class="seed__dot">
    <span class="seed__icon">
      {#if icon === 'warmth'}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.65-7 10-7 10z"/></svg>
      {:else if icon === 'mission'}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.4 8.6-8 9-4.6-.4-8-4-8-9V7l8-4zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>
      {:else if icon === 'companion'}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2-8 4.5V22h16v-2.5C20 17 16.4 15 12 15z"/></svg>
      {:else if icon === 'ritual'}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6 6 .9-4.4 4.3 1 6.1L12 16l-5.6 3.3 1-6.1L3 8.9 9 8l3-6z"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>
      {/if}
    </span>
  </span>

  <span class="seed__meta">
    <span class="seed__label">{dynamicLabel}</span>
    {#if description}
      <span class="seed__desc">{description}</span>
    {/if}
  </span>
</button>

<style>
  .seed {
    position: absolute;
    transform: translate(-50%, -50%) scale(0.94);
    display: inline-flex;
    align-items: center;
    gap: 0.56rem;
    border: none;
    background: transparent;
    padding: 0;
    z-index: 12;
    opacity: 0;
    pointer-events: none;
    transition: opacity 720ms cubic-bezier(0.22, 0.74, 0.25, 1), transform 720ms cubic-bezier(0.22, 0.74, 0.25, 1);
  }

  .seed--visible {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    pointer-events: auto;
  }

  .seed__dot {
    width: 0.86rem;
    height: 0.86rem;
    position: relative;
    border-radius: 999px;
    background: radial-gradient(circle at 35% 35%, rgba(218, 247, 255, 0.9), rgba(109, 209, 255, 0.84) 58%, rgba(109, 209, 255, 0.24));
    box-shadow:
      0 0 18px rgba(114, 216, 255, calc(0.16 + var(--seed-bright) * 0.26)),
      0 0 40px rgba(114, 216, 255, calc(0.08 + var(--seed-bright) * 0.18));
    display: grid;
    place-items: center;
    transition: transform 460ms cubic-bezier(0.22, 0.74, 0.25, 1), opacity 460ms cubic-bezier(0.22, 0.74, 0.25, 1);
  }

  .seed__icon {
    width: 0.62rem;
    height: 0.62rem;
    display: inline-grid;
    place-items: center;
    color: rgba(236, 248, 255, 0.9);
    opacity: 0;
    transition: opacity 460ms cubic-bezier(0.22, 0.74, 0.25, 1);
  }

  .seed__icon svg {
    width: 0.62rem;
    height: 0.62rem;
    fill: currentColor;
  }

  .seed__meta {
    display: grid;
    gap: 0.1rem;
    opacity: 0;
    transform: translateY(0.24rem);
    transition: opacity 460ms cubic-bezier(0.22, 0.74, 0.25, 1), transform 460ms cubic-bezier(0.22, 0.74, 0.25, 1);
    pointer-events: none;
    text-align: left;
  }

  .seed--explore .seed__icon {
    opacity: 0.92;
  }

  .seed--explore .seed__meta {
    opacity: 1;
    transform: translateY(0);
  }

  .seed__label {
    margin: 0;
    font-size: 0.71rem;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    line-height: 1;
    color: rgba(233, 243, 255, 0.94);
  }

  .seed__desc {
    margin: 0;
    font-size: 0.64rem;
    color: rgba(163, 184, 210, 0.82);
    max-width: 9.2rem;
    line-height: 1.25;
  }

  .seed:hover .seed__dot,
  .seed:focus-visible .seed__dot {
    transform: scale(1.12);
  }

  .seed:focus-visible {
    outline: none;
  }
</style>
