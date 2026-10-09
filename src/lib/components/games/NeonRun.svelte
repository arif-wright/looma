<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createEndlessRunner, type EndlessRunnerOptions, type EndlessRunnerInstance, type EndlessRunnerState } from '$lib/games/endlessRunner';
  import type { LoomaGameResult } from '$lib/games/types';
  import { startSession, completeSession, abandonSession, watchGameOwner, getGameErrorKind, getGameErrorMessage,
    type GameSessionStart, type GameSessionResult, type GameSessionServerResult } from '$lib/games/sdk';
  import { playSound, stopSound, isAudioEnabled, toggleAudioEnabled } from '$lib/games/audio';
  import { loadRunnerLanternwaySkin, RUNNER_LANTERNWAY_URLS, type RunnerLanternwayAssets } from '$lib/games/runnerLanternwaySkin';
  import { applyRitualUpdate } from '$lib/stores/companionRituals';

  export let createGame: (options: EndlessRunnerOptions) => EndlessRunnerInstance = createEndlessRunner;

  type Phase = 'ready' | 'starting' | 'playing' | 'paused' | 'saving' | 'complete' | 'practice' | 'start-error' | 'save-error';
  let phase: Phase = 'ready';
  let canvasEl: HTMLCanvasElement | null = null;
  let shellEl: HTMLDivElement | null = null;
  let focusedView = false;
  let fullscreenAvailable = false;
  let fullscreenActive = false;
  let fullscreenBusy = false;
  let viewGeneration = 0;
  let viewMessage = '';
  let statusEl: HTMLHeadingElement | null = null;
  let game: EndlessRunnerInstance | null = null;
  let session: GameSessionStart | null = null;
  let mounted = false;
  let startController: AbortController | null = null;
  let generation = 0;
  let pauseOnStart = false;
  let minimumDuration = 10_000;
  let maximumDuration = 600_000;
  let result: GameSessionResult | null = null;
  let reward: GameSessionServerResult | null = null;
  let errorMessage = '';
  let signInRequired = false;
  let refreshRequired = false;
  let audioOn = isAudioEnabled();
  let art: { assets: RunnerLanternwayAssets; complete: boolean } = { assets: {}, complete: false };
  let artState: 'loading' | 'ready' | 'fallback' = 'loading';
  let artTask: Promise<typeof art> | null = null;
  let motionPreference: MediaQueryList | null = null;
  const initialState = (): EndlessRunnerState => ({ score: 0, elapsedMs: 0, simulationElapsedMs: 0,
    distanceMeters: 0, shardsCollected: 0, playerX: 192, playerY: 405, onGround: true,
    powerups: { shield: true, magnet: 0, doubleShards: 0, slowMo: 0, dash: 0, dreamSurge: 0 } });
  let state = initialState();

  const cancelStart = () => { startController?.abort(); startController = null; };
  const isCurrent = (token: number) => mounted && generation === token;
  const stopGame = () => { game?.destroy(); game = null; stopSound('bgm'); };
  const releaseSession = () => { if (session) abandonSession(session.sessionId); session = null; };
  const focusStatus = async (token: number) => { await tick(); if (isCurrent(token)) statusEl?.focus(); };

  const saveResult = async (token: number) => {
    if (!isCurrent(token) || !session || !result || !['playing', 'save-error'].includes(phase)) return;
    const context = session;
    const payload = result;
    phase = 'saving'; errorMessage = ''; signInRequired = false;
    try {
      // The SDK preserves this session and payload after an uncertain response and
      // retrieves the existing atomic receipt on identical retries. Never re-award locally.
      const response = await completeSession(context.sessionId, payload);
      if (!isCurrent(token)) return;
      if (!response || !Number.isSafeInteger(response.xpDelta) || response.xpDelta < 0 ||
          !Number.isSafeInteger(response.currencyDelta) || response.currencyDelta < 0) {
        throw new Error('No confirmed reward receipt.');
      }
      reward = response;
      session = null;
      phase = 'complete';
      // Optional local ritual presentation cannot invalidate a confirmed receipt.
      try { if (response.rituals?.list) applyRitualUpdate(response.rituals.list); }
      catch { /* The saved result remains authoritative. */ }
    } catch (error) {
      if (!isCurrent(token)) return;
      signInRequired = getGameErrorKind(error, 'complete') === 'unauthorized';
      errorMessage = signInRequired ? getGameErrorMessage(error, 'complete')
        : 'We couldn’t confirm the saved result. Your run may already have saved.';
      phase = 'save-error';
      // Keep the exact result and SDK session for Retry saving. Only a new run or
      // explicit navigation abandons this local retry context; neither undoes a save.
    }
    if (isCurrent(token)) void focusStatus(token);
  };

  const finishRun = (raw: LoomaGameResult, token: number) => {
    if (!isCurrent(token) || phase !== 'playing') return;
    stopGame();
    const meta = { ...raw.meta };
    const powerupsUsed = Object.freeze({ shield: meta.shield_powerups ?? 0, magnet: meta.magnet_powerups ?? 0,
      doubleShards: meta.double_powerups ?? 0, slowMo: meta.slowmo_powerups ?? 0,
      dash: meta.dash_powerups ?? 0, dreamSurge: meta.dream_powerups ?? 0 });
    result = Object.freeze({ score: Math.max(0, Math.floor(raw.score)), durationMs: Math.max(0, Math.floor(raw.durationMs)),
      success: meta.survived_round === 1,
      stats: Object.freeze({ ...meta, shardsCollected: meta.shards ?? state.shardsCollected,
        distanceMeters: meta.distance_meters ?? state.distanceMeters, difficulty: 'normal', powerupsUsed }) });
    if (result.durationMs! < minimumDuration) {
      phase = 'practice'; releaseSession(); void focusStatus(token); return;
    }
    void saveResult(token);
  };

  const startRun = async () => {
    if (!mounted || !canvasEl || ['starting', 'playing', 'paused', 'saving'].includes(phase)) return;
    const token = ++generation;
    cancelStart();
    const controller = new AbortController();
    startController = controller;
    stopGame(); releaseSession();
    phase = 'starting'; pauseOnStart = document.hidden;
    result = null; reward = null; errorMessage = ''; signInRequired = false; refreshRequired = false; state = initialState();
    try {
      // Finish bounded cosmetic loading before opening a server session.
      const loadedArt = artTask ? await artTask : art;
      if (!isCurrent(token)) return;
      const context = await startSession('runner', 'standard', { clientVersion: '1.0.0', source: 'neon-run' }, { signal: controller.signal, ownerId: get(page).data.user?.id ?? null });
      if (!isCurrent(token)) { abandonSession(context.sessionId); return; }
      session = context;
      const min = context.caps.minDurationMs;
      const max = context.caps.maxDurationMs;
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || max < Math.max(1, min)) {
        throw new Error('Invalid session limits.');
      }
      minimumDuration = min; maximumDuration = max;
      game = createGame({ canvas: canvasEl, maxDurationMs: maximumDuration,
        skinAssets: loadedArt.assets, reducedMotion: () => motionPreference?.matches ?? true,
        onStateChange: (next) => { if (isCurrent(token)) state = next; },
        onGameOver: (next) => finishRun(next, token) });
      phase = 'playing'; game.start();
      if ((pauseOnStart || document.hidden) && phase === 'playing') pauseRun();
      else if (phase === 'playing') playSound('bgm', { loop: true });
      await tick();
      if (isCurrent(token) && phase === 'playing') canvasEl?.focus({ preventScroll: true });
    } catch (error) {
      if (!isCurrent(token)) return;
      stopGame(); releaseSession();
      signInRequired = getGameErrorKind(error, 'start') === 'unauthorized';
      errorMessage = getGameErrorMessage(error, 'start');
      refreshRequired = !signInRequired && typeof error === 'object' && error !== null && 'code' in error && error.code === 'start_account_changed';
      phase = 'start-error'; void focusStatus(token);
    } finally {
      if (startController === controller) startController = null;
    }
  };

  const pauseRun = () => { if (phase === 'playing') { phase = 'paused'; game?.pause(); stopSound('bgm'); } };
  const resumeRun = () => {
    if (phase !== 'paused' || document.hidden) return;
    phase = 'playing'; game?.resume(); playSound('bgm', { loop: true }); canvasEl?.focus({ preventScroll: true });
  };
  const jump = () => { if (phase === 'playing') game?.playerJump(); };
  const releaseFullscreen = async (target: HTMLDivElement | null = shellEl) => {
    if (target && document.fullscreenElement === target && typeof document.exitFullscreen === 'function') {
      try { await document.exitFullscreen(); } catch { /* Browser cleanup is best effort, scoped to this shell. */ }
    }
  };
  const syncFullscreen = () => { fullscreenActive = Boolean(shellEl && document.fullscreenElement === shellEl); };
  const toggleFocusView = async () => {
    focusedView = !focusedView; viewMessage = ''; ++viewGeneration;
    if (!focusedView) void releaseFullscreen();
    await tick();
    if (mounted && focusedView && phase === 'playing') canvasEl?.focus({ preventScroll: true });
  };
  const toggleFullscreen = async () => {
    if (!mounted || !shellEl || fullscreenBusy) return;
    if (document.fullscreenElement === shellEl) { await releaseFullscreen(); syncFullscreen(); return; }
    focusedView = true; viewMessage = '';
    const target = shellEl;
    const token = ++viewGeneration;
    if (!fullscreenAvailable || typeof target.requestFullscreen !== 'function') {
      viewMessage = 'Fullscreen isn’t available here. Focus view is open.'; return;
    }
    fullscreenBusy = true;
    try {
      await target.requestFullscreen();
      if (!mounted || viewGeneration !== token) {
        if (document.fullscreenElement === target) void releaseFullscreen(target);
        return;
      }
      syncFullscreen();
    } catch {
      if (mounted && viewGeneration === token) viewMessage = 'Fullscreen isn’t available here. Focus view is open.';
    } finally {
      fullscreenBusy = false;
    }
    await tick();
    if (mounted && viewGeneration === token && phase === 'playing') canvasEl?.focus({ preventScroll: true });
  };
  const exit = () => { ++generation; ++viewGeneration; cancelStart(); stopGame(); releaseSession(); void releaseFullscreen(); void goto('/app/games'); };
  const refreshPage = () => { ++generation; cancelStart(); stopGame(); releaseSession(); window.location.reload(); };
  const signIn = () => { ++generation; ++viewGeneration; cancelStart(); stopGame(); releaseSession(); void releaseFullscreen(); void goto('/app/auth'); };
  const onBackground = () => { if (phase === 'starting') pauseOnStart = true; else pauseRun(); };
  const onVisibility = () => { if (document.hidden) onBackground(); };
  const toggleAudio = () => { audioOn = toggleAudioEnabled(); };

  onMount(() => {
    mounted = true;
    const stopWatchingOwner = watchGameOwner((ownerId) => {
      if (phase !== 'starting') return;
      const token = ++generation;
      cancelStart(); stopGame(); releaseSession();
      result = null; reward = null;
      signInRequired = ownerId === null;
      refreshRequired = !signInRequired;
      errorMessage = ownerId ? 'Your account changed while starting. Refresh this page before starting again. Any session already created was not cancelled.'
        : 'You were signed out while starting. Sign in before starting again. Any session already created was not cancelled.';
      phase = 'start-error'; void focusStatus(token);
    }, get(page).data.user?.id ?? null);
    fullscreenAvailable = Boolean(document.fullscreenEnabled && typeof shellEl?.requestFullscreen === 'function');
    document.addEventListener('fullscreenchange', syncFullscreen);
    const artController = new AbortController();
    motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    artTask = loadRunnerLanternwaySkin({ signal: artController.signal });
    void artTask.then((loaded) => {
      if (!mounted) return;
      art = loaded; artState = loaded.complete ? 'ready' : 'fallback';
    });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBackground);
    return () => {
      mounted = false; stopWatchingOwner(); artController.abort(); motionPreference = null; ++generation; ++viewGeneration; cancelStart(); stopGame(); releaseSession(); void releaseFullscreen();
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBackground);
    };
  });
  $: statusTitle = phase === 'complete' ? 'Run complete' : phase === 'practice' ? 'Practice run'
    : phase === 'save-error' ? 'We couldn’t confirm your rewards' : phase === 'start-error' ? 'Couldn’t start this run'
    : phase === 'paused' ? 'Paused' : phase === 'saving' ? 'Saving your run…' : '';
</script>

<div bind:this={shellEl} class="neon-run-shell" class:focused={focusedView} data-testid="neon-run-game" data-phase={phase} data-art-state={artState} data-focused={focusedView} data-fullscreen={fullscreenActive}>
  <div class="view-toolbar">
    <button class="text-button" type="button" on:click={exit}>← Back to Play</button>
    <div class="view-actions">
      <button type="button" aria-pressed={focusedView} on:click={toggleFocusView}>{focusedView ? 'Exit focus view' : 'Focus view'}</button>
      {#if fullscreenAvailable}<button type="button" on:click={toggleFullscreen} disabled={fullscreenBusy}>{fullscreenActive ? 'Exit fullscreen' : 'Fullscreen'}</button>{/if}
    </div>
  </div>
  {#if viewMessage}<p class="view-message" role="status">{viewMessage}</p>{/if}
  <header>
    <p class="eyebrow">Memvoya / Play</p><h1>Neon Run</h1><p class="skin-name">Lanternway</p>
    <p id="neon-run-instructions">Jump over obstacles, gather shards, and discover six power-ups. Tap the play area or Jump, or focus the play area and press Space or ↑.</p>
  </header>
  <section class="play-panel" aria-label="Neon Run">
    <p class="orientation-hint">For a closer view, turn your phone sideways.</p>
    <div class="run-stats" aria-label="Run progress">
      <span>Score <strong data-testid="neon-run-score">{state.score.toLocaleString()}</strong></span>
      <span>Time <strong>{(state.elapsedMs / 1000).toFixed(1)}s</strong></span>
      <span>Distance <strong>{state.distanceMeters} m</strong></span>
      <span>Collected <strong>{state.shardsCollected}</strong></span>
    </div>
    <div class="canvas-frame">
      {#if art.assets.background}<img class="arena-preview" src={RUNNER_LANTERNWAY_URLS.background} alt="" aria-hidden="true" />{/if}
      <canvas bind:this={canvasEl} width="960" height="540" tabindex="0" data-testid="neon-run-canvas"
        aria-label="Neon Run play area" aria-describedby="neon-run-instructions"></canvas>
      {#if phase === 'ready' || phase === 'starting'}
        <div class="canvas-message">
          {#if art.assets.adventurer && art.assets.echo}
            <div class="intro-portraits" aria-hidden="true">
              <span class="intro-adventurer" style={`background-image: url("${RUNNER_LANTERNWAY_URLS.adventurer}")`}></span>
              <span class="intro-echo" style={`background-image: url("${RUNNER_LANTERNWAY_URLS.echo}")`}></span>
            </div>
          {/if}
          <p>A small journey, together.</p><span class="intro-caption">Follow the lanterns with Echo.</span>
          <button class="primary" type="button" on:click={startRun} disabled={phase === 'starting'}>{phase === 'starting' ? 'Starting…' : 'Start run'}</button>
        </div>
      {:else if phase === 'paused'}
        <div class="pause-cover" aria-hidden="true">Paused</div>
      {/if}
    </div>
    <div class="skin-status">{artState === 'loading' ? 'Preparing Lanternway…' : artState === 'fallback' ? 'Simplified art mode' : 'Lanternway · Echo by your side'}</div>
    {#if phase === 'playing' || phase === 'paused'}
    <div class="powerups" aria-label="Active power-ups">
      <span class:active={state.powerups.shield}>Shield {state.powerups.shield ? 'ready' : 'used'}</span>
      {#if state.powerups.magnet > 0}<span class="active">Magnet</span>{/if}
      {#if state.powerups.doubleShards > 0}<span class="active">×2 Shards</span>{/if}
      {#if state.powerups.slowMo > 0}<span class="active">Slow-Mo</span>{/if}
      {#if state.powerups.dash > 0}<span class="active">Dash</span>{/if}
      {#if state.powerups.dreamSurge > 0}<span class="active">Dream Surge</span>{/if}
    </div>
    {/if}
    <div class="controls">
      {#if phase === 'playing' || phase === 'paused'}
        <button class="primary jump" type="button" on:click={jump} disabled={phase !== 'playing'}>Jump</button>
        <button type="button" on:click={phase === 'paused' ? resumeRun : pauseRun}>{phase === 'paused' ? 'Resume' : 'Pause'}</button>
      {/if}
      <button type="button" aria-pressed={audioOn} on:click={toggleAudio}>Sound {audioOn ? 'on' : 'off'}</button>
    </div>
    {#if statusTitle}
      <section class="run-status" aria-live="polite" aria-atomic="true">
        <h2 bind:this={statusEl} tabindex="-1">{statusTitle}</h2>
        {#if phase === 'paused'}
          <p>Your run is paused. Resume whenever you’re ready.</p>
        {:else if phase === 'saving'}
          <p>Score {result?.score}. Checking the server’s result.</p>
        {:else if phase === 'start-error'}
          <p>{errorMessage}</p>
          <button class="primary" type="button" on:click={signInRequired ? signIn : refreshRequired ? refreshPage : startRun}>{signInRequired ? 'Sign in' : refreshRequired ? 'Refresh page' : 'Start new run'}</button>
        {:else}
          <p>Score {result?.score} · {((result?.durationMs ?? 0) / 1000).toFixed(1)} seconds</p>
          {#if reward}
            <p data-testid="neon-run-rewards">+{reward.xpDelta} XP · +{reward.currencyDelta} shards</p>
            {#if reward.companionBonus}<p>Companion bonus: {reward.companionBonus.name?.trim() || 'Your companion'}.</p>{/if}
            {#each reward.rituals?.completed ?? [] as ritual}<p>Completed: {ritual.title}</p>{/each}
          {:else if phase === 'practice'}
            <p>Runs under {minimumDuration / 1000} seconds are practice. No rewards were requested.</p>
          {:else}
            <p>{errorMessage} Retry saving checks this same run. Starting again or leaving closes this retry.</p>
          {/if}
          <div class="controls">
            {#if phase === 'save-error'}
              <button class="primary" type="button" on:click={() => saveResult(generation)}>Retry saving</button>
              {#if signInRequired}<button type="button" on:click={signIn}>Sign in</button>{/if}
            {/if}
            <button class:primary={phase !== 'save-error'} type="button" on:click={startRun}>Play again</button>
            <button type="button" on:click={exit}>Back to Play</button>
          </div>
        {/if}
      </section>
    {/if}
  </section>
  <p class="quiet">Find Shield, Magnet, ×2 Shards, Slow-Mo, Dash and Dream Surge along the way. Only your adventurer can be hit; Echo is a companion visual. Your starting shield absorbs one hit. Collected shards are run stats; only the confirmed result shows rewards. Leaving early doesn’t reduce your bond.</p>
</div>

<style>
  .neon-run-shell { box-sizing: border-box; width: 100%; height: 100%; overflow-y: auto; padding: 1rem; background: radial-gradient(ellipse at 50% 0, #26434d, #102935 60%, #0b1d2a); color: #f6efd9; }
  header, .view-toolbar, .view-message, .play-panel, .quiet { max-width: 960px; margin: 0 auto; }
  header { padding-bottom: 1rem; }
  .view-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .25rem .6rem; padding-bottom: .5rem; }
  .view-actions { display: flex; flex-wrap: wrap; gap: .4rem; }
  .view-actions button { font-size: .75rem; }
  .view-message { color: #f9e1ad; font-size: .8rem; padding: .25rem 0; }
  .orientation-hint { display: none; margin: 0; padding: .4rem .65rem; font-size: .75rem; color: #f1e2bc; }
  h1 { margin: .25rem 0; font-size: clamp(2rem, 5vw, 3rem); font-family: Georgia, 'Times New Roman', serif; font-weight: 500; letter-spacing: -.03em; }
  .skin-name { color: #eecb88; font-family: Georgia, 'Times New Roman', serif; font-size: 1.1rem; }
  h2 { margin: 0 0 .5rem; font-size: 1.2rem; }
  p { line-height: 1.5; margin: .4rem 0; }
  header > p, .quiet { color: #c5d5d2; font-size: .875rem; }
  .eyebrow { letter-spacing: .18em; text-transform: uppercase; font-size: .65rem; }
  .play-panel { border: 1px solid #87928a; border-radius: 1rem; background: #1b3544; overflow: hidden; }
  .run-stats { display: flex; flex-wrap: wrap; gap: .5rem 1rem; justify-content: space-between; padding: .8rem 1rem; font-size: .85rem; background: #f6efd9; color: #364c56; }
  strong { color: #1b3948; font-variant-numeric: tabular-nums; }
  .canvas-frame { width: 100%; position: relative; aspect-ratio: 16 / 9; background: #020617; }
  .arena-preview { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .75; pointer-events: none; }
  canvas { position: relative; width: 100%; height: 100%; display: block; touch-action: none; }
  .canvas-message, .pause-cover { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: .5rem; padding: .5rem; background: #112a3b66; }
  .canvas-message > p { font-family: Georgia, 'Times New Roman', serif; font-size: clamp(1rem, 2.8vw, 1.65rem); text-shadow: 0 2px 8px #071723; }
  .canvas-message > span { font-size: .8rem; text-shadow: 0 2px 8px #071723; }
  .skin-status { color: #d9d2ac; padding: .5rem 1rem 0; font-size: .72rem; }
  .intro-portraits { display: flex; align-items: flex-end; gap: .35rem; height: 96px; }
  .intro-portraits span { display: block; height: 96px; background-repeat: no-repeat; background-position: left top; background-size: auto 96px; }
  .intro-adventurer { width: 64px; }
  .intro-echo { width: 74px; }
  .pause-cover { pointer-events: none; font-size: 1.3rem; }
  .powerups { display: flex; flex-wrap: wrap; gap: .5rem; min-height: 2rem; padding: .5rem 1rem; color: #aebcd0; font-size: .75rem; }
  .powerups span { border: 1px solid #52627a; padding: .2rem .5rem; border-radius: 1rem; }
  .powerups .active { color: #fff0c8; border-color: #caa96c; }
  .controls { display: flex; flex-wrap: wrap; gap: .6rem; padding: .75rem 1rem; }
  button { min-height: 44px; border-radius: .65rem; border: 1px solid #b6baab; background: #284553; color: #faf3db; padding: .55rem .85rem; font: inherit; cursor: pointer; }
  button.primary { background: #f2deb0; border-color: #fff0cf; color: #183542; font-weight: 650; }
  .jump { min-width: 100px; }
  button:disabled { opacity: .55; cursor: default; }
  button:focus-visible, canvas:focus-visible, h2:focus { outline: 3px solid #fbd889; outline-offset: -3px; }
  .text-button { padding-left: 0; border-color: transparent; background: transparent; font-size: .85rem; }
  .run-status { padding: 1rem; border-top: 1px solid #52627a; }
  .run-status .controls { padding: .6rem 0 0; }
  .quiet { padding-top: 1rem; font-size: .8rem; }
  .focused { display: flex; flex-direction: column; padding: .5rem; min-height: 0; }
  .focused header, .focused .quiet, .focused .skin-status { display: none; }
  .focused .view-toolbar { flex: 0 0 auto; width: 100%; max-width: none; padding-bottom: .25rem; }
  .focused .view-message { width: 100%; max-width: none; flex: 0 0 auto; }
  .focused .play-panel { width: 100%; max-width: none; flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
  .focused .run-stats { padding: .35rem .65rem; font-size: .75rem; gap: .25rem .5rem; flex: 0 0 auto; }
  .focused .canvas-frame { flex: 1 1 0; min-height: 0; aspect-ratio: auto; }
  .focused canvas, .focused .arena-preview { width: 100%; height: 100%; object-fit: contain; }
  .focused .powerups { min-height: 0; padding: .2rem .65rem; font-size: .75rem; flex: 0 0 auto; }
  .focused .powerups span { padding: .05rem .4rem; }
  .focused .controls { padding: .25rem .65rem; flex: 0 0 auto; }
  .focused[data-phase='paused'] .run-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); padding: 0; border: 0; }
  .focused[data-phase='saving'] .canvas-frame, .focused[data-phase='complete'] .canvas-frame,
  .focused[data-phase='practice'] .canvas-frame, .focused[data-phase='save-error'] .canvas-frame,
  .focused[data-phase='start-error'] .canvas-frame { display: none; }
  .focused .run-status { min-height: 0; overflow-y: auto; }
  @media (max-width: 600px) { .intro-portraits, .intro-portraits span { height: 48px; } .intro-portraits span { background-size: auto 48px; } .intro-adventurer { width: 32px; } .intro-echo { width: 37px; } .intro-caption { display: none; } }
  @media (max-height: 500px) { .focused .intro-portraits { display: none; } }
  @media (max-width: 600px) and (orientation: portrait) { .orientation-hint { display: block; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto; } }
  @media (max-width: 400px) { .neon-run-shell { padding: .65rem; } .run-stats { padding: .65rem; font-size: .75rem; gap: .4rem; } .controls, .powerups, .run-status { padding: .65rem; } }
</style>
