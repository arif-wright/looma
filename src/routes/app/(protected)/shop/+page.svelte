<script lang="ts">
  import { browser } from '$app/environment';
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
  let walletPulse = false;
  let walletPulseTimer: ReturnType<typeof setTimeout> | null = null;
  let lastWalletBalance = walletBalance;

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

  let flashCountdown = '02:00:00';
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let countdownEndsAt: number | null = null;

  const updateCountdown = () => {
    if (!countdownEndsAt) return;
    const remaining = Math.max(0, countdownEndsAt - Date.now());
    const hours = String(Math.floor(remaining / 3_600_000)).padStart(2, '0');
    const minutes = String(Math.floor((remaining % 3_600_000) / 60_000)).padStart(2, '0');
    const seconds = String(Math.floor((remaining % 60_000) / 1000)).padStart(2, '0');
    flashCountdown = `${hours}:${minutes}:${seconds}`;
    if (remaining <= 0 && countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  const startCountdown = () => {
    if (!browser) return;
    countdownEndsAt = Date.now() + 2 * 60 * 60 * 1000;
    updateCountdown();
    countdownTimer = window.setInterval(updateCountdown, 1000);
  };

  $: {
    if (browser && flashPromos.length > 0) {
      if (!countdownTimer) startCountdown();
    } else if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  $: {
    if (walletBalance !== lastWalletBalance) {
      walletPulse = true;
      walletPulseTimer && clearTimeout(walletPulseTimer);
      walletPulseTimer = setTimeout(() => {
        walletPulse = false;
      }, 1500);
      lastWalletBalance = walletBalance;
    }
  }

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
    if (walletPulseTimer) clearTimeout(walletPulseTimer);
    if (countdownTimer) clearInterval(countdownTimer);
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
  <div class="shop-shell">
    <header class="shop-header panel-glass">
      <div class={`shop-wallet ${walletPulse ? 'pulse-soft' : ''}`} aria-live="polite">
        <span class="label">Wallet</span>
        <span class="amount">{formatAmount(walletBalance, walletCurrency)}</span>
      </div>

      {#if flashPromos.length > 0 && tickerText}
        <div class="flash-banner panel-glass" role="status">
          <div class="flash-meta">
            <span class="flash-label">Flash Sale</span>
            <span class="flash-countdown" aria-live="polite">{flashCountdown}</span>
          </div>
          <div class="flash-ticker">
            <span>{tickerText}</span>
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
      <main class="shop-main panel-glass">
        {#if filteredItems.length === 0}
          <p class="shop-empty">No items match your filters right now.</p>
        {:else}
          <ShopGrid items={filteredItems} on:select={handleSelect} />
        {/if}
      </main>

      <aside class="shop-sidebar">
        <section class="sidebar-card panel-glass">
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

        <section class="sidebar-card panel-glass">
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
      <div class="shop-toast toast-panel" role="status" data-testid="shop-toast">{toast.message}</div>
    {/if}
  </div>

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
    position: relative;
    min-height: 100vh;
    background: radial-gradient(circle at top, rgba(155, 92, 255, 0.15), transparent 55%),
      radial-gradient(circle at bottom, rgba(94, 242, 255, 0.1), transparent 45%),
      var(--brand-navy, #050712);
    padding: clamp(1.2rem, 4vw, 3rem);
  }

  .shop-shell {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .shop-header {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .shop-wallet {
    display: inline-flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.65rem 1.4rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(8, 12, 28, 0.75);
    color: rgba(248, 250, 255, 0.9);
    font-size: 0.95rem;
  }

  .shop-wallet .label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.65);
  }

  .shop-wallet .amount {
    font-size: 1.15rem;
    font-weight: 600;
  }

  .flash-banner {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 1rem;
    border-radius: 1.2rem;
    background: rgba(21, 15, 6, 0.6);
    border: 1px solid rgba(255, 207, 106, 0.4);
    box-shadow: 0 18px 32px rgba(255, 149, 5, 0.22);
  }

  .flash-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .flash-label {
    font-size: 0.78rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: rgba(255, 207, 106, 0.8);
  }

  .flash-countdown {
    font-family: 'Inter', monospace;
    font-size: 1.25rem;
    letter-spacing: 0.1em;
    color: #ffcf6a;
    text-shadow: 0 0 16px rgba(255, 207, 106, 0.6);
  }

  .flash-ticker {
    overflow: hidden;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 0.4rem;
  }

  .flash-ticker span {
    display: inline-block;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.75);
    animation: flash-marquee 18s linear infinite;
  }

  .shop-filters {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .filter-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .filter-btn {
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(8, 12, 28, 0.55);
    color: rgba(248, 250, 255, 0.8);
    padding: 0.45rem 1rem;
    border-radius: 999px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-size: 0.68rem;
    transition: background 180ms ease, color 180ms ease, border 180ms ease;
  }

  .filter-btn.active,
  .filter-btn:hover,
  .filter-btn:focus-visible {
    border-color: rgba(94, 242, 255, 0.5);
    background: rgba(94, 242, 255, 0.18);
    color: #fff;
    outline: none;
  }

  .shop-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 1.5rem;
  }

  .shop-main {
    min-height: 360px;
  }

  .shop-empty {
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.95rem;
  }

  .shop-sidebar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .sidebar-card {
    padding: 1.15rem;
    border-radius: 1.2rem;
    background: rgba(8, 12, 28, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(248, 250, 255, 0.9);
  }

  .sidebar-card h3 {
    margin: 0 0 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.65);
  }

  .sidebar-card ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }

  .order-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
  }

  .sidebar-card time {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .sku {
    font-weight: 600;
  }

  .qty {
    font-size: 0.85rem;
    color: rgba(94, 242, 255, 0.85);
  }

  .muted {
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.85rem;
  }

  .shop-toast {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
  }

  @keyframes flash-marquee {
    0% {
      transform: translateX(10%);
    }
    100% {
      transform: translateX(-110%);
    }
  }

  @media (max-width: 1024px) {
    .shop-content {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .shop-page {
      padding: 1rem;
    }

    .shop-shell {
      gap: 1rem;
    }

    .shop-content {
      gap: 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flash-ticker span {
      animation: none;
    }
  }
</style>
