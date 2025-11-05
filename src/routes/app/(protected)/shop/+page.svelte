<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy } from 'svelte';
  import ShopLayout, { type NavItem } from '$lib/components/shop/ShopLayout.svelte';
  import FeaturedSection, { type FeaturedBanner } from '$lib/components/shop/FeaturedSection.svelte';
  import FilterBar, { type FilterChip, type SortOption } from '$lib/components/shop/FilterBar.svelte';
  import ShopGrid, { type ShopGridItem } from '$lib/components/shop/ShopGrid.svelte';
  import ShopModal, { type PriceSummary, type PurchaseResult } from '$lib/components/shop/ShopModal.svelte';

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
  $: categoryChips = [{ id: 'all', label: 'All' }, ...Array.from(new Set(allItems.map((item) => categoryFor(item)))).map((key) => ({ id: key, label: categoryLabel(key) }))] as FilterChip[];
  $: rarityChips = [{ id: 'all', label: 'All Rarities' }, ...Array.from(new Set(allItems.map((item) => (item.rarity ?? 'common').toLowerCase()))).map((value) => ({ id: value, label: rarityLabel(value) }))] as FilterChip[];

  let filterCategory = 'all';
  let filterRarity = 'all';
  let sortMode = 'featured';
  let searchTerm = '';

  $: filteredItems = allItems
    .filter((item) => {
      const rarityKey = (item.rarity ?? 'common').toLowerCase();
      const categoryKey = categoryFor(item);
      const matchesRarity = filterRarity === 'all' || rarityKey === filterRarity;
      const matchesCategory = filterCategory === 'all' || categoryKey === filterCategory;
      const matchesSearch = !searchTerm
        || item.displayName.toLowerCase().includes(searchTerm.toLowerCase())
        || item.description.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesRarity && matchesCategory && matchesSearch;
    });

  const sorters: Record<string, (a: ShopGridItem, b: ShopGridItem) => number> = {
    featured: () => 0,
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    name: (a, b) => a.displayName.localeCompare(b.displayName)
  };

  $: sortedItems = [...filteredItems].sort(sorters[sortMode] ?? sorters.featured);

  $: flashPromos = allItems.filter((item) => item.isFlash && item.promoPercent > 0);
  $: featuredBanners = buildBanners(flashPromos, allItems);

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

  const navItems: NavItem[] = [
    { id: 'shop', label: 'Shop', href: '/app/shop' },
    { id: 'creatures', label: 'Creatures' },
    { id: 'items', label: 'Items' },
    { id: 'bundles', label: 'Bundles' },
    { id: 'flash', label: 'Flash Deals' }
  ];

  const sortOptions: SortOption[] = [
    { id: 'featured', label: 'Featured' },
    { id: 'price-asc', label: 'Price: Low to High' },
    { id: 'price-desc', label: 'Price: High to Low' },
    { id: 'name', label: 'Name' }
  ];

  function showToast(message: string) {
    toast = { message };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 3200);
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

  function handleCategory(event: CustomEvent<{ id: string }>) {
    filterCategory = event.detail.id;
  }

  function handleRarity(event: CustomEvent<{ id: string }>) {
    filterRarity = event.detail.id;
  }

  function handleSort(event: CustomEvent<{ id: string }>) {
    sortMode = event.detail.id;
  }

  function handleSearch(event: CustomEvent<{ value: string }>) {
    searchTerm = event.detail.value;
  }

  const isImage = (source: string | null | undefined) => {
    if (!source) return false;
    return source.startsWith('/') || source.startsWith('http') || /\.(png|jpe?g|webp|svg)$/i.test(source);
  };

  function buildBanners(promos: ShopGridItem[], items: ShopGridItem[]): FeaturedBanner[] {
    const sources = promos.length > 0 ? promos.slice(0, 3) : items.slice(0, 3);
    return sources.map((entry, index) => ({
      id: entry.sku,
      title: entry.displayName,
      description: entry.description,
      ctaLabel: entry.promoPercent > 0 ? `Save ${entry.promoPercent}%` : 'View Item',
      href: '#shop-grid',
      image: isImage(entry.icon) ? entry.icon : '/og/shop-banner.webp',
      accent: ['cyan', 'magenta', 'amber'][index % 3] as FeaturedBanner['accent']
    }));
  }
</script>

<svelte:window on:keydown={(event) => event.key === 'Escape' && modalOpen && handleClose()} />

<ShopLayout
  navItems={navItems}
  activeId="shop"
  walletLabel={formatAmount(walletBalance, walletCurrency)}
  {walletPulse}
  on:search={handleSearch}
>
  <FeaturedSection slot="featured" banners={featuredBanners} />

  <FilterBar
    slot="filters"
    categories={categoryChips}
    activeCategory={filterCategory}
    rarities={rarityChips}
    activeRarity={filterRarity}
    sortOptions={sortOptions}
    activeSort={sortMode}
    on:category={handleCategory}
    on:rarity={handleRarity}
    on:sort={handleSort}
  />

  <section id="shop-grid" class="shop-grid-panel panel-glass">
    {#if sortedItems.length === 0}
      <p class="shop-empty">No items match your filters right now.</p>
    {:else}
      <ShopGrid items={sortedItems} on:select={handleSelect} />
    {/if}
  </section>

  {#if orders.length > 0}
    <section class="shop-orders panel-glass" aria-label="Recent orders">
      <header>
        <h2>Recent Orders</h2>
        <p>Your latest marketplace activity.</p>
      </header>
      <ul>
        {#each orders.slice(0, 5) as order}
          <li>
            <div>
              <span class="order-id">#{order.id.slice(0, 8)}</span>
              <time datetime={order.insertedAt}>{new Date(order.insertedAt).toLocaleString()}</time>
            </div>
            <strong>{formatAmount(order.total, order.currency)}</strong>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if toast}
    <div class="shop-toast" role="status">{toast.message}</div>
  {/if}
</ShopLayout>

<ShopModal
  open={modalOpen}
  item={selectedItem}
  walletBalance={walletBalance}
  inventoryQty={selectedItem ? inventoryQtyFor(selectedItem.sku) : 0}
  maxQty={SHOP_MAX_QTY_PER_LINE}
  on:close={handleClose}
  on:purchased={handlePurchased}
  on:error={(event) => showToast(event.detail.message)}
/>

<style>
  .shop-grid-panel {
    display: grid;
    gap: 1.5rem;
    padding: 2.1rem clamp(1.6rem, 3vw, 2.3rem);
    border-radius: 1.75rem;
  }

  .shop-empty {
    margin: 0;
    color: rgba(226, 232, 240, 0.75);
    text-align: center;
    padding: 3rem 0;
  }

  .shop-orders {
    display: grid;
    gap: 1rem;
    padding: 1.8rem clamp(1.4rem, 3vw, 2.2rem);
    border-radius: 1.75rem;
  }

  .shop-orders header {
    display: grid;
    gap: 0.35rem;
  }

  .shop-orders h2 {
    margin: 0;
    font-size: clamp(1.35rem, 2.2vw, 1.7rem);
    color: rgba(248, 250, 252, 0.96);
  }

  .shop-orders p {
    margin: 0;
    color: rgba(226, 232, 240, 0.72);
  }

  .shop-orders ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.8rem;
  }

  .shop-orders li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .shop-orders li:last-child {
    border-bottom: none;
  }

  .shop-orders time {
    display: block;
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.78);
  }

  .order-id {
    font-size: 0.85rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.72);
  }

  .shop-toast {
    justify-self: center;
    margin-top: 1rem;
    padding: 0.75rem 1.8rem;
    border-radius: 999px;
    background: rgba(8, 12, 28, 0.7);
    border: 1px solid rgba(94, 242, 255, 0.35);
    color: rgba(248, 250, 255, 0.9);
    box-shadow: 0 18px 32px rgba(94, 242, 255, 0.2);
  }
</style>
