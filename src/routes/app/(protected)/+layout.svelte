<script lang="ts">
  import { browser } from '$app/environment';
  import { afterNavigate } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
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
  import { companionPrefs, hydrateCompanionPrefs } from '$lib/stores/companionPrefs';

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
  let hideCompanionDock = false;
  let walletBalance: number | null = null;
  let walletCurrency = 'SHARDS';

  $: currentPath = $pageStore.url.pathname;
  $: isHome = currentPath === '/app/home';
  $: isGames = currentPath.startsWith('/app/games');
  $: isShop = currentPath.startsWith('/app/shop');
  $: isProfileSurface =
    currentPath.startsWith('/app/profile') || currentPath === '/app/u' || currentPath.startsWith('/app/u/');
  $: hideCompanionDock = currentPath.startsWith('/app/companions');
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

  const SESSION_START_DAY_KEY = 'looma_session_start_day';
  const SESSION_DAY_KEY = 'looma_session_day';
  const SESSION_ID_KEY = 'looma_session_id';
  const SESSION_STARTED_AT_KEY = 'looma_session_started_at';
  const SESSION_END_SENT_FOR_KEY = 'looma_session_end_sent_for';
  const SESSION_GAMES_PLAYED_KEY = 'looma_session_games_played';
  const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;

  let sessionId: string | null = null;
  let sessionStartedAt = 0;
  let sessionEndSent = false;
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  let visitedPaths = new Set<string>();

  const dayKey = () => new Date().toISOString().slice(0, 10);

  const getGamesPlayedCount = () => {
    if (!browser) return 0;
    const raw = window.sessionStorage.getItem(SESSION_GAMES_PLAYED_KEY);
    const parsed = Number(raw ?? '0');
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  };

  const ensureSessionState = () => {
    if (!browser) return;
    const now = Date.now();
    const today = dayKey();
    const storedDay = window.localStorage.getItem(SESSION_DAY_KEY);
    const storedId = window.localStorage.getItem(SESSION_ID_KEY);
    const startedRaw = Number(window.localStorage.getItem(SESSION_STARTED_AT_KEY) ?? '0');
    const endedFor = window.localStorage.getItem(SESSION_END_SENT_FOR_KEY);

    const shouldCreateNew =
      !storedId || storedDay !== today || endedFor === storedId || !Number.isFinite(startedRaw) || startedRaw <= 0;

    if (shouldCreateNew) {
      sessionId = crypto.randomUUID();
      sessionStartedAt = now;
      sessionEndSent = false;
      window.localStorage.setItem(SESSION_DAY_KEY, today);
      window.localStorage.setItem(SESSION_ID_KEY, sessionId);
      window.localStorage.setItem(SESSION_STARTED_AT_KEY, String(sessionStartedAt));
      window.localStorage.removeItem(SESSION_END_SENT_FOR_KEY);
      window.sessionStorage.setItem(SESSION_GAMES_PLAYED_KEY, '0');
      return;
    }

    sessionId = storedId;
    sessionStartedAt = startedRaw;
    sessionEndSent = endedFor === storedId;
  };

  const sessionSummary = (reason: string) => {
    const now = Date.now();
    const durationMs = sessionStartedAt > 0 ? Math.max(0, now - sessionStartedAt) : 0;
    return {
      reason,
      durationMs,
      pagesVisitedCount: visitedPaths.size,
      gamesPlayedCount: getGamesPlayedCount(),
      lastSeenISO: new Date(now).toISOString()
    };
  };

  const markSessionEnded = () => {
    if (!browser || !sessionId) return;
    sessionEndSent = true;
    window.localStorage.setItem(SESSION_END_SENT_FOR_KEY, sessionId);
  };

  const postSessionEnd = async (reason: string, preferBeacon = false) => {
    if (!browser || !sessionId || sessionEndSent) return;
    const payload = sessionSummary(reason);
    const ts = new Date().toISOString();

    if (preferBeacon && typeof navigator.sendBeacon === 'function') {
      const body = JSON.stringify({
        type: 'session.end',
        payload,
        meta: { sessionId, ts }
      });
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/events/ingest', blob)) {
        markSessionEnded();
        return;
      }
    }

    await sendEvent('session.end', payload, { sessionId, ts });
    markSessionEnded();
  };

  const resetInactivityTimer = () => {
    if (!browser || sessionEndSent) return;
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
    inactivityTimer = setTimeout(() => {
      void postSessionEnd('idle_timeout');
    }, INACTIVITY_TIMEOUT_MS);
  };

  const handleActivity = () => {
    resetInactivityTimer();
  };

  const handlePageHide = () => {
    void postSessionEnd('pagehide', true);
  };

  const handleBeforeUnload = () => {
    void postSessionEnd('beforeunload', true);
  };

  const bindSessionListeners = () => {
    if (!browser) return;
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('focus', handleActivity, { passive: true });
  };

  const unbindSessionListeners = () => {
    if (!browser) return;
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pointerdown', handleActivity);
    window.removeEventListener('keydown', handleActivity);
    window.removeEventListener('touchstart', handleActivity);
    window.removeEventListener('focus', handleActivity);
  };

  if (browser) {
    onMount(async () => {
      const month = new Date().getMonth();
      const accent =
        month >= 5 && month <= 8 ? 'amber' : month >= 9 || month <= 1 ? 'neonMagenta' : 'neonCyan';
      document.documentElement.dataset.themeAccent = accent;
      previousPath = window.location.pathname;
      ensureSessionState();
      visitedPaths = new Set([window.location.pathname]);
      bindSessionListeners();
      resetInactivityTimer();

      const today = new Date().toISOString().slice(0, 10);
      const stored = window.localStorage.getItem(SESSION_START_DAY_KEY);
      if (stored !== today) {
        window.localStorage.setItem(SESSION_START_DAY_KEY, today);
        const response = await sendEvent(
          'session.start',
          { path: window.location.pathname },
          { sessionId: sessionId ?? undefined }
        );
        const output = response?.output ?? null;
        const reaction = output?.suppressed === true ? null : output?.reaction ?? null;
        if (reaction) {
          const { pushCompanionReaction } = await import('$lib/stores/companionReactions');
          pushCompanionReaction(reaction);
        }
      }

      try {
        const res = await fetch('/api/context/portable');
        const payload = await res.json().catch(() => null);
        if (res.ok && payload) {
          hydrateCompanionPrefs(payload);
        }
      } catch {
        // keep defaults
      }
    });

    afterNavigate((nav) => {
      const nextUrl = nav.to?.url ?? new URL(window.location.href);
      const nextPath = nextUrl.pathname;
      visitedPaths.add(nextPath);
      resetInactivityTimer();
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

  onDestroy(() => {
    if (!browser) return;
    unbindSessionListeners();
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
    void postSessionEnd('layout_destroy');
  });
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
{#if !hideCompanionDock}
  <CompanionDock
    visible={$companionPrefs.visible}
    motionEnabled={$companionPrefs.motion}
    transparent={$companionPrefs.transparent}
    reactionsEnabled={$companionPrefs.reactionsEnabled}
  />
{/if}

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
