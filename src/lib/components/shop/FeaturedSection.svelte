<script lang="ts">
  export let items: any[] = [];
  export let onClickItem: (item: any) => void = () => {};

  let idx = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

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
    if (hasItems() && items.length > 1) {
      timer = setInterval(next, 5000);
    }
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  $: hasItems() ? start() : stop();
</script>

{#if hasItems()}
  <section class="mb-5">
    <div class="relative mx-auto overflow-hidden rounded-2xl ring-1 ring-white/10 max-w-5xl">
      <div
        class="relative aspect-[5/2] sm:aspect-[16/6] lg:aspect-[21/8] xl:aspect-[16/5] max-h-[340px]"
        on:mouseenter={stop}
        on:mouseleave={start}
      >
        {#each items as item, i}
          <img
            src={item.image_url}
            alt={item.title}
            class="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
            style={`opacity: ${i === idx ? 1 : 0}; pointer-events: ${i === idx ? 'auto' : 'none'};`}
            loading="lazy"
            decoding="async"
          />
        {/each}

        <div class="absolute left-3 top-3 flex gap-2">
          {#if items[idx]?.badge}
            <span class="rounded-full bg-black/60 px-2 py-1 text-[11px] text-white/90 ring-1 ring-white/10">
              {items[idx].badge}
            </span>
          {/if}
          <span class="rounded-full bg-black/60 px-2 py-1 text-[11px] uppercase text-white/90 ring-1 ring-white/10">
            {items[idx]?.rarity}
          </span>
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

          <div class="absolute bottom-3 right-3 flex gap-1">
            {#each items as _, i}
              <button
                class="dot"
                class:active={i === idx}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === idx ? 'true' : 'false'}
                on:click={() => go(i)}
              />
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
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
  }

  .nav:hover,
  .nav:focus-visible {
    background: rgba(0, 0, 0, 0.6);
  }

  .nav.prev {
    left: 8px;
  }

  .nav.next {
    right: 8px;
  }

  .dot {
    height: 10px;
    width: 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    background: transparent;
    transition: background 0.2s ease;
  }

  .dot.active {
    background: white;
  }

  .info-panel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 22px;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(8, 11, 20, 0.85) 55%, rgba(5, 7, 14, 0.95) 100%);
    color: white;
  }

  .info-panel h3 {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0 0 6px;
  }

  .info-panel p {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(255, 255, 255, 0.78);
    max-width: 46ch;
    line-height: 1.35;
  }

  .cta-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }

  .price {
    font-weight: 600;
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.92);
  }

  .cta {
    height: 38px;
    padding: 0 18px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(34, 211, 238, 0.85), rgba(168, 85, 247, 0.85));
    color: rgba(17, 24, 39, 0.92);
    font-size: 0.9rem;
    font-weight: 600;
    border: none;
    box-shadow: 0 6px 18px rgba(56, 189, 248, 0.25);
    transition: filter 0.2s ease;
  }

  .cta:hover,
  .cta:focus-visible {
    filter: brightness(1.08);
  }

  @media (max-width: 640px) {
    .info-panel {
      flex-direction: column;
      align-items: flex-start;
      padding: 16px;
    }

    .cta-row {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
