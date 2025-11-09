<script lang="ts">
  import { page } from '$app/stores';
  import { derived } from 'svelte/store';

  export type NavActivity = Record<string, number | boolean | undefined>;

export let activity: NavActivity = {};
export let isAdmin = false;

  const navItems = [
    { href: '/app/home', label: 'Home', icon: '🏠' },
    { href: '/app/creatures', label: 'Creatures', icon: '🐾' },
    { href: '/app/missions', label: 'Missions', icon: '🎯' },
  { href: '/app/shop', label: 'Shop', icon: '🛒' },
  { href: '/app/inventory', label: 'Inventory', icon: '💾' },
    { href: '/app/u/me', label: 'Profile', icon: '👤' }
  ];

  const currentPath = derived(page, ($page) => $page.url.pathname);

  const isActive = (target: string, path: string) => {
    if (target === '/app/home' && path === '/app') return true;
    return path === target || path.startsWith(`${target}/`);
  };

  const badgeFor = (href: string): number => {
    const raw = activity[href];
    if (typeof raw === 'number') return raw;
    if (raw) return 1;
    return 0;
  };
</script>

<nav class="side-rail" aria-label="Main navigation">
  {#if $currentPath}
    {#each navItems as item}
      <a
        href={item.disabled ? undefined : item.href}
        class={`nav-link ${isActive(item.href, $currentPath) ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
        aria-current={isActive(item.href, $currentPath) ? 'page' : undefined}
        aria-disabled={item.disabled ? 'true' : undefined}
        data-badge={badgeFor(item.href) > 0 ? badgeFor(item.href) : undefined}
        tabindex={item.disabled ? -1 : undefined}
      >
        <span class="icon" aria-hidden="true">{item.icon}</span>
        <span class="label">{item.label}</span>
      </a>
    {/each}
    {#if isAdmin}
      <a href="/app/admin" class={`nav-link ${isActive('/app/admin', $currentPath) ? 'active' : ''}`}>
        <span class="icon" aria-hidden="true">🛡️</span>
        <span class="label">Admin</span>
      </a>
    {/if}
  {/if}
</nav>

<style>
  .side-rail {
    display: grid;
    gap: 12px;
    padding: 20px 12px;
    border-right: 1px solid rgba(148, 163, 184, 0.14);
    min-width: 200px;
  }

  .nav-link {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 16px;
    text-decoration: none;
    color: rgba(226, 232, 240, 0.75);
    font-weight: 500;
    transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
  }

  .nav-link::after {
    content: attr(data-badge);
    display: none;
    position: absolute;
    top: 8px;
    right: 12px;
    min-width: 18px;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(251, 191, 36, 0.95);
    color: #0f172a;
    font-size: 0.65rem;
    text-align: center;
    font-weight: 700;
  }

  .nav-link[data-badge]::after {
    display: inline-block;
  }

  .nav-link:hover,
  .nav-link:focus-visible {
    background: rgba(148, 163, 184, 0.1);
    color: rgba(226, 232, 240, 0.95);
    transform: translateX(2px);
  }

  .nav-link.active {
    background: linear-gradient(135deg, var(--theme-accent-soft), rgba(255, 255, 255, 0.05));
    color: rgba(226, 232, 240, 1);
    border: 1px solid var(--theme-accent-ring, rgba(56, 189, 248, 0.35));
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 8px 20px var(--theme-accent-soft, rgba(56, 189, 248, 0.18));
  }

  .nav-link.active::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 12px;
    bottom: 12px;
    width: 4px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(56, 189, 248, 0.58), rgba(45, 212, 191, 0.48));
  }

  .nav-link.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .icon {
    font-size: 1.1rem;
  }

  .label {
    font-size: 0.92rem;
    letter-spacing: 0.02em;
  }

  @media (max-width: 960px) {
    .side-rail {
      display: none;
    }
  }
</style>
