<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { PrimaryAction } from '$lib/home/fieldEngine';

  export let label = 'Act now';
  export let intent: PrimaryAction = 'MICRO_RITUAL';
  export let x = 50;
  export let y = 72;
  export let orbX = 50;
  export let orbY = 42;
  export let active = false;
  export let dragging = false;
  export let orbStatus: 'Distant' | 'Synced' | 'Resonant' | 'Steady' = 'Steady';
  export let hint = '';
  export let showHint = false;
  export let pulseCount = 0;

  const dispatch = createEventDispatcher<{ activate: { intent: PrimaryAction } }>();

  let previousPulse = pulseCount;
  let snapFlare = false;
  let echoText = false;
  let flareTimer: ReturnType<typeof setTimeout> | null = null;
  let echoTimer: ReturnType<typeof setTimeout> | null = null;

  $: gateClass = active || dragging ? 'gate--open' : 'gate--rest';

  $: if (pulseCount !== previousPulse) {
    previousPulse = pulseCount;
    snapFlare = true;
    echoText = true;
    if (flareTimer) clearTimeout(flareTimer);
    if (echoTimer) clearTimeout(echoTimer);
    flareTimer = setTimeout(() => {
      snapFlare = false;
      flareTimer = null;
    }, 760);
    echoTimer = setTimeout(() => {
      echoText = false;
      echoTimer = null;
    }, 1200);
  }

  onDestroy(() => {
    if (flareTimer) clearTimeout(flareTimer);
    if (echoTimer) clearTimeout(echoTimer);
  });
</script>

<div class="gate-layer" style={`--gate-x:${x}%; --gate-y:${y}%; --orb-x:${orbX}%; --orb-y:${orbY}%;`}>
  <div class={`gate ${gateClass} ${orbStatus === 'Distant' ? 'gate--distant' : ''} ${snapFlare ? 'gate--snap' : ''}`}>
    <span class="gate__floor"></span>
    <span class="gate__bloom"></span>
    <span class="gate__lift"></span>
    <span class="gate__particles" aria-hidden="true"></span>
    {#if echoText}
      <p class="gate__echo">She's closer.</p>
    {/if}

    <button class="gate__hit" type="button" aria-label={label} on:click={() => dispatch('activate', { intent })}></button>
  </div>

  {#if showHint && hint}
    <p class="gate__hint">{hint}</p>
  {/if}
</div>

<style>
  .gate-layer {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
  }

  .gate {
    position: absolute;
    left: var(--gate-x);
    top: var(--gate-y);
    transform: translate(-50%, -50%);
    width: min(78vw, 19rem);
    height: clamp(4.6rem, 16vw, 5.8rem);
    pointer-events: none;
  }

  .gate__floor,
  .gate__bloom,
  .gate__lift,
  .gate__particles {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    pointer-events: none;
  }

  .gate__floor {
    background:
      radial-gradient(62% 72% at 50% 64%, rgba(121, 250, 216, 0.26), rgba(121, 250, 216, 0) 74%),
      radial-gradient(52% 68% at 50% 78%, rgba(255, 200, 128, 0.16), rgba(255, 200, 128, 0) 78%);
    filter: blur(2px);
    opacity: 0.34;
    transform: scale(0.94);
    transition: opacity 420ms cubic-bezier(0.24, 0.8, 0.34, 1), transform 420ms cubic-bezier(0.24, 0.8, 0.34, 1);
  }

  .gate__bloom {
    inset: 12% 16%;
    background: radial-gradient(circle at 50% 50%, rgba(119, 247, 214, 0.2), rgba(119, 247, 214, 0));
    filter: blur(14px);
    opacity: 0.32;
    transform: scale(0.92);
    transition: opacity 460ms cubic-bezier(0.24, 0.8, 0.34, 1), transform 460ms cubic-bezier(0.24, 0.8, 0.34, 1);
  }

  .gate__lift {
    inset: 8% 22%;
    border-top: 1px solid rgba(164, 255, 236, 0.24);
    border-bottom: 1px solid rgba(164, 255, 236, 0.05);
    filter: blur(0.2px);
    opacity: 0.42;
    transition: opacity 420ms cubic-bezier(0.24, 0.8, 0.34, 1);
  }

  .gate__particles {
    inset: 20% 16%;
    background-image:
      radial-gradient(circle at 16% 86%, rgba(188, 255, 243, 0.44) 0.8px, rgba(188, 255, 243, 0) 1.8px),
      radial-gradient(circle at 50% 84%, rgba(188, 255, 243, 0.4) 0.8px, rgba(188, 255, 243, 0) 1.8px),
      radial-gradient(circle at 84% 84%, rgba(188, 255, 243, 0.4) 0.8px, rgba(188, 255, 243, 0) 1.8px);
    animation: rise 11.5s linear infinite;
    opacity: 0.2;
    filter: blur(0.2px);
  }

  .gate--open .gate__floor {
    opacity: 0.62;
    transform: scale(1.05);
  }

  .gate--open .gate__bloom {
    opacity: 0.62;
    transform: scale(1.06);
  }

  .gate--open .gate__lift {
    opacity: 0.74;
  }

  .gate--distant .gate__floor,
  .gate--distant .gate__bloom {
    opacity: 0.2;
  }

  .gate--distant.gate--open .gate__floor,
  .gate--distant.gate--open .gate__bloom {
    opacity: 0.68;
  }

  .gate--snap {
    animation: snapPulse 760ms cubic-bezier(0.2, 0.74, 0.2, 1) both;
  }

  .gate__hit {
    position: absolute;
    inset: -14% -6%;
    border: none;
    border-radius: 999px;
    background: transparent;
    pointer-events: auto;
    cursor: pointer;
  }

  .gate__echo {
    position: absolute;
    left: 50%;
    top: -0.6rem;
    transform: translateX(-50%);
    margin: 0;
    color: rgba(255, 224, 171, 0.98);
    font-size: 0.74rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 520;
    text-shadow: 0 0 14px rgba(255, 200, 128, 0.3);
    animation: echoIn 1200ms ease both;
    pointer-events: none;
  }

  .gate__hint {
    position: absolute;
    left: 50%;
    top: calc(var(--gate-y) - 5.15rem);
    transform: translateX(-50%);
    margin: 0;
    font-size: 0.62rem;
    color: rgba(199, 228, 237, 0.58);
    text-align: center;
    max-width: min(78vw, 17rem);
    line-height: 1.2;
    letter-spacing: 0.045em;
    text-transform: uppercase;
    pointer-events: none;
  }

  @keyframes rise {
    0% {
      background-position: 0 0, 0 0, 0 0;
      opacity: 0.16;
    }
    50% {
      opacity: 0.26;
    }
    100% {
      background-position: 0 -1.2rem, 0 -1.6rem, 0 -1.35rem;
      opacity: 0.12;
    }
  }

  @keyframes snapPulse {
    0% {
      transform: translate(-50%, -50%) scale(1);
      filter: brightness(1);
    }
    45% {
      transform: translate(-50%, -50%) scale(1.08);
      filter: brightness(1.3);
    }
    100% {
      transform: translate(-50%, -50%) scale(1);
      filter: brightness(1);
    }
  }

  @keyframes echoIn {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(0.32rem);
    }
    20% {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-0.2rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .gate__particles,
    .gate--snap,
    .gate__echo {
      animation: none;
    }
  }
</style>
