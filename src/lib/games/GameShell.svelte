<script lang="ts">
  import { onMount } from 'svelte';
  import { startSession, completeSession, signCompletion } from '$lib/games/sdk';
  import type { LoomaGameFactory, LoomaGameInstance, LoomaGameResult } from '$lib/games/types';

  export let title: string;
  export let description: string;
  export let gameId: string;
  export let createGame: LoomaGameFactory;
  export let clientVersion: string = '1.0.0';

  let canvasEl: HTMLCanvasElement | null = null;
  let game: LoomaGameInstance | null = null;
  let session: Awaited<ReturnType<typeof startSession>> | null = null;
  let sessionStartTime = 0;
  let sessionVersion = clientVersion;
  let isLoading = true;
  let isSubmitting = false;
  let error: string | null = null;
  let lastResult: LoomaGameResult | null = null;
  let resizeAttached = false;
  let difficulty: 'easy' | 'normal' | 'hard' = 'normal';
  let audioOn = true;
  let bestScore: number | null = null;

  const detachResize = () => {
    if (resizeAttached && typeof window !== 'undefined') {
      window.removeEventListener('resize', resizeCanvas);
      resizeAttached = false;
    }
  };

  const destroyGame = () => {
    game?.destroy();
    game = null;
  };

  function resizeCanvas() {
    if (!canvasEl) return;
    const parent = canvasEl.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (!width || !height) return;
    canvasEl.width = Math.round(width);
    canvasEl.height = Math.round(height);
  }

  const getBestScoreKey = () => `looma-best-${gameId}`;

  function loadBestScore() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(getBestScoreKey());
      if (stored) {
        const parsed = Number(stored);
        if (!Number.isNaN(parsed)) {
          bestScore = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  function persistBestScore(value: number) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(getBestScoreKey(), String(value));
    } catch {
      // ignore
    }
  }

  async function submitResult(rawResult: LoomaGameResult) {
    if (!session || isSubmitting) return;
    isSubmitting = true;
    const activeSession = session;
    const safeScore = Math.max(0, Math.floor(rawResult.score ?? 0));
    let durationMs = Number.isFinite(rawResult.durationMs)
      ? Math.max(0, Math.floor(rawResult.durationMs ?? 0))
      : Math.max(0, Math.floor(performance.now() - sessionStartTime));

    const minDuration = Number(activeSession.caps?.minDurationMs ?? 0);
    if (minDuration > 0 && durationMs < minDuration) {
      const waitMs = minDuration - durationMs;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      durationMs = Math.max(minDuration, Math.floor(performance.now() - sessionStartTime));
    }

    try {
      const { signature } = await signCompletion({
        sessionId: activeSession.sessionId,
        score: safeScore,
        durationMs,
        nonce: activeSession.nonce,
        clientVersion: sessionVersion ?? clientVersion
      });

      await completeSession({
        sessionId: activeSession.sessionId,
        score: safeScore,
        durationMs,
        nonce: activeSession.nonce,
        signature,
        clientVersion: sessionVersion ?? clientVersion
      });

      lastResult = { score: safeScore, durationMs, meta: rawResult.meta };
      if (bestScore === null || safeScore > bestScore) {
        bestScore = safeScore;
        persistBestScore(safeScore);
      }
    } catch (err) {
      console.error(err);
      error = 'Failed to submit score, but your run finished.';
    } finally {
      if (session === activeSession) {
        session = null;
      }
      isSubmitting = false;
    }
  }

  async function initGame() {
    if (!canvasEl) return;
    destroyGame();
    detachResize();
    session = null;
    isLoading = true;
    error = null;
    lastResult = null;
    sessionVersion = clientVersion;

    try {
      session = await startSession(gameId, clientVersion);
      sessionVersion = clientVersion || session.caps?.minClientVer || '1.0.0';
      sessionStartTime = performance.now();

      resizeCanvas();
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', resizeCanvas);
        resizeAttached = true;
      }

      game = createGame({
        canvas: canvasEl,
        difficulty,
        audioEnabled: audioOn,
        onGameOver: async (result) => {
          destroyGame();
          await submitResult(result);
        }
      });

      game.start();
    } catch (err) {
      console.error(err);
      error = 'Failed to start game session.';
    } finally {
      isLoading = false;
    }
  }

  function restart() {
    destroyGame();
    detachResize();
    initGame();
  }

  function toggleDifficulty() {
    difficulty = difficulty === 'normal' ? 'hard' : 'normal';
    restart();
  }

  function toggleAudio() {
    audioOn = !audioOn;
    restart();
  }

  onMount(() => {
    loadBestScore();
    initGame();

    return () => {
      destroyGame();
      detachResize();
    };
  });
</script>

<div class="flex flex-col gap-4 h-full">
  <header class="flex flex-col gap-1">
    <h1 class="text-xl font-semibold text-white">{title}</h1>
    <p class="text-sm text-slate-300">{description}</p>
  </header>

  <section class="flex flex-col gap-3 flex-1">
    <div class="flex items-center justify-between text-xs sm:text-sm text-slate-200">
      <div class="flex gap-4">
        <span>Score: <strong>{lastResult ? lastResult.score : 0}</strong></span>
        {#if bestScore !== null}
          <span class="hidden sm:inline">Best: <strong>{bestScore}</strong></span>
        {/if}
      </div>
      <div class="flex gap-2">
        <button
          class="px-2 py-1 rounded-full border border-white/20 text-[11px] sm:text-xs hover:border-cyan-400/80"
          type="button"
          on:click={toggleDifficulty}
        >
          Diff: {difficulty === 'hard' ? 'Hard' : 'Normal'}
        </button>
        <button
          class="px-2 py-1 rounded-full border border-white/20 text-[11px] sm:text-xs hover:border-cyan-400/80"
          type="button"
          on:click={toggleAudio}
        >
          Audio: {audioOn ? 'On' : 'Off'}
        </button>
      </div>
    </div>

    <div class="relative w-full max-w-4xl mx-auto grow flex items-center justify-center">
      <div class="relative w-full" style="aspect-ratio: 16 / 9;">
        {#if error}
          <div class="absolute inset-0 flex items-center justify-center text-red-300 text-sm">
            {error}
          </div>
        {:else}
          <canvas
            bind:this={canvasEl}
            class="absolute inset-0 w-full h-full rounded-xl bg-black touch-none"
          />
        {/if}
      </div>
    </div>

    <div class="flex items-center justify-between text-xs sm:text-sm text-slate-200">
      {#if isLoading}
        <span>Starting session…</span>
      {:else if lastResult}
        <span>Last run: <strong>{lastResult.score}</strong></span>
      {:else}
        <span>Tap or press Space to jump.</span>
      {/if}

      <button
        class="px-3 py-1 rounded-md bg-cyan-500/80 hover:bg-cyan-400 text-xs font-semibold"
        type="button"
        on:click={restart}
      >
        Restart
      </button>
    </div>
  </section>
</div>
