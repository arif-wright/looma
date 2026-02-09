<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ShopCard from './ShopCard.svelte';
  import type { FilterState, Category, Rarity, SortKey } from './types';

  export let items: any[] = [];
  export let filters: FilterState = { category: 'all', rarity: 'all', sortKey: 'newest' };

  const dispatch = createEventDispatcher<{ open: { item: any } }>();

  const rarityOrder: Record<Rarity, number> = {
    all: -1,
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5
  };

  $: filtered = applyFilters(items, filters);

  function applyFilters(list: any[], state: FilterState) {
    let out = Array.isArray(list) ? [...list] : [];

    if (state.category !== 'all') {
      out = out.filter((item) => item.type === state.category);
    }

    if (state.rarity !== 'all') {
      out = out.filter((item) => item.rarity === state.rarity);
    }

    switch (state.sortKey) {
      case 'priceAsc':
        out.sort((a, b) => a.price_shards - b.price_shards);
        break;
      case 'priceDesc':
        out.sort((a, b) => b.price_shards - a.price_shards);
        break;
      case 'rarity':
        out.sort((a, b) => (rarityOrder[a.rarity as Rarity] ?? 999) - (rarityOrder[b.rarity as Rarity] ?? 999));
        break;
      default:
        out.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }

    return out;
  }
</script>

<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 2xl:grid-cols-5" role="list">
  {#each filtered as item}
    <ShopCard {item} on:open={(event) => dispatch('open', event.detail)} />
  {/each}
</div>
