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
  let reconnectLine = '';
  let rippleOn = false;
  let rippleTimer: ReturnType<typeof setTimeout> | null = null;

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x1 - x2, y1 - y2);

  $: gateActive = dist(orbX, orbY, gatePoint.x, gatePoint.y) < 8;

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

  $: flickerPath = topSeed
    ? `M ${baseOrb.x} ${baseOrb.y} Q ${(baseOrb.x + topSeed.x) / 2} ${Math.min(baseOrb.y, topSeed.y) - 4} ${topSeed.x} ${topSeed.y}`
    : '';

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

  const beginLongPress = () => {
    if (draggingOrb) return;
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      exploreMode = !exploreMode;
      dispatch('explore', { enabled: exploreMode });
      pressTimer = null;
    }, 560);
  };

  const endLongPress = () => {
    if (!pressTimer) return;
    clearTimeout(pressTimer);
    pressTimer = null;
  };

  const triggerPrimary = () => {
    if (actionIntent === 'RECONNECT_30') {
      reconnectFx = true;
      reconnectLine = "She's closer.";
      rippleOn = true;
      setTimeout(() => {
        reconnectFx = false;
        reconnectLine = '';
      }, 900);
      setTimeout(() => {
        rippleOn = false;
      }, 1100);
      setTimeout(() => {
        dispatch('primary', { intent: actionIntent });
      }, 820);
    } else {
      dispatch('primary', { intent: actionIntent });
    }
    if (browser) {
      showGateHint = false;
      window.localStorage.setItem(GATE_HINT_KEY, 'true');
    }
  };

  const startOrbDrag = (event: CustomEvent<{ clientX: number; clientY: number; pointerId: number }>) => {
    draggingOrb = true;
    dragMoved = false;
    ignoreOpen = false;
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
        orbY = gatePoint.y - 2;
        triggerPrimary();
      } else if (draggingOrb && dragMoved) {
        ignoreOpen = true;
      }
      draggingOrb = false;
      orbX = baseOrb.x;
      orbY = baseOrb.y;
      unlockScroll();
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  const handleOrbOpen = () => {
    if (ignoreOpen) {
      ignoreOpen = false;
      return;
    }
    dispatch('orb', {});
  };

  const startFlickerLoop = () => {
    if (!browser) return;
    const schedule = () => {
      const nextDelay = 6000 + Math.round(Math.random() * 4000);
      flickerTimer = setTimeout(() => {
        flickerOn = true;
        setTimeout(() => {
          flickerOn = false;
          schedule();
        }, 700);
      }, nextDelay);
    };
    schedule();
  };

  const startResonantRippleLoop = () => {
    if (!browser) return;
    const schedule = () => {
      const nextDelay = 8000 + Math.round(Math.random() * 4000);
      rippleTimer = setTimeout(() => {
        if (companionStatus === 'Resonant') {
          rippleOn = true;
          setTimeout(() => {
            rippleOn = false;
            schedule();
          }, 850);
        } else {
          schedule();
        }
      }, nextDelay);
    };
    schedule();
  };

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
    startResonantRippleLoop();

    return () => {
      if (mediaQuery && mediaHandler) mediaQuery.removeEventListener('change', mediaHandler);
      if (flickerTimer) clearTimeout(flickerTimer);
      if (rippleTimer) clearTimeout(rippleTimer);
      unlockScroll();
    };
  });

  onDestroy(() => {
    if (pressTimer) clearTimeout(pressTimer);
    if (flickerTimer) clearTimeout(flickerTimer);
    if (rippleTimer) clearTimeout(rippleTimer);
    unlockScroll();
  });
</script>

<section
  bind:this={sceneEl}
  class={`living-field ${modeClass[fieldConfig.fieldMode]}`}
  on:pointerdown={beginLongPress}
  on:pointerup={endLongPress}
  on:pointercancel={endLongPress}
>
  <div class="living-field__mesh" aria-hidden="true"></div>
  <div class="living-field__particles" aria-hidden="true"></div>

  <svg class="living-field__synapse" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    {#if topSeed}
      <path d={flickerPath} class:flicker-on={flickerOn} />
    {/if}
  </svg>

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
    scaleBoost={reconnectFx ? 1.06 : 1}
    warmBoost={reconnectFx}
    on:press={startOrbDrag}
    on:open={handleOrbOpen}
  />

  <MoodSeeds
    open={showMoodSeeds}
    {selectedMood}
    orbX={baseOrb.x}
    orbY={baseOrb.y}
    fading={moodFading}
    on:select={(event) => dispatch('mood', event.detail)}
  />

  <ActionGate
    label={actionLabel}
    intent={actionIntent}
    x={gatePoint.x}
    y={gatePoint.y}
    orbX={orbX}
    orbY={orbY}
    active={gateActive}
    dragging={draggingOrb}
    orbStatus={companionStatus}
    showHint={showGateHint}
    hint={`Pull ${companionName ?? 'your companion'} into the glow to ${actionLabel.toLowerCase()}.`}
    on:activate={(event) => dispatch('primary', event.detail)}
  />

  {#if reconnectLine}
    <p class="living-field__reconnect-line">{reconnectLine}</p>
  {/if}

  {#if rippleOn}
    <span class="living-field__ripple" style={`left:${baseOrb.x}%; top:${baseOrb.y}%;`}></span>
  {/if}
</section>

<style>
  .living-field {
    position: relative;
    min-height: min(79vh, 43rem);
    border-radius: 1.45rem;
    border: 1px solid rgba(125, 211, 252, 0.24);
    overflow: hidden;
    background: radial-gradient(90rem 52rem at 10% -20%, rgba(56, 189, 248, 0.16), transparent 62%), #020617;
    box-shadow: 0 30px 60px rgba(2, 6, 23, 0.44);
    user-select: none;
    touch-action: none;
  }

  .living-field__mesh {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56, 189, 248, 0.08) 1px, transparent 1px);
    background-size: 1.1rem 1.1rem;
    mask-image: radial-gradient(circle at center, black 30%, transparent 78%);
    pointer-events: none;
  }

  .living-field__particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      radial-gradient(circle at 24% 18%, rgba(125, 211, 252, 0.2) 0.8px, transparent 1px),
      radial-gradient(circle at 78% 36%, rgba(125, 211, 252, 0.18) 0.8px, transparent 1px),
      radial-gradient(circle at 58% 82%, rgba(45, 212, 191, 0.2) 0.8px, transparent 1px);
    background-size: 220px 220px, 240px 240px, 200px 200px;
    animation: particleDrift 28s linear infinite;
  }

  .living-field__synapse {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .living-field__synapse path {
    stroke: rgba(56, 189, 248, 0.18);
    stroke-width: 1.4;
    fill: none;
    transition: stroke 280ms ease;
  }

  .living-field__synapse path.flicker-on {
    stroke: rgba(56, 189, 248, 0.88);
    filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.45));
  }

  .living-field__reconnect-line {
    position: absolute;
    left: 50%;
    top: 18%;
    transform: translateX(-50%);
    margin: 0;
    color: rgba(252, 211, 77, 0.95);
    font-size: 0.86rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    z-index: 10;
    text-shadow: 0 0 12px rgba(251, 191, 36, 0.32);
  }

  .living-field__ripple {
    position: absolute;
    width: 1rem;
    height: 1rem;
    border-radius: 999px;
    border: 1px solid rgba(251, 191, 36, 0.46);
    transform: translate(-50%, -50%);
    z-index: 3;
    pointer-events: none;
    animation: rippleOut 850ms ease-out;
  }

  .mode-neutral { background: radial-gradient(90rem 50rem at 12% -16%, rgba(56, 189, 248, 0.16), transparent 62%), #020617; }
  .mode-support { background: radial-gradient(90rem 50rem at 12% -16%, rgba(192, 132, 252, 0.28), transparent 58%), #020617; }
  .mode-settle { background: radial-gradient(90rem 50rem at 12% -16%, rgba(56, 189, 248, 0.2), transparent 62%), #020617; }
  .mode-settle .living-field__particles { animation-duration: 42s; opacity: 0.65; }
  .mode-explore {
    background:
      linear-gradient(115deg, rgba(14, 116, 144, 0.18), rgba(245, 158, 11, 0.14), rgba(14, 116, 144, 0.18)),
      #020617;
    background-size: 220% 220%;
    animation: sweep 10s ease-in-out infinite;
  }
  .mode-activate { background: radial-gradient(90rem 50rem at 12% -16%, rgba(34, 211, 238, 0.24), transparent 60%), #020617; }
  .mode-activate .living-field__particles { animation-duration: 14s; opacity: 1; }
  .mode-recover { background: radial-gradient(90rem 50rem at 12% -16%, rgba(148, 163, 184, 0.17), transparent 62%), #020617; filter: saturate(0.75); }

  @media (max-width: 640px) {
    .living-field {
      min-height: min(77vh, 39rem);
      border-radius: 1.2rem;
    }
  }

  @keyframes particleDrift {
    from { background-position: 0 0, 0 0, 0 0; }
    to { background-position: 180px 120px, -160px 140px, 120px -170px; }
  }

  @keyframes sweep {
    0%,100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @keyframes rippleOut {
    from {
      width: 1rem;
      height: 1rem;
      opacity: 0.65;
    }
    to {
      width: 13rem;
      height: 13rem;
      opacity: 0;
    }
  }
</style>
