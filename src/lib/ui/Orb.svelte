<script lang="ts">
  export let intensity = 1;
</script>

<div class="orb" aria-hidden="true" data-testid="orb" style="--i: {intensity};">
  <div class="orb__core"></div>
  <div class="orb__glow"></div>
  <div class="orb__rim"></div>
</div>

<style>
  .orb {
    position: relative;
    aspect-ratio: 1/1;
    border-radius: 50%;
    overflow: hidden;
    background: radial-gradient(140% 120% at 30% 30%, #0d1230, #070a1e 60%);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 30px 80px rgba(0, 0, 0, 0.45);
  }

  .orb__core {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background:
      radial-gradient(80% 70% at 35% 35%, rgba(233, 195, 255, 0.95), rgba(160, 107, 255, 0.45) 40%, transparent 65%),
      radial-gradient(120% 120% at 65% 70%, rgba(96, 165, 250, 0.3), transparent 60%);
    animation: orb-breathe 3.6s ease-in-out infinite;
    filter: saturate(calc(1.15 * var(--i, 1))) blur(0.2px);
  }

  .orb__glow {
    position: absolute;
    inset: -10%;
    border-radius: inherit;
    background:
      radial-gradient(60% 60% at 40% 40%, rgba(160, 107, 255, 0.35), transparent 70%),
      radial-gradient(80% 80% at 70% 70%, rgba(90, 224, 199, 0.2), transparent 70%);
    mix-blend-mode: screen;
    pointer-events: none;
  }

  .orb__rim {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 2px rgba(10, 14, 26, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    pointer-events: none;
  }

  @keyframes orb-breathe {
    0%,
    100% {
      transform: scale(0.965);
      opacity: 0.9;
    }

    50% {
      transform: scale(1.03);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .orb__core {
      animation: none;
    }
  }
</style>
