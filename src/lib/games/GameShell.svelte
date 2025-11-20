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
  let difficulty: 'normal' | 'hard' = 'normal';
  let muted = false;

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
    const size = Math.min(rect.width, rect.height || 480);

    canvasEl.width = size;
    canvasEl.height = size;
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
        onGameOver: async (result) => {
          destroyGame();
          await submitResult(result);
        },
        config: {
          difficulty,
          muted
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

  onMount(() => {
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

  <div class="flex-1 flex flex-col gap-3">
    <div class="flex-1 flex items-center justify-center bg-black/40 rounded-xl border border-white/10">
      {#if error}
        <div class="text-red-300 text-sm">{error}</div>
      {:else}
        <canvas bind:this={canvasEl} class="max-w-full max-h-full rounded-lg bg-black" />
      {/if}
    </div>

    <div class="flex items-center justify-between gap-3 text-sm text-slate-200">
      <div class="flex flex-col gap-1">
        {#if isLoading}
          <span>Starting session…</span>
        {:else if lastResult}
          <span>Last score: <strong>{lastResult.score}</strong></span>
        {:else}
          <span>Good luck.</span>
        {/if}
        <span class="text-xs text-slate-400">
          Difficulty: {difficulty === 'normal' ? 'Normal' : 'Hard'} · Audio: {muted ? 'Muted' : 'On'}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="px-2 py-1 rounded-md border border-white/10 text-xs hover:border-cyan-400/80"
          on:click={() => ((muted = !muted), restart())}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>

        <button
          class="px-2 py-1 rounded-md border border-white/10 text-xs hover:border-cyan-400/80"
          on:click={() => ((difficulty = difficulty === 'normal' ? 'hard' : 'normal'), restart())}
        >
          Toggle difficulty
        </button>

        <button
          class="px-3 py-1 rounded-md bg-cyan-500/80 hover:bg-cyan-400 text-xs font-semibold"
          on:click={restart}
        >
          Restart
        </button>
      </div>
    </div>
  </div>
</div>
