<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import type { IconNavItem } from './types';

  export let items: IconNavItem[] = [];
  export let className = '';

  $: pathFromStore = $page.url.pathname;
  let pathBump = 0;
  afterNavigate(() => {
    pathBump += 1;
  });

  $: currentPath = (() => {
    pathBump; // ensure dependency on SPA transitions
    return pathFromStore;
  })();

  const norm = (p: string) => {
    const compact = (p || '/').replace(/\/+/g, '/');
    const trimmed = compact.replace(/\/+$/, '');
    return trimmed.length ? trimmed : '/';
  };

  const isActive = (href: string, path: string) => {
    const h = norm(href);
    const c = norm(path);
    if (h === '/app/home') return c === '/app/home';
    return c === h || c.startsWith(`${h}/`);
  };
</script>

<nav class={`pointer-events-auto ${className}`.trim()} aria-label="Primary navigation">
  <div class="flex w-fit items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-1 backdrop-blur-xl md:gap-4">
    {#each items as item (item.href)}
      <a
        href={item.href}
        class={`brand-icon-button ${isActive(item.href, currentPath) ? 'active' : ''}`}
        title={item.label}
        aria-label={item.label}
        aria-current={isActive(item.href, currentPath) ? 'page' : undefined}
        data-active={isActive(item.href, currentPath) ? 'true' : 'false'}
        data-testid={`nav-icon-${(item.analyticsKey ?? item.label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        data-ana={`nav:${(item.analyticsKey ?? item.label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        data-sveltekit-prefetch
      >
        <svelte:component
          this={item.icon}
          class="h-5 w-5 text-inherit transition-colors duration-150 ease-out motion-reduce:transition-none"
          aria-hidden="true"
        />
        {#if (item.badgeCount ?? 0) > 0}
          <span class="nav-badge" aria-label={`${item.badgeCount} unread`}>
            {item.badgeCount! > 9 ? '9+' : item.badgeCount}
          </span>
        {/if}
        <span class="sr-only">{item.label}</span>
      </a>
    {/each}
  </div>
</nav>

<style>
  nav {
    --nav-pill-bg: rgba(8, 12, 28, 0.45);
    --nav-pill-border: rgba(255, 255, 255, 0.1);
  }

  .brand-icon-button {
    font-size: 0;
    border-radius: 16px;
    position: relative;
  }

  .nav-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    border-radius: 999px;
    padding: 0 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    line-height: 1;
    color: #fff;
    background: #ef4444;
    border: 1px solid rgba(15, 23, 42, 0.8);
  }

  .brand-icon-button.active,
  .brand-icon-button.active:hover,
  .brand-icon-button.active:focus-visible {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
    box-shadow: 0 0 0 1px rgba(94, 242, 255, 0.45), 0 12px 26px rgba(94, 242, 255, 0.25);
  }

  nav > div {
    border-radius: 999px;
    border: 1px solid var(--nav-pill-border);
    background: var(--nav-pill-bg);
    padding: 0.4rem;
    box-shadow: 0 24px 38px rgba(4, 5, 18, 0.4);
    backdrop-filter: blur(16px);
  }

  @media (prefers-reduced-motion: reduce) {
    nav > div,
    .brand-icon-button {
      transition: none;
    }
  }

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
</style>
