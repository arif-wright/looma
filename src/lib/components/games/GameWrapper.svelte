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
  export let ready = false;
  export let gameInstance: { pause?: () => void; resume?: () => void; reset?: () => void } | null = null;

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
    ready = false;
  };

  const startNewSession = async () => {
    const context = await startSession(gameId);
    applySessionContext(context);
  };

  const activateGame = async () => {
    if (!containerEl || activating) return;
    activating = true;
    overlayError = null;
    ready = false;
    try {
      await enterFullscreen(containerEl);
      await requestLandscape();
      await startNewSession();
      overlayVisible = false;
      if (!hasLoaded && typeof onLoaded === 'function') {
        await onLoaded();
      }
      hasLoaded = true;
      ready = true;
    } catch (err) {
      console.error('[GameWrapper] activation failed', err);
      overlayVisible = true;
      overlayError = err instanceof Error ? err.message : 'Unable to start session';
      ready = false;
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
    gameInstance?.pause?.();
    dispatch('pause', undefined);
  }

  export function resume() {
    if (!sessionActive) return;
    isPaused = false;
    gameInstance?.resume?.();
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

    ready = false;
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
    } catch (err) {
      console.error('[GameWrapper] failed to complete session', err);
      lastResult = payload;
      lastServerResult = null;
    } finally {
      showResults = true;
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

  const handlePlayAgain = () => {
    resetSessionContext();
    showResults = false;
    lastResult = null;
    lastServerResult = null;
    overlayError = null;
    overlayVisible = true;
    ready = false;
    gameInstance?.reset?.();
    dispatch('restart', undefined);
  };

  export function restart() {
    handlePlayAgain();
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
  <div class="game-surface">
    <slot />
  </div>

  <CompanionOverlay bind:this={overlayRef} {mood} visible={sessionActive && !showResults} />

  {#if sessionActive && !overlayVisible && !showResults}
    <button class="pause-toggle" type="button" on:click={pause}>
      Pause
    </button>
  {/if}

  {#if overlayVisible}
    <button class="start-overlay" type="button" on:click={activateGame} disabled={activating} aria-live="polite">
      <div class="pulse-circle"></div>
      <div class="start-orb"></div>
      <h2 class="start-title">{activating ? 'Preparing…' : overlayError ? 'Tap to Retry' : 'Tap to Begin'}</h2>
      <p class="start-subtitle">Enter fullscreen to play</p>
      {#if overlayError}
        <span class="activation-hint">{overlayError}</span>
      {/if}
    </button>
  {/if}

  {#if isPaused}
    <div class="pause-overlay">
      <div class="pause-card">
        <h2>Paused</h2>
        <button type="button" class="primary" on:click={resume}>Resume</button>
        <button type="button" class="secondary" on:click={handleQuit}>
          Exit to Hub
        </button>
      </div>
    </div>
  {/if}

  {#if showResults && lastResult}
    <div class="results-overlay">
      <div class="results-card">
        <h2>Run Complete</h2>
        <div class="results-stats">
          <div class="stat">
            <span class="label">Score</span>
            <span class="value">{formatNumber(lastResult.score ?? null)}</span>
          </div>
          <div class="stat">
            <span class="label">Duration</span>
            <span class="value">{formatDurationSeconds(lastResult.durationMs ?? null)}</span>
          </div>
          <div class="stat">
            <span class="label">XP</span>
            <span class="value">+{formatNumber(lastResult.rewards?.xp ?? lastServerResult?.xpDelta ?? 0)}</span>
          </div>
          <div class="stat">
            <span class="label">Shards</span>
            <span class="value">+{formatNumber(lastResult.rewards?.shards ?? lastServerResult?.currencyDelta ?? 0)}</span>
          </div>
        </div>
        <div class="results-actions">
          <button type="button" class="primary" on:click={handlePlayAgain}>Play Again</button>
          <button type="button" class="secondary" on:click={handleBackToHub}>Exit</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  #game-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
    transition: box-shadow 240ms ease, filter 240ms ease;
    z-index: 1;
    padding-top: env(safe-area-inset-top, 0px);
    padding-right: env(safe-area-inset-right, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    padding-left: env(safe-area-inset-left, 0px);
  }

  .game-surface {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
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

  .start-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
    border: none;
    background: rgba(3, 6, 20, 0.92);
    color: #fff;
    cursor: pointer;
    z-index: 5;
    text-align: center;
    font-family: 'Inter', system-ui, sans-serif;
  }

  .start-overlay:disabled {
    cursor: progress;
  }

  .pulse-circle {
    width: 140px;
    height: 140px;
    border-radius: 50%;
    border: 2px solid rgba(60, 250, 255, 0.7);
    animation: pulse 1.8s ease-in-out infinite;
    box-shadow: 0 0 26px rgba(60, 250, 255, 0.3);
  }

  .start-orb {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(124, 251, 255, 0.9), rgba(124, 251, 255, 0));
    filter: blur(1px);
  }

  .start-title {
    margin: 0;
    font-size: 1.6rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .start-subtitle,
  .activation-hint {
    font-size: 0.9rem;
    opacity: 0.75;
  }

  .activation-hint {
    margin-top: 0.5rem;
  }

  .pause-overlay,
  .results-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(12px);
    background: rgba(2, 6, 19, 0.65);
    z-index: 6;
    animation: fadeIn 300ms ease-out;
    padding: calc(env(safe-area-inset-top, 0px) + 16px)
      calc(env(safe-area-inset-right, 0px) + 16px)
      calc(env(safe-area-inset-bottom, 0px) + 16px)
      calc(env(safe-area-inset-left, 0px) + 16px);
  }

  .pause-card,
  .results-card {
    width: min(420px, 90vw);
    background: rgba(10, 16, 35, 0.8);
    border-radius: 20px;
    border: 2px solid rgba(124, 251, 255, 0.25);
    box-shadow: 0 20px 55px rgba(3, 201, 255, 0.25);
    padding: 1.75rem;
    text-align: center;
    color: #f8fbff;
  }

  .pause-card h2,
  .results-card h2 {
    margin-top: 0;
    margin-bottom: 1rem;
    letter-spacing: 0.1em;
  }

  .pause-card button,
  .results-actions button {
    width: 100%;
    border-radius: 999px;
    padding: 0.85rem 1rem;
    border: none;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    margin-top: 0.6rem;
  }

  .primary {
    background: linear-gradient(90deg, #00eaff, #ff4df5);
    color: #04060f;
  }

  .secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  .results-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .stat {
    padding: 0.85rem;
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.05);
    text-align: left;
  }

  .stat .label {
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    opacity: 0.7;
  }

  .stat .value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #fefefe;
  }

  .results-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  @keyframes pulse {
    0% {
      opacity: 0.6;
      transform: scale(0.9);
    }
    50% {
      opacity: 1;
      transform: scale(1.08);
    }
    100% {
      opacity: 0.6;
      transform: scale(0.9);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  :global(.companion-overlay) {
    position: absolute;
    z-index: 9999;
    bottom: 2rem;
    left: 2rem;
    pointer-events: none;
  }
</style>
