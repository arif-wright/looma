<script lang="ts">
  import { page } from '$app/stores';

  export type IconComponent = typeof import('lucide-svelte').Home;

  export type IconNavItem = {
    href: string;
    label: string;
    icon: IconComponent;
    analyticsKey?: string;
  };

  export let items: IconNavItem[] = [];
  export let className = '';

  const pageStore = page;
  let currentPath = '';

  $: currentPath = $pageStore.url.pathname;

  const isActive = (href: string) => {
    if (href === '/app/home') {
      return currentPath === '/app/home';
    }
    return currentPath.startsWith(href);
  };
</script>

<nav class={`pointer-events-auto ${className}`.trim()} aria-label="Primary navigation">
  <div class="flex w-fit items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-1 backdrop-blur-xl md:gap-4">
    {#each items as item (item.href)}
      {#key item.href}
        <a
          href={item.href}
          class={`brand-icon-button ${isActive(item.href) ? 'active' : ''}`}
          title={item.label}
          aria-label={item.label}
          aria-current={isActive(item.href) ? 'page' : undefined}
          data-testid={`nav-icon-${(item.analyticsKey ?? item.label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          data-ana={`nav:${(item.analyticsKey ?? item.label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        >
          <svelte:component
            this={item.icon}
            class="h-5 w-5 text-inherit transition-colors duration-150 ease-out motion-reduce:transition-none"
            aria-hidden="true"
          />
          <span class="sr-only">{item.label}</span>
        </a>
      {/key}
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
  }

  .brand-icon-button.active {
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
