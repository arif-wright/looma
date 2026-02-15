<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let name: string | null = null;
  export let status: 'Distant' | 'Synced' | 'Resonant' | 'Steady' = 'Steady';
  export let statusLine: string = '';
  export let x = 50;
  export let y = 44;
  export let scaleBoost = 1;
  export let warmBoost = false;
  export let tiltX = 0;
  export let tiltY = 0;
  export let dragProgress = 0;
  export let successBoost = false;

  const dispatch = createEventDispatcher<{ open: Record<string, never>; press: { clientX: number; clientY: number; pointerId: number } }>();

  $: glowClass = status === 'Distant' ? 'orb--distant' : status === 'Resonant' ? 'orb--resonant' : 'orb--steady';
  $: statusScale = status === 'Distant' ? 0.93 : status === 'Resonant' ? 1.03 : 1;
  $: baseScale = statusScale * scaleBoost;
  $: statusSaturation = status === 'Distant' ? 0.62 : status === 'Resonant' ? 1.1 : 1;
  $: glowWarm = warmBoost || status === 'Resonant';
  $: a11yLabel = `Open ${name ?? 'companion'} details. ${statusLine || status}.`;
</script>

<button
  class={`orb ${glowClass} ${glowWarm ? 'orb--warm' : ''} ${successBoost ? 'orb--success' : ''}`}
  style={`left:${x}%; top:${y}%; --orb-scale:${baseScale}; --orb-sat:${statusSaturation}; --tilt-x:${tiltX}; --tilt-y:${tiltY}; --drag-p:${dragProgress};`}
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
  <span class="orb__outer-diffusion"></span>
  <span class="orb__ring"></span>
  <span class="orb__mid-glass"></span>
  <span class="orb__inner-core"></span>
  <span class="orb__refraction"></span>
</button>

<style>
  .orb {
    --ease-orb: cubic-bezier(0.16, 0.84, 0.32, 1);
    position: absolute;
    transform: translate(-50%, -50%) scale(var(--orb-scale, 1));
    width: clamp(7.8rem, 30vw, 9.8rem);
    aspect-ratio: 1/1;
    border-radius: 999px;
    border: none;
    background:
      radial-gradient(circle at 36% 28%, rgba(219, 244, 255, 0.48), rgba(134, 219, 255, 0.16) 35%, rgba(8, 16, 40, 0.92) 72%),
      linear-gradient(152deg, rgba(72, 131, 209, 0.36), rgba(8, 14, 34, 0.94));
    z-index: 14;
    touch-action: none;
    filter: saturate(var(--orb-sat, 1));
    box-shadow:
      0 34px 58px rgba(1, 6, 19, 0.58),
      0 0 68px rgba(130, 220, 255, calc(0.14 + (var(--drag-p) * 0.2))),
      inset 0 -14px 24px rgba(3, 10, 28, 0.58),
      inset 0 12px 24px rgba(185, 230, 255, calc(0.16 + (var(--drag-p) * 0.16)));
    transition: box-shadow 420ms var(--ease-orb), filter 420ms var(--ease-orb), opacity 420ms var(--ease-orb);
  }

  .orb__outer-diffusion,
  .orb__ring,
  .orb__mid-glass,
  .orb__inner-core,
  .orb__refraction {
    position: absolute;
    border-radius: 999px;
    pointer-events: none;
  }

  .orb__outer-diffusion {
    inset: -22%;
    background: radial-gradient(circle, rgba(114, 215, 255, calc(0.22 + (var(--drag-p) * 0.2))), rgba(114, 215, 255, 0) 70%);
    filter: blur(14px);
    opacity: 0.65;
    transition: all 420ms var(--ease-orb);
  }

  .orb__ring {
    inset: calc(3% + (var(--drag-p) * 1.2%));
    border: 1px solid rgba(174, 236, 255, calc(0.24 + (var(--drag-p) * 0.26)));
    transform: scale(calc(1 - (var(--drag-p) * 0.05)));
    transition: all 360ms var(--ease-orb);
  }

  .orb__mid-glass {
    inset: 8%;
    background:
      radial-gradient(circle at 33% 28%, rgba(206, 238, 255, 0.45), rgba(206, 238, 255, 0) 48%),
      radial-gradient(circle at 66% 72%, rgba(79, 139, 210, 0.38), rgba(79, 139, 210, 0) 68%);
    mix-blend-mode: screen;
    opacity: 0.46;
    transform: translate3d(calc(var(--tilt-x) * 0.16rem), calc(var(--tilt-y) * 0.12rem), 0);
    transition: transform 520ms var(--ease-orb);
  }

  .orb__inner-core {
    inset: 23%;
    background:
      radial-gradient(circle at 37% 36%, rgba(237, 248, 255, calc(0.74 + (var(--drag-p) * 0.18))), rgba(132, 214, 255, 0.28) 54%, rgba(132, 214, 255, 0) 72%),
      radial-gradient(circle at 62% 65%, rgba(39, 99, 172, 0.42), rgba(39, 99, 172, 0));
    opacity: 0.84;
    filter: blur(0.25px);
    transform: translate3d(calc(var(--tilt-x) * 0.1rem), calc(var(--tilt-y) * 0.08rem), 0);
    transition: transform 520ms var(--ease-orb);
  }

  .orb__refraction {
    inset: 2%;
    background: linear-gradient(118deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0));
    filter: blur(12px);
    opacity: 0.18;
    animation: refractionSweep 13.5s cubic-bezier(0.3, 0.1, 0.2, 1) infinite;
  }

  .orb--steady {
    animation: orbBreath 11s cubic-bezier(0.34, 0, 0.2, 1) infinite;
  }

  .orb--resonant {
    animation: orbBreath 9.8s cubic-bezier(0.34, 0, 0.2, 1) infinite;
  }

  .orb--distant {
    opacity: 0.82;
    animation: orbBreathDistant 13.8s cubic-bezier(0.34, 0, 0.2, 1) infinite;
  }

  .orb--success {
    box-shadow:
      0 34px 58px rgba(1, 6, 19, 0.58),
      0 0 84px rgba(255, 204, 150, 0.26),
      inset 0 -14px 24px rgba(3, 10, 28, 0.58),
      inset 0 12px 24px rgba(255, 224, 178, 0.24);
  }

  .orb--warm {
    background:
      radial-gradient(circle at 36% 28%, rgba(255, 231, 192, 0.52), rgba(255, 171, 112, 0.2) 35%, rgba(13, 16, 36, 0.92) 72%),
      linear-gradient(152deg, rgba(187, 126, 96, 0.36), rgba(10, 12, 31, 0.94));
  }

  @media (min-width: 900px) {
    .orb {
      width: clamp(8.4rem, 19vw, 10rem);
    }
  }

  @keyframes orbBreath {
    0%, 100% { transform: translate(-50%, -50%) scale(var(--orb-scale, 1)); }
    50% { transform: translate(-50%, -50%) scale(calc(var(--orb-scale, 1) * 1.032)); }
  }

  @keyframes orbBreathDistant {
    0%, 100% {
      transform: translate(-50%, -50%) translateY(0) scale(var(--orb-scale, 1));
      filter: saturate(var(--orb-sat, 1)) brightness(0.88);
    }
    50% {
      transform: translate(-50%, -50%) translateY(0.45rem) scale(calc(var(--orb-scale, 1) * 0.985));
      filter: saturate(var(--orb-sat, 1)) brightness(0.82);
    }
  }

  @keyframes refractionSweep {
    0% { transform: translateX(-34%) rotate(7deg); opacity: 0.12; }
    45% { opacity: 0.24; }
    100% { transform: translateX(34%) rotate(7deg); opacity: 0.12; }
  }

  @media (prefers-reduced-motion: reduce) {
    .orb,
    .orb__refraction {
      animation: none;
    }
  }
</style>
