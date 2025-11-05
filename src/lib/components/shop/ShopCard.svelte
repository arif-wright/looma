<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ShopGridItem } from './ShopGrid.svelte';

  export let item: ShopGridItem;

  const dispatch = createEventDispatcher<{ select: { item: ShopGridItem } }>();

  const rarityLabel = (value: string | null | undefined) => {
    if (!value) return 'Common';
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  const currencyLabel = (value: string) => (value ?? 'shards').toUpperCase();

  const isImage = (source: string | null | undefined) => {
    if (!source) return false;
    return source.startsWith('/') || source.startsWith('http') || /\.(png|jpe?g|webp|svg)$/i.test(source);
  };

  const rarityAccent = (value: string | null | undefined) => {
    const key = (value ?? 'common').toLowerCase();
    if (key === 'legendary') return 'accent-amber';
    if (key === 'epic') return 'accent-magenta';
    if (key === 'rare') return 'accent-cyan';
    return 'accent-violet';
  };

  const handleSelect = () => dispatch('select', { item });
</script>

<button
  type="button"
  class={`shop-card panel-glass ${rarityAccent(item?.rarity)}`}
  on:click={handleSelect}
  data-testid={`shop-card-${item?.sku}`}
>
  <div class="card-media" aria-hidden="true">
    {#if isImage(item?.icon)}
      <img src={item.icon} alt="" loading="lazy" decoding="async" />
    {:else if item?.icon}
      <span>{item.icon}</span>
    {:else}
      <span>{item?.displayName?.charAt(0) ?? '★'}</span>
    {/if}
  </div>

  <div class="card-copy">
    <div class="card-meta">
      <span class="rarity-chip">{rarityLabel(item?.rarity)}</span>
      {#if item?.promoPercent > 0}
        <span class={`promo-chip ${item?.isFlash ? 'flash' : ''}`}>-{item.promoPercent}%</span>
      {/if}
    </div>
    <h3>{item?.displayName}</h3>
    <p>{item?.description}</p>
  </div>

  <div class="card-footer">
    <span class="price">{item?.price.toLocaleString()} {currencyLabel(item?.currency)}</span>
    <span class="cta">View</span>
  </div>
</button>

<style>
  .shop-card {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 1rem;
    padding: 1.4rem;
    border-radius: 1.65rem;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    transition: transform 180ms ease, box-shadow 220ms ease;
  }

  .shop-card:hover,
  .shop-card:focus-visible {
    transform: translateY(-6px);
    box-shadow: 0 28px 46px rgba(9, 12, 30, 0.5);
    outline: none;
  }

  .card-media {
    position: relative;
    border-radius: 1.35rem;
    overflow: hidden;
    background: radial-gradient(circle at 30% 25%, rgba(94, 242, 255, 0.35), transparent 60%),
      rgba(255, 255, 255, 0.08);
    display: grid;
    place-items: center;
    height: 160px;
  }

  .card-media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scale(1.04);
    transition: transform 200ms ease;
  }

  .shop-card:hover .card-media img,
  .shop-card:focus-visible .card-media img {
    transform: scale(1.08);
  }

  .card-media span {
    font-size: 2.4rem;
  }

  .card-copy {
    display: grid;
    gap: 0.55rem;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .rarity-chip,
  .promo-chip {
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(8, 12, 28, 0.6);
    color: rgba(248, 250, 255, 0.75);
  }

  .promo-chip {
    background: linear-gradient(120deg, rgba(255, 79, 216, 0.9), rgba(155, 92, 255, 0.9));
    border-color: transparent;
    color: #fff;
  }

  .promo-chip.flash {
    background: linear-gradient(120deg, rgba(255, 207, 106, 0.95), rgba(255, 149, 5, 0.95));
    color: rgba(24, 17, 5, 0.95);
  }

  h3 {
    margin: 0;
    font-size: 1.2rem;
    color: rgba(248, 250, 252, 0.96);
  }

  p {
    margin: 0;
    color: rgba(226, 232, 240, 0.78);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.9rem;
  }

  .price {
    font-weight: 600;
    color: rgba(248, 250, 255, 0.9);
  }

  .cta {
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.72);
  }

  .accent-cyan::after,
  .accent-magenta::after,
  .accent-amber::after,
  .accent-violet::after {
    content: '';
    position: absolute;
    inset: -40% -30% auto;
    height: 60%;
    border-radius: 999px;
    filter: blur(60px);
    opacity: 0.55;
    pointer-events: none;
    z-index: -1;
  }

  .accent-cyan::after {
    background: rgba(94, 242, 255, 0.6);
  }

  .accent-magenta::after {
    background: rgba(255, 79, 216, 0.5);
  }

  .accent-amber::after {
    background: rgba(255, 207, 106, 0.55);
  }

  .accent-violet::after {
    background: rgba(155, 92, 255, 0.5);
  }

  @media (prefers-reduced-motion: reduce) {
    .shop-card,
    .card-media img {
      transition: none;
    }
  }
</style>
