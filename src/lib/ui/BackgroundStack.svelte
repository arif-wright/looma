<script lang="ts">
  import { onMount } from 'svelte';
  import ThreadBackground from '$lib/ui/ThreadBackground.svelte';
  import ParticlesLayer from '$lib/ui/ParticlesLayer.svelte';

  let reduceMotion = false;

  onMount(() => {
    reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  });
</script>

<div class={`neuro-stack ${reduceMotion ? 'is-reduced' : ''}`} aria-hidden="true">
  <div class="gradient"></div>
  <ThreadBackground />
  <ParticlesLayer className="layer" />
  <div class="vignette"></div>
</div>

<style>
  .neuro-stack {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: -3;
  }

  .neuro-stack::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(120% 80% at 10% 15%, rgba(60, 247, 255, 0.16), transparent 60%),
      radial-gradient(100% 70% at 80% 20%, rgba(160, 107, 255, 0.18), transparent 60%),
      linear-gradient(180deg, rgba(8, 10, 28, 0.7), rgba(8, 10, 28, 0.55));
    opacity: 0.78;
    z-index: 0;
  }

  .gradient {
    position: absolute;
    inset: -10%;
    background: linear-gradient(
      120deg,
      rgba(77, 244, 255, 0.42),
      rgba(155, 92, 255, 0.52),
      rgba(249, 128, 255, 0.45),
      rgba(77, 244, 255, 0.42)
    );
    background-size: 400% 400%;
    filter: blur(80px);
    transform: scale(1.08);
    opacity: 0.55;
    animation: breathe 48s ease-in-out infinite;
    z-index: 1;
  }

  .layer {
    position: absolute;
    inset: 0;
    z-index: 3;
  }

  .vignette {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(150% 120% at 50% 10%, transparent 40%, rgba(4, 6, 18, 0.55) 80%),
      radial-gradient(140% 120% at 50% 100%, transparent 35%, rgba(4, 6, 18, 0.7) 80%);
    mix-blend-mode: multiply;
    opacity: 0.96;
    z-index: 4;
  }

  .is-reduced .gradient {
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .gradient {
      animation: none;
    }
  }

  @keyframes breathe {
    0% {
      background-position: 0% 50%;
    }

    50% {
      background-position: 100% 50%;
    }

    100% {
      background-position: 0% 50%;
    }
  }
</style>
