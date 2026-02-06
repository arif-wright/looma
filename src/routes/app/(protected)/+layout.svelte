<script lang="ts">
  import { browser } from '$app/environment';
  import { afterNavigate } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';
  import { sendAnalytics } from '$lib/utils/analytics';
  import { logout } from '$lib/auth/logout';
  import { page } from '$app/stores';
  import MobileDock from '$lib/components/ui/MobileDock.svelte';
  import { Gamepad2, ShoppingBag, MessageCircle, Trophy, UserRound, PawPrint } from 'lucide-svelte';
  import { applyHeaderStats, playerProgress } from '$lib/games/state';
  import { FLAGS } from '$lib/config/flags';
  import BrandHeader from '$lib/components/layout/BrandHeader.svelte';
  import LeanHeader from '$lib/components/layout/LeanHeader.svelte';
  import type { IconNavItem } from '$lib/components/ui/CenterIconNav.svelte';
  import CompanionDock from '$lib/components/companion/CompanionDock.svelte';
  import { sendEvent } from '$lib/client/events/sendEvent';

  export let data;

  const userEmail = data?.user?.email ?? '';
  let bellNotifications: NotificationItem[] = (data?.notifications ?? []) as NotificationItem[];
  let bellUnread = data?.notificationsUnread ?? 0;
  let previousPath: string | null = null;
  const initialWalletBalance =
    typeof data?.wallet?.shards === 'number' ? (data.wallet.shards as number) : null;

  $: bellNotifications = (data?.notifications ?? bellNotifications) as NotificationItem[];
  $: bellUnread = typeof data?.notificationsUnread === 'number' ? data.notificationsUnread : bellUnread;

  $: if (browser) {
    applyHeaderStats(data?.headerStats ?? null);
  }

  function handleLogout() {
    void logout();
  }

  const pageStore = page;
  let currentPath = '';
  let isHome = false;
  let isGames = false;
  let isShop = false;
  let isProfileSurface = false;
  let walletBalance: number | null = null;
  let walletCurrency = 'SHARDS';

  $: currentPath = $pageStore.url.pathname;
  $: isHome = currentPath === '/app/home';
  $: isGames = currentPath.startsWith('/app/games');
  $: isShop = currentPath.startsWith('/app/shop');
  $: isProfileSurface =
    currentPath.startsWith('/app/profile') || currentPath === '/app/u' || currentPath.startsWith('/app/u/');
  $: walletBalance =
    typeof $playerProgress?.currency === 'number' && Number.isFinite($playerProgress.currency)
      ? ($playerProgress.currency as number)
      : initialWalletBalance;
  $: walletCurrency = 'SHARDS';

  const iconNavItems: IconNavItem[] = [
    { href: '/app/games', label: 'Games', icon: Gamepad2, analyticsKey: 'games' },
    { href: '/app/shop', label: 'Shop', icon: ShoppingBag, analyticsKey: 'shop' },
    { href: '/app/companions', label: 'Companions', icon: PawPrint, analyticsKey: 'companions' },
    { href: '/app/home', label: 'Feed', icon: MessageCircle, analyticsKey: 'feed' },
    { href: '/app/dashboard', label: 'Achievements', icon: Trophy, analyticsKey: 'achievements' },
    { href: '/app/profile', label: 'Profile', icon: UserRound, analyticsKey: 'profile' }
  ];

  if (browser) {
    onMount(async () => {
      const month = new Date().getMonth();
      const accent =
        month >= 5 && month <= 8 ? 'amber' : month >= 9 || month <= 1 ? 'neonMagenta' : 'neonCyan';
      document.documentElement.dataset.themeAccent = accent;
      previousPath = window.location.pathname;

      const today = new Date().toISOString().slice(0, 10);
      const stored = window.localStorage.getItem('looma_session_start_day');
      if (stored !== today) {
        window.localStorage.setItem('looma_session_start_day', today);
        const response = await sendEvent('session.start', { path: window.location.pathname });
        const reaction = response?.output?.reaction ?? null;
        if (reaction) {
          const { pushCompanionReaction } = await import('$lib/stores/companionReactions');
          pushCompanionReaction(reaction);
        }
      }
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

<div class="app-shell">
  <div class="app-surface">
    {#if FLAGS.NEW_BRAND_HEADER}
      <BrandHeader
        iconNavItems={iconNavItems}
        energy={$playerProgress.energy}
        energyMax={$playerProgress.energyMax}
        level={$playerProgress.level}
        xp={$playerProgress.xp}
        xpNext={$playerProgress.xpNext}
        walletBalance={walletBalance}
        walletCurrency={walletCurrency}
        notifications={bellNotifications}
        unreadCount={bellUnread}
        userEmail={userEmail}
        activeCompanion={data?.activeCompanion ?? null}
        onLogout={handleLogout}
      />
    {:else}
      <LeanHeader
        energy={$playerProgress.energy}
        energyMax={$playerProgress.energyMax}
        level={$playerProgress.level}
        xp={$playerProgress.xp}
        xpNext={$playerProgress.xpNext}
        walletBalance={walletBalance}
        walletCurrency={walletCurrency}
        notifications={bellNotifications}
        unreadCount={bellUnread}
        userEmail={userEmail}
        onLogout={handleLogout}
        iconNavItems={iconNavItems}
        profile={data?.profile ?? null}
        activeCompanion={data?.activeCompanion ?? null}
      />
    {/if}

    <main class="app-main">
      <slot />
    </main>
  </div>
</div>

<MobileDock items={iconNavItems} />
<CompanionDock />

<style>
  .app-shell {
    min-height: 100vh;
    min-height: 100vh;
    background: var(--brand-navy, #050712);
  }

  .app-surface {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 100vh;
    background: radial-gradient(circle at top, rgba(155, 92, 255, 0.15), transparent 55%),
      radial-gradient(circle at bottom, rgba(94, 242, 255, 0.08), transparent 45%),
      var(--brand-navy, #050712);
  }

  .app-main {
    padding: 0;
    overflow-y: auto;
  }

  @media (max-width: 960px) {
    .app-surface {
      grid-template-rows: auto 1fr;
    }
  }

  :global(body.looma-game-fullscreen) .app-surface {
    grid-template-rows: 0 1fr;
  }

  :global(body.looma-game-fullscreen) .app-surface > :first-child {
    display: none;
  }

  :global(body.looma-game-fullscreen) .app-main {
    padding: 0;
  }

  :global(body.looma-game-fullscreen) nav[aria-label='Primary navigation'] {
    display: none !important;
  }
</style>
