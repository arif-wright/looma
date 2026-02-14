<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let name: string | null = null;
  export let status: 'Distant' | 'Synced' | 'Resonant' | 'Steady' = 'Steady';
  export let statusLine: string = '';
  export let x = 50;
  export let y = 44;

  const dispatch = createEventDispatcher<{ open: Record<string, never>; press: { clientX: number; clientY: number; pointerId: number } }>();

  $: glowClass = status === 'Distant' ? 'orb--dim' : status === 'Resonant' ? 'orb--resonant' : 'orb--steady';
</script>

<button
  class={`orb ${glowClass}`}
  style={`left:${x}%; top:${y}%;`}
  type="button"
  on:pointerdown={(event) =>
    dispatch('press', {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId
    })}
  on:click={() => dispatch('open', {})}
  aria-label="Open companion details"
>
  <span class="orb__core"></span>
  <span class="orb__ring"></span>
  <span class="orb__name">{name ?? 'Companion'}</span>
  <span class="orb__status">{statusLine || status}</span>
</button>

<style>
  .orb {
    position: absolute;
    transform: translate(-50%, -50%);
    width: clamp(6.6rem, 27vw, 9rem);
    aspect-ratio: 1/1;
    border-radius: 999px;
    border: 1px solid rgba(125, 211, 252, 0.34);
    background: radial-gradient(circle at 34% 30%, rgba(56, 189, 248, 0.36), rgba(2, 6, 23, 0.9) 62%);
    color: rgba(224, 242, 254, 0.96);
    display: grid;
    place-content: center;
    text-align: center;
    gap: 0.16rem;
    z-index: 8;
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.08), 0 18px 34px rgba(2, 6, 23, 0.45);
    touch-action: none;
  }

  .orb__core,
  .orb__ring {
    position: absolute;
    border-radius: 999px;
    pointer-events: none;
  }

  .orb__core {
    inset: 18%;
    border: 1px solid rgba(125, 211, 252, 0.35);
  }

  .orb__ring {
    inset: -7%;
    border: 1px solid rgba(56, 189, 248, 0.2);
  }

  .orb__name {
    font-size: 0.84rem;
    font-weight: 700;
    z-index: 1;
    line-height: 1.1;
    padding: 0 0.35rem;
  }

  .orb__status {
    font-size: 0.63rem;
    color: rgba(186, 230, 253, 0.86);
    letter-spacing: 0.03em;
    z-index: 1;
    line-height: 1.2;
    padding: 0 0.45rem;
  }

  .orb--dim {
    filter: saturate(0.75) brightness(0.83);
    animation: pulseDim 4.2s ease-in-out infinite;
  }

  .orb--steady {
    animation: pulseSteady 3.1s ease-in-out infinite;
  }

  .orb--resonant {
    animation: shimmer 2.2s linear infinite;
  }

  @keyframes pulseDim {
    0%,100% { box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.05), 0 14px 28px rgba(2, 6, 23, 0.36); }
    50% { box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.1), 0 18px 34px rgba(2, 6, 23, 0.42); }
  }

  @keyframes pulseSteady {
    0%,100% { transform: translate(-50%, -50%) scale(1); }
    50% { transform: translate(-50%, -50%) scale(1.025); }
  }

  @keyframes shimmer {
    0% { box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.12), 0 18px 36px rgba(2, 6, 23, 0.5); }
    50% { box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.24), 0 22px 42px rgba(2, 6, 23, 0.58); }
    100% { box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.2), 0 20px 40px rgba(2, 6, 23, 0.54); }
  }
</style>
