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
  export let companionName: string | null = null;

  const dispatch = createEventDispatcher<{ follow: { id: string; href: string } }>();

  $: brightness = Math.max(0.24, Math.min(1, relevance + (exploreMode ? 0.35 : 0)));
  $: revealLabels = exploreMode || brightness > 0.72;
  $: dynamicLabel = id === 'companion' && companionName ? `Visit ${companionName}` : label;

  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holdProgress = 0;
  let holdInterval: ReturnType<typeof setInterval> | null = null;
  let showHint = false;
  let activatedFromHold = false;

  const clearHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    if (holdInterval) clearInterval(holdInterval);
    holdTimer = null;
    holdInterval = null;
    holdProgress = 0;
    activatedFromHold = false;
  };

  const activate = () => {
    if (activatedFromHold) {
      clearHold();
      return;
    }
    clearHold();
    dispatch('follow', { id, href });
  };

  const startHold = () => {
    showHint = true;
    const startedAt = Date.now();
    holdInterval = setInterval(() => {
      holdProgress = Math.min(1, (Date.now() - startedAt) / 620);
    }, 16);
    holdTimer = setTimeout(() => {
      activatedFromHold = true;
      activate();
    }, 620);
  };
</script>

<button
  type="button"
  class="seed"
  style={`left:${x}%; top:${y}%; --seed-bright:${brightness};`}
  on:pointerdown={startHold}
  on:pointerup={clearHold}
  on:pointerleave={clearHold}
  on:click={activate}
  aria-label={`Open ${label}`}
>
  <span class="seed__dot">
    {#if holdProgress > 0}
      <span class="seed__progress" style={`--p:${holdProgress};`}></span>
    {/if}
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
  <span class="seed__meta {revealLabels ? 'seed__meta--on' : ''}">
    <span class="seed__label">{dynamicLabel}</span>
    {#if description}
      <span class="seed__desc">{description}</span>
    {/if}
  </span>
  {#if showHint && holdProgress < 1}
    <span class="seed__hint">Pull to activate</span>
  {/if}
</button>

<style>
  .seed {
    position: absolute;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
    border: none;
    background: transparent;
    padding: 0;
    color: rgba(226, 232, 240, calc(0.58 + var(--seed-bright) * 0.3));
    z-index: 4;
    transition: transform 140ms ease;
  }

  .seed__dot {
    width: 0.74rem;
    height: 0.74rem;
    position: relative;
    border-radius: 999px;
    background: rgba(125, 211, 252, calc(0.16 + var(--seed-bright) * 0.8));
    box-shadow: 0 0 14px rgba(56, 189, 248, calc(0.18 + var(--seed-bright) * 0.42));
    display: grid;
    place-items: center;
  }

  .seed__icon {
    width: 0.68rem;
    height: 0.68rem;
    display: inline-grid;
    place-items: center;
    color: rgba(224, 242, 254, 0.92);
  }

  .seed__icon svg {
    width: 0.68rem;
    height: 0.68rem;
    fill: currentColor;
  }

  .seed__progress {
    position: absolute;
    inset: -0.2rem;
    border-radius: 999px;
    border: 2px solid rgba(45, 212, 191, 0.75);
    opacity: calc(var(--p));
  }

  .seed__meta {
    display: grid;
    gap: 0.06rem;
    opacity: 0;
    transform: translateY(1px);
    transition: opacity 180ms ease, transform 180ms ease;
  }

  .seed__meta--on {
    opacity: 1;
    transform: translateY(0);
  }

  .seed__label {
    font-size: 0.72rem;
    text-align: left;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    line-height: 1;
  }

  .seed__desc {
    font-size: 0.64rem;
    color: rgba(148, 163, 184, 0.92);
  }

  .seed:hover,
  .seed:focus-visible {
    transform: translate(-50%, -50%) scale(1.04);
    outline: none;
  }

  .seed__hint {
    position: absolute;
    top: 1.2rem;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.62rem;
    color: rgba(186, 230, 253, 0.9);
    white-space: nowrap;
    opacity: 0.9;
  }
</style>
