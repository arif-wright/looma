<script lang="ts">
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

  const rarityLabel = (rarity: string | null | undefined) => {
    if (!rarity) return 'Common';
    return rarity.charAt(0).toUpperCase() + rarity.slice(1);
  };

  const currencyLabel = (currency: string) => (currency ?? 'shards').toUpperCase();

  function select(item: ShopGridItem) {
    dispatch('select', { item });
  }
</script>

<div class="shop-grid" role="list">
  {#each items as item (item.sku)}
    <button
      type="button"
      class="shop-card"
      role="listitem"
      data-testid={`shop-card-${item.sku}`}
      on:click={() => select(item)}
    >
      <div class="shop-card__header">
        <span class={`shop-card__rarity rarity-${(item.rarity ?? 'common').toLowerCase()}`}>
          {rarityLabel(item.rarity)}
        </span>
        {#if item.promoPercent > 0}
          <span
            class={`shop-card__promo ${item.isFlash ? 'flash' : ''}`}
            aria-label={item.isFlash ? 'Flash promo active' : 'Promotion active'}
            data-testid={item.isFlash ? 'shop-promo-flash' : 'shop-promo'}
          >
            {item.isFlash ? 'Flash -' : '-'}{item.promoPercent}%
          </span>
        {/if}
      </div>

      <div class="shop-card__icon" aria-hidden="true">{item.icon}</div>

      <div class="shop-card__body">
        <h3>{item.displayName}</h3>
        <p>{item.description}</p>
      </div>

      <div class="shop-card__footer">
        <span class="price">{item.price.toLocaleString()} {currencyLabel(item.currency)}</span>
        <span class="cta">View</span>
      </div>
    </button>
  {/each}
</div>

<style>
  .shop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.2rem;
    width: 100%;
  }

  .shop-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.15rem;
    border-radius: 1.2rem;
    background: linear-gradient(160deg, rgba(17, 25, 40, 0.85), rgba(15, 23, 42, 0.6));
    border: 1px solid rgba(94, 234, 212, 0.08);
    box-shadow: 0 24px 48px rgba(15, 23, 42, 0.35);
    color: #e2e8f0;
    text-align: left;
    transition: transform 0.22s ease, box-shadow 0.22s ease, border 0.22s ease;
    cursor: pointer;
  }

  .shop-card:hover,
  .shop-card:focus-visible {
    transform: translateY(-4px);
    border-color: rgba(94, 234, 212, 0.38);
    box-shadow: 0 32px 64px rgba(13, 25, 51, 0.45);
    outline: none;
  }

  .shop-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .shop-card__rarity {
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: rgba(226, 232, 240, 0.08);
    color: rgba(226, 232, 240, 0.85);
    border: 1px solid transparent;
  }

  .rarity-rare {
    border-color: rgba(79, 255, 176, 0.4);
  }

  .rarity-epic {
    border-color: rgba(129, 140, 248, 0.55);
  }

  .rarity-legendary {
    border-color: rgba(251, 191, 36, 0.55);
  }

  .shop-card__promo {
    padding: 0.2rem 0.6rem;
    border-radius: 0.75rem;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: rgba(52, 211, 153, 0.18);
    color: rgba(110, 231, 183, 0.95);
    border: 1px solid rgba(16, 185, 129, 0.35);
  }

  .shop-card__promo.flash {
    background: rgba(251, 191, 36, 0.25);
    color: rgba(253, 224, 71, 0.95);
    border-color: rgba(252, 211, 77, 0.55);
  }

  .shop-card__icon {
    width: 64px;
    height: 64px;
    border-radius: 1rem;
    display: grid;
    place-items: center;
    font-size: 2.25rem;
    background: linear-gradient(145deg, rgba(59, 130, 246, 0.22), rgba(45, 212, 191, 0.18));
    align-self: flex-start;
  }

  .shop-card__body h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: rgba(226, 232, 240, 0.95);
  }

  .shop-card__body p {
    margin: 0.25rem 0 0;
    font-size: 0.88rem;
    color: rgba(203, 213, 225, 0.78);
    line-height: 1.35;
  }

  .shop-card__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.9rem;
    margin-top: auto;
  }

  .shop-card__footer .price {
    font-weight: 600;
    color: rgba(244, 247, 255, 0.92);
  }

  .shop-card__footer .cta {
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(94, 234, 212, 0.9);
  }
</style>
