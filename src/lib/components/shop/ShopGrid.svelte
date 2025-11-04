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

  const glowForRarity = (rarity: string | null | undefined) => {
    const key = (rarity ?? 'common').toLowerCase();
    if (key === 'legendary') return 'glow-amber';
    if (key === 'epic') return 'glow-magenta';
    if (key === 'rare') return 'glow-cyan';
    return 'glow-violet';
  };

  function select(item: ShopGridItem) {
    dispatch('select', { item });
  }
</script>

<div class="shop-grid" role="list" data-testid="shop-grid">
  {#each items as item (item.sku)}
    <button
      type="button"
      class={`shop-card panel-glass ${glowForRarity(item.rarity)}`}
      role="listitem"
      data-testid={`shop-card-${item.sku}`}
      aria-label={`Inspect ${item.displayName}`}
      data-ana="shop:open-modal"
      on:click={() => select(item)}
    >
      {#if item.promoPercent > 0}
        <span
          class={`promo-ribbon ${item.isFlash ? 'flash' : ''}`}
          aria-label={item.isFlash ? 'Flash promo active' : 'Promotion active'}
          data-testid="promo-ribbon"
        >
          {item.isFlash ? 'Flash -' : '-'}{item.promoPercent}%
        </span>
      {/if}
      <div class="shop-card__header">
        <span class={`shop-card__rarity rarity-${(item.rarity ?? 'common').toLowerCase()}`}>
          {rarityLabel(item.rarity)}
        </span>
      </div>

      <div class="shop-card__icon" aria-hidden="true">{item.icon}</div>

      <div class="shop-card__body">
        <h3>{item.displayName}</h3>
        <p>{item.description}</p>
      </div>

      <div class="shop-card__footer">
        <span class="price" aria-label="Price">
          <span class="shard" aria-hidden="true">💎</span>
          {item.price.toLocaleString()} {currencyLabel(item.currency)}
        </span>
        <span class="cta">Inspect</span>
      </div>
    </button>
  {/each}
</div>

<style>
  .shop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1.3rem;
    width: 100%;
  }

  .shop-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.3rem;
    border-radius: 1.35rem;
    text-align: left;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(5, 7, 18, 0.78);
    color: #f8f6ff;
    overflow: hidden;
    box-shadow: 0 18px 32px rgba(10, 14, 24, 0.35);
    transition: transform 180ms ease, box-shadow 220ms ease;
  }

  .shop-card:hover,
  .shop-card:focus-visible {
    transform: translateY(-4px);
    box-shadow: 0 24px 40px rgba(10, 14, 24, 0.45);
    outline: none;
  }

  .promo-ribbon {
    position: absolute;
    top: 0.75rem;
    left: -0.15rem;
    padding: 0.25rem 1rem;
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    background: linear-gradient(120deg, rgba(255, 79, 216, 0.9), rgba(155, 92, 255, 0.9));
    color: #fff;
    clip-path: polygon(0 0, 100% 0, 85% 100%, 0 100%);
    box-shadow: 0 12px 24px rgba(155, 92, 255, 0.45);
  }

  .promo-ribbon.flash {
    background: linear-gradient(120deg, rgba(255, 207, 106, 0.95), rgba(255, 149, 5, 0.9));
  }

  .shop-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .shop-card__rarity {
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: rgba(255, 255, 255, 0.78);
  }

  .shop-card__icon {
    width: 70px;
    height: 70px;
    border-radius: 1.2rem;
    display: grid;
    place-items: center;
    font-size: 2.35rem;
    background: radial-gradient(circle at 30% 20%, rgba(94, 242, 255, 0.4), transparent 60%),
      rgba(255, 255, 255, 0.08);
  }

  .shop-card__body h3 {
    margin: 0;
    font-size: 1.2rem;
  }

  .shop-card__body p {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .shop-card__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
    font-size: 0.9rem;
  }

  .price {
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .shard {
    font-size: 1rem;
  }

  .cta {
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
  }
</style>
