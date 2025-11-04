<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import type { NavActivity } from './SideRail.svelte';
  import { createEventDispatcher } from 'svelte';

  export let activity: NavActivity = {};

  const dispatch = createEventDispatcher<{ compose: void }>();

  const navItems = [
    { href: '/app/home', label: 'Home', icon: '🏠' },
    { href: '/app/creatures', label: 'Creatures', icon: '🐾' },
    { href: '/app/shop', label: 'Shop', icon: '🛒' },
    { href: '/app/missions', label: 'Missions', icon: '🎯' },
    { href: '/app/u/me', label: 'Profile', icon: '👤' }
  ];

  let hidden = false;
  let lastY = 0;

  function badgeFor(href: string): number {
    const raw = activity[href];
    if (typeof raw === 'number') return raw;
    if (raw) return 1;
    return 0;
  }

  function onCompose() {
    dispatch('compose');
  }

  function handleScroll() {
    if (!browser) return;
    const y = window.scrollY;
    const threshold = 80;
    if (y > lastY + 12 && y > threshold) {
      hidden = true;
    } else if (y < lastY - 12 || y <= threshold) {
      hidden = false;
    }
    lastY = y;
  }

  onMount(() => {
    if (!browser) return;
    lastY = window.scrollY;
    window.addEventListener('scroll', handleScroll, { passive: true });
  });

  onDestroy(() => {
    if (!browser) return;
    window.removeEventListener('scroll', handleScroll);
  });
</script>

{#if browser}
  <nav class={`dock ${hidden ? 'dock--hidden' : ''}`} aria-label="Dock navigation">
    <button type="button" class="dock__compose" on:click={onCompose}>
      <span aria-hidden="true">➕</span>
      <span class="sr-only">Add Post</span>
    </button>

    {#each navItems as item}
      <a
        class={`dock__link ${$page.url.pathname.startsWith(item.href) ? 'active' : ''}`}
        href={item.href}
        aria-current={$page.url.pathname.startsWith(item.href) ? 'page' : undefined}
        data-badge={badgeFor(item.href) > 0 ? badgeFor(item.href) : undefined}
      >
        <span class="icon" aria-hidden="true">{item.icon}</span>
        <span class="label">{item.label}</span>
      </a>
    {/each}
  </nav>
{/if}

<style>
  .dock {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 16px;
    width: min(540px, calc(100vw - 32px));
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    box-shadow: 0 24px 40px rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(12px);
    transition: transform 0.25s ease, opacity 0.25s ease;
    z-index: 100;
  }

  .dock--hidden {
    transform: translate(-50%, 120%);
    opacity: 0;
  }

  .dock__compose {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(135deg, var(--theme-accent, rgba(56, 189, 248, 0.95)), rgba(59, 130, 246, 0.9));
    color: rgba(15, 23, 42, 0.9);
    font-size: 1.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 16px 32px var(--theme-accent-soft, rgba(56, 189, 248, 0.35));
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .dock__compose:hover,
  .dock__compose:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 22px 44px var(--theme-accent-soft, rgba(56, 189, 248, 0.45));
  }

  .dock__link {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-decoration: none;
    color: rgba(226, 232, 240, 0.75);
    font-size: 0.75rem;
    padding: 6px 10px;
    border-radius: 14px;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .dock__link::after {
    content: attr(data-badge);
    display: none;
    position: absolute;
    top: 2px;
    right: 6px;
    min-width: 16px;
    padding: 1px 5px;
    border-radius: 999px;
    background: rgba(251, 191, 36, 0.95);
    color: #0f172a;
    font-size: 0.62rem;
    font-weight: 700;
    text-align: center;
  }

  .dock__link[data-badge]::after {
    display: inline-block;
  }

  .dock__link:hover,
  .dock__link:focus-visible {
    background: var(--theme-accent-soft, rgba(56, 189, 248, 0.15));
    color: rgba(226, 232, 240, 0.95);
  }

  .dock__link.active {
    background: var(--theme-accent-soft, rgba(56, 189, 248, 0.22));
    color: rgba(226, 232, 240, 1);
  }

  .icon {
    font-size: 1.2rem;
  }

  .label {
    font-size: 0.72rem;
    letter-spacing: 0.04em;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (min-width: 961px) {
    .dock {
      display: none;
    }
  }
</style>
