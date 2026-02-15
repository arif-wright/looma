<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import CompanionOrb from '$lib/components/home/CompanionOrb.svelte';
  import ActionGate from '$lib/components/home/ActionGate.svelte';
  import ConstellationSeed from '$lib/components/home/ConstellationSeed.svelte';
  import MoodSeeds from '$lib/components/home/MoodSeeds.svelte';
  import type { ConstellationConfig, FieldConfig, FieldMode, PrimaryAction } from '$lib/home/fieldEngine';
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

  let sceneEl: HTMLElement | null = null;
  let exploreMode = false;
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let intentTimer: ReturnType<typeof setTimeout> | null = null;

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

  let showGateHint = true;
  const GATE_HINT_KEY = 'looma:gestureGateHintDone';

  let flickerOn = false;
  let flickerTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectFx = false;
  let gatePulseCount = 0;
  let intentActive = false;
  let moodOverlayOpenPrev = false;

  let parallaxX = 0;
  let parallaxY = 0;

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x1 - x2, y1 - y2);

  $: gateY = clamp(gatePoint.y, isMobile ? 68 : 70, isMobile ? 75 : 77);
  $: gateActive = dist(orbX, orbY, gatePoint.x, gatePoint.y) < 8;
  $: revealSeeds = exploreMode || intentActive || draggingOrb;

  $: seeds = (() => {
    if (!isMobile) return fieldConfig.constellations;
    const byId = new Map(fieldConfig.constellations.map((seed) => [seed.id, seed]));
    const ordered = ['signals', 'games', 'companion', 'missions', 'ritual'] as const;
    const arc = [
      { x: 30, y: 63 },
      { x: 50, y: 66 },
      { x: 70, y: 63 },
      { x: 38, y: 76 },
      { x: 62, y: 76 }
    ];
    return ordered
      .map((id, index) => {
        const seed = byId.get(id);
        const pos = arc[index];
        if (!seed || !pos) return null;
        return {
          ...seed,
          x: pos.x,
          y: pos.y
        };
      })
      .filter((seed): seed is ConstellationConfig => Boolean(seed));
  })();

  $: topSeed = seeds.reduce<ConstellationConfig | null>((current, seed) => {
    if (!current) return seed;
    return seed.relevance > current.relevance ? seed : current;
  }, null);

  $: sweepLength = topSeed ? Math.hypot(topSeed.x - baseOrb.x, topSeed.y - baseOrb.y) : 0;
  $: sweepAngle = topSeed ? (Math.atan2(topSeed.y - baseOrb.y, topSeed.x - baseOrb.x) * 180) / Math.PI : 0;

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

    if (actionIntent === 'RECONNECT_30') {
      setTimeout(() => {
        dispatch('primary', { intent: actionIntent });
      }, 780);
    } else {
      dispatch('primary', { intent: actionIntent });
    }

    setTimeout(() => {
      reconnectFx = false;
    }, 1080);

    if (browser) {
      showGateHint = false;
      window.localStorage.setItem(GATE_HINT_KEY, 'true');
    }
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
      const clampedX = clamp(nx, baseOrb.x - 18, baseOrb.x + 18);
      const clampedY = clamp(ny, baseOrb.y - 8, baseOrb.y + 36);
      if (Math.abs(clampedX - baseOrb.x) > 2 || Math.abs(clampedY - baseOrb.y) > 2) {
        dragMoved = true;
      }
      orbX = clampedX;
      orbY = clampedY;
    };

    const handleUp = () => {
      if (draggingOrb && gateActive) {
        orbX = gatePoint.x;
        orbY = gateY - 2;
        triggerPrimary();
      } else if (draggingOrb && dragMoved) {
        ignoreOpen = true;
      }
      draggingOrb = false;
      orbX = baseOrb.x;
      orbY = baseOrb.y;
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

  const startFlickerLoop = () => {
    if (!browser) return;
    const schedule = () => {
      const nextDelay = 9000 + Math.round(Math.random() * 6500);
      flickerTimer = setTimeout(() => {
        flickerOn = true;
        setTimeout(() => {
          flickerOn = false;
          schedule();
        }, 1400);
      }, nextDelay);
    };
    schedule();
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
    showGateHint = window.localStorage.getItem(GATE_HINT_KEY) !== 'true';

    mediaQuery = window.matchMedia('(max-width: 900px)');
    isMobile = mediaQuery.matches;
    mediaHandler = (event: MediaQueryListEvent) => {
      isMobile = event.matches;
    };
    mediaQuery.addEventListener('change', mediaHandler);

    startFlickerLoop();

    return () => {
      if (mediaQuery && mediaHandler) mediaQuery.removeEventListener('change', mediaHandler);
      if (flickerTimer) clearTimeout(flickerTimer);
      if (intentTimer) clearTimeout(intentTimer);
      unlockScroll();
    };
  });

  onDestroy(() => {
    if (pressTimer) clearTimeout(pressTimer);
    if (flickerTimer) clearTimeout(flickerTimer);
    if (intentTimer) clearTimeout(intentTimer);
    unlockScroll();
  });
</script>

<section
  bind:this={sceneEl}
  class={`living-field ${modeClass[fieldConfig.fieldMode]}`}
  style={`--parallax-x:${parallaxX}; --parallax-y:${parallaxY};`}
  on:pointerdown={beginLongPress}
  on:pointerup={endLongPress}
  on:pointercancel={endLongPress}
  on:pointermove={handleParallax}
  on:pointerleave={resetParallax}
>
  <div class="living-field__base" aria-hidden="true"></div>
  <div class="living-field__chroma" aria-hidden="true"></div>
  <div class="living-field__mist" aria-hidden="true"></div>
  <div class="living-field__grain" aria-hidden="true"></div>
  <div class="living-field__vignette" aria-hidden="true"></div>

  {#if topSeed}
    <div
      class={`living-field__sweep ${flickerOn ? 'living-field__sweep--on' : ''}`}
      style={`left:${baseOrb.x}%; top:${baseOrb.y}%; width:${sweepLength}%; --sweep-angle:${sweepAngle}deg;`}
      aria-hidden="true"
    ></div>
  {/if}

  {#each seeds as seed}
    <ConstellationSeed
      id={seed.id}
      label={seed.label}
      description={seed.description}
      icon={seed.icon}
      href={seed.href}
      relevance={seed.relevance}
      x={seed.x}
      y={seed.y}
      {exploreMode}
      visible={revealSeeds}
      {companionName}
      on:follow={(event) => dispatch('seed', event.detail)}
    />
  {/each}

  <CompanionOrb
    name={companionName}
    status={companionStatus}
    statusLine={companionStatusLine}
    x={orbX}
    y={orbY}
    scaleBoost={reconnectFx ? 1.04 : 1}
    warmBoost={reconnectFx}
    on:press={startOrbDrag}
    on:open={handleOrbOpen}
  />

  <div class="living-field__statement">
    <p class="living-field__statement-primary">{companionStatusLine}</p>
    <p class="living-field__statement-secondary">{statementSecondary}</p>
  </div>

  <ActionGate
    label={actionLabel}
    intent={actionIntent}
    x={gatePoint.x}
    y={gateY}
    orbX={orbX}
    orbY={orbY}
    active={gateActive}
    dragging={draggingOrb}
    orbStatus={companionStatus}
    showHint={showGateHint}
    hint="Drag the orb into the light"
    pulseCount={gatePulseCount}
    on:activate={(event) => dispatch('primary', event.detail)}
  />

  <MoodSeeds
    open={showMoodSeeds}
    {selectedMood}
    orbX={baseOrb.x}
    orbY={baseOrb.y}
    fading={moodFading}
    on:select={(event) => dispatch('mood', event.detail)}
  />
</section>

<style>
  .living-field {
    --ease-organic: cubic-bezier(0.23, 0.9, 0.32, 1);
    position: relative;
    min-height: min(80vh, 44rem);
    border-radius: 1.55rem;
    overflow: hidden;
    background: #03040b;
    box-shadow: 0 40px 80px rgba(1, 3, 12, 0.52);
    user-select: none;
    touch-action: none;
    isolation: isolate;
  }

  .living-field__base,
  .living-field__chroma,
  .living-field__mist,
  .living-field__grain,
  .living-field__vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .living-field__base {
    background:
      radial-gradient(120% 95% at 50% -12%, rgba(18, 23, 48, 0.66), rgba(4, 6, 16, 0) 65%),
      linear-gradient(180deg, rgba(5, 7, 18, 0.94), rgba(3, 4, 11, 0.98));
    z-index: 0;
  }

  .living-field__chroma {
    background:
      radial-gradient(44% 36% at calc(24% + (var(--parallax-x) * 2.6%)) calc(14% + (var(--parallax-y) * 2.4%)), rgba(67, 220, 255, 0.16), rgba(67, 220, 255, 0) 80%),
      radial-gradient(48% 42% at calc(70% - (var(--parallax-x) * 2.2%)) calc(24% - (var(--parallax-y) * 2.6%)), rgba(214, 98, 255, 0.14), rgba(214, 98, 255, 0) 76%),
      radial-gradient(52% 36% at calc(56% + (var(--parallax-x) * 1.4%)) calc(70% + (var(--parallax-y) * 1.8%)), rgba(124, 96, 255, 0.14), rgba(124, 96, 255, 0) 80%);
    mix-blend-mode: screen;
    opacity: 0.85;
    transform: translate3d(calc(var(--parallax-x) * -0.8rem), calc(var(--parallax-y) * -0.5rem), 0);
    transition: transform 640ms var(--ease-organic);
    z-index: 1;
  }

  .living-field__mist {
    background:
      radial-gradient(70% 60% at 50% 30%, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0) 76%),
      radial-gradient(80% 44% at 50% 80%, rgba(120, 227, 255, 0.06), rgba(120, 227, 255, 0) 72%);
    filter: blur(12px);
    opacity: 0.72;
    z-index: 2;
  }

  .living-field__grain {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.78' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E");
    opacity: 0.1;
    mix-blend-mode: soft-light;
    z-index: 3;
  }

  .living-field__vignette {
    background: radial-gradient(130% 110% at 50% 42%, rgba(0, 0, 0, 0) 48%, rgba(2, 3, 9, 0.5) 100%);
    z-index: 4;
  }

  .living-field__sweep {
    position: absolute;
    height: 0.72rem;
    transform: translateY(-50%) rotate(var(--sweep-angle));
    transform-origin: left center;
    background: linear-gradient(90deg, rgba(132, 235, 255, 0.02), rgba(132, 235, 255, 0.24), rgba(132, 235, 255, 0));
    filter: blur(7px);
    opacity: 0.1;
    z-index: 5;
    transition: opacity 720ms var(--ease-organic);
    pointer-events: none;
  }

  .living-field__sweep--on {
    opacity: 0.36;
  }

  .living-field__statement {
    position: absolute;
    left: 50%;
    top: 60%;
    transform: translateX(-50%);
    width: min(84vw, 31rem);
    display: grid;
    gap: 0.5rem;
    text-align: center;
    z-index: 11;
    pointer-events: none;
  }

  .living-field__statement-primary {
    margin: 0;
    color: rgba(245, 249, 255, 0.98);
    font-size: clamp(1.75rem, 5.8vw, 3.12rem);
    line-height: 1.03;
    letter-spacing: -0.015em;
    font-weight: 560;
    text-wrap: balance;
    text-shadow: 0 8px 30px rgba(7, 10, 24, 0.72);
  }

  .living-field__statement-secondary {
    margin: 0;
    color: rgba(198, 215, 237, 0.74);
    font-size: clamp(0.76rem, 1.8vw, 0.94rem);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 450;
  }

  .mode-neutral .living-field__chroma { opacity: 0.78; }
  .mode-support .living-field__chroma { filter: hue-rotate(18deg); opacity: 0.88; }
  .mode-settle .living-field__mist { opacity: 0.6; }
  .mode-explore .living-field__chroma { opacity: 1; filter: saturate(1.08); }
  .mode-activate .living-field__chroma { opacity: 1; filter: saturate(1.16) hue-rotate(-8deg); }
  .mode-recover .living-field__base { filter: saturate(0.82); }

  @media (max-width: 640px) {
    .living-field {
      min-height: min(79vh, 40rem);
      border-radius: 1.26rem;
    }

    .living-field__statement {
      top: 62%;
      width: min(90vw, 26rem);
      gap: 0.34rem;
    }

    .living-field__statement-secondary {
      font-size: 0.69rem;
      letter-spacing: 0.075em;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .living-field__chroma {
      transition: none;
      transform: none;
    }

    .living-field__sweep {
      transition: none;
    }
  }
</style>
