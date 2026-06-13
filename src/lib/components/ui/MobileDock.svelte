<script lang="ts">
  import type { IconNavItem } from './types';
  import { page } from '$app/stores';
  import { LAUNCH_PRIMARY_PATHS } from '$lib/launch/navigation';

  export let items: IconNavItem[] = [];

  const pageStore = page;
  const mobileOrder = LAUNCH_PRIMARY_PATHS;

  $: mobileItems = mobileOrder
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is IconNavItem => Boolean(item))
    .map((item) => ({ ...item }));

  const isActive = (href: string) => {
    const path = $pageStore.url.pathname;
    if (href === '/app/home') {
      return path === '/app/home';
    }
    return path.startsWith(href);
  };
</script>

<nav
  class="md:hidden"
  aria-label="Primary navigation"
>
  <div class="mobile-dock-shell">
    <div class="dock-scroll no-scrollbar mx-auto max-w-md overflow-x-auto px-3">
      <div class="mobile-dock-grid">
        {#each mobileItems as item (item.href)}
          <a
            href={item.href}
            class={`group mobile-dock-link ${
              isActive(item.href)
                ? 'is-active'
                : ''
            }`}
            title={item.label}
            aria-current={isActive(item.href) ? 'page' : undefined}
            data-testid={`dock-${item.label.toLowerCase()}`}
          >
            <span class="icon-wrap">
              <svelte:component
                this={item.icon}
                class="h-[20px] w-[20px] text-inherit"
                aria-hidden="true"
              />
              {#if (item.badgeCount ?? 0) > 0}
                <span class="dock-badge" aria-label={`${item.badgeCount} unread`}>
                  {item.badgeCount! > 9 ? '9+' : item.badgeCount}
                </span>
              {/if}
            </span>
            <span class="dock-label">
              {item.label}
            </span>
          </a>
        {/each}
      </div>
    </div>
  </div>
</nav>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }

  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .icon-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .mobile-dock-shell {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 40;
    border: 1px solid rgba(183, 140, 255, 0.18);
    border-bottom: 0;
    border-radius: 1.45rem 1.45rem 0 0;
    background: rgba(5, 6, 19, 0.9);
    padding: 0.65rem 0.45rem max(0.9rem, env(safe-area-inset-bottom));
    box-shadow:
      0 -18px 56px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(24px);
  }

  .mobile-dock-grid {
    display: inline-flex;
    min-width: 100%;
    align-items: center;
    gap: 0.2rem;
  }

  .mobile-dock-link {
    position: relative;
    display: grid;
    width: 5.15rem;
    flex: 0 0 5.15rem;
    min-height: 3.95rem;
    place-items: center;
    align-content: center;
    gap: 0.18rem;
    border-radius: 1rem;
    color: rgba(231, 228, 248, 0.68);
    text-decoration: none;
    transition: color 150ms ease, text-shadow 150ms ease, transform 150ms ease;
  }

  .mobile-dock-link:hover,
  .mobile-dock-link:focus-visible {
    color: rgba(255, 255, 255, 0.92);
    outline: none;
  }

  .mobile-dock-link.is-active {
    color: #d08cff;
    text-shadow: 0 0 18px rgba(192, 92, 255, 0.78);
  }

  .mobile-dock-link.is-active .icon-wrap {
    filter: drop-shadow(0 0 16px rgba(192, 92, 255, 0.72));
  }

  .mobile-dock-link :global(svg) {
    width: clamp(1.32rem, 5.6vw, 1.72rem);
    height: clamp(1.32rem, 5.6vw, 1.72rem);
  }

  .dock-label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    color: currentColor;
    font-size: clamp(0.62rem, 2.8vw, 0.78rem);
    font-weight: 800;
    line-height: 1.1;
    white-space: nowrap;
  }

  .dock-badge {
    position: absolute;
    top: -5px;
    right: -8px;
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
    background: #d97706;
    border: 1px solid rgba(15, 23, 42, 0.8);
  }
</style>
