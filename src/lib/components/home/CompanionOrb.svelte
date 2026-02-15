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

  $: glowClass = status === 'Distant' ? 'orb--distant' : status === 'Resonant' ? 'orb--resonant' : 'orb--steady';
  $: statusScale = status === 'Distant' ? 0.9 : status === 'Resonant' ? 1.03 : 1;
  $: baseScale = statusScale * scaleBoost;
  $: statusSaturation = status === 'Distant' ? 0.58 : status === 'Resonant' ? 1.08 : 1;
  $: glowWarm = warmBoost || status === 'Resonant';
  $: a11yLabel = `Open ${name ?? 'companion'} details. ${statusLine || status}.`;
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
  aria-label={a11yLabel}
>
  <span class="orb__outer"></span>
  <span class="orb__diffuse"></span>
  <span class="orb__bloom"></span>
  <span class="orb__core"></span>
  <span class="orb__sheen"></span>
</button>

<style>
  .orb {
    --ease-orb: cubic-bezier(0.24, 0.8, 0.34, 1);
    position: absolute;
    transform: translate(-50%, -50%) scale(var(--orb-scale, 1));
    width: clamp(7.9rem, 32vw, 9.95rem);
    aspect-ratio: 1/1;
    border-radius: 999px;
    border: none;
    background:
      radial-gradient(circle at 31% 24%, rgba(196, 236, 255, 0.56), rgba(108, 203, 255, 0.18) 30%, rgba(8, 13, 32, 0.96) 68%),
      linear-gradient(145deg, rgba(50, 110, 180, 0.5), rgba(11, 16, 34, 0.94));
    z-index: 12;
    touch-action: none;
    filter: saturate(var(--orb-sat, 1));
    box-shadow:
      0 36px 58px rgba(2, 6, 20, 0.56),
      0 0 50px rgba(126, 219, 255, 0.16),
      inset 0 -16px 22px rgba(5, 10, 26, 0.52),
      inset 0 10px 22px rgba(168, 224, 255, 0.2);
    transition: filter 620ms var(--ease-orb), box-shadow 620ms var(--ease-orb);
  }

  .orb__outer,
  .orb__diffuse,
  .orb__bloom,
  .orb__core,
  .orb__sheen {
    position: absolute;
    border-radius: 999px;
    pointer-events: none;
  }

  .orb__outer {
    inset: -10%;
    border: 1px solid rgba(132, 223, 255, 0.18);
    box-shadow: 0 0 28px rgba(132, 223, 255, 0.22);
    opacity: 0.7;
  }

  .orb__diffuse {
    inset: -24%;
    background: radial-gradient(circle, rgba(120, 213, 255, 0.22), rgba(120, 213, 255, 0) 68%);
    filter: blur(12px);
    opacity: 0.74;
  }

  .orb__bloom {
    inset: -5%;
    background: radial-gradient(circle at 36% 30%, rgba(184, 234, 255, 0.45), rgba(184, 234, 255, 0) 68%);
    mix-blend-mode: screen;
    opacity: 0.52;
  }

  .orb__core {
    inset: 21%;
    background:
      radial-gradient(circle at 35% 34%, rgba(232, 248, 255, 0.72), rgba(98, 192, 255, 0.26) 48%, rgba(98, 192, 255, 0) 70%),
      radial-gradient(circle at 65% 66%, rgba(35, 98, 170, 0.4), rgba(35, 98, 170, 0));
    filter: blur(0.2px);
    opacity: 0.85;
  }

  .orb__sheen {
    inset: 7%;
    background: conic-gradient(from 240deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0));
    filter: blur(10px);
    opacity: 0.2;
    transform: rotate(0deg);
    animation: orbShimmer 12.8s linear infinite;
  }

  .orb--steady {
    animation: orbBreath 10.2s cubic-bezier(0.37, 0, 0.2, 1) infinite;
  }

  .orb--resonant {
    animation: orbBreath 9.4s cubic-bezier(0.37, 0, 0.2, 1) infinite;
  }

  .orb--distant {
    opacity: 0.84;
    animation: orbBreathDistant 12.2s cubic-bezier(0.37, 0, 0.2, 1) infinite, orbDrift 13.8s cubic-bezier(0.37, 0, 0.2, 1) infinite;
  }

  .orb--warm {
    background:
      radial-gradient(circle at 31% 24%, rgba(255, 228, 178, 0.52), rgba(255, 175, 99, 0.2) 30%, rgba(11, 10, 24, 0.96) 68%),
      linear-gradient(145deg, rgba(182, 118, 78, 0.44), rgba(14, 13, 32, 0.94));
    box-shadow:
      0 36px 58px rgba(8, 7, 20, 0.58),
      0 0 58px rgba(255, 196, 132, 0.26),
      inset 0 -16px 22px rgba(8, 6, 20, 0.54),
      inset 0 10px 22px rgba(255, 205, 150, 0.22);
  }

  @media (min-width: 900px) {
    .orb {
      width: clamp(8.4rem, 20vw, 10rem);
    }
  }

  @keyframes orbBreath {
    0%,
    100% {
      transform: translate(-50%, -50%) scale(var(--orb-scale, 1));
    }
    48% {
      transform: translate(-50%, -50%) scale(calc(var(--orb-scale, 1) * 1.032));
    }
  }

  @keyframes orbBreathDistant {
    0%,
    100% {
      transform: translate(-50%, -50%) scale(var(--orb-scale, 1));
      filter: saturate(var(--orb-sat, 1)) brightness(0.9);
    }
    50% {
      transform: translate(-50%, -50%) scale(calc(var(--orb-scale, 1) * 0.98));
      filter: saturate(var(--orb-sat, 1)) brightness(0.84);
    }
  }

  @keyframes orbDrift {
    0%,
    100% {
      transform: translate(-50%, -50%) scale(var(--orb-scale, 1));
    }
    50% {
      transform: translate(-47.5%, -51.7%) scale(calc(var(--orb-scale, 1) * 0.97));
    }
  }

  @keyframes orbShimmer {
    0% {
      transform: rotate(0deg);
      opacity: 0.16;
    }
    50% {
      transform: rotate(180deg);
      opacity: 0.26;
    }
    100% {
      transform: rotate(360deg);
      opacity: 0.16;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .orb,
    .orb__sheen {
      animation: none;
    }
  }
</style>
