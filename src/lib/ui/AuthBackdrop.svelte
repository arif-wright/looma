<script lang="ts">
  import ThreadBackground from '$lib/ui/ThreadBackground.svelte';
  import ParticlesLayer from '$lib/ui/ParticlesLayer.svelte';
</script>

<div class="auth-backdrop" aria-hidden="true">
  <div class="auth-backdrop__gradient"></div>
  <div class="auth-backdrop__threads">
    <ThreadBackground />
  </div>
  <ParticlesLayer className="auth-backdrop__particles" />
  <div class="auth-backdrop__glow auth-backdrop__glow--top"></div>
  <div class="auth-backdrop__glow auth-backdrop__glow--bottom"></div>
</div>

<style>
  .auth-backdrop {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .auth-backdrop__gradient {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 22% 18%, rgba(148, 70, 231, 0.32), transparent 45%),
      radial-gradient(circle at 78% 16%, rgba(73, 255, 255, 0.24), transparent 52%),
      radial-gradient(circle at 50% 80%, rgba(55, 120, 255, 0.18), transparent 58%),
      linear-gradient(160deg, rgba(12, 10, 24, 0.96), rgba(9, 15, 28, 0.92));
    background-size: 180% 180%, 200% 200%, 220% 220%, 100% 100%;
    z-index: 0;
    animation:
      gradientFlow 26s ease-in-out infinite,
      gradientPulse 34s ease-in-out infinite alternate;
  }

  .auth-backdrop__threads {
    position: absolute;
    inset: 0;
    opacity: 0.35;
    mix-blend-mode: screen;
    transform: scale(1.05);
    z-index: 1;
    animation: threadDrift 42s ease-in-out infinite alternate;
  }

  .auth-backdrop__threads :global(.threads) {
    position: absolute;
    inset: 0;
  }

  :global(.auth-backdrop__particles) {
    position: absolute !important;
    inset: 0 !important;
    opacity: 0.6 !important;
    z-index: 2 !important;
  }

  .auth-backdrop__glow {
    position: absolute;
    width: 60vw;
    height: 60vw;
    max-width: 900px;
    max-height: 900px;
    filter: blur(120px);
    opacity: 0.45;
    border-radius: 50%;
    z-index: 0;
  }

  .auth-backdrop__glow--top {
    top: -20vw;
    left: -15vw;
    background: radial-gradient(circle, rgba(155, 92, 255, 0.7), transparent 60%);
    animation: floatTop 36s ease-in-out infinite alternate;
  }

  .auth-backdrop__glow--bottom {
    bottom: -25vw;
    right: -18vw;
    background: radial-gradient(circle, rgba(77, 244, 255, 0.65), transparent 65%);
    animation: floatBottom 44s ease-in-out infinite alternate;
  }

  @media (max-width: 768px) {
    .auth-backdrop__glow {
      width: 90vw;
      height: 90vw;
      filter: blur(160px);
    }
  }

  @keyframes gradientFlow {
    0% {
      background-position: 18% 24%, 82% 20%, 50% 80%, 50% 50%;
    }
    35% {
      background-position: 26% 32%, 78% 22%, 44% 74%, 50% 50%;
    }
    65% {
      background-position: 14% 28%, 84% 28%, 56% 70%, 50% 50%;
    }
    100% {
      background-position: 20% 24%, 80% 18%, 50% 82%, 50% 50%;
    }
  }

  @keyframes gradientPulse {
    0% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0.92;
      transform: scale(1.04);
    }
  }

  @keyframes threadDrift {
    0% {
      transform: translate3d(-1.2%, -0.6%, 0) scale(1.03);
    }
    50% {
      transform: translate3d(1.6%, 0.8%, 0) scale(1.05) rotate(0.2deg);
    }
    100% {
      transform: translate3d(-0.6%, -0.2%, 0) scale(1.02);
    }
  }

  @keyframes floatTop {
    0% {
      transform: translate3d(-12%, -6%, 0) scale(1.05);
    }
    50% {
      transform: translate3d(6%, 4%, 0) scale(1.12);
    }
    100% {
      transform: translate3d(-4%, -2%, 0) scale(1.08);
    }
  }

  @keyframes floatBottom {
    0% {
      transform: translate3d(10%, 8%, 0) scale(1.03);
    }
    50% {
      transform: translate3d(-8%, -6%, 0) scale(1.1);
    }
    100% {
      transform: translate3d(4%, 3%, 0) scale(1.05);
    }
  }
</style>
