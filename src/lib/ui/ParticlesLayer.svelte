<script lang="ts">
  import { onMount } from 'svelte';

  export let className = '';

  let reduce = false;
  let restClass: string | undefined;
  let restProps: Record<string, unknown> = {};

  $: ({ class: restClass, ...restProps } = $$restProps);
  $: classes = ['particles', className, restClass as string | undefined, reduce ? 'is-reduced' : '']
    .filter(Boolean)
    .join(' ');

  onMount(() => {
    reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  });
</script>

<div class={classes} aria-hidden="true" {...restProps}>
  <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
    <defs>
      <radialGradient id="p-dot" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(180,130,255,0.55)" />
        <stop offset="100%" stop-color="rgba(180,130,255,0)" />
      </radialGradient>
      <filter id="p-blur">
        <feGaussianBlur stdDeviation="0.6" />
      </filter>
    </defs>

    <g class="layer l1" filter="url(#p-blur)">
      <circle cx="140" cy="180" r="16" fill="url(#p-dot)" class="tw t1" />
      <circle cx="760" cy="120" r="12" fill="url(#p-dot)" class="tw t2" />
      <circle cx="1460" cy="260" r="18" fill="url(#p-dot)" class="tw t3" />
    </g>

    <g class="layer l2" filter="url(#p-blur)">
      <circle cx="420" cy="640" r="13" fill="url(#p-dot)" class="tw t4" />
      <circle cx="990" cy="760" r="10" fill="url(#p-dot)" class="tw t5" />
      <circle cx="1280" cy="460" r="14" fill="url(#p-dot)" class="tw t6" />
    </g>

    <g class="layer l3" filter="url(#p-blur)">
      <circle cx="1180" cy="420" r="19" fill="url(#p-dot)" class="tw t7" />
      <circle cx="590" cy="320" r="11" fill="url(#p-dot)" class="tw t8" />
      <circle cx="300" cy="480" r="9" fill="url(#p-dot)" class="tw t9" />
    </g>
  </svg>
</div>

<style>
  .particles {
    position: fixed;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    opacity: 0.38;
    mix-blend-mode: screen;
  }

  .particles.is-reduced {
    opacity: 0.18;
  }

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .layer {
    animation: drift 28s linear infinite;
  }

  .l2 {
    animation-duration: 36s;
    animation-direction: reverse;
  }

  .l3 {
    animation-duration: 44s;
  }

  @keyframes drift {
    from {
      transform: translate3d(-1.6%, -0.8%, 0);
    }

    to {
      transform: translate3d(1.6%, 0.8%, 0);
    }
  }

  .tw {
    animation: twinkle 6.5s ease-in-out infinite;
  }

  .t2 {
    animation-delay: 0.8s;
  }

  .t3 {
    animation-delay: 1.6s;
  }

  .t4 {
    animation-delay: 2.2s;
  }

  .t5 {
    animation-delay: 3.1s;
  }

  .t6 {
    animation-delay: 3.9s;
  }

  .t7 {
    animation-delay: 4.6s;
  }

  .t8 {
    animation-delay: 5.3s;
  }

  .t9 {
    animation-delay: 5.9s;
  }

  @keyframes twinkle {
    0%,
    100% {
      opacity: 0.55;
    }

    50% {
      opacity: 0.25;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .layer {
      animation: none;
    }

    .tw {
      animation: none;
    }

    .particles {
      opacity: 0.18;
    }
  }
</style>
