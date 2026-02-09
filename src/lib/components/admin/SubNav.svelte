<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { derived } from 'svelte/store';
  import type { NavItem } from './types';

  export let items: NavItem[] = [];

  const pathname = derived(page, ($page) => $page.url.pathname);
  let selectedHref = '';

  $: if ($pathname) {
    const resolved = items.find((item) => !item.hidden && isActive($pathname, item.href));
    selectedHref = resolved?.href ?? items.find((item) => !item.hidden)?.href ?? '';
  }

  const isActive = (current: string, target: string) => {
    if (current === target) return true;
    if (target !== '/' && current.startsWith(`${target}/`)) return true;
    return false;
  };

  const handleSelect = (event: Event) => {
    const select = event.currentTarget as HTMLSelectElement;
    const next = select.value;
    if (next) {
      void goto(next);
    }
  };
</script>

<nav class="admin-subnav" aria-label="Admin sections">
  {#if $pathname}
    <div class="subnav-mobile">
      <label class="sr-only" for="admin-section-select">Choose section</label>
      <select id="admin-section-select" bind:value={selectedHref} on:change={handleSelect}>
        {#each items.filter((item) => !item.hidden) as item}
          <option value={item.href}>{item.label}</option>
        {/each}
      </select>
    </div>

    <ul class="subnav-desktop">
      {#each items.filter((item) => !item.hidden) as item}
        <li>
          <a href={item.href} class:is-active={isActive($pathname, item.href)}>{item.label}</a>
        </li>
      {/each}
    </ul>
  {/if}
</nav>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .admin-subnav {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .subnav-mobile {
    display: none;
  }

  select {
    width: 100%;
    border-radius: 1rem;
    padding: 0.65rem 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(10, 15, 28, 0.72);
    color: inherit;
  }

  .subnav-desktop {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .subnav-desktop a {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.7rem 0.9rem;
    border-radius: 0.9rem;
    text-decoration: none;
    color: rgba(255, 255, 255, 0.72);
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.02);
  }

  .subnav-desktop a:is(:hover, :focus-visible) {
    border-color: rgba(56, 189, 248, 0.4);
    color: #fff;
  }

  .subnav-desktop a.is-active {
    border-color: rgba(56, 189, 248, 0.5);
    color: #fff;
    background: rgba(56, 189, 248, 0.08);
  }

  @media (max-width: 1023px) {
    .subnav-desktop {
      display: none;
    }
    .subnav-mobile {
      display: block;
    }
  }
</style>
