<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let name: string | null = null;
  export let status: 'Distant' | 'Synced' | 'Resonant' | 'Steady' = 'Steady';
  export let statusLine: string = '';
  export let x = 50;
  export let y = 44;
  export let scaleBoost = 1;
  export let warmBoost = false;

  const dispatch = createEventDispatcher<{ open: Record<string, never>; press: { clientX: number; clientY: number; pointerId: number } }>();

  $: glowClass = status === 'Distant' ? 'orb--dim' : status === 'Resonant' ? 'orb--resonant' : 'orb--steady';
  $: statusScale = status === 'Distant' ? 0.92 : status === 'Resonant' ? 1.04 : 1;
  $: baseScale = statusScale * scaleBoost;
  $: statusSaturation = status === 'Distant' ? 0.68 : status === 'Resonant' ? 1.08 : 1;
  $: glowWarm = warmBoost || status === 'Resonant';
</script>

<button
  class={`orb ${glowClass} ${glowWarm ? 'orb--warm' : ''}`}
  style={`left:${x}%; top:${y}%; --orb-scale:${baseScale}; --orb-sat:${statusSaturation};`}
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
    transform: translate(-50%, -50%) scale(var(--orb-scale, 1));
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
    filter: saturate(var(--orb-sat, 1));
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
    animation: pulseDim 5.2s ease-in-out infinite, distantDrift 7.6s ease-in-out infinite;
  }

  .orb--steady {
    animation: pulseSteady 3.1s ease-in-out infinite;
  }

  .orb--resonant {
    animation: shimmer 2.2s linear infinite;
  }

  .orb--warm {
    border-color: rgba(251, 191, 36, 0.35);
    background: radial-gradient(circle at 34% 30%, rgba(251, 191, 36, 0.22), rgba(2, 6, 23, 0.9) 62%);
  }

  @keyframes pulseDim {
    0%,100% { box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.04), 0 12px 22px rgba(2, 6, 23, 0.34); }
    50% { box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.08), 0 16px 30px rgba(2, 6, 23, 0.4); }
  }

  @keyframes pulseSteady {
    0%,100% { transform: translate(-50%, -50%) scale(var(--orb-scale, 1)); }
    50% { transform: translate(-50%, -50%) scale(calc(var(--orb-scale, 1) * 1.025)); }
  }

  @keyframes shimmer {
    0% { box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.12), 0 18px 36px rgba(2, 6, 23, 0.5); }
    50% { box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.24), 0 22px 42px rgba(2, 6, 23, 0.58); }
    100% { box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.2), 0 20px 40px rgba(2, 6, 23, 0.54); }
  }

  @keyframes distantDrift {
    0%,100% { transform: translate(-50%, -50%) scale(var(--orb-scale, 1)); }
    50% { transform: translate(-47%, -53%) scale(var(--orb-scale, 1)); }
  }
</style>
