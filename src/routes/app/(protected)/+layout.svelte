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
  import { Search, Gamepad2, ShoppingBag, MessageCircle, Trophy, UserRound } from 'lucide-svelte';
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
  let walletBalance: number | null = null;

  $: currentPath = $pageStore.url.pathname;
  $: isHome = currentPath === '/app/home';
  $: isGames = currentPath.startsWith('/app/games');
  $: hideRail = isHome || isGames;
  $: walletBalance =
    typeof $playerProgress?.currency === 'number' ? ($playerProgress.currency as number) : null;

  const iconNavItems: IconNavItem[] = [
    { href: '/app/games', label: 'Games', icon: Gamepad2, analyticsKey: 'games' },
    { href: '/app/shop', label: 'Shop', icon: ShoppingBag, analyticsKey: 'shop' },
    { href: '/app/home', label: 'Feed', icon: MessageCircle, analyticsKey: 'feed' },
    { href: '/app/dashboard', label: 'Achievements', icon: Trophy, analyticsKey: 'achievements' },
    { href: '/app/profile', label: 'Profile', icon: UserRound, analyticsKey: 'profile' }
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
          <div class="logo-lockup" role="img" aria-label="Looma sigil">
            <span class="logo-dot" aria-hidden="true"></span>
            <span class="logo-text">Looma</span>
          </div>
          <label class="search-omnibox panel-glass" role="search" aria-label="Search Kinforge">
            <Search class="search-icon" aria-hidden="true" />
            <input type="search" placeholder="Search Kinforge…" aria-label="Search Kinforge" />
          </label>
        </div>
        <CenterIconNav className="header-nav hidden md:flex" items={iconNavItems} />
        <div class="header-right">
          <StatusCapsuleNav
            className="ml-auto shrink-0"
            energy={$playerProgress.energy}
            energyMax={$playerProgress.energyMax}
            level={$playerProgress.level}
            xp={$playerProgress.xp}
            xpNext={$playerProgress.xpNext}
            walletBalance={walletBalance}
            walletCurrency="SHARDS"
            unreadCount={bellUnread}
            notifications={bellNotifications}
            userEmail={userEmail}
            onLogout={handleLogout}
          />
        </div>
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
    background: var(--brand-navy, #050712);
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
    background: radial-gradient(circle at top, rgba(155, 92, 255, 0.15), transparent 55%),
      radial-gradient(circle at bottom, rgba(94, 242, 255, 0.08), transparent 45%),
      var(--brand-navy, #050712);
  }

  .app-header {
    position: sticky;
    top: 0;
    z-index: 40;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(18px);
    background: transparent;
  }

  .app-header::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(8, 12, 24, 0.85), rgba(24, 7, 33, 0.78));
    opacity: 0.94;
    z-index: -1;
  }

  .app-header__inner {
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    padding: 0 clamp(1.25rem, 3vw, 3rem);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    min-height: 3.5rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
    flex: 1 1 auto;
  }

  .logo-lockup {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.65rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    box-shadow: 0 10px 26px rgba(5, 7, 18, 0.6);
  }

  .logo-dot {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 30%, rgba(94, 242, 255, 0.9), rgba(155, 92, 255, 0.5));
    box-shadow: 0 0 24px rgba(94, 242, 255, 0.6);
  }

  .logo-text {
    font-size: 0.8rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.8);
  }

  .search-omnibox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 20px;
    padding: 0 0.85rem;
    height: 2.35rem;
    width: clamp(12rem, 30vw, 22rem);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(8, 12, 28, 0.55);
    color: rgba(244, 247, 255, 0.85);
  }

  .search-omnibox input {
    flex: 1;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 0.88rem;
  }

  .search-omnibox input::placeholder {
    color: rgba(244, 247, 255, 0.45);
  }

  .search-omnibox input:focus-visible {
    outline: none;
  }

  .search-omnibox:focus-within {
    border-color: rgba(94, 242, 255, 0.5);
    box-shadow: 0 0 0 1px rgba(94, 242, 255, 0.35), 0 12px 28px rgba(5, 7, 18, 0.45);
  }

  .search-icon {
    width: 1rem;
    height: 1rem;
    color: rgba(244, 247, 255, 0.5);
  }

  .header-nav {
    flex: 0 0 auto;
    justify-content: center;
  }

  .header-right {
    display: flex;
    justify-content: flex-end;
    flex: 1 1 auto;
    min-width: 0;
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
      gap: 0.75rem;
    }

    .search-omnibox {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .logo-dot,
    .search-omnibox,
    .logo-lockup {
      transition: none;
    }
  }
</style>
