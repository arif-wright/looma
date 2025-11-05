<script lang="ts">
  import ShopCard from './ShopCard.svelte';
  import { createEventDispatcher } from 'svelte';

  export type ShopGridItem = {
    productSlug: string;
    productName: string;
    description: string;
    rarity: string | null;
    sku: string;
    displayName: string;
    icon: string;
    stackable: boolean;
    price: number;
    currency: string;
    promoPercent: number;
    promoSlug: string | null;
    isFlash: boolean;
  };

  export let items: ShopGridItem[] = [];

  const dispatch = createEventDispatcher<{ select: { item: ShopGridItem } }>();

  const handleSelect = (event: CustomEvent<{ item: ShopGridItem }>) => {
    dispatch('select', event.detail);
  };
</script>

<section class="shop-grid" data-testid="shop-grid">
  {#each items as item (item.sku)}
    <ShopCard {item} on:select={handleSelect} />
  {/each}
</section>

<style>
  .shop-grid {
    display: grid;
    gap: 1.2rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 640px) {
    .shop-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1.3rem;
    }
  }

  @media (min-width: 1024px) {
    .shop-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (min-width: 1280px) {
    .shop-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }
</style>
