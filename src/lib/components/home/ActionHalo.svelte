<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PrimaryAction } from '$lib/home/fieldEngine';

  export let label = 'Do this now';
  export let intent: PrimaryAction = 'MICRO_RITUAL';
  export let x = 50;
  export let y = 83;
  export let orbX = 50;
  export let orbY = 44;
  export let orbStatus: 'Distant' | 'Synced' | 'Resonant' | 'Steady' = 'Steady';

  const dispatch = createEventDispatcher<{ activate: { intent: PrimaryAction } }>();

  $: pulseClass = orbStatus === 'Distant' ? 'halo--slow' : orbStatus === 'Resonant' ? 'halo--bright' : 'halo--steady';
</script>

<div class="tether-layer" aria-hidden="true">
  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
    <defs>
      <linearGradient id="halo-tether" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(45,212,191,0.15)" />
        <stop offset="45%" stop-color="rgba(56,189,248,0.85)" />
        <stop offset="100%" stop-color="rgba(45,212,191,0.12)" />
      </linearGradient>
    </defs>
    <path d={`M ${orbX} ${orbY + 7} Q 52 ${(orbY + y) / 2} ${x} ${y - 4}`} stroke="url(#halo-tether)" stroke-width="1.6" fill="none" />
  </svg>
</div>

<button class={`halo ${pulseClass}`} style={`left:${x}%; top:${y}%;`} type="button" on:click={() => dispatch('activate', { intent })} aria-label={label}>
  <span class="halo__inner">{label}</span>
</button>

<style>
  .tether-layer {
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
  }

  .tether-layer svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.35));
  }

  .halo {
    position: absolute;
    transform: translate(-50%, -50%);
    width: min(86vw, 19.5rem);
    min-height: 2.9rem;
    border-radius: 999px;
    border: 1px solid rgba(45, 212, 191, 0.55);
    background: linear-gradient(135deg, rgba(45, 212, 191, 0.95), rgba(56, 189, 248, 0.94));
    color: rgba(2, 6, 23, 0.95);
    box-shadow: 0 14px 30px rgba(45, 212, 191, 0.3);
    z-index: 6;
    padding: 0.18rem;
  }

  .halo__inner {
    display: grid;
    place-items: center;
    min-height: 2.5rem;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    background: linear-gradient(145deg, rgba(236, 253, 245, 0.3), rgba(255, 255, 255, 0));
  }

  .halo--slow {
    animation: haloSlow 2.8s ease-in-out infinite;
  }

  .halo--steady {
    animation: haloSteady 2.1s ease-in-out infinite;
  }

  .halo--bright {
    animation: haloBright 1.6s ease-in-out infinite;
  }

  @keyframes haloSlow {
    0%,
    100% {
      box-shadow: 0 10px 22px rgba(45, 212, 191, 0.2);
    }
    50% {
      box-shadow: 0 16px 30px rgba(45, 212, 191, 0.32);
    }
  }

  @keyframes haloSteady {
    0%,
    100% {
      box-shadow: 0 12px 24px rgba(45, 212, 191, 0.24);
    }
    50% {
      box-shadow: 0 16px 30px rgba(45, 212, 191, 0.34);
    }
  }

  @keyframes haloBright {
    0%,
    100% {
      box-shadow: 0 14px 26px rgba(56, 189, 248, 0.32);
    }
    50% {
      box-shadow: 0 20px 34px rgba(56, 189, 248, 0.5);
    }
  }
</style>
