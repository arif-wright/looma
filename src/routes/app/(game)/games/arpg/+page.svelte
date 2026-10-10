<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import OrbPanel from '$lib/components/ui/OrbPanel.svelte';
  import LeaderboardTabs from '$lib/components/games/LeaderboardTabs.svelte';
  import LeaderboardList from '$lib/components/games/LeaderboardList.svelte';
  import AchievementToastStack from '$lib/components/games/AchievementToastStack.svelte';
  import { bootGame, shutdownGame, type ArpgControls } from '$lib/games/arpg/main';
  import { createTownSession, type TownSession, type TownSessionState } from '$lib/games/arpg/townSession';
  import {
    abandonSession,
    completeSession,
    fetchPlayerState,
    getGameErrorKind,
    getGameErrorMessage,
    startSession,
    signCompletion,
    type GameSessionServerResult,
    watchGameOwner,
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
      name: 'Memvoya ARPG',
      min_version: '1.0.0',
      max_score: 150000
    };
  const minVersion = game.min_version ?? '1.0.0';
  const devBanner = import.meta.env.DEV;

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
  let controls: ArpgControls | null = null;
  let townSession: TownSession | null = null;
  let townState: TownSessionState | null = null;
  let bootLoading = false;
  let bootController: AbortController | null = null;
  let reward: SessionReward | null = null;
  let ritualCompletions: CompanionRitual[] = [];
  let errorMessage: string | null = null;
  let status = 'Preparing Lantern Square…';
  let mounted = false;
  let workGeneration = 0;
  let pageBlocked = false;
  let startRecoveryAction: 'refresh' | 'signin' | null = null;

  const stopPageWork = () => {
    ++workGeneration;
    bootController?.abort();
    bootController = null;
    townSession?.dispose();
    townSession = null;
    controls = null;
    bootLoading = false;
    if (containerEl) shutdownGame(containerEl);
  };

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
  const leaderboardRequests: Record<LeaderboardScope, number> = { daily: 0, weekly: 0, alltime: 0 };

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
    if (!mounted || pageBlocked) return;
    const generation = workGeneration;
    const request = ++leaderboardRequests[scope];
    const isCurrent = () => mounted && !pageBlocked && generation === workGeneration && request === leaderboardRequests[scope];
    mutateLeaderboardState(scope, { loading: true });
    const previousRows = leaderboardStates[scope].rows;

    try {
      const response = await fetch(
        `/api/leaderboard/${slug}/${scope}?page=${page}&limit=${leaderboardPageSize}`
      );
      if (!response.ok) throw new Error('Unable to load leaderboard');
      const payload = await response.json();
      if (!isCurrent()) return;
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
      if (!isCurrent()) return;
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
          ? {
              name: reward.companionBonus.name,
              bondLevel: reward.companionBonus.bondLevel,
              xpMultiplier: reward.companionBonus.xpMultiplier
            }
          : null
      })
    : null;

  const acceptSettlement = (result: GameSessionServerResult, isCurrent: () => boolean) => {
    if (!isCurrent()) return;
    // Preserve the SDK's optional session-summary counter. Only this confirmed,
    // current-owner receipt may update it; blocked storage never invalidates save.
    try {
      const current = Number(window.sessionStorage.getItem('looma_session_games_played') ?? '0');
      const next = Number.isFinite(current) && current > 0 ? Math.floor(current) + 1 : 1;
      window.sessionStorage.setItem('looma_session_games_played', String(next));
    } catch (storageErr) {
      console.debug('[arpg] session counter unavailable', storageErr);
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

    status = 'Result saved. Town is untimed; depart again whenever you’re ready.';
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

    // The captured run/page owner must still match after every asynchronous read.
    void (async () => {
      try {
        const latest = await fetchPlayerState();
        if (isCurrent()) applyPlayerState(latest);
      } catch (refreshErr) {
        if (isCurrent()) console.warn('[arpg] failed to refresh player state', refreshErr);
      }
    })();
    void loadLeaderboard(leaderboardScope);
  };

  const reflectTownState = (next: TownSessionState) => {
    townState = next;
    errorMessage = null;
    startRecoveryAction = null;
    switch (next.phase) {
      case 'starting':
        reward = null;
        ritualCompletions = [];
        status = 'Starting your expedition…';
        controls?.setTownStatus('starting', status);
        break;
      case 'expedition':
        status = 'Expedition in progress. Return to town to save your result.';
        break;
      case 'waiting':
        status = `Back in town. Your result is fixed; saving after the minimum session time (up to ${Math.ceil(next.waitMs / 1000)} seconds).`;
        controls?.setTownStatus('saving', 'Result fixed. Waiting for minimum session time…');
        break;
      case 'saving':
        status = 'Back in town. Saving your expedition result…';
        controls?.setTownStatus('saving', 'Saving this expedition…');
        break;
      case 'retry':
        status = 'Save not confirmed. Retry this result before departing again.';
        errorMessage = next.issue ? getGameErrorMessage(next.issue.error, 'complete') : null;
        controls?.setTownStatus('retry', 'Save not confirmed. Retry the same result.');
        break;
      case 'rejected':
        status = 'The server rejected this expedition result. New departures are blocked.';
        errorMessage = (next.issue?.error as { code?: string })?.code === 'invalid_score_rate'
          ? 'This expedition exceeded the server score-rate limit. Its score and duration are fixed; waiting in town cannot make this result valid.'
          : 'This result cannot be changed or retried here. Return to the hub to review your account before another expedition.';
        controls?.setTownStatus('blocked', 'Result rejected. Review the message below.');
        break;
      case 'blocked':
        startRecoveryAction = 'refresh';
        if (next.issue?.context === 'entry') {
          // A failed area rebuild can leave a partial world. Stop its renderer,
          // rather than letting another accepted session silently target it.
          controls = null;
          if (containerEl) shutdownGame(containerEl);
          status = 'The dungeon could not open. Refresh to reload the town.';
          errorMessage = 'A session was already created and may count toward your daily limit; it was not cancelled. Refresh before starting another expedition.';
        } else {
          status = 'Expeditions unavailable with the current server limits.';
          errorMessage = 'The server timing limits do not fit this expedition. Refresh before trying again. A session was already created and may count toward your daily limit; it was not cancelled.';
          controls?.setTownStatus('blocked', 'Server timing limits incompatible. Refresh the page.');
        }
        break;
      case 'ready':
        status = 'Town is untimed. Depart when you’re ready.';
        if (next.issue) {
          errorMessage = getGameErrorMessage(next.issue.error, 'start');
          if (next.issue.sessionCreated) errorMessage += ' A session was already created and may count toward your daily limit; it was not cancelled.';
          startRecoveryAction = getGameErrorKind(next.issue.error, 'start') === 'unauthorized'
            ? 'signin'
            : (next.issue.error as { code?: string })?.code === 'start_account_changed' ? 'refresh' : null;
          status = 'Departure was not confirmed. Review the message before trying again.';
        }
        controls?.setTownStatus(startRecoveryAction ? 'blocked' : 'ready',
          next.issue ? 'Departure not confirmed. Check the message below.' : 'Town is untimed. Depart when ready.');
        break;
    }
  };

  const depart = () => {
    if (!mounted || pageBlocked || bootLoading || startRecoveryAction) return;
    void townSession?.depart();
  };

  const bootTown = async () => {
    if (!mounted || pageBlocked || bootLoading || townSession) return;
    bootLoading = true;
    const generation = ++workGeneration;
    const controller = new AbortController();
    bootController = controller;
    const isCurrent = () => mounted && !pageBlocked && generation === workGeneration && !controller.signal.aborted;
    let bootTimedOut = false;
    let bootTimer: ReturnType<typeof setTimeout> | null = null;
    errorMessage = null;
    status = 'Loading Lantern Square…';
    try {
      if (!containerEl) await tick();
      if (!isCurrent()) return;
      if (!containerEl) throw new Error('The game container is unavailable.');
      bootTimer = setTimeout(() => { bootTimedOut = true; controller.abort(); }, 30_000);
      await bootGame(containerEl, {
        signal: controller.signal,
        onControls: (nextControls) => {
          if (isCurrent()) controls = nextControls;
        },
        onDepartureRequested: () => { if (isCurrent()) depart(); },
        onRetryRequested: () => { if (isCurrent()) void townSession?.retry(); },
        onGameOver: (score, durationMs) => {
          if (isCurrent()) void townSession?.returnToTown(score, durationMs);
        }
      });
      if (!isCurrent()) return;
      if (!controls) throw new Error('The town controls are unavailable.');
      townSession = createTownSession({
        start: (signal) => startSession(slug, 'standard', {
          clientVersion: minVersion, source: 'arpg_page'
        }, { signal, ownerId: get(page).data.user?.id ?? null }),
        beginExpedition: (maximum) => controls?.beginExpedition(maximum),
        sign: async (session, result) => {
          const signed = await signCompletion({
            sessionId: session.sessionId, slug, nonce: session.nonce,
            score: result.score, durationMs: result.durationMs, clientVersion: minVersion
          });
          return signed.signature;
        },
        // Use the explicit request overload so SDK event/reaction continuations
        // cannot update a different owner's UI after this screen is invalidated.
        complete: (session, result, signature) => completeSession({
          sessionId: session.sessionId, nonce: session.nonce, signature,
          clientVersion: minVersion, ...result
        }),
        abandon: abandonSession,
        now: () => performance.now(),
        onState: (next) => { if (isCurrent()) reflectTownState(next); },
        onSettled: (result, isRunCurrent) => {
          acceptSettlement(result, () => isCurrent() && isRunCurrent());
        }
      });
      reflectTownState(townSession.state);
    } catch (err) {
      if (!mounted || pageBlocked || generation !== workGeneration) return;
      controls = null;
      if (containerEl) shutdownGame(containerEl);
      errorMessage = bootTimedOut
        ? 'Town took too long to load. Try loading it again. No expedition session was started.'
        : getGameErrorMessage(err, 'load');
      status = 'Town could not load. No expedition session was started.';
    } finally {
      if (bootTimer) clearTimeout(bootTimer);
      if (generation === workGeneration) bootLoading = false;
    }
  };

  const replay = () => {
    if (bootLoading) return;
    if (startRecoveryAction === 'refresh') {
      window.location.reload();
    } else if (startRecoveryAction === 'signin') {
      void goto('/app/auth');
    } else if (townState?.phase === 'retry') {
      void townSession?.retry();
    } else if (!townSession) {
      void bootTown();
    } else {
      depart();
    }
  };

  $: actionDisabled = bootLoading || ['starting', 'expedition', 'waiting', 'saving', 'rejected'].includes(townState?.phase ?? '');
  $: actionLabel = startRecoveryAction === 'refresh' ? 'Refresh page'
    : startRecoveryAction === 'signin' ? 'Sign in'
    : bootLoading ? 'Loading town…'
    : townState?.phase === 'starting' ? 'Starting…'
    : townState?.phase === 'expedition' ? 'Expedition in progress…'
    : townState?.phase === 'waiting' ? 'Waiting to save…'
    : townState?.phase === 'saving' ? 'Saving…'
    : townState?.phase === 'retry' ? 'Retry save'
    : townState?.phase === 'rejected' ? 'Result rejected'
    : !townSession ? 'Retry loading town' : 'Depart on expedition';

  const goBack = () => {
    // Successful navigation unmounts and invalidates this screen. Do not stop a
    // live town for a cancelled/failed navigation or an in-place query change.
    void goto('/app/games').catch(() => {
      if (mounted && !pageBlocked) errorMessage = 'Unable to return to the hub. Please try again.';
    });
  };

  onMount(() => {
    mounted = true;
    const stopWatchingOwner = watchGameOwner((ownerId) => {
      if (!mounted || pageBlocked) return;
      pageBlocked = true;
      stopPageWork();
      townState = null;
      reward = null;
      ritualCompletions = [];
      startRecoveryAction = ownerId ? 'refresh' : 'signin';
      errorMessage = ownerId
        ? 'Your account changed. Refresh before playing again. Any expedition already created was not cancelled.'
        : 'You signed out. Sign in before playing again. Any expedition already created was not cancelled.';
      status = 'Play stopped because your account changed.';
    }, get(page).data.user?.id ?? null);
    const bootstrap = async () => {
      await tick();
      if (!mounted || pageBlocked) return;
      await bootTown();
      if (mounted && !pageBlocked) void loadLeaderboard('alltime');
    };
    void bootstrap();
    return () => {
      mounted = false;
      stopPageWork();
      stopWatchingOwner();
    };
  });

</script>

<svelte:head>
  <title>Memvoya — {game.name}</title>
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
        <p class="text-sm text-white/70">Rest in Lantern Square, explore two dungeon floors, and return to save your expedition.</p>
      </header>

      <div class="game-frame">
        <div class="arpg-container" bind:this={containerEl}></div>
      </div>

      <p class="game-status" role="status" aria-live="polite">{status}</p>

      <div class="session-actions">
        <button
          class="toast-button"
          type="button"
          on:click={replay}
          disabled={actionDisabled}
        >
          {actionLabel}
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
            <p class="reward-toast__detail">Ritual complete: {ritualCompletions[0]?.title ?? 'Complete'}</p>
          {/if}
          <div class="toast-actions">
            <button class="toast-button" type="button" on:click={replay}>
              Depart again
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

  /* A narrow portrait view needs room for the complete town route. Preserve
     desktop 16:9 and short-landscape 4:3; this does not add touch controls. */
  @media (max-width: 640px) and (orientation: portrait) {
    .arpg-container {
      aspect-ratio: 3 / 4;
    }
  }
</style>
