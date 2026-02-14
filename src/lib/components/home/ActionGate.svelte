<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PrimaryAction } from '$lib/home/fieldEngine';

  export let label = 'Act now';
  export let intent: PrimaryAction = 'MICRO_RITUAL';
  export let x = 50;
  export let y = 76;
  export let orbX = 50;
  export let orbY = 42;
  export let active = false;
  export let dragging = false;
  export let orbStatus: 'Distant' | 'Synced' | 'Resonant' | 'Steady' = 'Steady';
  export let hint = '';
  export let showHint = false;

  const dispatch = createEventDispatcher<{ activate: { intent: PrimaryAction } }>();
</script>

<div class="gate-layer" style={`--gate-x:${x}%; --gate-y:${y}%; --orb-x:${orbX}%; --orb-y:${orbY}%;`}>
  <svg class="gate-tether" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path d={`M ${orbX} ${orbY + 7} Q ${orbX} ${(orbY + y) / 2} ${x} ${y - 5}`} />
  </svg>

  <button class={`gate ${active ? 'gate--active' : ''} ${dragging ? 'gate--dragging' : ''} ${orbStatus === 'Distant' ? 'gate--distant' : ''}`} type="button" aria-label={label} on:click={() => dispatch('activate', { intent })}>
    <span class="gate__arc"></span>
    <span class="gate__core">{label}</span>
  </button>

  {#if showHint && hint}
    <p class="gate__hint">{hint}</p>
  {/if}
</div>

<style>
  .gate-layer {
    position: absolute;
    inset: 0;
    z-index: 7;
    pointer-events: none;
  }

  .gate-tether {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .gate-tether path {
    stroke: rgba(56, 189, 248, 0.52);
    stroke-width: 1.8;
    fill: none;
    filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.25));
    stroke-dasharray: 3 6;
    animation: tetherShift 2.8s linear infinite;
  }

  .gate {
    pointer-events: auto;
    position: absolute;
    left: var(--gate-x);
    top: var(--gate-y);
    transform: translate(-50%, -50%);
    width: min(78vw, 17rem);
    height: 4rem;
    border: none;
    background: transparent;
    padding: 0;
  }

  .gate__arc {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    border: 1px solid rgba(45, 212, 191, 0.42);
    mask: linear-gradient(to top, transparent 15%, black 40%, black 100%);
    box-shadow: inset 0 0 24px rgba(45, 212, 191, 0.26), 0 10px 24px rgba(45, 212, 191, 0.18);
  }

  .gate__core {
    position: absolute;
    left: 50%;
    bottom: 0.2rem;
    transform: translateX(-50%);
    color: rgba(224, 242, 254, 0.94);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-shadow: 0 0 10px rgba(56, 189, 248, 0.28);
  }

  .gate--active .gate__arc {
    border-color: rgba(45, 212, 191, 0.72);
    box-shadow: inset 0 0 24px rgba(45, 212, 191, 0.3), 0 14px 28px rgba(45, 212, 191, 0.32);
  }

  .gate--distant .gate__arc {
    border-color: rgba(45, 212, 191, 0.24);
    box-shadow: inset 0 0 14px rgba(45, 212, 191, 0.12), 0 8px 16px rgba(45, 212, 191, 0.12);
  }

  .gate--distant.gate--dragging .gate__arc,
  .gate--distant.gate--active .gate__arc {
    border-color: rgba(45, 212, 191, 0.82);
    box-shadow: inset 0 0 26px rgba(45, 212, 191, 0.34), 0 18px 32px rgba(45, 212, 191, 0.38);
  }

  .gate__hint {
    position: absolute;
    left: 50%;
    top: calc(var(--gate-y) - 6.3rem);
    transform: translateX(-50%);
    margin: 0;
    font-size: 0.74rem;
    color: rgba(186, 230, 253, 0.9);
    text-align: center;
    max-width: min(84vw, 20rem);
    line-height: 1.3;
    pointer-events: none;
  }

  @keyframes tetherShift {
    from { stroke-dashoffset: 0; }
    to { stroke-dashoffset: -18; }
  }
</style>
