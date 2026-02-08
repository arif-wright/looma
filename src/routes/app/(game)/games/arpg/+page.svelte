<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import OrbPanel from '$lib/components/ui/OrbPanel.svelte';
  import LeaderboardTabs from '$lib/components/games/LeaderboardTabs.svelte';
  import LeaderboardList from '$lib/components/games/LeaderboardList.svelte';
  import AchievementToastStack from '$lib/components/games/AchievementToastStack.svelte';
  import { bootGame, shutdownGame } from '$lib/games/arpg/main';
  import {
    completeSession,
    fetchPlayerState,
    startSession,
    type SessionAchievement
  } from '$lib/games/sdk';
  import { applyPlayerState, recordRewardResult } from '$lib/games/state';
  import { describeCompanionBonus } from '$lib/games/rewardBonus';
  import { applyRitualUpdate } from '$lib/stores/companionRituals';
  import type { CompanionRitual } from '$lib/companions/rituals';
  import type { LeaderboardScope, LeaderboardDisplayRow } from '$lib/server/games/leaderboard';
  import { achievementsUI } from '$lib/achievements/store';
  import type { PageData } from './$types';

  export let data: PageData;

  const slug = data.slug ?? 'arpg';
  const game =
    data.game ?? {
      slug,
      name: 'Looma ARPG',
      min_version: '1.0.0',
      max_score: 150000
    };
  const minVersion = game.min_version ?? '1.0.0';
  const devBanner = import.meta.env.DEV;

  type SessionContext = {
    sessionId: string;
    nonce: string;
    caps?: {
      minDurationMs?: number;
      maxDurationMs?: number;
    };
  };

  type SessionReward = {
    xpDelta: number;
    baseXp?: number | null;
    finalXp?: number | null;
    xpFromCompanion?: number | null;
    xpFromStreak?: number | null;
    xpMultiplier?: number | null;
    companionBonus?: {
      companionId?: string | null;
      name: string | null;
      bondLevel: number;
      xpMultiplier: number;
    } | null;
    currencyDelta: number;
    baseCurrencyDelta?: number | null;
    currencyMultiplier?: number | null;
    achievements: SessionAchievement[];
  };

  let containerEl: HTMLDivElement | null = null;
  let session: SessionContext | null = null;
  let sessionStartWall = 0;
  let sessionStartClock = 0;
  let sessionLoading = false;
  let sessionFinalizing = false;
  let reward: SessionReward | null = null;
  let ritualCompletions: CompanionRitual[] = [];
  let errorMessage: string | null = null;
  let status = 'Preparing Looma ARPG…';

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
      if (!response.ok) throw new Error('Unable to load leaderboard');
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
      console.warn('[arpg] leaderboard fetch failed', err);
      mutateLeaderboardState(scope, { loading: false, fetched: true });
    }
  };

  const onTabsChange = (scope: LeaderboardScope) => {
    leaderboardScope = scope;
    if (!leaderboardStates[scope].fetched) {
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

  $: companionBonusDescription = reward
    ? describeCompanionBonus({
        xpFromCompanion: reward.xpFromCompanion ?? 0,
        companionBonus: reward.companionBonus
      })
    : null;

  const startRun = async () => {
    if (sessionLoading || sessionFinalizing || session) return;
    if (!containerEl) {
      await tick();
    }
    if (!containerEl) return;

    sessionLoading = true;
    reward = null;
    errorMessage = null;
    status = 'Connecting to Looma ARPG…';

    try {
      session = await startSession(slug, 'standard', {
        clientVersion: minVersion,
        source: 'arpg_page'
      });
      sessionStartWall = Date.now();
      sessionStartClock = typeof performance !== 'undefined' ? performance.now() : sessionStartWall;
      await bootGame(containerEl, { onGameOver: finalizeRun });
      status = 'Session live — survive and dash!';
    } catch (err) {
      const message = (err as Error).message ?? 'Unable to start session';
      errorMessage = message;
      status = 'Session failed to start';
    } finally {
      sessionLoading = false;
    }
  };

  const finalizeRun = async (score: number) => {
    if (!session || sessionFinalizing) return;
    sessionFinalizing = true;
    status = 'Finalizing session…';

    try {
      const sanitizedScore = Math.max(0, Math.floor(score));
      let durationMs = Math.max(0, Date.now() - sessionStartWall);
      const nowClock = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsedClock = sessionStartClock ? Math.floor(nowClock - sessionStartClock) : durationMs;
      durationMs = Math.max(durationMs, elapsedClock);

      const minDuration = Number(session.caps?.minDurationMs ?? 0);
      if (minDuration > 0 && durationMs < minDuration) {
        const waitMs = minDuration - durationMs;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        const latestClock = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const postWaitElapsed = sessionStartClock
          ? Math.floor(latestClock - sessionStartClock)
          : Date.now() - sessionStartWall;
        durationMs = Math.max(minDuration, postWaitElapsed);
      }

      const result = await completeSession(session.sessionId, {
        score: sanitizedScore,
        durationMs,
        success: true,
        stats: {
          mode: 'standard'
        }
      });
      if (!result) {
        throw new Error('Unable to complete session');
      }

      const fallbackBaseXp =
        typeof result.baseXp === 'number'
          ? result.baseXp
          : typeof result.baseXpDelta === 'number'
            ? result.baseXpDelta
            : result.xpDelta;
      const fallbackFinalXp = typeof result.finalXp === 'number' ? result.finalXp : result.xpDelta;
      const inferredCompanionXp = Math.max(0, fallbackFinalXp - fallbackBaseXp);

      const companionBonus = result.companionBonus
        ? {
            companionId: result.companionBonus.companionId ?? null,
            name: result.companionBonus.name ?? null,
            bondLevel: result.companionBonus.bondLevel ?? 0,
            xpMultiplier: result.companionBonus.xpMultiplier ?? 1
          }
        : null;

      const sessionReward: SessionReward = {
        xpDelta: result.xpDelta,
        baseXp: fallbackBaseXp,
        finalXp: fallbackFinalXp,
        xpFromCompanion: result.xpFromCompanion ?? inferredCompanionXp,
        xpFromStreak: result.xpFromStreak ?? null,
        xpMultiplier: result.xpMultiplier ?? null,
        companionBonus,
        currencyDelta: result.currencyDelta,
        baseCurrencyDelta: result.baseCurrencyDelta ?? null,
        currencyMultiplier: result.currencyMultiplier ?? null,
        achievements: Array.isArray(result.achievements) ? result.achievements : []
      };
      reward = sessionReward;

      if (result.rituals?.list) {
        applyRitualUpdate(result.rituals.list as CompanionRitual[]);
        ritualCompletions = (result.rituals.completed as CompanionRitual[]) ?? [];
      } else {
        ritualCompletions = [];
      }

      status = 'Session complete';
      recordRewardResult({
        xpDelta: result.xpDelta,
        baseXpDelta: result.baseXpDelta ?? null,
        xpMultiplier: result.xpMultiplier ?? null,
        baseXp: fallbackBaseXp,
        finalXp: fallbackFinalXp,
        xpFromCompanion: sessionReward.xpFromCompanion ?? inferredCompanionXp,
        xpFromStreak: result.xpFromStreak ?? null,
        companionBonus,
        currencyDelta: result.currencyDelta,
        baseCurrencyDelta: result.baseCurrencyDelta ?? null,
        currencyMultiplier: result.currencyMultiplier ?? null,
        game: slug,
        gameName: game.name
      });

      try {
        const latest = await fetchPlayerState();
        applyPlayerState(latest);
      } catch (refreshErr) {
        console.warn('[arpg] failed to refresh player state', refreshErr);
      }

      session = null;
    } catch (err) {
      const message = (err as Error).message ?? 'Unable to complete session';
      errorMessage = message;
      status = 'Result submission failed';
    } finally {
      if (session) {
        session = null;
      }
      sessionFinalizing = false;
    }
  };

  const replay = () => {
    if (sessionLoading || sessionFinalizing) return;
    void startRun();
  };

  const goBack = () => goto('/app/games');

  onMount(() => {
    let cancelled = false;
    const bootstrap = async () => {
      await tick();
      if (cancelled) return;
      await startRun();
      void loadLeaderboard('alltime');
    };
    void bootstrap();
    return () => {
      cancelled = true;
      shutdownGame();
    };
  });

  onDestroy(() => {
    shutdownGame();
  });
</script>

<svelte:head>
  <title>Looma — {game.name}</title>
</svelte:head>

<div class="bg-neuro min-h-screen" data-testid="looma-arpg">
  <BackgroundStack />
  <main class="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pb-24 pt-20">
    <button class="back-link" type="button" on:click={goBack}>
      ← Back to hub
    </button>

    {#if devBanner}
      <div class="dev-banner">Status: {status}</div>
    {/if}

    <OrbPanel class="space-y-6">
      <header class="flex flex-col gap-2 text-white">
        <p class="text-xs uppercase tracking-[0.3em] text-white/40">Now playing</p>
        <h1 class="text-3xl font-semibold">{game.name}</h1>
        <p class="text-sm text-white/70">Stay alive, stack pulses, and secure the shards.</p>
      </header>

      <div class="game-frame">
        <div class="arpg-container" bind:this={containerEl}></div>
      </div>

      <p class="game-status">{status}</p>

      <div class="session-actions">
        <button
          class="toast-button"
          type="button"
          on:click={replay}
          disabled={sessionLoading || sessionFinalizing || !!session}
        >
          {session ? 'Run in progress…' : sessionLoading ? 'Starting…' : 'Replay'}
        </button>
        <button class="toast-button secondary" type="button" on:click={goBack}>
          Back to hub
        </button>
      </div>

      {#if reward}
        <div class="reward-toast" role="status">
          <p class="reward-toast__label">Session rewards</p>
          <p class="reward-toast__value">
            +{reward.xpDelta} XP • +{reward.currencyDelta} shards
          </p>
          {#if (reward.currencyMultiplier && reward.currencyMultiplier > 1) || companionBonusDescription}
            <p class="reward-toast__meta">
              {#if reward.currencyMultiplier && reward.currencyMultiplier > 1}
                <span class="reward-pill">x{reward.currencyMultiplier.toFixed(1)} streak</span>
              {/if}
              {#if companionBonusDescription}
                <span class="reward-pill">{companionBonusDescription.pill}</span>
              {/if}
            </p>
          {/if}
          {#if companionBonusDescription?.detail}
            <p class="reward-toast__detail">{companionBonusDescription.detail}</p>
          {/if}
          {#if ritualCompletions.length}
            <p class="reward-toast__detail">Ritual complete: {ritualCompletions[0].title}</p>
          {/if}
          <div class="toast-actions">
            <button class="toast-button" type="button" on:click={replay}>
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
                })}
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
        on:click={() => achievementsUI.open({ slug, gameId: game.id ?? null, source: 'game' })}
      >
        View achievements
      </button>
    </OrbPanel>
  </main>
</div>

<style>
  .back-link {
    color: rgba(255, 255, 255, 0.72);
    font-size: 0.9rem;
    text-decoration: none;
    transition: color 0.2s ease;
    align-self: flex-start;
  }

  .back-link:hover {
    color: #fff;
  }

  .dev-banner {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
    color: #fff;
    width: fit-content;
  }

  .game-frame {
    background: rgba(13, 19, 39, 0.82);
    border-radius: 24px;
    padding: 1rem;
    position: relative;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 20px 50px rgba(0, 0, 0, 0.45);
  }

  .arpg-container {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 20px;
    overflow: hidden;
    background: #05060a;
  }

  .game-status {
    color: rgba(255, 255, 255, 0.72);
    font-size: 0.95rem;
  }

  .session-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .reward-toast {
    background: rgba(12, 17, 43, 0.9);
    border-radius: 18px;
    padding: 1.25rem;
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .reward-toast__label {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 0.25rem;
  }

  .reward-toast__value {
    font-size: 1.4rem;
    font-weight: 600;
  }

  .reward-toast__meta {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.4rem;
  }

  .reward-pill {
    background: rgba(255, 255, 255, 0.12);
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
  }

  .reward-toast__detail {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
    margin-top: 0.35rem;
  }

  .toast-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .toast-button {
    background: linear-gradient(120deg, #66b2ff, #87f7ff);
    color: #05060a;
    border-radius: 999px;
    padding: 0.45rem 1.4rem;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .toast-button[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .toast-button.secondary {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: rgba(255, 255, 255, 0.9);
  }

  .error-banner {
    background: rgba(255, 99, 99, 0.12);
    border: 1px solid rgba(255, 99, 99, 0.4);
    color: #ffd7d7;
    padding: 0.9rem 1rem;
    border-radius: 14px;
  }

  .leaderboard-section {
    background: rgba(7, 10, 24, 0.8);
    border-radius: 20px;
    padding: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .leaderboard-header {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .leaderboard-title {
    color: #fff;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .leaderboard-more {
    align-self: flex-start;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: #fff;
    border-radius: 999px;
    padding: 0.4rem 1.1rem;
    cursor: pointer;
  }

  .achievements-open {
    align-self: flex-start;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    padding: 0.45rem 1.3rem;
    color: #fff;
    border: none;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .achievements-open:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  @media (max-width: 768px) {
    .game-frame {
      padding: 0.5rem;
    }

    .arpg-container {
      aspect-ratio: 4 / 3;
    }
  }
</style>
