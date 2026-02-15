<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import CompanionOrb from '$lib/components/home/CompanionOrb.svelte';
  import ActionGate from '$lib/components/home/ActionGate.svelte';
  import MoodSeeds from '$lib/components/home/MoodSeeds.svelte';
  import type { FieldConfig, FieldMode, PrimaryAction } from '$lib/home/fieldEngine';
  import type { HomeMood } from '$lib/components/home/homeLoopTypes';

  export let fieldConfig: FieldConfig;
  export let companionName: string | null = null;
  export let companionStatus: 'Distant' | 'Synced' | 'Resonant' | 'Steady' = 'Steady';
  export let companionStatusLine = 'Mirae feels far.';
  export let statementSecondary = 'Bring her closer.';
  export let actionLabel = 'Do this now';
  export let actionIntent: PrimaryAction = 'MICRO_RITUAL';
  export let showMoodSeeds = false;
  export let moodFading = false;
  export let selectedMood: HomeMood | null = null;

  const dispatch = createEventDispatcher<{
    primary: { intent: PrimaryAction };
    mood: { mood: HomeMood };
    orb: Record<string, never>;
    explore: { enabled: boolean };
    seed: { id: string; href: string };
  }>();

  const modeClass: Record<FieldMode, string> = {
    neutral: 'mode-neutral',
    support: 'mode-support',
    settle: 'mode-settle',
    explore: 'mode-explore',
    activate: 'mode-activate',
    recover: 'mode-recover'
  };

  const DRAG_HINT_KEY = 'looma:reconnectDragHintDone';

  let sceneEl: HTMLElement | null = null;
  let exploreMode = false;
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let intentTimer: ReturnType<typeof setTimeout> | null = null;
  let successTimer: ReturnType<typeof setTimeout> | null = null;

  let isMobile = false;
  let mediaQuery: MediaQueryList | null = null;
  let mediaHandler: ((event: MediaQueryListEvent) => void) | null = null;

  const baseOrb = fieldConfig.layoutPositions.orb;
  const gatePoint = fieldConfig.layoutPositions.halo;

  let orbX = baseOrb.x;
  let orbY = baseOrb.y;
  let draggingOrb = false;
  let dragMoved = false;
  let ignoreOpen = false;

  let previousBodyOverflow: string | null = null;
  let previousBodyTouch: string | null = null;

  let gatePulseCount = 0;
  let reconnectFx = false;
  let reconnectSuccess = false;
  let intentActive = false;
  let moodOverlayOpenPrev = false;
  let showDragHint = false;

  let parallaxX = 0;
  let parallaxY = 0;

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x1 - x2, y1 - y2);

  $: orbRestX = clamp(baseOrb.x - (isMobile ? 6 : 7.5), 28, 52);
  $: orbRestY = clamp(baseOrb.y - (isMobile ? 8 : 9), 31, 40);
  $: if (!draggingOrb) {
    orbX = orbRestX;
    orbY = orbRestY;
  }

  $: gateX = clamp(gatePoint.x + (isMobile ? 1.8 : 3.8), 45, 60);
  $: gateY = clamp(gatePoint.y + (isMobile ? 0.8 : 1.4), isMobile ? 70 : 72, isMobile ? 77 : 79);
  $: gateActive = dist(orbX, orbY, gateX, gateY) < 8.2;

  $: baseGateDistance = Math.max(0.1, dist(orbRestX, orbRestY, gateX, gateY));
  $: dragProgressRaw = clamp(1 - dist(orbX, orbY, gateX, gateY) / baseGateDistance, 0, 1);
  $: dragProgress = draggingOrb ? dragProgressRaw : 0;

  $: statementX = clamp(orbRestX + (isMobile ? 4 : 7.5), 34, 70);
  $: statementY = clamp(orbRestY + (isMobile ? 8.8 : 10.6), 42, 58);

  $: livePrimaryLine = reconnectSuccess
    ? "You're connected."
    : draggingOrb && dragProgress > 0.72
      ? "She's almost here."
      : draggingOrb && dragProgress > 0.34
        ? "She's listening."
        : companionStatusLine;

  $: liveSecondaryLine = reconnectSuccess ? 'Stay with her.' : statementSecondary;

  $: revealDragArc = draggingOrb;
  $: dragArcPath = `M ${orbRestX} ${orbRestY + 3} Q ${(orbRestX + gateX) / 2} ${Math.min(orbRestY, gateY) - 8} ${gateX} ${gateY - 4}`;

  const lockScroll = () => {
    if (!browser) return;
    if (previousBodyOverflow === null) previousBodyOverflow = document.body.style.overflow;
    if (previousBodyTouch === null) previousBodyTouch = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
  };

  const unlockScroll = () => {
    if (!browser) return;
    if (previousBodyOverflow !== null) document.body.style.overflow = previousBodyOverflow;
    if (previousBodyTouch !== null) document.body.style.touchAction = previousBodyTouch;
    previousBodyOverflow = null;
    previousBodyTouch = null;
  };

  const armIntentWindow = (windowMs = 8200) => {
    intentActive = true;
    if (intentTimer) clearTimeout(intentTimer);
    intentTimer = setTimeout(() => {
      if (!draggingOrb && !exploreMode) intentActive = false;
      intentTimer = null;
    }, windowMs);
  };

  const beginLongPress = () => {
    if (draggingOrb) return;
    armIntentWindow(9000);
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      exploreMode = !exploreMode;
      dispatch('explore', { enabled: exploreMode });
      if (exploreMode) {
        intentActive = true;
      } else {
        armIntentWindow(7200);
      }
      pressTimer = null;
    }, 560);
  };

  const endLongPress = () => {
    if (!pressTimer) return;
    clearTimeout(pressTimer);
    pressTimer = null;
  };

  const triggerPrimary = () => {
    reconnectFx = true;
    gatePulseCount += 1;

    dispatch('primary', { intent: actionIntent });

    if (actionIntent === 'RECONNECT_30') {
      reconnectSuccess = true;
      showDragHint = false;
      if (browser) window.localStorage.setItem(DRAG_HINT_KEY, 'true');
      if (successTimer) clearTimeout(successTimer);
      successTimer = setTimeout(() => {
        reconnectSuccess = false;
        successTimer = null;
      }, 3200);
    }

    setTimeout(() => {
      reconnectFx = false;
    }, 1400);
  };

  const startOrbDrag = (_event: CustomEvent<{ clientX: number; clientY: number; pointerId: number }>) => {
    draggingOrb = true;
    dragMoved = false;
    ignoreOpen = false;
    armIntentWindow(10000);
    lockScroll();

    const handleMove = (moveEvent: PointerEvent) => {
      if (!draggingOrb || !sceneEl) return;
      const rect = sceneEl.getBoundingClientRect();
      const nx = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      const ny = ((moveEvent.clientY - rect.top) / rect.height) * 100;
      const clampedX = clamp(nx, orbRestX - 18, orbRestX + 22);
      const clampedY = clamp(ny, orbRestY - 6, orbRestY + 40);
      if (Math.abs(clampedX - orbRestX) > 2 || Math.abs(clampedY - orbRestY) > 2) {
        dragMoved = true;
      }
      orbX = clampedX;
      orbY = clampedY;
    };

    const handleUp = () => {
      if (draggingOrb && gateActive) {
        orbX = gateX;
        orbY = gateY - 2.3;
        triggerPrimary();
      } else if (draggingOrb && dragMoved) {
        ignoreOpen = true;
      }
      draggingOrb = false;
      orbX = orbRestX;
      orbY = orbRestY;
      unlockScroll();
      armIntentWindow(7600);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  const handleOrbOpen = () => {
    armIntentWindow(9000);
    if (ignoreOpen) {
      ignoreOpen = false;
      return;
    }
    dispatch('orb', {});
  };

  const handleParallax = (event: PointerEvent) => {
    if (!sceneEl) return;
    const rect = sceneEl.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const py = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    parallaxX = clamp(px, -1, 1);
    parallaxY = clamp(py, -1, 1);
  };

  const resetParallax = () => {
    parallaxX = 0;
    parallaxY = 0;
  };

  $: if (showMoodSeeds && !moodOverlayOpenPrev) armIntentWindow(10000);
  $: moodOverlayOpenPrev = showMoodSeeds;

  onMount(() => {
    if (!browser) return;
    showDragHint = window.localStorage.getItem(DRAG_HINT_KEY) !== 'true';

    mediaQuery = window.matchMedia('(max-width: 900px)');
    isMobile = mediaQuery.matches;
    mediaHandler = (event: MediaQueryListEvent) => {
      isMobile = event.matches;
    };
    mediaQuery.addEventListener('change', mediaHandler);

    return () => {
      if (mediaQuery && mediaHandler) mediaQuery.removeEventListener('change', mediaHandler);
      if (intentTimer) clearTimeout(intentTimer);
      if (successTimer) clearTimeout(successTimer);
      unlockScroll();
    };
  });

  onDestroy(() => {
    if (pressTimer) clearTimeout(pressTimer);
    if (intentTimer) clearTimeout(intentTimer);
    if (successTimer) clearTimeout(successTimer);
    unlockScroll();
  });
</script>

<section
  bind:this={sceneEl}
  class={`living-field ${modeClass[fieldConfig.fieldMode]}`}
  style={`--parallax-x:${parallaxX}; --parallax-y:${parallaxY}; --orb-x:${orbX}; --orb-y:${orbY}; --statement-x:${statementX}; --statement-y:${statementY};`}
  on:pointerdown={beginLongPress}
  on:pointerup={endLongPress}
  on:pointercancel={endLongPress}
  on:pointermove={handleParallax}
  on:pointerleave={resetParallax}
>
  <div class="living-field__base" aria-hidden="true"></div>
  <div class="living-field__bleed" aria-hidden="true"></div>
  <div class="living-field__drift living-field__drift--one" aria-hidden="true"></div>
  <div class="living-field__drift living-field__drift--two" aria-hidden="true"></div>
  <div class="living-field__orb-spill {companionStatus === 'Distant' ? 'living-field__orb-spill--distant' : ''} {companionStatus === 'Resonant' || reconnectFx ? 'living-field__orb-spill--warm' : ''}" aria-hidden="true"></div>
  <div class="living-field__stars" aria-hidden="true"></div>
  <div class="living-field__grain" aria-hidden="true"></div>
  <div class="living-field__aberration" aria-hidden="true"></div>
  <div class="living-field__vignette" aria-hidden="true"></div>

  {#if revealDragArc}
    <svg class="living-field__drag-arc" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={dragArcPath}></path>
    </svg>
  {/if}

  <CompanionOrb
    name={companionName}
    status={companionStatus}
    statusLine={companionStatusLine}
    x={orbX}
    y={orbY}
    scaleBoost={reconnectFx ? 1.03 : 1}
    warmBoost={reconnectFx}
    tiltX={parallaxX}
    tiltY={parallaxY}
    dragProgress={dragProgress}
    successBoost={reconnectSuccess}
    on:press={startOrbDrag}
    on:open={handleOrbOpen}
  />

  {#if showDragHint}
    <p class="living-field__drag-hint">Drag {companionName ?? 'Mirae'} downward to reconnect.</p>
  {/if}

  <div class="living-field__statement">
    <p class="living-field__statement-primary">{livePrimaryLine}</p>
    <p class="living-field__statement-secondary">{liveSecondaryLine}</p>
  </div>

  <ActionGate
    label={actionLabel}
    intent={actionIntent}
    x={gateX}
    y={gateY}
    orbX={orbX}
    orbY={orbY}
    active={gateActive}
    dragging={draggingOrb}
    progress={dragProgress}
    orbStatus={companionStatus}
    showHint={false}
    hint=""
    caption="Reconnect"
    pulseCount={gatePulseCount}
    on:activate={(event) => dispatch('primary', event.detail)}
  />

  <MoodSeeds
    open={showMoodSeeds}
    {selectedMood}
    orbX={orbRestX}
    orbY={orbRestY}
    fading={moodFading}
    on:select={(event) => dispatch('mood', event.detail)}
  />
</section>

<style>
  .living-field {
    --ease-space: cubic-bezier(0.16, 0.84, 0.32, 1);
    position: relative;
    min-height: 100dvh;
    overflow: hidden;
    background: #040711;
    user-select: none;
    touch-action: none;
    isolation: isolate;
  }

  .living-field__base,
  .living-field__bleed,
  .living-field__drift,
  .living-field__orb-spill,
  .living-field__stars,
  .living-field__grain,
  .living-field__aberration,
  .living-field__vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .living-field__base {
    z-index: 0;
    background:
      radial-gradient(140% 120% at 88% -18%, rgba(110, 144, 244, 0.2), rgba(110, 144, 244, 0) 54%),
      radial-gradient(120% 95% at -14% 108%, rgba(61, 188, 214, 0.15), rgba(61, 188, 214, 0) 62%),
      linear-gradient(168deg, rgba(7, 11, 27, 0.98), rgba(3, 6, 14, 1) 60%);
  }

  .living-field__bleed {
    z-index: 1;
    background:
      radial-gradient(76% 56% at calc(16% + (var(--parallax-x) * 1.5%)) calc(20% + (var(--parallax-y) * 1.2%)), rgba(76, 222, 255, 0.11), rgba(76, 222, 255, 0) 72%),
      radial-gradient(72% 54% at calc(80% - (var(--parallax-x) * 1.6%)) calc(74% - (var(--parallax-y) * 1.5%)), rgba(216, 108, 255, 0.09), rgba(216, 108, 255, 0) 76%);
    mix-blend-mode: screen;
    opacity: 0.82;
    transform: translate3d(calc(var(--parallax-x) * -0.65rem), calc(var(--parallax-y) * -0.44rem), 0);
    transition: transform 760ms var(--ease-space);
  }

  .living-field__drift {
    z-index: 2;
    filter: blur(42px);
    opacity: 0.3;
  }

  .living-field__drift--one {
    background: radial-gradient(42% 32% at 28% 34%, rgba(66, 212, 255, 0.22), rgba(66, 212, 255, 0));
    animation: cloudOne 18s var(--ease-space) infinite alternate;
  }

  .living-field__drift--two {
    background: radial-gradient(46% 30% at 72% 70%, rgba(216, 124, 255, 0.2), rgba(216, 124, 255, 0));
    animation: cloudTwo 15s var(--ease-space) infinite alternate;
  }

  .living-field__orb-spill {
    z-index: 3;
    background:
      radial-gradient(36% 28% at calc(var(--orb-x) * 1%) calc((var(--orb-y) * 1%) + 7%), rgba(128, 229, 255, 0.24), rgba(128, 229, 255, 0) 74%),
      radial-gradient(28% 22% at calc((var(--orb-x) * 1%) + 10%) calc((var(--orb-y) * 1%) + 12%), rgba(92, 156, 255, 0.12), rgba(92, 156, 255, 0) 82%);
    transition: opacity 900ms var(--ease-space), filter 900ms var(--ease-space);
    opacity: 0.5;
  }

  .living-field__orb-spill--distant {
    opacity: 0.3;
    filter: saturate(0.78);
  }

  .living-field__orb-spill--warm {
    background:
      radial-gradient(38% 30% at calc(var(--orb-x) * 1%) calc((var(--orb-y) * 1%) + 8%), rgba(255, 209, 162, 0.24), rgba(255, 209, 162, 0) 72%),
      radial-gradient(30% 24% at calc((var(--orb-x) * 1%) + 10%) calc((var(--orb-y) * 1%) + 12%), rgba(255, 163, 110, 0.14), rgba(255, 163, 110, 0) 84%);
    opacity: 0.58;
  }

  .living-field__stars {
    z-index: 4;
    opacity: 0.16;
    filter: blur(0.8px);
    background-image:
      radial-gradient(circle at 18% 24%, rgba(214, 241, 255, 0.8) 0.26px, transparent 0.8px),
      radial-gradient(circle at 72% 18%, rgba(214, 241, 255, 0.7) 0.24px, transparent 0.8px),
      radial-gradient(circle at 60% 66%, rgba(214, 241, 255, 0.7) 0.24px, transparent 0.8px),
      radial-gradient(circle at 34% 82%, rgba(214, 241, 255, 0.72) 0.22px, transparent 0.8px);
    background-size: 280px 280px, 260px 260px, 300px 300px, 240px 240px;
  }

  .living-field__grain {
    z-index: 5;
    opacity: 0.09;
    mix-blend-mode: soft-light;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.7'/%3E%3C/svg%3E");
  }

  .living-field__aberration {
    z-index: 6;
    box-shadow: inset 34px 0 90px rgba(66, 212, 255, 0.06), inset -34px 0 90px rgba(222, 119, 255, 0.05);
  }

  .living-field__vignette {
    z-index: 7;
    background: radial-gradient(130% 110% at 50% 44%, rgba(0, 0, 0, 0) 54%, rgba(2, 4, 10, 0.54) 100%);
  }

  .living-field__drag-arc {
    position: absolute;
    inset: 0;
    z-index: 12;
    pointer-events: none;
  }

  .living-field__drag-arc path {
    stroke: rgba(176, 238, 255, 0.34);
    stroke-width: 1;
    fill: none;
    filter: blur(0.35px);
    stroke-linecap: round;
    stroke-dasharray: 3 5;
    animation: arcFlow 1400ms linear infinite;
  }

  .living-field__drag-hint {
    position: absolute;
    left: calc(var(--orb-x) * 1%);
    top: calc((var(--orb-y) * 1%) + 10.3%);
    transform: translateX(-50%);
    margin: 0;
    z-index: 15;
    color: rgba(197, 224, 246, 0.78);
    font-size: 0.68rem;
    letter-spacing: 0.045em;
    text-transform: none;
    animation: hintFloat 2600ms var(--ease-space) infinite;
    pointer-events: none;
  }

  .living-field__statement {
    position: absolute;
    left: calc(var(--statement-x) * 1%);
    top: calc(var(--statement-y) * 1%);
    width: min(80vw, 30rem);
    z-index: 15;
    pointer-events: none;
    display: grid;
    gap: 0.42rem;
  }

  .living-field__statement-primary {
    margin: 0;
    color: rgba(242, 247, 255, 0.95);
    font-size: clamp(1.9rem, 5.2vw, 3.32rem);
    font-weight: 560;
    letter-spacing: -0.01em;
    line-height: 1.02;
    text-wrap: balance;
    text-shadow: 0 16px 36px rgba(1, 5, 14, 0.62);
    transition: all 420ms var(--ease-space);
  }

  .living-field__statement-secondary {
    margin: 0;
    color: rgba(177, 200, 230, 0.58);
    font-size: clamp(0.67rem, 1.3vw, 0.82rem);
    text-transform: uppercase;
    letter-spacing: 0.11em;
    font-weight: 440;
    transform: translateX(0.75rem);
    transition: all 420ms var(--ease-space);
  }

  .mode-recover .living-field__base {
    filter: saturate(0.82);
  }

  @media (max-width: 640px) {
    .living-field {
      min-height: 100svh;
    }

    .living-field__statement {
      width: min(86vw, 22rem);
      gap: 0.32rem;
    }

    .living-field__statement-secondary {
      transform: translateX(0.45rem);
    }

    .living-field__drag-hint {
      width: min(84vw, 16rem);
      text-align: center;
      font-size: 0.64rem;
    }
  }

  @keyframes cloudOne {
    0% { transform: translate3d(-2%, 0, 0) scale(1); opacity: 0.2; }
    100% { transform: translate3d(3%, -2%, 0) scale(1.08); opacity: 0.34; }
  }

  @keyframes cloudTwo {
    0% { transform: translate3d(2%, 1%, 0) scale(1); opacity: 0.18; }
    100% { transform: translate3d(-3%, -2%, 0) scale(1.1); opacity: 0.31; }
  }

  @keyframes arcFlow {
    from { stroke-dashoffset: 0; }
    to { stroke-dashoffset: -14; }
  }

  @keyframes hintFloat {
    0%, 100% { opacity: 0.66; transform: translateX(-50%) translateY(0); }
    50% { opacity: 0.9; transform: translateX(-50%) translateY(-0.18rem); }
  }

  @media (prefers-reduced-motion: reduce) {
    .living-field__bleed,
    .living-field__drift,
    .living-field__drag-arc path,
    .living-field__drag-hint {
      transition: none;
      animation: none;
      transform: none;
    }
  }
</style>
