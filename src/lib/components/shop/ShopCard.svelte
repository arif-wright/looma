<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let item: any;

  const dispatch = createEventDispatcher<{ open: { item: any } }>();

  const open = () => dispatch('open', { item });
</script>

<article
  tabindex="0"
  on:click={open}
  on:keypress={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  }}
  class="group cursor-pointer overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 transition hover:ring-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
>
  <div class="relative aspect-[16/9] overflow-hidden">
    <img
      src={item.image_url}
      alt={`${item.title} cover`}
      loading="lazy"
      decoding="async"
      class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
    />
    <div class="absolute right-2 top-2 flex gap-1">
      <span class="rounded-full bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide ring-1 ring-white/10">
        {item.rarity}
      </span>
      <span class="rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold ring-1 ring-white/10">
        💎 {item.price_shards}
      </span>
    </div>
  </div>

  <div class="px-3 py-2">
    <h3 class="text-sm font-semibold text-white">{item.title}</h3>
    {#if item.subtitle}
      <p class="mt-1 line-clamp-2 text-xs text-white/60">{item.subtitle}</p>
    {/if}
  </div>
</article>
