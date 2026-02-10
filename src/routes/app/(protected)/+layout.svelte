<script lang="ts">
  import { browser } from '$app/environment';
  import { afterNavigate } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import type { NotificationItem } from '$lib/components/ui/types';
  import { sendAnalytics } from '$lib/utils/analytics';
  import { logout } from '$lib/auth/logout';
  import { page } from '$app/stores';
  import MobileDock from '$lib/components/ui/MobileDock.svelte';
  import { Gamepad2, ShoppingBag, MessageCircle, Trophy, UserRound, PawPrint } from 'lucide-svelte';
  import { applyHeaderStats, playerProgress } from '$lib/games/state';
  import { FLAGS } from '$lib/config/flags';
  import BrandHeader from '$lib/components/layout/BrandHeader.svelte';
  import LeanHeader from '$lib/components/layout/LeanHeader.svelte';
  import type { IconNavItem } from '$lib/components/ui/types';
  import CompanionDock from '$lib/components/companion/CompanionDock.svelte';
  import { sendEvent } from '$lib/client/events/sendEvent';
  import { companionPrefs, hydrateCompanionPrefs } from '$lib/stores/companionPrefs';
  import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';

  export let data;

  const isAlphaDenied = () => Boolean(data?.alphaDenied);

  const userEmail = data?.user?.email ?? '';
  let bellNotifications: NotificationItem[] = (data?.notifications ?? []) as NotificationItem[];
  let bellUnread = data?.notificationsUnread ?? 0;
  let previousPath: string | null = null;
  const initialWalletBalance =
    typeof data?.wallet?.shards === 'number' ? (data.wallet.shards as number) : null;

  $: bellNotifications = (data?.notifications ?? bellNotifications) as NotificationItem[];
  $: bellUnread = typeof data?.notificationsUnread === 'number' ? data.notificationsUnread : bellUnread;

  $: if (browser) {
    if (!isAlphaDenied()) {
      applyHeaderStats(data?.headerStats ?? null);
    }
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
  let ambientHue = 224;
  let ambientSecondaryHue = 192;
  let ambientIntensity = 0.1;
  let ambientDrift = 14;
  let prefersReducedMotion = false;
  let motionQuery: MediaQueryList | null = null;
  let currentMood: 'steady' | 'bright' | 'low' = 'steady';
  let currentMoodValue = 0;
  let nowTick = Date.now();
  let nowTimer: number | null = null;

  const activeCompanionSnapshot = data?.activeCompanion ?? null;
  const activeAsInstance =
    activeCompanionSnapshot
      ? ({
          id: activeCompanionSnapshot.id,
          name: activeCompanionSnapshot.name,
          species: activeCompanionSnapshot.species ?? 'Muse',
          rarity: 'common',
          level: 1,
          xp: 0,
          affection: activeCompanionSnapshot.affection ?? 0,
          trust: activeCompanionSnapshot.trust ?? 0,
          energy: activeCompanionSnapshot.energy ?? 0,
          mood: activeCompanionSnapshot.mood ?? 'steady',
          avatar_url: activeCompanionSnapshot.avatar_url ?? null,
          created_at: new Date().toISOString(),
          updated_at: activeCompanionSnapshot.updated_at ?? new Date().toISOString(),
          stats: activeCompanionSnapshot.stats ?? null
        } as any)
      : null;

  $: activeEffective = activeAsInstance ? computeCompanionEffectiveState(activeAsInstance, new Date(nowTick)) : null;

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

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const computeAmbientFromMood = (mood: string | null | undefined, moodValue: number | null | undefined) => {
    const normalizedMood = mood === 'bright' || mood === 'low' ? mood : 'steady';
    const value = Number.isFinite(moodValue as number) ? clamp(Number(moodValue), -1, 1) : 0;
    currentMood = normalizedMood;
    currentMoodValue = value;
    const base = 0.075 + Math.abs(value) * 0.07;

    let nextHue = 224;
    let nextSecondaryHue = 192;
    let nextDrift = 14;
    if (normalizedMood === 'bright') {
      nextHue = 190;
      nextSecondaryHue = 160;
      nextDrift = 20;
    } else if (normalizedMood === 'low') {
      nextHue = 255;
      nextSecondaryHue = 228;
      nextDrift = 9;
    }

    let intensity = base;
    if (prefersReducedMotion) intensity *= 0.35;
    if (!$companionPrefs.motion) intensity *= 0.55;
    if (!$companionPrefs.visible) intensity *= 0.75;

    ambientHue = nextHue;
    ambientSecondaryHue = nextSecondaryHue;
    ambientDrift = nextDrift;
    ambientIntensity = Number(clamp(intensity, 0.03, 0.18).toFixed(3));
  };

  const refreshAmbientContext = async () => {
    if (!browser) return;
    try {
      const res = await fetch('/api/context/bundle');
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload) return;
      const world = payload?.worldState ?? null;
      computeAmbientFromMood(world?.companionMood, world?.companionMoodValue);
    } catch {
      // keep existing ambient values
    }
  };

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

  const handleMotionChange = () => {
    prefersReducedMotion = motionQuery?.matches ?? false;
    computeAmbientFromMood(currentMood, currentMoodValue);
  };

  if (browser) {
    onMount(async () => {
      if (isAlphaDenied()) return;
      const month = new Date().getMonth();
      const accent =
        month >= 5 && month <= 8 ? 'amber' : month >= 9 || month <= 1 ? 'neonMagenta' : 'neonCyan';
      document.documentElement.dataset.themeAccent = accent;
      previousPath = window.location.pathname;
      motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      prefersReducedMotion = motionQuery.matches;
      motionQuery.addEventListener('change', handleMotionChange);
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
          sessionId ? { sessionId } : {}
        );
        const output = response?.output ?? null;
        const reaction = output?.suppressed === true ? null : output?.reaction ?? null;
        if (reaction) {
          const { pushCompanionReaction } = await import('$lib/stores/companionReactions');
          pushCompanionReaction(reaction);
        }
      }

      await refreshAmbientContext();

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
      if (isAlphaDenied()) return;
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

  $: if (browser) {
    if (isAlphaDenied()) {
      // Keep alpha-gated pages lightweight: skip ambient recompute work.
    } else {
    // Recalculate intensity when user preferences change.
    $companionPrefs.visible;
    $companionPrefs.motion;
    computeAmbientFromMood(currentMood, currentMoodValue);
    }
  }

  onDestroy(() => {
    if (!browser) return;
    if (isAlphaDenied()) return;
    unbindSessionListeners();
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
    if (motionQuery) {
      motionQuery.removeEventListener('change', handleMotionChange);
      motionQuery = null;
    }
    void postSessionEnd('layout_destroy');
  });

  onMount(() => {
    if (!browser) return;
    if (isAlphaDenied()) return;
    nowTimer = window.setInterval(() => {
      nowTick = Date.now();
    }, 30_000);
    return () => {
      if (nowTimer) {
        window.clearInterval(nowTimer);
        nowTimer = null;
      }
    };
  });
</script>

{#if data?.alphaDenied}
  <div class="app-shell">
    <div
      class="app-surface"
      style={`--ambient-hue:${ambientHue};--ambient-secondary-hue:${ambientSecondaryHue};--ambient-intensity:${ambientIntensity};--ambient-drift:${ambientDrift}px;`}
    >
      <main class="app-main">
        <slot />
      </main>
    </div>
  </div>
{:else}
<div class="app-shell">
  <div
    class="app-surface"
    style={`--ambient-hue:${ambientHue};--ambient-secondary-hue:${ambientSecondaryHue};--ambient-intensity:${ambientIntensity};--ambient-drift:${ambientDrift}px;`}
  >
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
    companionId={data?.activeCompanion?.id ?? data?.portableActiveCompanion?.id ?? 'muse'}
    companionName={data?.activeCompanion?.name ?? data?.portableActiveCompanion?.name ?? 'Muse'}
    companionCosmetics={data?.portableActiveCompanion?.cosmetics ?? null}
    moodKey={activeEffective?.moodKey ?? null}
  />
{/if}
{/if}

<style>
  .app-shell {
    min-height: 100vh;
    min-height: 100vh;
    background: var(--brand-navy, #050712);
    overflow-x: clip;
  }

  .app-surface {
    --ambient-hue: 224;
    --ambient-secondary-hue: 192;
    --ambient-intensity: 0.1;
    --ambient-drift: 14px;
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 100vh;
    background: radial-gradient(
        circle at 24% 12%,
        hsl(var(--ambient-hue) 92% 66% / var(--ambient-intensity)),
        transparent 56%
      ),
      radial-gradient(
        circle at 76% 88%,
        hsl(var(--ambient-secondary-hue) 88% 62% / calc(var(--ambient-intensity) * 0.72)),
        transparent 48%
      ),
      radial-gradient(circle at top, rgba(155, 92, 255, calc(var(--ambient-intensity) * 0.8)), transparent 55%),
      radial-gradient(circle at bottom, rgba(94, 242, 255, calc(var(--ambient-intensity) * 0.45)), transparent 45%),
      var(--brand-navy, #050712);
    transition: background 360ms ease;
    background-position: 0 0, var(--ambient-drift) 0, 0 0, 0 0;
    overflow-x: clip;
  }

  .app-main {
    padding: 0;
    overflow-y: auto;
    overflow-x: clip;
    min-width: 0;
    width: 100%;
  }

  .app-main :global(*) {
    min-width: 0;
  }

  @media (max-width: 960px) {
    .app-surface {
      grid-template-rows: auto 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .app-surface {
      transition: none;
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

</style>
