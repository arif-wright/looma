<script lang="ts">
  import type { IconNavItem } from './types';
  import { page } from '$app/stores';

  export let items: IconNavItem[] = [];

  const pageStore = page;

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
  <div
    class="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-900/80 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2.5 backdrop-blur-2xl"
  >
    <div class="dock-scroll no-scrollbar mx-auto max-w-md overflow-x-auto px-3">
      <div class="inline-flex min-w-full items-center gap-1">
        {#each items as item (item.href)}
          <a
            href={item.href}
            class={`group flex w-[88px] shrink-0 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium tracking-[0.08em] text-white/75 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-0 motion-reduce:transition-none ${
              isActive(item.href)
                ? 'bg-white/15 text-white shadow-[0_8px_26px_rgba(77,244,255,0.22)]'
                : 'hover:bg-white/10 hover:text-white focus-visible:text-white'
            }`}
            title={item.label}
            aria-current={isActive(item.href) ? 'page' : undefined}
            data-testid={`dock-${item.label.toLowerCase()}`}
          >
            <svelte:component
              this={item.icon}
              class="h-[20px] w-[20px] text-inherit"
              aria-hidden="true"
            />
            <span class="text-[10px] uppercase tracking-[0.18em] text-white/70">
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
</style>
