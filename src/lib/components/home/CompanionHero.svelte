<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { onMount } from 'svelte';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';
  import type { MuseAnimationName } from '$lib/companions/museAnimations';
  import type { MuseVisualMood } from '$lib/companions/museVisuals';

  export let name = 'Mirae';
  export let avatarUrl: string | null = null;
  export let closenessState: 'Distant' | 'Near' | 'Resonant' = 'Near';
  export let activityState: 'idle' | 'attending' | 'composing' | 'responding' = 'idle';
  export let animationName: MuseAnimationName = 'Idle';

  const dispatch = createEventDispatcher<{ open: Record<string, never> }>();

  let tiltX = 0;
  let tiltY = 0;
  let ambientX = 0;
  let ambientY = 0;
  let presenceBoost = 0;
  let presenceDecayTimer: ReturnType<typeof setTimeout> | null = null;
  let ambientTimer: ReturnType<typeof setInterval> | null = null;

  const updateTiltFromViewport = (clientX: number, clientY: number) => {
    const x = clientX / Math.max(1, window.innerWidth) - 0.5;
    const y = clientY / Math.max(1, window.innerHeight) - 0.5;
    tiltY = x * 14;
    tiltX = y * -10;
    presenceBoost = 1;
    if (presenceDecayTimer) clearTimeout(presenceDecayTimer);
    presenceDecayTimer = setTimeout(() => {
      presenceBoost = 0;
      presenceDecayTimer = null;
    }, 1200);
  };

  const resetTilt = () => {
    tiltX = 0;
    tiltY = 0;
  };

  $: baseIntensity = closenessState === 'Distant' ? 0.68 : closenessState === 'Resonant' ? 1.06 : 0.9;
  $: activityBoost = activityState === 'responding' ? 0.3 : activityState === 'composing' ? 0.2 : activityState === 'attending' ? 0.1 : 0;
  $: intensity = Math.min(1.38, baseIntensity + activityBoost + presenceBoost * 0.14);
  let visualMood: MuseVisualMood = 'calm';
  $: visualMood =
    activityState === 'responding'
      ? 'bright'
      : activityState === 'composing'
        ? 'calm'
        : closenessState === 'Distant'
          ? 'low'
          : closenessState === 'Resonant'
            ? 'bright'
            : 'calm';

  onMount(() => {
    if (typeof window === 'undefined') return;
    ambientTimer = setInterval(() => {
      const max = closenessState === 'Distant' ? 1.8 : 2.6;
      ambientX = (Math.random() - 0.5) * max;
      ambientY = (Math.random() - 0.5) * max;
    }, 2200);

    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      return () => {
        if (presenceDecayTimer) clearTimeout(presenceDecayTimer);
        if (ambientTimer) clearInterval(ambientTimer);
      };
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      updateTiltFromViewport(event.clientX, event.clientY);
    };

    const handleLeave = () => resetTilt();

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handleLeave);
    window.addEventListener('blur', handleLeave);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handleLeave);
      window.removeEventListener('blur', handleLeave);
      if (presenceDecayTimer) clearTimeout(presenceDecayTimer);
      if (ambientTimer) clearInterval(ambientTimer);
    };
  });
</script>

<section class="core" aria-label="Companion model" style={`--core-intensity:${intensity};`}>
  <div class="core__halo"></div>
  <div class="core__halo core__halo--soft"></div>
  <div class="core__model-wrap {activityState === 'responding' ? 'core__model-wrap--responding' : ''}">
    <div class="core__model-track" style={`--tilt-x:${tiltX}; --tilt-y:${tiltY}; --ambient-x:${ambientX}; --ambient-y:${ambientY};`}>
      <button
        class="core__model-button"
        type="button"
        on:click={() => dispatch('open', {})}
        on:pointerleave={resetTilt}
        on:pointerenter={() => {
          presenceBoost = 1;
          if (presenceDecayTimer) clearTimeout(presenceDecayTimer);
          presenceDecayTimer = setTimeout(() => {
            presenceBoost = 0;
            presenceDecayTimer = null;
          }, 900);
        }}
        on:pointerdown={() => {
          presenceBoost = 1;
        }}
        on:blur={resetTilt}
        aria-label={`Open ${name} details`}
      >
        <MuseModel
          class="core__model"
          poster={avatarUrl ?? undefined}
          {animationName}
          visualMood={visualMood}
          glowEnabled={true}
          glowScale={intensity}
          motionScale={intensity}
          transparent={true}
          autoplay={true}
          eager={true}
          minSize={0}
        />
      </button>
    </div>
  </div>
</section>

<style>
  .core {
    position: relative;
    width: min(82vw, 28rem);
    margin: 0 auto;
    text-align: center;
    padding-top: 0.4rem;
  }

  .core__halo {
    position: absolute;
    inset: 8% 10% auto;
    height: clamp(9rem, 26vw, 14rem);
    border-radius: 999px;
    background: radial-gradient(circle, rgba(255, 203, 148, calc(0.34 * var(--core-intensity))), rgba(255, 203, 148, 0) 72%);
    filter: blur(28px);
    pointer-events: none;
    animation: haloBreath 10s ease-in-out infinite;
  }

  .core__halo--soft {
    inset: 20% 16% auto;
    height: clamp(10rem, 28vw, 15rem);
    opacity: 0.58;
    filter: blur(34px);
    animation-duration: 13.5s;
  }

  .core__model-wrap {
    position: relative;
    width: clamp(12rem, 46vw, 20rem);
    aspect-ratio: 1 / 1;
    margin: 0 auto;
    filter: drop-shadow(0 20px 42px rgba(18, 14, 45, 0.42));
    animation: modelFloat 9.2s ease-in-out infinite;
  }

  .core__model-track {
    width: 100%;
    height: 100%;
    transform:
      perspective(900px)
      rotateX(calc(var(--tilt-x) * 1deg))
      rotateY(calc(var(--tilt-y) * 1deg))
      translate3d(calc(var(--tilt-y) * 0.7px + var(--ambient-x) * 1px), calc(var(--tilt-x) * -0.5px + var(--ambient-y) * 1px), 0);
    transition: transform 260ms cubic-bezier(0.24, 0.08, 0.2, 1);
    will-change: transform;
  }

  .core__model-wrap--responding {
    filter: drop-shadow(0 24px 50px rgba(96, 179, 255, 0.42));
  }

  .core__model-button {
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }

  .core__model-button:focus-visible {
    outline: 2px solid rgba(231, 238, 252, 0.8);
    outline-offset: 6px;
    border-radius: 1.4rem;
  }

  .core :global(.core__model.muse-shell) {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border: none;
    border-radius: 1.6rem;
    background: radial-gradient(circle at 50% 42%, rgba(245, 234, 209, 0.16), rgba(28, 28, 58, 0.05) 66%, rgba(11, 12, 24, 0));
  }

  .core :global(.core__model .muse-aura) {
    opacity: calc(0.8 * var(--core-intensity));
  }

  .core :global(.core__model .muse-viewer) {
    border-radius: 1.6rem;
  }

  @keyframes modelFloat {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-6px) scale(1.015); }
  }

  @keyframes haloBreath {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.08); opacity: 1; }
  }
</style>
