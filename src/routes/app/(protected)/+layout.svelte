<script lang="ts">
  import { browser } from '$app/environment';
  import { afterNavigate, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import SideRail from '$lib/components/nav/SideRail.svelte';
  import BottomDock from '$lib/components/nav/BottomDock.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';
  import { sendAnalytics } from '$lib/utils/analytics';
  import { logout } from '$lib/auth/logout';
  import StatusCapsuleNav from '$lib/components/ui/StatusCapsule.svelte';
  import { page } from '$app/stores';
  import CenterIconNav, { type IconNavItem } from '$lib/components/ui/CenterIconNav.svelte';
  import MobileDock from '$lib/components/ui/MobileDock.svelte';
import { Search, Home, PawPrint, ListChecks, Package, UserRound, Gamepad2, ShoppingBag } from 'lucide-svelte';
  import { applyHeaderStats, playerProgress } from '$lib/games/state';

  export let data;

  const userEmail = data?.user?.email ?? '';
  const activity = data?.navActivity ?? {};
  let bellNotifications: NotificationItem[] = (data?.notifications ?? []) as NotificationItem[];
  let bellUnread = data?.notificationsUnread ?? 0;
  let previousPath: string | null = null;

  $: bellNotifications = (data?.notifications ?? bellNotifications) as NotificationItem[];
  $: bellUnread = typeof data?.notificationsUnread === 'number' ? data.notificationsUnread : bellUnread;

  $: if (browser) {
    applyHeaderStats(data?.headerStats ?? null);
  }

  function handleCompose() {
    void goto('/app/u/me?compose=1');
  }

  function handleLogout() {
    void logout();
  }

  const pageStore = page;
  let currentPath = '';
  let isHome = false;
  let isGames = false;
  let hideRail = false;

  $: currentPath = $pageStore.url.pathname;
  $: isHome = currentPath === '/app/home';
  $: isGames = currentPath.startsWith('/app/games');
  $: hideRail = isHome || isGames;

  const iconNavItems: IconNavItem[] = [
    { href: '/app/home', label: 'Home', icon: Home },
    { href: '/app/creatures', label: 'Creatures', icon: PawPrint },
    { href: '/app/missions', label: 'Missions', icon: ListChecks },
    { href: '/app/shop', label: 'Shop', icon: ShoppingBag },
    { href: '/app/games', label: 'Games', icon: Gamepad2 },
    { href: '/app/inventory', label: 'Inventory', icon: Package },
    { href: '/app/profile', label: 'Profile', icon: UserRound }
  ];

  if (browser) {
    onMount(() => {
      const month = new Date().getMonth();
      const accent =
        month >= 5 && month <= 8 ? 'amber' : month >= 9 || month <= 1 ? 'neonMagenta' : 'neonCyan';
      document.documentElement.dataset.themeAccent = accent;
      previousPath = window.location.pathname;
    });

    afterNavigate((nav) => {
      const nextUrl = nav.to?.url ?? new URL(window.location.href);
      const nextPath = nextUrl.pathname;
      if (previousPath && previousPath !== nextPath) {
        sendAnalytics('nav_switch', {
          payload: {
            from: previousPath,
            to: nextPath
          }
        });
      }
      previousPath = nextPath;
    });
  }
</script>

<div class={`app-shell ${hideRail ? 'app-shell--home' : ''}`}>
  {#if !hideRail}
    <aside class="app-rail">
      <SideRail activity={activity} />
    </aside>
  {/if}
  <div class="app-surface">
    <header class="app-header">
      <div class="app-header__inner">
        <div class="header-left">
          <span class="logo-dot" aria-hidden="true"></span>
          <div class="search" role="search" aria-label="Search threads">
            <Search class="search-icon" aria-hidden="true" />
            <input type="search" placeholder="Search threads…" aria-label="Search threads" />
          </div>
        </div>
        <CenterIconNav className="hidden md:flex flex-1 justify-center" items={iconNavItems} />
        <StatusCapsuleNav
          className="ml-auto shrink-0"
          energy={$playerProgress.energy}
          energyMax={$playerProgress.energyMax}
          level={$playerProgress.level}
          xp={$playerProgress.xp}
          xpNext={$playerProgress.xpNext}
          unreadCount={bellUnread}
          notifications={bellNotifications}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
      </div>
    </header>

    <main class="app-main">
      <slot />
    </main>
  </div>
</div>

{#if !isHome}
  <BottomDock activity={activity} on:compose={handleCompose} />
{/if}

{#if isHome}
  <MobileDock items={iconNavItems} />
{/if}

<style>
  .app-shell {
    display: grid;
    grid-template-columns: auto 1fr;
    min-height: 100vh;
    background: transparent;
  }

  .app-shell--home {
    grid-template-columns: 1fr;
  }

  .app-rail {
    backdrop-filter: blur(12px);
  }

  .app-surface {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 100vh;
  }

  .app-header {
    position: sticky;
    top: 0;
    z-index: 40;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(6, 11, 23, 0.7);
    backdrop-filter: blur(18px);
  }

  .app-header__inner {
    margin: 0;
    width: 100%;
    padding: 0 clamp(1rem, 3vw, 2.75rem);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: clamp(0.5rem, 1.5vw, 1.25rem);
    height: 3.5rem;
  }

  .header-left {
    display: inline-flex;
    flex: 1 1 0;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .logo-dot {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(77, 244, 255, 0.35), rgba(155, 92, 255, 0.45));
    box-shadow: 0 12px 28px rgba(77, 244, 255, 0.22);
  }

  .search {
    display: none;
    align-items: center;
    gap: 0.45rem;
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    padding: 0 0.65rem;
    height: 2.1rem;
    color: rgba(244, 247, 255, 0.82);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 12px 28px rgba(7, 11, 23, 0.4);
    flex: 1 1 0;
    min-width: 12rem;
    max-width: clamp(12rem, 28vw, 22rem);
  }

  .search:focus-within {
    border-color: rgba(77, 244, 255, 0.4);
    box-shadow: 0 0 0 2px rgba(77, 244, 255, 0.32), 0 12px 28px rgba(7, 11, 23, 0.4);
  }

  .search input {
    border: none;
    background: transparent;
    color: rgba(244, 247, 255, 0.9);
    font-size: 0.84rem;
    width: 100%;
  }

  .search input::placeholder {
    color: rgba(244, 247, 255, 0.38);
  }

  .search input:focus-visible {
    outline: none;
  }

  .search-icon {
    width: 1rem;
    height: 1rem;
    color: rgba(244, 247, 255, 0.45);
    transition: color 0.16s ease;
  }

  .search:focus-within .search-icon {
    color: rgba(244, 247, 255, 0.8);
  }

  .app-main {
    padding: 0;
    overflow-y: auto;
  }

  @media (max-width: 960px) {
    .app-shell {
      grid-template-columns: 1fr;
    }

    .app-header__inner {
      padding: 0 1.25rem;
    }

    .search {
      display: none;
    }

    .app-main {
      padding: 0;
    }
  }

  @media (min-width: 768px) {
    .search {
      display: inline-flex;
    }
  }

  @media (min-width: 1024px) {
    .app-header__inner {
      padding: 0 2.25rem;
    }
  }
</style>
