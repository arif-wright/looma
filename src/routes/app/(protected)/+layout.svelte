<script lang="ts">
  import { browser } from '$app/environment';
  import { afterNavigate } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import type { NotificationItem } from '$lib/components/ui/types';
  import { sendAnalytics } from '$lib/utils/analytics';
  import { page } from '$app/stores';
  import MobileDock from '$lib/components/ui/MobileDock.svelte';
  import {
    Box,
    Compass,
    Gamepad2,
    House,
    MessageSquare,
    Sparkles,
    Store,
    Trees,
    UserRound,
    Users,
    UsersRound,
    WandSparkles
  } from 'lucide-svelte';
  import { applyHeaderStats, playerProgress } from '$lib/games/state';
  import type { IconNavItem } from '$lib/components/ui/types';
  import FantasySidebar from '$lib/components/home/fantasy/FantasySidebar.svelte';
  import { sendEvent } from '$lib/client/events/sendEvent';
  import { companionPrefs, hydrateCompanionPrefs } from '$lib/stores/companionPrefs';
  import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';
  import { ambient } from '$lib/stores/ambient';

  export let data;

  const isAlphaDenied = () => Boolean(data?.alphaDenied);

  const userEmail = data?.user?.email ?? '';
  const presenceVisible = data?.preferences?.presence_visible !== false;
  let bellNotifications: NotificationItem[] = (data?.notifications ?? []) as NotificationItem[];
  let bellUnread = data?.notificationsUnread ?? 0;
  let messageUnread = 0;
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

  const pageStore = page;
  let currentPath = '';
  let isHome = false;
  let isCompanions = false;
  let isGames = false;
  let isShop = false;
  let isMessages = false;
  let isProfileSurface = false;
  let walletBalance: number | null = null;
  let walletCurrency = 'SHARDS';
  let ambientHue = 224;
  let ambientSecondaryHue = 192;
  let ambientIntensity = 0.1;
  let ambientDrift = 14;
  let ambientGlow = 0.72;
  let ambientMotion = 1;
  let ambientAccent = '#7dd3fc';
  let prefersReducedMotion = false;
  let motionQuery: MediaQueryList | null = null;
  let nowTick = Date.now();
  let nowTimer: number | null = null;
  let presenceAwayTimer: number | null = null;
  let presenceHeartbeatTimer: number | null = null;
  let unreadPollTimer: number | null = null;
  let currentPresenceStatus: 'online' | 'away' | 'offline' = 'offline';
  let lastPresenceHeartbeatAt = 0;
  let iconNavItems: IconNavItem[] = [];

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
  $: isCompanions = currentPath.startsWith('/app/companions');
  $: isGames = currentPath.startsWith('/app/games');
  $: isShop = currentPath.startsWith('/app/shop');
  $: isMessages = currentPath.startsWith('/app/messages');
  $: isProfileSurface =
    currentPath.startsWith('/app/profile') || currentPath === '/app/u' || currentPath.startsWith('/app/u/');
  $: usePageOwnedShell = isHome || isMessages || isCompanions;
  $: shellPlayerName =
    (data as any)?.profile?.display_name ??
    (data as any)?.user?.user_metadata?.name ??
    (data as any)?.user?.email?.split('@')?.[0] ??
    'Traveler';
  $: shellLevel = Math.max(1, Math.floor(data?.headerStats?.level ?? data?.activeCompanion?.bondLevel ?? 1));
  $: shellXp = Math.max(0, Math.floor(data?.headerStats?.xp ?? 0));
  $: shellXpNext = Math.max(shellXp + 1, Math.floor(data?.headerStats?.xp_next ?? 100));
  $: walletBalance =
    typeof $playerProgress?.currency === 'number' && Number.isFinite($playerProgress.currency)
      ? ($playerProgress.currency as number)
      : initialWalletBalance;
  $: walletCurrency = 'SHARDS';

  $: iconNavItems = [
    { href: '/app/home', label: 'Home', icon: House, analyticsKey: 'home' },
    { href: '/app/sanctuary', label: 'Sanctuary', icon: Trees, analyticsKey: 'sanctuary' },
    { href: '/app/companions', label: 'Companions', icon: Sparkles, analyticsKey: 'companions' },
    { href: '/app/games', label: 'Games', icon: Gamepad2, analyticsKey: 'games' },
    { href: '/app/memory', label: 'Journal', icon: Compass, analyticsKey: 'journal' },
    { href: '/app/missions', label: 'Quests', icon: WandSparkles, analyticsKey: 'quests' },
    { href: '/app/inventory', label: 'Inventory', icon: Box, analyticsKey: 'inventory' },
    { href: '/app/shop', label: 'Market', icon: Store, analyticsKey: 'market' },
    {
      href: '/app/messages',
      label: 'Messages',
      icon: MessageSquare,
      analyticsKey: 'messages',
      badgeCount: messageUnread
    },
    { href: '/app/friends', label: 'Friends', icon: Users, analyticsKey: 'friends' },
    { href: '/app/circles', label: 'Circles', icon: UsersRound, analyticsKey: 'circles' },
    { href: '/app/profile', label: 'Profile', icon: UserRound, analyticsKey: 'profile' }
  ] satisfies IconNavItem[];

  const refreshMessageUnread = async () => {
    if (!browser || isAlphaDenied()) return;
    try {
      const res = await fetch('/api/messenger/unread', { headers: { 'cache-control': 'no-store' } });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const count = Number(payload?.totalUnread ?? 0);
      messageUnread = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    } catch {
      // keep current unread count
    }
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const mapAccentToPalette = (accentVariant: string) => {
    if (accentVariant === 'luminous') {
      return { hue: 190, secondaryHue: 160, drift: 20, accent: '#67e8f9' };
    }
    if (accentVariant === 'dim') {
      return { hue: 255, secondaryHue: 228, drift: 9, accent: '#a78bfa' };
    }
    return { hue: 224, secondaryHue: 192, drift: 14, accent: '#7dd3fc' };
  };

  const refreshAmbientContext = async () => {
    if (!browser) return;
    try {
      const res = await fetch('/api/companions/ambient');
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload) return;
      const adaptationEnabled = payload?.consent?.emotionalAdaptation !== false;
      if (!adaptationEnabled) {
        ambient.reset({ instant: prefersReducedMotion, reducedMotion: prefersReducedMotion });
        return;
      }
      ambient.setFromEmotionalState(payload?.emotionalState ?? null, {
        instant: prefersReducedMotion,
        reducedMotion: prefersReducedMotion
      });
      ambient.setFromSummary(payload?.memorySummary ?? null, {
        instant: prefersReducedMotion,
        reducedMotion: prefersReducedMotion
      });
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
    if (presenceVisible) {
      void touchPresenceActivity();
    }
  };

  const handlePageHide = () => {
    void postSessionEnd('pagehide', true);
    if (presenceVisible) {
      void postPresence('offline', true);
    }
  };

  const handleBeforeUnload = () => {
    void postSessionEnd('beforeunload', true);
    if (presenceVisible) {
      void postPresence('offline', true);
    }
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
    void refreshAmbientContext();
  };

  const handleAmbientRefresh = () => {
    void refreshAmbientContext();
  };

  const postPresence = async (status: 'online' | 'away' | 'offline', keepalive = false) => {
    if (!browser || !presenceVisible) return;

    currentPresenceStatus = status;
    const payload = JSON.stringify({ status });

    if (keepalive) {
      void fetch('/api/presence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
      return;
    }

    await fetch('/api/presence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload
    }).catch(() => {});
  };

  const resetPresenceAwayTimer = () => {
    if (!browser || !presenceVisible) return;
    if (presenceAwayTimer) {
      window.clearTimeout(presenceAwayTimer);
      presenceAwayTimer = null;
    }
    presenceAwayTimer = window.setTimeout(() => {
      if (currentPresenceStatus !== 'away') {
        void postPresence('away');
      }
    }, 2 * 60 * 1000);
  };

  const touchPresenceActivity = async () => {
    if (!browser || !presenceVisible) return;
    resetPresenceAwayTimer();
    const now = Date.now();
    if (currentPresenceStatus !== 'online') {
      await postPresence('online');
      lastPresenceHeartbeatAt = now;
      return;
    }
    if (now - lastPresenceHeartbeatAt >= 60_000) {
      lastPresenceHeartbeatAt = now;
      await postPresence('online');
    }
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
      window.addEventListener('looma:ambient-refresh', handleAmbientRefresh);
      ensureSessionState();
      visitedPaths = new Set([window.location.pathname]);
      bindSessionListeners();
      resetInactivityTimer();
      if (presenceVisible) {
        await postPresence('online');
        lastPresenceHeartbeatAt = Date.now();
        resetPresenceAwayTimer();
        presenceHeartbeatTimer = window.setInterval(() => {
          if (currentPresenceStatus === 'online') {
            lastPresenceHeartbeatAt = Date.now();
            void postPresence('online');
          }
        }, 75_000);
      }

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
      await refreshMessageUnread();

      try {
        const res = await fetch('/api/context/portable');
        const payload = await res.json().catch(() => null);
        if (res.ok && payload) {
          hydrateCompanionPrefs(payload);
        }
      } catch {
        // keep defaults
      }

      unreadPollTimer = window.setInterval(() => {
        void refreshMessageUnread();
      }, 15_000);
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
      void refreshMessageUnread();
    });
  }

  $: if (browser) {
    if (isAlphaDenied()) {
      // Keep alpha-gated pages lightweight: skip ambient recompute work.
    } else {
      $ambient;
      $companionPrefs.visible;
      $companionPrefs.motion;
      const palette = mapAccentToPalette($ambient.accentVariant);
      ambientHue = palette.hue;
      ambientSecondaryHue = palette.secondaryHue;
      ambientDrift = palette.drift;
      ambientAccent = palette.accent;
      const visibilityScale = $companionPrefs.visible ? 1 : 0.82;
      const motionPrefScale = $companionPrefs.motion ? 1 : 0.92;
      const baseIntensity = clamp($ambient.intensity * visibilityScale * motionPrefScale, 0, 1);
      ambientIntensity = Number(clamp(0.04 + baseIntensity * 0.14, 0.04, 0.18).toFixed(3));
      ambientGlow = Number(clamp($ambient.glowScale, 0.6, 1.2).toFixed(3));
      ambientMotion = Number((prefersReducedMotion ? 1 : clamp($ambient.motionScale, 0.7, 1.15)).toFixed(3));
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
    window.removeEventListener('looma:ambient-refresh', handleAmbientRefresh);
    if (presenceAwayTimer) {
      window.clearTimeout(presenceAwayTimer);
      presenceAwayTimer = null;
    }
    if (presenceHeartbeatTimer) {
      window.clearInterval(presenceHeartbeatTimer);
      presenceHeartbeatTimer = null;
    }
    if (unreadPollTimer) {
      window.clearInterval(unreadPollTimer);
      unreadPollTimer = null;
    }
    if (presenceVisible) {
      void postPresence('offline', true);
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
      style={`--ambient-hue:${ambientHue};--ambient-secondary-hue:${ambientSecondaryHue};--ambient-intensity:${ambientIntensity};--ambient-drift:${ambientDrift}px;--ambientIntensity:${ambientIntensity};--ambientGlow:${ambientGlow};--ambientMotion:${ambientMotion};--ambientAccent:${ambientAccent};`}
    >
      <main class={`app-main ${isHome ? 'app-main--home' : 'app-main--unified'}`}><slot /></main>
    </div>
  </div>
{:else}
<div class="app-shell">
  <div
    class={`app-surface ${isHome ? 'app-surface--home' : ''}`}
    style={`--ambient-hue:${ambientHue};--ambient-secondary-hue:${ambientSecondaryHue};--ambient-intensity:${ambientIntensity};--ambient-drift:${ambientDrift}px;--ambientIntensity:${ambientIntensity};--ambientGlow:${ambientGlow};--ambientMotion:${ambientMotion};--ambientAccent:${ambientAccent};`}
  >
    <div class:page-owned-shell={usePageOwnedShell} class="unified-app-layout">
      {#if !usePageOwnedShell}
        <FantasySidebar
          playerName={shellPlayerName}
          level={shellLevel}
          xp={shellXp}
          xpNext={shellXpNext}
          activePath={currentPath}
        />
      {/if}
      <main class={`app-main ${usePageOwnedShell ? 'app-main--home' : 'app-main--unified'} ${isMessages ? 'app-main--messages' : ''}`}>
        <slot />
      </main>
    </div>
  </div>
</div>

<MobileDock items={iconNavItems} />
{/if}

<style>
  .app-shell {
    min-height: 100vh;
    background: var(--brand-obsidian, #100d12);
    overflow-x: clip;
  }

  .app-surface {
    --ambient-hue: 224;
    --ambient-secondary-hue: 192;
    --ambient-intensity: 0.1;
    --ambient-drift: 14px;
    display: block;
    min-height: 100vh;
    background:
      radial-gradient(circle at 78% 12%, rgba(123, 77, 255, 0.22), transparent 28rem),
      radial-gradient(circle at 44% 48%, rgba(74, 244, 255, 0.07), transparent 26rem),
      linear-gradient(135deg, #080719, #070a19 52%, #050714);
    transition: background 360ms ease;
    background-position: 0 0, var(--ambient-drift) 0, 0 0, 0 0;
    overflow-x: clip;
    position: relative;
  }

  .app-surface--home {
    min-height: 100vh;
  }

  .app-surface::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--ambientAccent) 70%, #f0b470), transparent);
    opacity: calc(var(--ambientIntensity) * 0.85);
    pointer-events: none;
  }

  .app-main {
    padding: 0;
    overflow-y: auto;
    overflow-x: clip;
    min-width: 0;
    width: 100%;
  }

  .unified-app-layout {
    display: grid;
    min-height: 100vh;
    grid-template-columns: 14.5rem minmax(0, 1fr);
  }

  .unified-app-layout.page-owned-shell {
    display: block;
  }

  .app-main--unified {
    padding: 1rem 1rem calc(5.6rem + env(safe-area-inset-bottom));
  }

  .app-main--messages {
    padding: 0;
    overflow: hidden;
  }

  .app-main :global(*) {
    min-width: 0;
  }

  .app-main :global(.panel),
  .app-main :global(.preferences-panel),
  .app-main :global(.mission-card) {
    box-shadow: 0 0 calc(18px * var(--ambientGlow)) color-mix(in oklab, var(--ambientAccent) 14%, transparent);
  }

  @media (max-width: 1180px) {
    .unified-app-layout {
      display: block;
    }

    .app-main--unified {
      padding: 0.5rem 0.4rem calc(5.2rem + env(safe-area-inset-bottom));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .app-surface {
      transition: none;
    }
  }

  :global(body.looma-game-fullscreen) .app-main {
    padding: 0;
  }

</style>
