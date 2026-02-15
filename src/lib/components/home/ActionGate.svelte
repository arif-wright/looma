<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { PrimaryAction } from '$lib/home/fieldEngine';

  export let label = 'Act now';
  export let intent: PrimaryAction = 'MICRO_RITUAL';
  export let caption = 'Reconnect';
  export let x = 50;
  export let y = 72;
  export let orbX = 50;
  export let orbY = 42;
  export let active = false;
  export let dragging = false;
  export let progress = 0;
  export let orbStatus: 'Distant' | 'Synced' | 'Resonant' | 'Steady' = 'Steady';
  export let hint = '';
  export let showHint = false;
  export let pulseCount = 0;

  const dispatch = createEventDispatcher<{ activate: { intent: PrimaryAction } }>();

  let previousPulse = pulseCount;
  let snapFlare = false;
  let screenPulse = false;

  let flareTimer: ReturnType<typeof setTimeout> | null = null;
  let screenTimer: ReturnType<typeof setTimeout> | null = null;

  $: gateClass = active || dragging ? 'gate--open' : 'gate--rest';

  $: if (pulseCount !== previousPulse) {
    previousPulse = pulseCount;
    snapFlare = true;
    screenPulse = true;

    if (flareTimer) clearTimeout(flareTimer);
    if (screenTimer) clearTimeout(screenTimer);

    flareTimer = setTimeout(() => {
      snapFlare = false;
      flareTimer = null;
    }, 1250);

    screenTimer = setTimeout(() => {
      screenPulse = false;
      screenTimer = null;
    }, 1800);
  }

  onDestroy(() => {
    if (flareTimer) clearTimeout(flareTimer);
    if (screenTimer) clearTimeout(screenTimer);
  });
</script>

<div class="gate-layer" style={`--gate-x:${x}%; --gate-y:${y}%; --progress:${progress}; --orb-x:${orbX}%; --orb-y:${orbY}%;`}>
  {#if screenPulse}
    <span class="gate__screen-pulse" aria-hidden="true"></span>
  {/if}

  <div class={`gate ${gateClass} ${orbStatus === 'Distant' ? 'gate--distant' : ''} ${snapFlare ? 'gate--snap' : ''}`}>
    <span class="gate__pool"></span>
    <span class="gate__mist"></span>
    <span class="gate__ripple"></span>

    <button class="gate__hit" type="button" aria-label={label} on:click={() => dispatch('activate', { intent })}></button>
  </div>

  <p class="gate__caption">{caption}</p>

  {#if showHint && hint}
    <p class="gate__hint">{hint}</p>
  {/if}
</div>

<style>
  .gate-layer {
    position: absolute;
    inset: 0;
    z-index: 16;
    pointer-events: none;
  }

  .gate {
    position: absolute;
    left: var(--gate-x);
    top: var(--gate-y);
    transform: translate(-50%, -50%);
    width: min(80vw, 23rem);
    height: clamp(5.4rem, 18vw, 7rem);
    pointer-events: none;
  }

  .gate__pool,
  .gate__mist,
  .gate__ripple {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    pointer-events: none;
  }

  .gate__pool {
    background:
      radial-gradient(60% 70% at 50% 62%, rgba(130, 245, 225, calc(0.24 + (var(--progress) * 0.28))), rgba(130, 245, 225, 0) 72%),
      radial-gradient(48% 62% at 50% 75%, rgba(255, 198, 137, calc(0.13 + (var(--progress) * 0.14))), rgba(255, 198, 137, 0) 78%);
    filter: blur(2px);
    opacity: 0.38;
    transform: scale(calc(0.94 + (var(--progress) * 0.08)));
    transition: all 420ms cubic-bezier(0.16, 0.84, 0.32, 1);
  }

  .gate__mist {
    inset: 8% 16%;
    background: radial-gradient(circle at 50% 70%, rgba(176, 255, 241, calc(0.19 + (var(--progress) * 0.18))), rgba(176, 255, 241, 0));
    filter: blur(16px);
    opacity: 0.3;
    transform: translateY(calc(0.3rem - (var(--progress) * 0.3rem))) scale(calc(0.94 + (var(--progress) * 0.08)));
    transition: all 420ms cubic-bezier(0.16, 0.84, 0.32, 1);
  }

  .gate__ripple {
    inset: 24% 26%;
    border: 1px solid rgba(168, 255, 239, calc(0.22 + (var(--progress) * 0.3)));
    opacity: 0;
    transform: scale(0.72);
  }

  .gate--open .gate__ripple {
    opacity: 0.52;
    animation: activeRipple 1800ms cubic-bezier(0.16, 0.84, 0.32, 1) infinite;
  }

  .gate--distant .gate__pool,
  .gate--distant .gate__mist {
    opacity: 0.24;
  }

  .gate--snap {
    animation: gatePulse 1250ms cubic-bezier(0.16, 0.84, 0.32, 1) both;
  }

  .gate__hit {
    position: absolute;
    inset: -16% -8%;
    border: none;
    border-radius: 999px;
    background: transparent;
    pointer-events: auto;
    cursor: pointer;
  }

  .gate__caption {
    position: absolute;
    left: var(--gate-x);
    top: calc(var(--gate-y) + 3.25rem);
    transform: translateX(-50%);
    margin: 0;
    color: rgba(199, 220, 239, 0.62);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 500;
  }

  .gate__hint {
    position: absolute;
    left: 50%;
    top: calc(var(--gate-y) - 4.8rem);
    transform: translateX(-50%);
    margin: 0;
    font-size: 0.6rem;
    color: rgba(198, 219, 238, 0.52);
    text-align: center;
    max-width: min(74vw, 16rem);
    line-height: 1.2;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    pointer-events: none;
  }

  .gate__screen-pulse {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at var(--gate-x) var(--gate-y), rgba(255, 210, 146, 0.28), rgba(255, 210, 146, 0) 54%);
    opacity: 0;
    animation: scenePulse 1800ms cubic-bezier(0.16, 0.84, 0.32, 1) both;
    pointer-events: none;
  }

  @keyframes activeRipple {
    0% { transform: scale(0.78); opacity: 0.38; }
    100% { transform: scale(1.42); opacity: 0; }
  }

  @keyframes gatePulse {
    0% { transform: translate(-50%, -50%) scale(1); filter: brightness(1); }
    45% { transform: translate(-50%, -50%) scale(1.08); filter: brightness(1.28); }
    100% { transform: translate(-50%, -50%) scale(1); filter: brightness(1); }
  }

  @keyframes scenePulse {
    0% { opacity: 0; transform: scale(0.5); }
    26% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.8); }
  }

  @media (prefers-reduced-motion: reduce) {
    .gate--snap,
    .gate__ripple,
    .gate__screen-pulse {
      animation: none;
    }
  }
</style>
