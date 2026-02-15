<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { QuickNavItem } from '$lib/components/home/quickNavTypes';

  export let items: QuickNavItem[] = [];

  const dispatch = createEventDispatcher<{ navigate: { id: QuickNavItem['id']; href: string } }>();
</script>

<nav class="quick-nav" aria-label="Home quick navigation">
  {#each items as item}
    <button type="button" class="quick-nav__item" on:click={() => dispatch('navigate', { id: item.id, href: item.href })}>
      <span class="quick-nav__icon" aria-hidden="true">
        {#if item.id === 'circles'}
          <svg viewBox="0 0 24 24"><path d="M7.5 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm9 2a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c0-2.8 2.6-5 5.8-5 3.1 0 5.7 2.2 5.7 5v1H3v-1zm12.2 1v-1c0-1 .3-2 .9-2.8 2.2.2 3.9 1.7 3.9 3.8v.1h-4.8z"/></svg>
        {:else if item.id === 'messages'}
          <svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2zm3 4v2h10V8H7zm0 4v2h7v-2H7z"/></svg>
        {:else if item.id === 'games'}
          <svg viewBox="0 0 24 24"><path d="M8 7h8a6 6 0 0 1 6 6v2a3 3 0 0 1-5.1 2.1l-2-2h-5.8l-2 2A3 3 0 0 1 2 15v-2a6 6 0 0 1 6-6zm-1 4v2h2v2h2v-2h2v-2h-2V9H9v2H7zm9 1a1.4 1.4 0 1 0 0 .01zm3 2a1.4 1.4 0 1 0 0 .01z"/></svg>
        {:else}
          <svg viewBox="0 0 24 24"><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.1-8 4.6V22h16v-2.4c0-2.5-3.6-4.6-8-4.6z"/></svg>
        {/if}
      </span>
      <span>{item.label}</span>
    </button>
  {/each}
</nav>

<style>
  .quick-nav {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .quick-nav__item {
    min-height: 4.1rem;
    border: 1px solid rgba(158, 185, 218, 0.24);
    border-radius: 0.9rem;
    background: rgba(9, 15, 34, 0.56);
    color: rgba(226, 239, 255, 0.95);
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.4rem;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    backdrop-filter: blur(4px);
  }

  .quick-nav__icon {
    width: 1.14rem;
    height: 1.14rem;
    display: inline-grid;
    place-items: center;
    color: rgba(215, 233, 255, 0.95);
  }

  .quick-nav__icon svg {
    width: 1.14rem;
    height: 1.14rem;
    fill: currentColor;
  }
</style>
