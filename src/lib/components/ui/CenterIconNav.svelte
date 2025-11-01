<script lang="ts">
  import { page } from '$app/stores';

  export type IconComponent = typeof import('lucide-svelte').Home;

  export type IconNavItem = {
    href: string;
    label: string;
    icon: IconComponent;
  };

  export let items: IconNavItem[] = [];
  export let className = '';

  const pageStore = page;

  const isActive = (href: string) => {
    const path = $pageStore.url.pathname;
    if (href === '/app/home') {
      return path === '/app/home';
    }
    return path.startsWith(href);
  };
</script>

<nav class={`pointer-events-auto ${className}`.trim()} aria-label="Primary navigation">
  <div class="mx-auto flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-2 py-1 backdrop-blur-xl md:gap-5">
    {#each items as item (item.href)}
      <a
        href={item.href}
        class={`group relative flex h-10 w-10 flex-col items-center justify-center gap-1 rounded-full text-[13px] font-medium text-white/70 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-0 motion-reduce:transition-none md:h-11 md:w-11 ${
          isActive(item.href)
            ? 'bg-white/10 text-white shadow-[0_0_0_1px_rgba(77,244,255,0.45),0_10px_24px_rgba(77,244,255,0.22)]'
            : 'hover:bg-white/10 hover:text-white focus-visible:text-white'
        }`}
        title={item.label}
        aria-current={isActive(item.href) ? 'page' : undefined}
        data-testid={`center-nav-${item.label.toLowerCase()}`}
      >
        <svelte:component
          this={item.icon}
          class="h-[18px] w-[18px] text-inherit transition-colors duration-150 ease-out motion-reduce:transition-none"
          aria-hidden="true"
        />
        <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 md:hidden">
          {item.label}
        </span>
      </a>
    {/each}
  </div>
</nav>
