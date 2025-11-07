<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { onMount } from 'svelte';

  export let shards = 0;

  const animated = tweened(0, { duration: 900 });

  onMount(() => {
    animated.set(shards);
  });
</script>

<section class="hero">
  <div class="hero-glow"></div>
  <div class="hero-content">
    <div class="hero-label">Wallet Balance</div>
    <div class="hero-balance">
      <span class="hero-icon" aria-hidden="true">💎</span>
      <div class="hero-amount">{$animated.toFixed(0)}</div>
    </div>
    <p class="hero-helper">Your in-game currency. Earn through play or buy more below.</p>
  </div>
</section>

<style>
  @keyframes pulse-slow {
    0%,
    100% {
      opacity: 0.25;
      transform: scale(1);
    }
    50% {
      opacity: 0.4;
      transform: scale(1.08);
    }
  }

  .hero {
    position: relative;
    overflow: hidden;
    border-radius: 1.25rem;
    padding: clamp(1.75rem, 4vw, 2.5rem);
    background: linear-gradient(135deg, #141626, #1e2238);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .hero-glow {
    position: absolute;
    top: -6rem;
    right: -6rem;
    width: 16rem;
    height: 16rem;
    border-radius: 50%;
    background: radial-gradient(circle at center, #31f0c7 0%, transparent 60%);
    filter: blur(50px);
    opacity: 0.3;
    pointer-events: none;
    animation: pulse-slow 6s ease-in-out infinite;
  }

  .hero-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.75rem;
  }

  .hero-label {
    font-size: 0.65rem;
    letter-spacing: 0.4em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
  }

  .hero-balance {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
  }

  .hero-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.14);
    font-size: 1.5rem;
  }

  .hero-amount {
    font-size: clamp(2.5rem, 6vw, 3.5rem);
    font-weight: 700;
    color: white;
    font-variant-numeric: tabular-nums;
  }

  .hero-helper {
    max-width: 28rem;
    font-size: 0.95rem;
    color: rgba(255, 255, 255, 0.65);
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-glow {
      animation: none;
    }
  }
</style>
