<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { loadOrbfieldSkin, ORBFIELD_SKIN_URLS, type OrbfieldSkinLoad } from './orbfieldSkin';
  import { goto } from '$app/navigation';
  import {
    startSession, completeSession, abandonSession,
    getGameErrorMessage, getGameErrorKind,
    type GameSessionStart, type GameSessionServerResult
  } from '$lib/games/sdk';
  import { applyRitualUpdate } from '$lib/stores/companionRituals';
  import type { CompanionRitual } from '$lib/companions/rituals';
  import type { LoomaGameResult } from '$lib/games/types';
  import type { OrbfieldOptions, OrbfieldInstance, OrbfieldState } from '$lib/games/dodgeSurvive';

  export let title: string;
  export let description: string;
  export let gameId: string;
  export let createGame: (options: OrbfieldOptions) => OrbfieldInstance;
  export let clientVersion = '1.0.0';
  export let fullScreen = true;

  type Phase = 'ready' | 'starting' | 'playing' | 'paused' | 'saving' | 'complete' | 'practice' | 'start-error' | 'save-error';
  let phase: Phase = 'ready';
  let canvasEl: HTMLCanvasElement | null = null;
  let statusEl: HTMLHeadingElement | null = null;
  let game: OrbfieldInstance | null = null;
  let session: GameSessionStart | null = null;
  let generation = 0;
  let mounted = false;
  let pauseOnStart = false;
  let art: OrbfieldSkinLoad = { assets: {}, complete: false };
  let artState: 'loading' | 'ready' | 'fallback' = 'loading';
  let artTask: Promise<OrbfieldSkinLoad> | null = null;
  let motionPreference: MediaQueryList | null = null;
  let errorMessage = '';
  let signInRequired = false;
  let result: LoomaGameResult | null = null;
  let reward: GameSessionServerResult | null = null;
  let completedRituals: CompanionRitual[] = [];
  let roundLimit = 60_000;
  let minimumDuration = 10_000;
  let state: OrbfieldState = { score: 0, elapsedMs: 0, slowCharges: 3, slowMoActive: false, playerX: 480, playerY: 270 };

  const stopGame = () => { game?.destroy(); game = null; };
  const releaseSession = () => { if (session) abandonSession(session.sessionId); session = null; };
  const isCurrent = (token: number) => mounted && generation === token;
  const focusStatus = async (token: number) => { await tick(); if (isCurrent(token)) statusEl?.focus(); };

  const finishRound = async (raw: LoomaGameResult, token: number, context: GameSessionStart) => {
    if (!isCurrent(token) || phase !== 'playing') return;
    stopGame();
    const finishedResult: LoomaGameResult = { score: Math.max(0, Math.floor(raw.score)), durationMs: Math.max(0, Math.floor(raw.durationMs)), ...(raw.meta ? { meta: raw.meta } : {}) };
    result = finishedResult;
    // An early collision remains a real short round, never padded with waiting time to earn rewards.
    if (finishedResult.durationMs < minimumDuration) {
      phase = 'practice'; releaseSession(); void focusStatus(token); return;
    }
    phase = 'saving';
    try {
      const response = await completeSession(context.sessionId, {
        score: finishedResult.score, durationMs: finishedResult.durationMs,
        success: raw.meta?.survived_round === 1, stats: raw.meta ?? {}
      });
      if (!isCurrent(token)) return;
      if (!response || !Number.isSafeInteger(response.xpDelta) || response.xpDelta < 0 || !Number.isSafeInteger(response.currencyDelta) || response.currencyDelta < 0) {
        throw new Error('No confirmed reward response.');
      }
      reward = response;
      if (response.rituals?.list) applyRitualUpdate(response.rituals.list);
      completedRituals = response.rituals?.completed ?? [];
      phase = 'complete';
      // Show this confirmed response only. The legacy player-state read needs a separate
      // owner-isolation/canonical-wallet review; do not introduce another call here.
    } catch (error) {
      if (!isCurrent(token)) return;
      const kind = getGameErrorKind(error, 'complete');
      signInRequired = kind === 'unauthorized';
      errorMessage = signInRequired ? getGameErrorMessage(error, 'complete')
        : kind === 'network' ? 'The connection ended before we could confirm the result.'
        : 'The server did not return a confirmed result.';
      phase = 'save-error';
    } finally {
      abandonSession(context.sessionId);
      if (isCurrent(token)) { session = null; void focusStatus(token); }
    }
  };

  const startRound = async () => {
    if (!mounted || !canvasEl || ['starting', 'playing', 'paused', 'saving'].includes(phase)) return;
    const token = ++generation;
    stopGame(); releaseSession();
    pauseOnStart = document.hidden;
    phase = 'starting'; errorMessage = ''; signInRequired = false;
    result = null; reward = null; completedRituals = [];
    state = { score: 0, elapsedMs: 0, slowCharges: 3, slowMoActive: false, playerX: 480, playerY: 270 };
    try {
      // Finish the bounded cosmetic preload before creating a server session.
      const loadedArt = artTask ? await artTask : art;
      if (!isCurrent(token)) return;
      const context = await startSession(gameId, 'standard', { clientVersion, source: 'orbfield' });
      if (!isCurrent(token)) { abandonSession(context.sessionId); return; }
      session = context;
      const min = Number(context.caps?.minDurationMs ?? 10_000);
      const max = Number(context.caps?.maxDurationMs ?? 600_000);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < Math.max(min, 1)) {
        throw new Error('Invalid session limits.');
      }
      minimumDuration = Math.floor(min);
      roundLimit = Math.min(max, Math.max(60_000, minimumDuration));
      game = createGame({
        canvas: canvasEl, maxDurationMs: roundLimit,
        skinAssets: loadedArt.assets, reducedMotion: () => motionPreference?.matches ?? true,
        onStateChange: (next) => { if (isCurrent(token)) state = next; },
        onGameOver: (next) => { void finishRound(next, token, context); }
      });
      phase = 'playing'; game.start();
      if ((pauseOnStart || document.hidden) && phase === 'playing') { game.pause(); phase = 'paused'; }
      await tick();
      if (isCurrent(token) && phase === 'playing') canvasEl?.focus({ preventScroll: true });
    } catch (error) {
      if (!isCurrent(token)) return;
      stopGame(); releaseSession();
      errorMessage = getGameErrorMessage(error, 'start');
      signInRequired = getGameErrorKind(error, 'start') === 'unauthorized';
      phase = 'start-error'; void focusStatus(token);
    }
  };
  const pauseRound = () => { if (phase === 'playing') { phase = 'paused'; game?.pause?.(); } };
  const resumeRound = () => {
    if (phase !== 'paused') return;
    phase = 'playing'; game?.resume?.(); canvasEl?.focus({ preventScroll: true });
  };
  const exit = () => {
    ++generation; stopGame(); releaseSession();
    void goto('/app/games');
  };
  const signIn = () => { ++generation; stopGame(); releaseSession(); void goto('/app/auth'); };
  const onBackground = () => {
    if (phase === 'starting') pauseOnStart = true;
    else pauseRound();
  };
  const onVisibility = () => { if (document.hidden) onBackground(); };
  onMount(() => {
    mounted = true;
    const artController = new AbortController();
    motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    artTask = loadOrbfieldSkin({ signal: artController.signal });
    void artTask.then((loaded) => {
      if (!mounted) return;
      art = loaded; artState = loaded.complete ? 'ready' : 'fallback';
    });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBackground);
    return () => {
      mounted = false; artController.abort(); motionPreference = null; ++generation; stopGame(); releaseSession();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBackground);
    };
  });
  $: finished = ['complete', 'practice', 'save-error'].includes(phase);
  $: statusTitle = phase === 'complete' ? 'Round complete' : phase === 'practice' ? 'Practice round'
    : phase === 'save-error' ? 'We couldn’t confirm your rewards' : phase === 'start-error' ? 'Couldn’t start this round'
    : phase === 'paused' ? 'Paused' : phase === 'saving' ? 'Saving your round…' : '';
</script>

<div class:full-screen={fullScreen} class="orbfield-shell" data-testid="orbfield-game" data-phase={phase} data-art-state={artState}>
  <header>
    <button class="text-button" type="button" on:click={exit}>← Back to Play</button>
    <div class="title-row">
      <div><p class="eyebrow">Memvoya / Play</p><h1>{title}</h1><p class="skin-name">Moonlit Conservatory</p></div>
      <div class="companion-card" aria-label="Muse companion skin">
        {#if art.assets.companion}<img src={ORBFIELD_SKIN_URLS.companion} width="92" height="92" alt="Muse, a little lavender dragon" />{/if}
        <span>Muse <small>by your side</small></span>
      </div>
    </div>
    <p id="orbfield-instructions">{description}</p>
  </header>
  <section class="play-panel" aria-label="Orbfield round">
    <div class="round-stats" aria-label="Round progress">
      <span>Score <strong data-testid="orbfield-score">{state.score}</strong></span>
      <span>Time <strong>{Math.floor(state.elapsedMs / 1000)} / {Math.ceil(roundLimit / 1000)}s</strong></span>
      <span>Time warps <strong>{state.slowCharges}</strong></span>
    </div>
    <div class="canvas-frame">
      {#if art.assets.background}<img class="arena-preview" src={ORBFIELD_SKIN_URLS.background} alt="" aria-hidden="true" />{/if}
      <canvas bind:this={canvasEl} width="960" height="540" tabindex="0" aria-label="Orbfield play area"
        aria-describedby="orbfield-instructions" data-testid="orbfield-canvas"></canvas>
      {#if phase === 'ready' || phase === 'starting'}
        <div class="canvas-message">
          <div class="intro-art" aria-hidden="true">
            {#if art.assets.player}<img class="intro-pearl" src={ORBFIELD_SKIN_URLS.player} alt="" />{/if}
            {#if art.assets.companion}<img class="intro-muse" src={ORBFIELD_SKIN_URLS.companion} alt="" />{/if}
          </div>
          <p class="intro-title">A little courage, together.</p>
          <p>Guide your pearl wisp. Dodge the amber thorns.</p>
          <button class="primary" type="button" on:click={startRound} disabled={phase === 'starting'}>
            {phase === 'starting' ? 'Starting…' : 'Start round'}
          </button>
        </div>
      {/if}
    </div>
    <div class="skin-legend" aria-label="Orbfield visual guide">
      <span>{#if art.assets.player}<img src={ORBFIELD_SKIN_URLS.player} alt="" />{/if}Your wisp</span>
      <span>{#if art.assets.hazard}<img src={ORBFIELD_SKIN_URLS.hazard} alt="" />{/if}Avoid thorns</span>
      <span class="skin-status">{artState === 'loading' ? 'Preparing artwork…' : artState === 'fallback' ? 'Simplified art mode' : 'Moonlit skin'}</span>
    </div>
    {#if phase === 'playing' || phase === 'paused'}
      <div class="controls">
        <button class="primary" type="button" on:click={() => game?.activateSlowMo()}
          disabled={phase !== 'playing' || state.slowCharges === 0 || state.slowMoActive}
          aria-label={`Time warp (${state.slowCharges} remaining)`}>
          {state.slowMoActive ? 'Time warp active' : 'Time warp'} · {state.slowCharges}
        </button>
        <button type="button" on:click={phase === 'paused' ? resumeRound : pauseRound}>
          {phase === 'paused' ? 'Resume' : 'Pause'}
        </button>
      </div>
    {/if}
    {#if statusTitle}
      <section class="round-status" aria-live="polite" aria-atomic="true">
        <h2 bind:this={statusEl} tabindex="-1">{statusTitle}</h2>
        {#if phase === 'paused'}
          <p>Your round is paused. Resume whenever you’re ready.</p>
        {:else if phase === 'saving'}
          <p>Your score is {result?.score}. Checking the server’s result.</p>
        {:else if phase === 'start-error'}
          <p>{errorMessage}</p>
          <button class="primary" type="button" on:click={signInRequired ? signIn : startRound}>{signInRequired ? 'Sign in' : 'Try again'}</button>
        {:else if finished}
          <p>Score {result?.score} · {((result?.durationMs ?? 0) / 1000).toFixed(1)} seconds</p>
          {#if reward}
            <p data-testid="orbfield-rewards">+{reward.xpDelta} XP · +{reward.currencyDelta} shards</p>
            {#if reward.companionBonus}
              <p>Companion bonus: {reward.companionBonus.name?.trim() || 'Your companion'}.</p>
            {/if}
            {#each completedRituals as ritual}<p>Completed: {ritual.title}</p>{/each}
          {:else if phase === 'practice'}
            <p>Rounds under {Math.ceil(minimumDuration / 1000)} seconds are practice. No rewards were requested.</p>
          {:else}
            <p>{errorMessage} Your run may already have saved. You can return to Play or start a new round.</p>
          {/if}
          <div class="controls">
            <button class="primary" type="button" on:click={signInRequired ? signIn : startRound}>{signInRequired ? 'Sign in' : 'Play again'}</button>
            <button type="button" on:click={exit}>Back to Play</button>
          </div>
        {/if}
      </section>
    {/if}
  </section>
  <p class="quiet">Only your pearl wisp can be hit; Muse is a companion visual. Move with your pointer, drag on touch, or focus the play area and use arrow keys or WASD. Space or Time warp slows nearby motion. Leaving early doesn’t reduce your bond.</p>
</div>

<style>
  .orbfield-shell { box-sizing: border-box; width: 100%; min-height: 100%; padding: 1rem; background: radial-gradient(ellipse at 50% 0, #332345 0, #181221 55%, #110e1b 100%); color: #f4edf9; overflow-y: auto; }
  .full-screen { height: 100%; min-height: 0; }
  header, .play-panel, .quiet { max-width: 960px; margin: 0 auto; }
  header { padding-bottom: 1rem; }
  .title-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .eyebrow { font-size: .64rem; letter-spacing: .24em; text-transform: uppercase; color: #ceb1dc; }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-size: clamp(2rem, 5vw, 3.2rem); font-weight: 500; letter-spacing: -.035em; line-height: 1.1; margin: .2rem 0 .25rem; }
  .skin-name { font-family: Georgia, 'Times New Roman', serif; color: #e0c2db; font-size: 1rem; }
  .companion-card { display: flex; align-items: center; flex-shrink: 0; gap: .1rem; }
  .companion-card img { width: 92px; height: 92px; object-fit: contain; }
  .companion-card span { color: #f5ddeb; font-size: .875rem; }
  .companion-card small { display: block; color: #c7b7d0; font-size: .7rem; margin-top: .25rem; }
  h2 { font-size: 1.25rem; font-weight: 600; margin: 0 0 .5rem; }
  p { line-height: 1.5; margin: .4rem 0; }
  header > p, .quiet { color: #cdc1d8; font-size: .875rem; }
  .play-panel { border: 1px solid #6f527f; border-radius: 1.1rem; overflow: hidden; background: #21192e; box-shadow: 0 16px 70px #08051060; }
  .round-stats { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem 1rem; padding: .8rem 1rem; font-size: .875rem; border-bottom: 1px solid #735c764d; background: #271c34; }
  strong { color: #f7dceb; font-variant-numeric: tabular-nums; }
  .canvas-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #191528; }
  .arena-preview { position: absolute; width: 100%; height: 100%; object-fit: cover; opacity: .7; pointer-events: none; }
  canvas { position: relative; display: block; width: 100%; height: 100%; touch-action: none; }
  .canvas-message { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .45rem; padding: .75rem; text-align: center; background: #1b10254d; }
  .canvas-message p { font-size: .875rem; margin: 0; text-shadow: 0 2px 10px #100b18; }
  .canvas-message .intro-title { font-family: Georgia, 'Times New Roman', serif; font-size: clamp(1rem, 2.8vw, 1.7rem); color: #fff1ef; }
  .intro-art { display: flex; height: 106px; align-items: center; }
  .intro-pearl { width: 44px; height: 44px; }
  .intro-muse { width: 130px; height: 130px; margin-left: -.4rem; }
  .skin-legend { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem 1rem; padding: .6rem 1rem; color: #d6c9df; font-size: .75rem; border-top: 1px solid #735c764d; }
  .skin-legend > span { display: inline-flex; align-items: center; gap: .4rem; }
  .skin-legend img { width: 23px; height: 23px; object-fit: contain; }
  .skin-status { margin-left: auto; color: #c6aed2; }
  button { min-height: 44px; border-radius: .7rem; border: 1px solid #a58aaa; background: #34263f; color: #fff2fb; padding: .55rem 1rem; font: inherit; cursor: pointer; }
  button.primary { background: linear-gradient(135deg, #ead1ef, #c9b6ed); border-color: #f4d7ed; color: #21142d; font-weight: 650; box-shadow: inset 0 1px #fff7; }
  button:disabled { opacity: .65; cursor: default; }
  button:focus-visible, canvas:focus-visible, h2:focus { outline: 3px solid #f7d396; outline-offset: -3px; }
  .text-button { border-color: transparent; background: transparent; padding-left: 0; font-size: .85rem; color: #dfc6e5; }
  .controls { display: flex; flex-wrap: wrap; gap: .65rem; padding: 1rem; }
  .round-status { padding: 1rem; border-top: 1px solid #735c7670; }
  .round-status .controls { padding: .7rem 0 0; }
  .quiet { padding-top: 1rem; font-size: .8rem; line-height: 1.65; }
  @media (max-width: 600px) { .companion-card { gap: 0; } .companion-card img { width: 76px; height: 76px; } .companion-card small { display: none; } .intro-art { display: none; } .skin-status { display: none; } }
  @media (max-width: 400px) { .orbfield-shell { padding: .65rem; } .title-row { gap: .25rem; } .companion-card { flex-direction: column; } .companion-card img { width: 68px; height: 68px; } .companion-card span { margin-top: -.6rem; font-size: .75rem; } .round-stats { padding: .65rem; font-size: .75rem; gap: .4rem; } .controls { padding: .75rem; } .skin-legend { gap: .8rem; padding: .45rem .65rem; } .canvas-message { gap: .5rem; } .canvas-message p { font-size: .75rem; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto; } }
</style>
