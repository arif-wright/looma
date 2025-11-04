<script lang="ts">
  import { onDestroy } from 'svelte';
import ShopGrid, { type ShopGridItem } from '$lib/components/shop/ShopGrid.svelte';
import ShopItemModal, { type PriceSummary, type PurchaseResult } from '$lib/components/shop/ShopItemModal.svelte';

  type CatalogProduct = {
    slug: string;
    name: string;
    description: string;
    rarity: string | null;
    variants: Array<{
      sku: string;
      displayName: string;
      icon: string;
      stackable: boolean;
      maxStack: number | null;
      price: number;
      currency: string;
      promoPercent: number;
      promoSlug: string | null;
      isFlash: boolean;
    }>;
  };

  type InventoryRow = { sku: string; qty: number };
  type OrderPreview = {
    id: string;
    total: number;
    currency: string;
    insertedAt: string;
    items: Array<{ sku: string; name: string; qty: number; total: number }>;
  };

  export let data: {
    products: CatalogProduct[];
    wallet: { balance: number; currency: string } | null;
    inventory: InventoryRow[];
    orders: Array<{ id: string; total: number; currency: string; insertedAt?: string; items?: any[] }>;
  };

  const SHOP_MAX_QTY_PER_LINE = (() => {
    const raw = (import.meta.env.VITE_SHOP_MAX_QTY_PER_LINE as string | undefined) ?? '20';
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
  })();

  let walletBalance = Number(data.wallet?.balance ?? 0);
  let walletCurrency = (data.wallet?.currency ?? 'shards').toUpperCase();

  const inventoryMap = new Map<string, number>();
  for (const row of data.inventory ?? []) {
    inventoryMap.set(row.sku, Number(row.qty ?? 0));
  }

  const buildItems = (): ShopGridItem[] => {
    const items: ShopGridItem[] = [];
    for (const product of data.products ?? []) {
      for (const variant of product.variants ?? []) {
        items.push({
          productSlug: product.slug,
          productName: product.name,
          description: product.description,
          rarity: product.rarity,
          sku: variant.sku,
          displayName: variant.displayName,
          icon: variant.icon,
          stackable: variant.stackable,
          price: variant.price,
          currency: variant.currency ?? 'shards',
          promoPercent: variant.promoPercent ?? 0,
          promoSlug: variant.promoSlug ?? null,
          isFlash: !!variant.isFlash
        });
      }
    }
    return items;
  };

  const categoryFor = (item: ShopGridItem) => {
    const slug = item.productSlug ?? '';
    if (slug.includes('energy')) return 'energy';
    if (slug.includes('boost') || slug.includes('burst')) return 'boost';
    if (slug.includes('cosmetic') || slug.includes('emote')) return 'cosmetic';
    if (slug.includes('loot')) return 'loot';
    return 'misc';
  };

  $: allItems = buildItems();
  $: rarityOptions = ['all', ...Array.from(new Set(allItems.map((item) => (item.rarity ?? 'common').toLowerCase())))];
  $: categoryOptions = ['all', ...Array.from(new Set(allItems.map((item) => categoryFor(item))))].filter(
    (key, idx, arr) => key === 'all' || arr.indexOf(key) === idx
  );

  let filterRarity = 'all';
  let filterCategory = 'all';

  $: filteredItems = allItems.filter((item) => {
    const rarityKey = (item.rarity ?? 'common').toLowerCase();
    const categoryKey = categoryFor(item);
    const matchesRarity = filterRarity === 'all' || rarityKey === filterRarity;
    const matchesCategory = filterCategory === 'all' || categoryKey === filterCategory;
    return matchesRarity && matchesCategory;
  });

  $: flashPromos = allItems.filter((item) => item.isFlash && item.promoPercent > 0);
  $: tickerText = flashPromos.map((item) => `${item.displayName} ${item.promoPercent}% off`).join(' • ');

  let selectedItem: ShopGridItem | null = null;
  let modalOpen = false;

  let toast: { message: string } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  let orders: OrderPreview[] = (data.orders ?? []).map((order) => ({
    id: order.id,
    total: Number(order.total ?? 0),
    currency: order.currency ?? 'shards',
    insertedAt: order.insertedAt ?? new Date().toISOString(),
    items: Array.isArray(order.items)
      ? order.items.map((item: any) => ({
          sku: item.sku,
          name: item.name ?? item.sku,
          qty: Number(item.qty ?? 0),
          total: Number(item.unit_price ?? 0) * Number(item.qty ?? 1) - Number(item.discount ?? 0)
        }))
      : []
  }));

  function showToast(message: string) {
    toast = { message };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 3500);
  }

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
  });

  function handleSelect(event: CustomEvent<{ item: ShopGridItem }>) {
    selectedItem = event.detail.item;
    modalOpen = true;
  }

  function handleClose() {
    modalOpen = false;
    selectedItem = null;
  }

  function handlePurchased(event: CustomEvent<{ item: ShopGridItem; qty: number; total: number; price: PriceSummary; result: PurchaseResult }>) {
    const { item, qty, total, price, result } = event.detail;
    walletBalance = Number(result.balance ?? walletBalance);
    walletCurrency = (result.currency ?? walletCurrency).toUpperCase();

    for (const delta of result.inventoryDeltas ?? []) {
      inventoryMap.set(delta.sku, Number(delta.qty ?? 0));
    }

    const toastAmount = `-${total.toLocaleString()} ${walletCurrency}`;
    showToast(`${toastAmount} • +${qty} ${item.displayName}`);

    const now = new Date().toISOString();
    orders = [
      {
        id: result.orderId,
        total: result.total,
        currency: result.currency,
        insertedAt: now,
        items: price.lines.map((line) => ({
          sku: line.sku,
          name: item.displayName,
          qty: line.qty,
          total: line.total
        }))
      },
      ...orders
    ].slice(0, 10);
  }

  function inventoryQtyFor(sku: string) {
    return inventoryMap.get(sku) ?? 0;
  }

  const rarityLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  const categoryLabel = (key: string) => {
    switch (key) {
      case 'energy':
        return 'Energy';
      case 'boost':
        return 'Boosters';
      case 'cosmetic':
        return 'Cosmetics';
      case 'loot':
        return 'Loot';
      case 'misc':
        return 'Misc';
      default:
        return 'All';
    }
  };

  const formatAmount = (amount: number, currency: string) => `${amount.toLocaleString()} ${currency.toUpperCase()}`;
</script>

<svelte:window on:keydown={(event) => event.key === 'Escape' && modalOpen && handleClose()} />

<div class="shop-page">
  <header class="shop-header">
    <div class="shop-wallet" aria-live="polite">
      <span class="label">Wallet</span>
      <span class="amount">{formatAmount(walletBalance, walletCurrency)}</span>
    </div>

    {#if flashPromos.length > 0 && tickerText}
      <div class="shop-ticker" role="status">
        <span class="ticker-label">Flash Sale</span>
        <div class="ticker-track">
          <span class="ticker-text">{tickerText}</span>
        </div>
      </div>
    {/if}

    <div class="shop-filters">
      <div class="filter-group" role="group" aria-label="Filter by rarity">
        {#each rarityOptions as rarity}
          <button
            type="button"
            class={`filter-btn ${filterRarity === rarity ? 'active' : ''}`}
            on:click={() => (filterRarity = rarity)}
          >
            {rarity === 'all' ? 'All' : rarityLabel(rarity)}
          </button>
        {/each}
      </div>
      <div class="filter-group" role="group" aria-label="Filter by type">
        {#each categoryOptions as category}
          <button
            type="button"
            class={`filter-btn ${filterCategory === category ? 'active' : ''}`}
            on:click={() => (filterCategory = category)}
          >
            {category === 'all' ? 'All Types' : categoryLabel(category)}
          </button>
        {/each}
      </div>
    </div>
  </header>

  <div class="shop-content">
    <main class="shop-main">
      {#if filteredItems.length === 0}
        <p class="shop-empty">No items match your filters right now.</p>
      {:else}
        <ShopGrid items={filteredItems} on:select={handleSelect} />
      {/if}
    </main>

    <aside class="shop-sidebar">
      <section class="shop-sidebar__section">
        <h3>Recent Orders</h3>
        {#if orders.length === 0}
          <p class="muted">No purchases yet.</p>
        {:else}
          <ul>
            {#each orders.slice(0, 5) as order}
              <li>
                <div class="order-head">
                  <span>#{order.id.slice(0, 8)}</span>
                  <span>{formatAmount(order.total, order.currency)}</span>
                </div>
                <time datetime={order.insertedAt}>{new Date(order.insertedAt).toLocaleString()}</time>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="shop-sidebar__section">
        <h3>Inventory</h3>
        {#if Array.from(inventoryMap.values()).every((qty) => qty === 0)}
          <p class="muted">Purchases will appear here.</p>
        {:else}
          <ul>
            {#each Array.from(inventoryMap.entries()).filter(([, qty]) => qty > 0) as [sku, qty]}
              <li>
                <span class="sku">{sku}</span>
                <span class="qty">x{qty}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </aside>
  </div>

  {#if toast}
    <div class="shop-toast" role="status" data-testid="shop-toast">{toast.message}</div>
  {/if}

  <ShopItemModal
    open={modalOpen}
    item={selectedItem}
    walletBalance={walletBalance}
    inventoryQty={selectedItem ? inventoryQtyFor(selectedItem.sku) : 0}
    maxQty={SHOP_MAX_QTY_PER_LINE}
    on:close={handleClose}
    on:purchased={handlePurchased}
  />
</div>

<style>
  .shop-page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
  }

  .shop-header {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .shop-wallet {
    display: inline-flex;
    align-items: baseline;
    gap: 0.5rem;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(94, 234, 212, 0.2);
    border-radius: 999px;
    padding: 0.6rem 1.2rem;
    width: fit-content;
  }

  .shop-wallet .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: rgba(148, 163, 184, 0.78);
  }

  .shop-wallet .amount {
    font-size: 1rem;
    font-weight: 600;
    color: rgba(244, 247, 255, 0.95);
  }

  .shop-ticker {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.6rem 1rem;
    border-radius: 0.9rem;
    background: linear-gradient(135deg, rgba(252, 211, 77, 0.12), rgba(249, 115, 22, 0.1));
    border: 1px solid rgba(251, 191, 36, 0.25);
    font-size: 0.85rem;
    color: rgba(250, 204, 21, 0.92);
  }

  .shop-ticker .ticker-label {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.7rem;
  }

  .ticker-track {
    position: relative;
    overflow: hidden;
    flex: 1;
  }

  .ticker-text {
    display: inline-block;
    white-space: nowrap;
    color: rgba(253, 224, 71, 0.95);
    animation: ticker-slide 16s linear infinite;
  }

  .shop-filters {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .filter-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .filter-btn {
    border: 1px solid rgba(94, 234, 212, 0.18);
    background: rgba(15, 23, 42, 0.7);
    color: rgba(226, 232, 240, 0.82);
    border-radius: 999px;
    padding: 0.45rem 0.95rem;
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border 0.2s ease;
  }

  .filter-btn.active,
  .filter-btn:hover,
  .filter-btn:focus-visible {
    background: rgba(56, 189, 248, 0.2);
    border-color: rgba(56, 189, 248, 0.4);
    color: rgba(248, 250, 252, 0.95);
    outline: none;
  }

  .shop-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 1.5rem;
  }

  .shop-main {
    min-height: 320px;
  }

  .shop-empty {
    color: rgba(148, 163, 184, 0.8);
  }

  .shop-sidebar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .shop-sidebar__section {
    background: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 1rem;
    padding: 1rem;
  }

  .shop-sidebar__section h3 {
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: rgba(226, 232, 240, 0.92);
  }

  .shop-sidebar__section ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .shop-sidebar__section li {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .order-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.88);
  }

  .shop-sidebar__section time {
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.7);
  }

  .shop-sidebar__section .sku {
    font-size: 0.82rem;
    color: rgba(226, 232, 240, 0.9);
  }

  .shop-sidebar__section .qty {
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.78);
  }

  .muted {
    color: rgba(148, 163, 184, 0.7);
    font-size: 0.85rem;
  }

  .shop-toast {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.75rem 1.4rem;
    border-radius: 999px;
    background: rgba(34, 197, 94, 0.92);
    color: rgba(15, 23, 42, 0.95);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    box-shadow: 0 18px 36px rgba(16, 185, 129, 0.32);
  }

  @media (max-width: 900px) {
    .shop-content {
      grid-template-columns: 1fr;
    }

    .shop-sidebar {
      flex-direction: row;
      overflow-x: auto;
    }

    .shop-sidebar__section {
      min-width: 260px;
    }
  }

  @media (max-width: 640px) {
    .shop-page {
      padding: 1rem;
    }

    .shop-filters {
      align-items: flex-start;
    }

    .shop-sidebar {
      flex-direction: column;
    }
  }

  @keyframes ticker-slide {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(-100%);
    }
  }
</style>
