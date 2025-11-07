<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let item: any;

  const dispatch = createEventDispatcher<{ open: { item: any } }>();

  const open = () => {
    if (!item?.__owned) {
      dispatch('open', { item });
    }
  };
</script>

<button
  type="button"
  data-test="shop-card"
  aria-label={item.__owned ? `${item.title} owned` : `View ${item.title}`}
  on:click={open}
  class={`group overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
    item.__owned ? 'cursor-default opacity-75' : 'cursor-pointer hover:ring-white/20'
  }`}
  disabled={item.__owned}
>
  <div class="relative aspect-[16/9] overflow-hidden">
    <img
      src={item.image_url}
      alt={`${item.title} cover`}
      loading="lazy"
      decoding="async"
      class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
    />
    {#if item.badge}
      <span class="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide text-white/90 ring-1 ring-white/10">
        {item.badge}
      </span>
    {/if}
    <div class="absolute right-2 top-2 flex gap-1">
      <span class="rounded-full bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide ring-1 ring-white/10">
        {item.rarity}
      </span>
      <span class="rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold ring-1 ring-white/10">
        {item.__owned ? 'Owned' : `💎 ${item.price_shards}`}
      </span>
    </div>
    {#if item.__owned}
      <div class="absolute inset-0 bg-black/30 backdrop-blur-[2px]"></div>
    {/if}
  </div>

  <div class="px-3 py-2">
    <h3 class="text-sm font-semibold text-white">{item.title}</h3>
    {#if item.subtitle}
      <p class="mt-1 line-clamp-2 text-xs text-white/60">{item.subtitle}</p>
    {/if}
  </div>
</button>
