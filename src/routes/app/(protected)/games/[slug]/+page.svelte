<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import OrbPanel from '$lib/components/ui/OrbPanel.svelte';
import {
  completeSession,
  fetchPlayerState,
  init,
  signCompletion,
  startSession
} from '$lib/games/sdk';
import type { SessionAchievement } from '$lib/games/sdk';
import { applyPlayerState, recordRewardResult } from '$lib/games/state';
import LeaderboardTabs from '$lib/components/games/LeaderboardTabs.svelte';
import LeaderboardList, { type LeaderboardDisplayRow } from '$lib/components/games/LeaderboardList.svelte';
import type { LeaderboardScope } from '$lib/server/games/leaderboard';
import AchievementToastStack from '$lib/components/games/AchievementToastStack.svelte';
import { achievementsUI } from '$lib/achievements/store';
import AchievementsPanel from '$lib/components/games/AchievementsPanel.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  const slug = data.slug;
  const game = data.game ?? { name: slug, min_version: '1.0.0' };
  const isTilesRun = slug === 'tiles-run';

  const devBanner = import.meta.env.DEV;

  let status = isTilesRun ? 'Waiting for game bridge…' : 'Preparing bridge…';
  let errorMessage: string | null = null;
let reward: { xpDelta: number; currencyDelta: number; achievements: SessionAchievement[] } | null = null;
  let iframeEl: HTMLIFrameElement | null = null;
  let bridge: ReturnType<typeof init> | null = null;
  let unsubscribers: Array<() => void> = [];
  let session: {
    sessionId: string;
    nonce: string;
    caps?: {
      maxDurationMs: number;
      minDurationMs: number;
      maxScorePerMin: number;
      minClientVer: string;
      maxScore: number;
    };
  } | null = null;
  let sessionStartTime = 0;
  let sessionInFlight: Promise<void> | null = null;
let iframeKey = 0;

let achievementsPanelOpen = false;
let achievementsHighlight: string | null = null;
let achievementsFilterSlug: string | null = null;
let achievementsFilterGameId: string | null = null;
let achievementsRequestId: number | null = null;

const releaseAchievements = achievementsUI.subscribe((state) => {
  achievementsPanelOpen = state.open;
  achievementsHighlight = state.highlightKey;
  achievementsFilterSlug = state.filterSlug;
  achievementsFilterGameId = state.filterGameId;
  achievementsRequestId = state.requestId;
});

  type LeaderboardState = {
    rows: LeaderboardDisplayRow[];
    meta: { page: number; limit: number; total: number } | null;
    loading: boolean;
    fetched: boolean;
  };

  const createLeaderboardState = (): LeaderboardState => ({
    rows: [],
    meta: null,
    loading: false,
    fetched: false
  });

  let leaderboardScope: LeaderboardScope = 'alltime';
  let leaderboardStates: Record<LeaderboardScope, LeaderboardState> = {
    daily: createLeaderboardState(),
    weekly: createLeaderboardState(),
    alltime: createLeaderboardState()
  };

  const leaderboardPageSize = 25;

  const mutateLeaderboardState = (scope: LeaderboardScope, partial: Partial<LeaderboardState>) => {
    leaderboardStates = {
      ...leaderboardStates,
      [scope]: {
        ...leaderboardStates[scope],
        ...partial
      }
    };
  };

  const loadLeaderboard = async (scope: LeaderboardScope, page = 1, append = false) => {
    mutateLeaderboardState(scope, { loading: true });
    const previousRows = leaderboardStates[scope].rows;

    try {
      const response = await fetch(
        `/api/leaderboard/${slug}/${scope}?page=${page}&limit=${leaderboardPageSize}`
      );
      if (!response.ok) {
        throw new Error('Unable to load leaderboard');
      }
      const payload = await response.json();
      const nextRows: LeaderboardDisplayRow[] = append
        ? [...previousRows, ...payload.rows]
        : payload.rows;
      mutateLeaderboardState(scope, {
        rows: nextRows,
        meta: payload.meta,
        loading: false,
        fetched: true
      });
    } catch (err) {
      console.error('[games] leaderboard fetch failed', err);
      mutateLeaderboardState(scope, { loading: false, fetched: true });
    }
  };

  const refreshActiveLeaderboard = () => {
    void loadLeaderboard(leaderboardScope);
  };

  const onTabsChange = (scope: LeaderboardScope) => {
    leaderboardScope = scope;
    const current = leaderboardStates[scope];
    if (!current.fetched) {
      void loadLeaderboard(scope);
    }
  };

  const loadMoreLeaderboard = () => {
    const current = leaderboardStates[leaderboardScope];
    if (!current.meta) return;
    const totalPages = Math.ceil(current.meta.total / current.meta.limit);
    const nextPage = current.meta.page + 1;
    if (nextPage > totalPages) return;
    void loadLeaderboard(leaderboardScope, nextPage, true);
  };

  $: activeLeaderboard = leaderboardStates[leaderboardScope];
  $: leaderboardHasMore = activeLeaderboard.meta
    ? activeLeaderboard.meta.page * activeLeaderboard.meta.limit < activeLeaderboard.meta.total
    : false;

  onMount(() => {
    void loadLeaderboard('alltime');
  });

  const embedSrcDoc = String.raw`<!DOCTYPE html><html><head><meta charset="utf-8" /><style>html,body{margin:0;padding:0;background:#050b1f;color:#fff;font-family:Inter,sans-serif;height:100%;display:grid;place-items:center;}</style></head><body><div>Mini-game sandbox</div><script>\n(function(){\n  const send = (type, payload) => parent.postMessage({ type, payload }, '*');\n  window.__loomaGame = { send, lastSession:null, lastReward:null };\n  window.addEventListener('message', (event) => {\n    if (event.data?.type === 'SESSION_STARTED') { window.__loomaGame.lastSession = event.data.payload; }\n    if (event.data?.type === 'REWARD_GRANTED') { window.__loomaGame.lastReward = event.data.payload; }\n    if (event.data?.type === 'ERROR') { window.__loomaGame.lastError = event.data.payload; }\n  });\n  send('GAME_READY');\n})();\n<\/script></body></html>`;

  const resetListeners = () => {
    unsubscribers.forEach((fn) => fn());
    unsubscribers = [];
    bridge?.destroy();
    bridge = null;
    sessionInFlight = null;
    if (typeof window !== 'undefined') {
      delete (window as any).__loomaSession;
      delete (window as any).__loomaComplete;
    }
  };

  const beginSession = () => {
    if (!isTilesRun || !bridge) return;
    if (sessionInFlight) return;

    sessionInFlight = (async () => {
      try {
        status = 'Starting session…';
        errorMessage = null;
        session = await startSession(slug, game.min_version ?? '1.0.0');
        if (typeof window !== 'undefined') {
          (window as any).__loomaSession = session;
        }
        bridge?.post('SESSION_STARTED', { ...session, slug });
        sessionStartTime = typeof window !== 'undefined' ? performance.now() : Date.now();
        status = 'Session handshake complete';
      } catch (err) {
        session = null;
        const message = (err as Error).message ?? 'Unable to start session';
        errorMessage = message;
        status = 'Handshake failed';
      } finally {
        sessionInFlight = null;
      }
    })();
  };

  const finalizeSession = async (payload: any) => {
    if (!isTilesRun) return;
    try {
      if (!session) throw new Error('Session missing');
      const score = Math.max(0, Math.floor(Number(payload?.score ?? 0)));
      let durationMs = Math.max(0, Math.floor(Number(payload?.durationMs ?? 0)));
      const reportedNonce = typeof payload?.nonce === 'string' ? payload.nonce : session.nonce;

      const elapsed = typeof window !== 'undefined' ? performance.now() - sessionStartTime : durationMs;
      durationMs = Math.max(durationMs, Math.floor(elapsed));

      const minDuration = Number(session.caps?.minDurationMs ?? 0);
      if (minDuration > 0 && durationMs < minDuration) {
        const waitMs = minDuration - durationMs;
        status = `Finalizing… ${Math.ceil(waitMs / 1000)}s minimum session time`;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        const postWaitElapsed = typeof window !== 'undefined' ? performance.now() - sessionStartTime : durationMs + waitMs;
        durationMs = Math.max(minDuration, Math.floor(postWaitElapsed));
      }

      status = 'Requesting validation…';
      const { signature } = await signCompletion({
        sessionId: session.sessionId,
        score,
        durationMs,
        nonce: reportedNonce,
        clientVersion: game.min_version ?? '1.0.0'
      });

      status = 'Reporting results…';
      const result = await completeSession({
        sessionId: session.sessionId,
        score,
        durationMs,
        nonce: reportedNonce,
        signature,
        clientVersion: game.min_version ?? '1.0.0'
      });

      reward = {
        xpDelta: result.xpDelta,
        currencyDelta: result.currencyDelta,
        achievements: Array.isArray(result.achievements) ? result.achievements : []
      };
      status = 'Session complete';
      session = null;
      if (typeof window !== 'undefined') {
        (window as any).__loomaComplete = null;
      }

      recordRewardResult({
        xpDelta: result.xpDelta,
        currencyDelta: result.currencyDelta,
        game: slug,
        gameName: game.name
      });

      try {
        const latest = await fetchPlayerState();
        applyPlayerState(latest);
      } catch (refreshErr) {
        console.warn('[games] failed to refresh player state', refreshErr);
      }

      refreshActiveLeaderboard();
    } catch (err) {
      const message = (err as Error).message ?? 'Unable to complete session';
      errorMessage = message;
      status = 'Result submission failed';
    }
  };

  const handleFrameLoad = (iframe: HTMLIFrameElement) => {
    const target = iframe.contentWindow;
    if (!target) {
      errorMessage = 'Unable to load game frame';
      return;
    }

    resetListeners();
    bridge = init({ targetWindow: target, origin: '*' });

    unsubscribers.push(
      bridge.subscribe('GAME_READY', () => {
        status = 'Game signaled ready';
        if (isTilesRun) {
          beginSession();
        }
      })
    );

    unsubscribers.push(bridge.subscribe('GAME_COMPLETE', finalizeSession));

    if (!isTilesRun) {
      status = 'Sandbox ready';
    }
  };

  const reloadIframe = () => {
    reward = null;
    errorMessage = null;
    session = null;
    iframeKey += 1;
    status = 'Waiting for game bridge…';
  };

  const replaySession = () => {
    reward = null;
    errorMessage = null;
    session = null;
    if (bridge) {
      bridge.post('SESSION_RESET');
      beginSession();
      status = 'Waiting for game bridge…';
    } else {
      reloadIframe();
    }
  };

  onMount(() => {
    if (!iframeEl) return;
    const runner = () => handleFrameLoad(iframeEl!);
    iframeEl.addEventListener('load', runner);
    if (iframeEl.contentWindow) {
      runner();
    }
    return () => {
      iframeEl?.removeEventListener('load', runner);
    };
  });

  onDestroy(() => {
    resetListeners();
    releaseAchievements();
  });

  const goBack = () => goto('/app/games');
</script>

<svelte:head>
  <title>Looma — {game.name}</title>
</svelte:head>

<div class="bg-neuro min-h-screen" data-testid="game-embed">
  <BackgroundStack />
  <main class="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pb-24 pt-20">
    <button class="back-link" type="button" on:click={goBack}>
      ← Back to hub
    </button>

    {#if devBanner}
      <div class="dev-banner">Bridge status: {status}</div>
    {/if}

    <OrbPanel class="space-y-6">
      <header class="flex flex-col gap-2 text-white">
        <p class="text-xs uppercase tracking-[0.3em] text-white/40">Now playing</p>
        <h1 class="text-3xl font-semibold">{game.name}</h1>
      </header>

      <div class="game-frame">
        {#if isTilesRun}
          <iframe
            bind:this={iframeEl}
            title={`${game.name} embed`}
            src={`/games/tiles-run/embed?session=${iframeKey}`}
            data-testid="tiles-embed"
            class="tiles-iframe"
            allow="gamepad *; fullscreen"
            allowfullscreen
          ></iframe>
        {:else}
          <iframe
            bind:this={iframeEl}
            title={`${game.name} embed`}
            srcdoc={embedSrcDoc}
            allowfullscreen
          ></iframe>
        {/if}
      </div>

      {#if reward}
        <div class="reward-toast" role="status" data-testid="reward-toast">
          <p class="reward-toast__label">Session rewards</p>
          <p class="reward-toast__value">
            +{reward.xpDelta} XP • +{reward.currencyDelta} shards
          </p>
          <div class="toast-actions">
            <button class="toast-button" type="button" on:click={replaySession}>
              Replay
            </button>
            <button class="toast-button secondary" type="button" on:click={goBack}>
              Back to hub
            </button>
          </div>

          {#if reward.achievements.length > 0}
            <AchievementToastStack
              achievements={reward.achievements}
              slug={slug}
              gameId={game.id ?? null}
              on:view={(event) =>
                achievementsUI.focusAchievement(event.detail.key, {
                  slug: event.detail.slug,
                  gameId: event.detail.gameId ?? null,
                  source: 'toast'
                })
              }
            />
          {/if}
        </div>
      {/if}

      {#if errorMessage}
        <div class="error-banner">{errorMessage}</div>
      {/if}

      <section class="leaderboard-section">
        <div class="leaderboard-header">
          <h2 class="leaderboard-title">Leaderboards</h2>
          <LeaderboardTabs active={leaderboardScope} on:change={(event) => onTabsChange(event.detail)} />
        </div>

        <LeaderboardList
          rows={activeLeaderboard.rows}
          loading={activeLeaderboard.loading && activeLeaderboard.rows.length === 0}
          scope={leaderboardScope}
        />

        {#if leaderboardHasMore}
          <button
            class="leaderboard-more"
            type="button"
            data-testid="leaderboard-next"
            on:click={loadMoreLeaderboard}
            disabled={activeLeaderboard.loading}
          >
            {activeLeaderboard.loading ? 'Loading…' : 'Next page'}
          </button>
        {/if}
      </section>

      <button
        class="achievements-open"
        type="button"
        data-testid="achievements-open"
        on:click={() => achievementsUI.open({ slug, gameId: game.id ?? null, source: 'game' })}
      >
        View achievements
      </button>
    </OrbPanel>
  </main>

  <AchievementsPanel
    open={achievementsPanelOpen}
    gameSlug={slug}
    gameName={game.name}
    gameId={game.id ?? null}
    highlightKey={achievementsHighlight}
    filterSlug={achievementsFilterSlug}
    filterGameId={achievementsFilterGameId}
    requestId={achievementsRequestId}
    on:close={() => achievementsUI.close()}
  />
</div>

<style>
  .back-link {
    align-self: flex-start;
    color: rgba(255, 255, 255, 0.65);
    font-size: 0.85rem;
    text-decoration: none;
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .back-link:hover,
  .back-link:focus-visible {
    color: rgba(255, 255, 255, 0.95);
    outline: none;
  }

  .dev-banner {
    border-radius: 999px;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    background: rgba(8, 12, 28, 0.6);
    color: rgba(255, 255, 255, 0.75);
    padding: 0.4rem 0.8rem;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .game-frame {
    position: relative;
    width: 100%;
    padding-top: 56.25%;
    border-radius: 1.2rem;
    overflow: hidden;
    box-shadow: 0 18px 35px rgba(9, 12, 26, 0.45);
  }

  iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  .tiles-iframe {
    background: transparent;
  }

  .reward-toast {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    border-radius: 1rem;
    padding: 1rem 1.2rem;
    background: rgba(13, 23, 45, 0.85);
    border: 1px solid rgba(116, 186, 255, 0.2);
    color: rgba(230, 240, 255, 0.92);
    box-shadow: 0 14px 38px rgba(8, 12, 28, 0.35);
  }

  .reward-toast__label {
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(160, 194, 255, 0.6);
  }

  .reward-toast__value {
    font-size: 1.05rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
  }

  .toast-actions {
    display: flex;
    gap: 0.75rem;
  }

  .toast-button {
    border-radius: 999px;
    border: none;
    padding: 0.55rem 1.4rem;
    background: linear-gradient(120deg, rgba(155, 92, 255, 0.85), rgba(77, 244, 255, 0.85));
    color: rgba(10, 14, 32, 0.9);
    font-weight: 600;
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 200ms ease;
  }

  .toast-button.secondary {
    background: transparent;
    border: 1px solid rgba(160, 194, 255, 0.35);
    color: rgba(200, 224, 255, 0.85);
  }

  .toast-button:hover,
  .toast-button:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(77, 244, 255, 0.25);
    outline: none;
  }

  .achievements-open {
    align-self: flex-end;
    border: 1px solid rgba(160, 194, 255, 0.4);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(220, 234, 255, 0.85);
    border-radius: 999px;
    padding: 0.4rem 1.1rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, border 0.15s ease, transform 0.15s ease;
  }

  .achievements-open:hover,
  .achievements-open:focus-visible {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(210, 230, 255, 0.8);
    transform: translateY(-1px);
    outline: none;
  }

  .error-banner {
    border-radius: 0.9rem;
    padding: 0.65rem 0.9rem;
    background: rgba(255, 71, 87, 0.16);
    border: 1px solid rgba(255, 71, 87, 0.45);
    color: rgba(255, 224, 230, 0.92);
  }

  .leaderboard-section {
    display: grid;
    gap: 1rem;
    padding-top: 0.5rem;
  }

  .leaderboard-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .leaderboard-title {
    margin: 0;
    font-size: 1.1rem;
    color: rgba(244, 247, 255, 0.85);
  }

  .leaderboard-more {
    justify-self: center;
    border: none;
    border-radius: 999px;
    padding: 0.5rem 1.4rem;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(244, 247, 255, 0.85);
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease;
  }

  .leaderboard-more:hover,
  .leaderboard-more:focus-visible {
    background: rgba(255, 255, 255, 0.14);
    color: white;
    outline: none;
  }

  .leaderboard-more[disabled] {
    opacity: 0.6;
    cursor: progress;
  }
</style>
