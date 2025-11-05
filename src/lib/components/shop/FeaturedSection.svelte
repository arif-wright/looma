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

        <div class="absolute left-3 bottom-3 flex items-center gap-2">
          <button
            class="h-9 rounded-full bg-gradient-to-r from-cyan-400/80 to-fuchsia-400/80 px-4 text-sm font-semibold text-black/90 transition hover:brightness-110"
            on:click={() => onClickItem?.(items[idx])}
            aria-label="View offer"
          >
            View offer
          </button>
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
</style>
