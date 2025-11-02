<script lang="ts">
  import { onDestroy } from 'svelte';

  type Piece = {
    id: number;
    delay: number;
    hue: number;
    left: number;
    rotation: number;
    scale: number;
  };

  export let triggerId = 0;
  export let count = 16;
  export let duration = 1400;

  let pieces: Piece[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const resetPieces = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    const next: Piece[] = [];
    for (let i = 0; i < count; i += 1) {
      next.push({
        id: i,
        delay: Math.random() * 120,
        hue: Math.floor(Math.random() * 360),
        left: Math.random() * 100,
        rotation: -25 + Math.random() * 50,
        scale: 0.75 + Math.random() * 0.5
      });
    }

    pieces = next;

    timer = setTimeout(() => {
      pieces = [];
      timer = null;
    }, duration + 200);
  };

  $: if (triggerId > 0) {
    resetPieces();
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<div class="confetti" aria-hidden="true">
  {#each pieces as piece (piece.id)}
    <span
      class="confetti-piece"
      style={`--confetti-delay:${piece.delay}ms; --confetti-hue:${piece.hue}deg; --confetti-left:${piece.left}%; --confetti-rotation:${piece.rotation}deg; --confetti-scale:${piece.scale};`}
    ></span>
  {/each}
</div>

<style>
  .confetti {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
  }

  .confetti-piece {
    position: absolute;
    top: 0;
    left: var(--confetti-left, 50%);
    width: 0.45rem;
    height: 0.9rem;
    border-radius: 2px;
    background: hsl(var(--confetti-hue, 260deg), 85%, 65%);
    opacity: 0;
    transform-origin: center;
    animation: burst 1.4s ease-out forwards;
    animation-delay: var(--confetti-delay, 0ms);
  }

  @media (prefers-reduced-motion: reduce) {
    .confetti-piece {
      display: none;
    }
  }

  @keyframes burst {
    0% {
      opacity: 0;
      transform: translate3d(-50%, 0, 0) rotate(0deg) scale(0.8);
    }
    10% {
      opacity: 1;
    }
    60% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate3d(calc(-50% + (var(--confetti-rotation, 0deg) * 0.5px)), -70px, 0)
        rotate(var(--confetti-rotation, 0deg))
        scale(var(--confetti-scale, 1));
    }
  }
</style>
