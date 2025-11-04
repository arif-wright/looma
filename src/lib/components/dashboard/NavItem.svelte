<script lang="ts">
  import type { SvelteComponent } from 'svelte';
  import { createEventDispatcher } from 'svelte';

  export let icon: typeof SvelteComponent | null = null;
  export let label = '';
  export let description: string | null = null;
  export let href = '#';
  export let active = false;

  const dispatch = createEventDispatcher<{ navigate: { href: string } }>();

  const handleClick = (event: MouseEvent) => {
    if (!href) return;
    dispatch('navigate', { href });
    if (href.startsWith('#')) {
      event.preventDefault();
      const target = document.querySelector(href) as HTMLElement | null;
      const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
      target?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    }
  };
</script>

<button
  type="button"
  class="nav-item"
  data-active={active}
  on:click={handleClick}
  aria-pressed={active}
>
  {#if icon}
    <svelte:component this={icon} class="nav-item__icon" stroke-width={1.6} aria-hidden="true" />
  {/if}
  <span class="nav-item__copy">
    <span class="nav-item__label">{label}</span>
    {#if description}
      <span class="nav-item__description">{description}</span>
    {/if}
  </span>
</button>

<style>
  .nav-item {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0.85rem;
    width: 100%;
    padding: 0.85rem 1rem;
    border-radius: 1.15rem;
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(240, 249, 255, 0.82);
    text-align: left;
    cursor: pointer;
    transition: all 180ms ease;
  }

  .nav-item:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.6);
  }

  .nav-item:hover,
  .nav-item[data-active="true"] {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(147, 197, 253, 0.18);
    color: rgba(255, 255, 255, 0.95);
  }

  .nav-item__icon {
    width: 1.2rem;
    height: 1.2rem;
    color: currentColor;
  }

  .nav-item__copy {
    display: grid;
    gap: 0.15rem;
  }

  .nav-item__label {
    font-size: 0.95rem;
    font-weight: 600;
  }

  .nav-item__description {
    font-size: 0.78rem;
    color: rgba(226, 232, 240, 0.65);
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-item {
      transition: none;
    }
  }
</style>
