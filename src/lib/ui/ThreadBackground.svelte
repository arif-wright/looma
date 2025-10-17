<script lang="ts">
  import { onMount } from 'svelte';

  let t1: SVGGElement;
  let t2: SVGGElement;

  onMount(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const onScroll = () => {
      const y = window.scrollY || 0;
      if (t1) t1.style.transform = `translateY(${y * 0.12}px)`;
      if (t2) t2.style.transform = `translateY(${y * 0.28}px)`;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  });
</script>

<div class="threads" aria-hidden="true" data-testid="threads">
  <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="rgba(233,195,255,.45)" />
        <stop offset="1" stop-color="rgba(90,224,199,.28)" />
      </linearGradient>
    </defs>
    <g class="t1" bind:this={t1}>
      <path
        d="M-50,600 C400,320 1200,720 1650,420"
        stroke="url(#g1)"
        stroke-width="1.8"
        fill="none"
        stroke-linecap="round"
      />
      <path
        d="M-80,520 C350,260 1250,560 1680,300"
        stroke="rgba(233,195,255,.30)"
        stroke-width="1.2"
        fill="none"
        stroke-linecap="round"
      />
    </g>
    <g class="t2" bind:this={t2}>
      <path
        d="M-60,680 C420,760 1180,520 1660,680"
        stroke="rgba(90,224,199,.22)"
        stroke-width="1.4"
        fill="none"
        stroke-linecap="round"
      />
    </g>
  </svg>
</div>

<style>
  .threads {
    position: absolute;
    inset: 0;
    z-index: -1;
    opacity: 0.7;
    filter: blur(0.15px);
    overflow: hidden;
  }

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
