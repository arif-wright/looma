<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    enterFullscreen,
    ensureFallbackLayout,
    isFullscreen,
    requestLandscape
  } from '$lib/games/fullscreen';
  import CompanionOverlay from './CompanionOverlay.svelte';
  import {
    awardShards,
    awardXP,
    completeSession,
    getMood,
    startSession,
    type GameSessionResult,
    type GameSessionServerResult,
    type GameSessionStart
  } from '$lib/games/sdk';

  export let gameId: string;
  export let onLoaded: (() => void | Promise<void>) | null = null;

  type SessionStartDetail = {
    sessionId: string;
    context: GameSessionStart;
  };

  const dispatch = createEventDispatcher<{
    sessionstart: SessionStartDetail;
    sessioncomplete: { sessionId: string; result: GameSessionResult };
    pause: void;
    resume: void;
    restart: void;
  }>();

  let containerEl: HTMLDivElement | null = null;
  let overlayVisible = true;
  let activating = false;
  let fullscreenActive = false;
  let hasLoaded = false;
  let overlayError: string | null = null;
  let isPaused = false;
  let showResults = false;
  let mood: { state: string; intensity: number } | null = null;
  let moodInterval: ReturnType<typeof setInterval> | null = null;

  let currentSessionId: string | null = null;
  let sessionContext: GameSessionStart | null = null;
  let sessionStartClock = 0;
  let sessionActive = false;

  let lastResult: GameSessionResult | null = null;
  let lastServerResult: GameSessionServerResult | null = null;
  let overlayRef: InstanceType<typeof CompanionOverlay> | null = null;

  const updateFullscreenState = () => {
    fullscreenActive = isFullscreen();
  };

  const syncContainerSize = () => {
    if (typeof document === 'undefined' || !containerEl) return;
    const root = document.getElementById('game-root');
    if (root) {
      const rect = root.getBoundingClientRect();
      containerEl.style.width = `${rect.width}px`;
      containerEl.style.height = `${rect.height}px`;
    } else {
      containerEl.style.width = '100vw';
      containerEl.style.height = '100vh';
    }
    ensureFallbackLayout();
  };

  const applySessionContext = (context: GameSessionStart) => {
    sessionContext = context;
    currentSessionId = context.sessionId;
    sessionStartClock = typeof window !== 'undefined' ? performance.now() : Date.now();
    sessionActive = true;
    dispatch('sessionstart', { sessionId: context.sessionId, context });
    startMoodUpdates();
  };

  const resetSessionContext = () => {
    currentSessionId = null;
    sessionContext = null;
    sessionStartClock = 0;
    sessionActive = false;
    stopMoodUpdates();
    mood = null;
  };

  const startNewSession = async () => {
    const context = await startSession(gameId);
    applySessionContext(context);
  };

  const activateGame = async () => {
    if (!containerEl || activating) return;
    activating = true;
    overlayError = null;
    try {
      await enterFullscreen(containerEl);
      await requestLandscape();
      await startNewSession();
      overlayVisible = false;
      if (!hasLoaded && typeof onLoaded === 'function') {
        await onLoaded();
      }
      hasLoaded = true;
    } catch (err) {
      console.error('[GameWrapper] activation failed', err);
      overlayVisible = true;
      overlayError = err instanceof Error ? err.message : 'Unable to start session';
    } finally {
      syncContainerSize();
      updateFullscreenState();
      activating = false;
    }
  };

  const awardFromResponse = async (response: GameSessionServerResult | null, payload: GameSessionResult) => {
    const xpReward = payload.rewards?.xp ?? response?.xpDelta ?? null;
    if (typeof xpReward === 'number' && xpReward !== 0) {
      await awardXP(xpReward, payload.extra?.xpReason ?? 'session_result');
    }

    const shardReward = payload.rewards?.shards ?? response?.currencyDelta ?? null;
    if (typeof shardReward === 'number' && shardReward !== 0) {
      await awardShards(shardReward, payload.extra?.shardsReason ?? 'session_result');
    }
  };

  const computeDuration = (input: number | undefined) => {
    if (typeof input === 'number' && Number.isFinite(input)) {
      return Math.max(0, Math.floor(input));
    }
    const now = typeof window !== 'undefined' ? performance.now() : Date.now();
    return Math.max(0, Math.floor(now - sessionStartClock));
  };

  const stopMoodUpdates = () => {
    if (moodInterval) {
      clearInterval(moodInterval);
      moodInterval = null;
    }
  };

  const refreshMood = async () => {
    try {
      mood = await getMood();
    } catch (err) {
      console.warn('[GameWrapper] failed to fetch companion mood', err);
    }
  };

  const startMoodUpdates = () => {
    stopMoodUpdates();
    void refreshMood();
    moodInterval = setInterval(() => {
      void refreshMood();
    }, 15000);
  };

  const companionReact = (type: string) => {
    if (!type) return;
    overlayRef?.triggerCompanionReact(type);
  };

  export function pause() {
    if (!sessionActive) return;
    isPaused = true;
    dispatch('pause', undefined);
  }

  export function resume() {
    if (!sessionActive) return;
    isPaused = false;
    dispatch('resume', undefined);
  }

  export function react(type: string) {
    companionReact(type);
  }

  export async function reportSessionResult(result: GameSessionResult) {
    if (!sessionActive || !currentSessionId) {
      console.warn('[GameWrapper] No active session to complete.');
      return;
    }

    const durationMs = computeDuration(result?.durationMs);
    const payload: GameSessionResult = {
      ...result,
      durationMs
    };

    try {
      const serverResponse = await completeSession(currentSessionId, payload);
      await awardFromResponse(serverResponse, payload);

      const enrichedResult: GameSessionResult = {
        ...payload,
        server: serverResponse ?? undefined
      };

      dispatch('sessioncomplete', { sessionId: currentSessionId, result: enrichedResult });
      lastResult = enrichedResult;
      lastServerResult = serverResponse ?? null;
      showResults = true;
    } catch (err) {
      console.error('[GameWrapper] failed to complete session', err);
      throw err;
    } finally {
      resetSessionContext();
      isPaused = false;
    }
  }

  const handleQuit = async () => {
    isPaused = false;
    showResults = false;
    if (sessionActive && currentSessionId) {
      try {
        await completeSession(currentSessionId, {
          success: false,
          durationMs: computeDuration(undefined),
          extra: { reason: 'quit' }
        });
      } catch (err) {
        console.warn('[GameWrapper] failed to abandon session', err);
      } finally {
        resetSessionContext();
      }
    }
    goto('/app/games');
  };

  const handlePlayAgain = async () => {
    showResults = false;
    lastResult = null;
    lastServerResult = null;
    overlayError = null;
    try {
      await startNewSession();
      dispatch('restart', undefined);
    } catch (err) {
      overlayVisible = true;
      overlayError = err instanceof Error ? err.message : 'Unable to start session';
      console.error('[GameWrapper] replay failed', err);
    }
  };

  export function restart() {
    if (showResults) {
      void handlePlayAgain();
    } else if (!sessionActive) {
      void activateGame();
    }
  }

  const handleBackToHub = () => {
    goto('/app/games');
  };

  const formatNumber = (value: number | null | undefined) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '0';
    return new Intl.NumberFormat('en-US').format(value);
  };

  const formatDurationSeconds = (ms: number | null | undefined) => {
    if (typeof ms !== 'number' || Number.isNaN(ms)) return '0s';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  $: moodClass = mood?.state ? `mood-${mood.state}` : '';

  onMount(() => {
    syncContainerSize();
    updateFullscreenState();

    const onFullscreenChange = () => {
      updateFullscreenState();
      syncContainerSize();
    };

    const onResize = () => {
      syncContainerSize();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      stopMoodUpdates();
    };
  });
</script>

<div
  id="game-container"
  data-game-id={gameId}
  bind:this={containerEl}
  data-fullscreen={fullscreenActive}
  class={moodClass}
>
  <slot />

  <CompanionOverlay bind:this={overlayRef} {mood} visible={sessionActive && !showResults} />

  {#if sessionActive && !overlayVisible && !showResults}
    <button class="pause-toggle" type="button" on:click={pause}>
      Pause
    </button>
  {/if}

  {#if overlayVisible}
    <button
      class="activation-overlay"
      type="button"
      on:click={activateGame}
      disabled={activating}
      aria-live="polite"
    >
      <span class="activation-label">
        {#if activating}
          Starting…
        {:else if overlayError}
          Tap to Retry
        {:else}
          Tap to Start
        {/if}
      </span>
      {#if overlayError}
        <span class="activation-hint">{overlayError}</span>
      {/if}
    </button>
  {/if}

  {#if isPaused}
    <div class="overlay-scrim">
      <div class="overlay-card">
        <h2>Game Paused</h2>
        <div class="overlay-actions">
          <button type="button" on:click={resume}>Resume</button>
          <button type="button" class="secondary" on:click={handleQuit}>
            Quit to Hub
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showResults && lastResult}
    <div class="overlay-scrim">
      <div class="overlay-card results">
        <h2>Run Complete</h2>
        <ul class="result-stats">
          <li>
            <span>Score</span>
            <strong>{formatNumber(lastResult.score ?? null)}</strong>
          </li>
          <li>
            <span>Duration</span>
            <strong>{formatDurationSeconds(lastResult.durationMs ?? null)}</strong>
          </li>
          <li>
            <span>XP</span>
            <strong>{formatNumber(lastResult.rewards?.xp ?? lastServerResult?.xpDelta ?? 0)}</strong>
          </li>
          <li>
            <span>Shards</span>
            <strong>{formatNumber(lastResult.rewards?.shards ?? lastServerResult?.currencyDelta ?? 0)}</strong>
          </li>
        </ul>
        <div class="overlay-actions">
          <button type="button" on:click={handlePlayAgain}>
            Play Again
          </button>
          <button type="button" class="secondary" on:click={handleBackToHub}>
            Back to Hub
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  #game-container {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
    transition: box-shadow 240ms ease, filter 240ms ease;
    z-index: 1;
  }

  #game-container.mood-excited {
    box-shadow: 0 0 32px rgba(236, 72, 153, 0.25);
  }

  #game-container.mood-calm {
    box-shadow: 0 0 26px rgba(56, 189, 248, 0.2);
  }

  #game-container.mood-focused {
    filter: contrast(1.04) saturate(1.05);
  }

  #game-container.mood-tired {
    filter: brightness(0.95);
  }

  .pause-toggle {
    position: absolute;
    top: 1rem;
    right: 1rem;
    padding: 0.35rem 0.9rem;
    font-size: 0.85rem;
    border-radius: 999px;
    border: none;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    cursor: pointer;
    z-index: 6;
  }

  .pause-toggle:hover,
  .pause-toggle:focus-visible {
    background: rgba(0, 0, 0, 0.75);
    outline: none;
  }

  .activation-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: none;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    font-size: 1.1rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-weight: 600;
    cursor: pointer;
    z-index: 5;
    transition: opacity 160ms ease;
    text-align: center;
    padding: 1rem;
  }

  .activation-label {
    letter-spacing: 0.2em;
  }

  .activation-hint {
    margin-top: 0.75rem;
    display: block;
    font-size: 0.85rem;
    letter-spacing: normal;
    opacity: 0.8;
    text-transform: none;
  }

  .activation-overlay:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.8);
    outline-offset: 4px;
  }

  .activation-overlay:disabled {
    cursor: progress;
    opacity: 0.7;
  }

  .overlay-scrim {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    z-index: 6;
  }

  .overlay-card {
    width: min(420px, 90vw);
    border-radius: 1.25rem;
    padding: 1.5rem;
    background: rgba(8, 12, 28, 0.95);
    color: #fff;
    text-align: center;
    box-shadow: 0 25px 60px rgba(5, 8, 19, 0.6);
  }

  .overlay-card h2 {
    margin: 0 0 0.75rem;
    font-size: 1.4rem;
  }

  .overlay-actions {
    margin-top: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .overlay-actions button {
    border: none;
    border-radius: 999px;
    padding: 0.65rem 1rem;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }

  .overlay-actions button:not(.secondary) {
    background: linear-gradient(90deg, #00e0ff, #ff00d4);
    color: #050611;
  }

  .overlay-actions button.secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  .result-stats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    text-align: left;
  }

  .result-stats li {
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.8rem;
  }

  .result-stats span {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    opacity: 0.7;
  }

  .result-stats strong {
    font-size: 1.1rem;
  }

  :global(.companion-overlay) {
    position: absolute;
    z-index: 9999;
    bottom: 2rem;
    left: 2rem;
    pointer-events: none;
  }
</style>
