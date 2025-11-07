<script lang="ts">
  import { onMount } from 'svelte';

  export let items: any[] = [];
  export let onClickItem: (item: any) => void = () => {};

  let idx = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let reducedMotion = false;

  const hasItems = () => Array.isArray(items) && items.length > 0;

  const next = () => {
    if (!hasItems()) return;
    idx = (idx + 1) % items.length;
  };

  const prev = () => {
    if (!hasItems()) return;
    idx = (idx - 1 + items.length) % items.length;
  };

  const go = (i: number) => {
    if (!hasItems()) return;
    idx = ((i % items.length) + items.length) % items.length;
  };

  const start = () => {
    stop();
    if (hasItems() && items.length > 1 && !reducedMotion) {
      timer = setInterval(next, 5000);
    }
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  $: hasItems() && !reducedMotion ? start() : stop();

  onMount(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handle = () => {
      reducedMotion = media.matches;
      if (reducedMotion) stop();
    };
    handle();
    media.addEventListener('change', handle);
    return () => media.removeEventListener('change', handle);
  });
</script>

{#if hasItems()}
  <section class="featured-section w-full rounded-2xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
    <div
      role="presentation"
      class="featured-stage w-full h-[220px] sm:h-[260px] md:h-[340px] lg:h-[420px]"
      on:mouseenter={stop}
      on:mouseleave={start}
    >
      {#each items as item, i}
        <img
          src={item.image_url}
          alt={item.title}
          class="featured-image w-full h-[220px] sm:h-[260px] md:h-[340px] lg:h-[420px] object-cover"
          style={`opacity: ${i === idx ? 1 : 0}; pointer-events: ${i === idx ? 'auto' : 'none'};`}
          loading="lazy"
          decoding="async"
        />
      {/each}

      <div class="featured-badges">
        {#if items[idx]?.badge}
          <span class="badge">{items[idx].badge}</span>
        {/if}
        <span class="badge uppercase">{items[idx]?.rarity}</span>
      </div>

      <div class="info-panel">
        <div>
          <h3>{items[idx]?.title}</h3>
          {#if items[idx]?.subtitle || items[idx]?.description}
            <p>{items[idx]?.subtitle ?? items[idx]?.description}</p>
          {/if}
        </div>
        <div class="cta-row">
          <span class="price">💎 {items[idx]?.price_shards}</span>
          <button
            class="cta"
            on:click={() => onClickItem?.(items[idx])}
            aria-label="View offer"
          >
            View offer
          </button>
        </div>
      </div>

      {#if items.length > 1}
        <button
          class="nav prev"
          on:click={prev}
          aria-label="Previous"
        >
          ‹
        </button>
        <button
          class="nav next"
          on:click={next}
          aria-label="Next"
        >
          ›
        </button>

        <div class="dots">
          {#each items as _, i}
            <button
              type="button"
              class="dot"
              class:active={i === idx}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === idx ? 'true' : 'false'}
              on:click={() => go(i)}
            ></button>
          {/each}
        </div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .featured-stage {
    position: relative;
  }

  .featured-image {
    position: absolute;
    inset: 0;
    transition: opacity 0.4s ease;
  }

  .featured-badges {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    display: flex;
    gap: 0.4rem;
  }

  .badge {
    border-radius: 999px;
    padding: 0.2rem 0.65rem;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .info-panel {
    position: absolute;
    inset: auto 0 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.1rem 1.5rem;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(8, 11, 20, 0.85) 55%, rgba(5, 7, 14, 0.95) 100%);
    color: #fff;
  }

  .info-panel h3 {
    margin: 0 0 0.4rem;
    font-size: 1.15rem;
  }

  .info-panel p {
    margin: 0;
    color: rgba(255, 255, 255, 0.78);
    max-width: 46ch;
  }

  .cta-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .price {
    font-weight: 600;
  }

  .cta {
    border-radius: 999px;
    padding: 0.45rem 1.3rem;
    background: linear-gradient(90deg, rgba(34, 211, 238, 0.85), rgba(168, 85, 247, 0.85));
    border: none;
    color: rgba(17, 24, 39, 0.9);
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.2s ease;
    outline: none;
  }

  .cta:hover,
  .cta:focus-visible {
    filter: brightness(1.08);
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.45);
  }

  .nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 36px;
    width: 36px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.45);
    color: white;
    font-size: 1.5rem;
    line-height: 1;
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: background 0.2s ease;
    outline: none;
  }

  .nav.prev {
    left: 8px;
  }

  .nav.next {
    right: 8px;
  }

  .nav:hover,
  .nav:focus-visible {
    background: rgba(0, 0, 0, 0.6);
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.45);
  }

  .dots {
    position: absolute;
    right: 0.75rem;
    bottom: 0.75rem;
    display: flex;
    gap: 0.35rem;
  }

  .dot {
    height: 10px;
    width: 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    background: transparent;
    transition: background 0.2s ease;
    outline: none;
  }

  .dot.active {
    background: white;
  }

  .dot:focus-visible {
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.45);
  }

  @media (max-width: 640px) {
    .featured-stage {
      aspect-ratio: 16 / 8;
    }

    .info-panel {
      flex-direction: column;
      align-items: flex-start;
    }

    .cta-row {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
