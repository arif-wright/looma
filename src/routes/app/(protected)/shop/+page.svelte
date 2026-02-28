<script lang="ts">
  import { onMount } from 'svelte';
  import FeaturedSection from '$lib/components/shop/FeaturedSection.svelte';
  import FilterBar from '$lib/components/shop/FilterBar.svelte';
  import type { Category, Rarity, SortKey } from '$lib/components/shop/types';
  import Panel from '$lib/components/ui/Panel.svelte';
  import ShopGrid from '$lib/components/shop/ShopGrid.svelte';
  import ShopModal from '$lib/components/shop/ShopModal.svelte';
  import { walletBalance, setWalletBalance } from '$lib/stores/economy';
  import { logEvent } from '$lib/analytics';

  type FilterState = {
    category: Category;
    rarity: Rarity;
    sortKey: SortKey;
  };

  export let data: {
    items: any[];
    featured?: any[];
    highlightSlug?: string | null;
    wallet?: number;
    shards?: number;
    ownedIds: string[];
    error?: string | null;
    filters?: { current?: FilterState } | FilterState;
  };

  const defaultFilters: FilterState = { category: 'all', rarity: 'all', sortKey: 'newest' };
  const numberFormatter = new Intl.NumberFormat();

  const asNumber = (value: unknown, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    if (typeof value === 'object' && value !== null) {
      const candidate = (value as Record<string, unknown>).balance ?? (value as Record<string, unknown>).shards;
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
    }
    return Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  };

  let modalOpen = false;
  let selected: any = null;
  let busy = false;
  let modalError: string | null = null;
  let owned = new Set(data.ownedIds ?? []);
  let current: FilterState = {
    ...defaultFilters,
    ...(data.filters && 'current' in (data.filters as any)
      ? (data.filters as { current?: FilterState }).current ?? {}
      : data.filters ?? {})
  };

  const fallbackBalance = asNumber(data.wallet ?? data.shards, 0);
  let highlightSlug: string | null = data?.highlightSlug ?? null;
  let highlightHandled = !highlightSlug;
  $: ownedCount = owned.size;

  const formatError = (value: unknown): string => {
    if (!value) return 'Purchase failed';
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message || 'Purchase failed';
    if (typeof value === 'object') {
      const candidate = (value as Record<string, unknown>).message ?? (value as Record<string, unknown>).hint ?? (value as Record<string, unknown>).details;
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return 'Purchase failed';
      }
    }
    return 'Purchase failed';
  };
  const subNavItems = [
    { label: 'Shop', href: '/app/shop', active: true },
    { label: 'Companions', href: '/app/companions', active: false },
    { label: 'Items', href: '/app/items', active: false },
    { label: 'Bundles', href: '/app/bundles', active: false }
  ];

  const openModal = (event: CustomEvent) => {
    selected = event.detail.item;
    modalError = null;
    modalOpen = true;
  };

  const closeModal = () => {
    modalOpen = false;
    selected = null;
    modalError = null;
  };

  async function purchase(item: any) {
    modalError = null;

    if (item.price_shards > balance) {
      modalError = 'Insufficient shards';
      return;
    }

    busy = true;

    const normalizeActionPayload = (payload: any) => {
      if (
        payload &&
        typeof payload === 'object' &&
        'type' in payload &&
        Array.isArray((payload as Record<string, unknown>).data)
      ) {
        const entries = (payload as { data: unknown[] }).data;
        const primary = entries?.[0];
        if (primary && typeof primary === 'object') {
          return primary;
        }
      }
      return payload;
    };

    try {
      const form = new FormData();
      form.set('slug', item.slug);

      const res = await fetch('?/purchase', { method: 'POST', body: form });
      const raw = await res.json().catch(() => ({}));
      const out = normalizeActionPayload(raw);

      if (!res.ok || !out?.ok) {
        throw new Error(formatError(out?.error ?? raw));
      }

      const nextBalance = asNumber(out.shards, balance);
      setWalletBalance(nextBalance, balance);
      owned = new Set([...owned, item.id]);
      logEvent('purchase', { itemId: item.id, priceShards: item.price_shards });
      closeModal();
    } catch (err: any) {
      modalError = formatError(err);
    } finally {
      busy = false;
    }
  }

  function onFilterChange(next: FilterState) {
    current = next;
  }

  onMount(() => {
    setWalletBalance(fallbackBalance);
    logEvent('pageview', { path: '/app/shop' });
  });

  $: balance = asNumber($walletBalance, fallbackBalance);
  $: featuredItems = Array.isArray(data.featured) ? data.featured : [];
  $: catalogItems = (data.items ?? []).map((item) => ({ ...item, __owned: owned.has(item.id) }));

  $: if (highlightSlug && !highlightHandled && catalogItems.length) {
    const target = catalogItems.find((item) => item.slug === highlightSlug);
    if (target) {
      selected = target;
      modalError = null;
      modalOpen = true;
      highlightHandled = true;
      logEvent('shop_highlight_open', { slug: highlightSlug });
    } else {
      highlightHandled = true;
    }
  }
</script>

<div class="shop-shell mx-auto max-w-screen-xl space-y-4 md:space-y-6">
  <section class="shop-pulse" aria-label="Shop pulse">
    <div>
      <p class="shop-pulse__eyebrow">Marketplace pulse</p>
      <h1>Spend shards without losing the sanctuary feel.</h1>
      <p class="shop-pulse__lede">
        Cosmetics and collectibles should support the companion loop, not feel like a detached storefront.
      </p>
    </div>

    <div class="shop-pulse__stats">
      <article class="pulse-card">
        <span class="pulse-card__label">Wallet</span>
        <strong>{numberFormatter.format(balance)} shards</strong>
        <span>Top up only when you need to extend the experience.</span>
      </article>
      <article class="pulse-card">
        <span class="pulse-card__label">Owned</span>
        <strong>{ownedCount} items</strong>
        <span>Your collection grows alongside your sanctuary.</span>
      </article>
    </div>
  </section>

  <header class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
    <div>
      <h2 class="text-2xl font-semibold text-white">Shop</h2>
      <p class="text-sm text-white/60">Browse featured drops, filter gear, and spend shards.</p>
    </div>

    <div class="wallet-pill inline-flex items-center gap-2 self-start md:self-auto rounded-full px-3 py-1.5 text-sm ring-1">
      <span class="text-white/70 text-xs">WALLET</span>
      <span class="tabular-nums font-semibold text-white">{numberFormatter.format(balance)}</span>
      <a
        class="wallet-pill__action rounded-full px-2 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2"
        href="/app/wallet"
      >
        Add shards
      </a>
    </div>
  </header>

  <section class="hidden md:block rounded-2xl bg-white/5 ring-1 ring-white/10 p-3 md:p-4 space-y-3">
    <div
      class="scrollbar-hide flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 md:pb-3"
      style="-webkit-overflow-scrolling: touch;"
    >
      {#each subNavItems as item}
        <a
          href={item.href}
          class={`snap-start whitespace-nowrap rounded-full px-4 py-2 text-sm ring-1 ring-white/10 ${
            item.active
              ? 'bg-cyan-500/20 text-white font-semibold'
              : 'bg-white/5 text-white/80'
          }`}
        >
          {item.label}
        </a>
      {/each}
    </div>

    <div>
      <input
        type="search"
        placeholder="Search the market…"
        class="w-full rounded-xl bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/40 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
      />
    </div>
  </section>

  {#if featuredItems.length > 0}
    <FeaturedSection items={featuredItems} />
  {/if}

  <Panel className="space-y-4 md:space-y-6">
    <FilterBar current={current} on:change={(event) => onFilterChange(event.detail)} />

    {#if data.error}
      <div class="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
        Failed to load shop items: {data.error}
      </div>
    {:else}
      <ShopGrid items={catalogItems} filters={current} on:open={openModal} />
    {/if}
  </Panel>
</div>

<ShopModal
  open={modalOpen}
  item={selected}
  {busy}
  error={modalError}
  owned={selected ? owned.has(selected.id) : false}
  stackable={selected?.stackable ?? true}
  onClose={closeModal}
  onPurchase={purchase}
/>

<style>
  .shop-pulse {
    border-radius: 1.25rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(160deg, rgba(24, 20, 15, 0.78), rgba(12, 16, 19, 0.88)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.14), transparent 42%);
    padding: 1rem;
    display: grid;
    gap: 0.9rem;
  }

  .shop-pulse__eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  .shop-pulse h1 {
    margin: 0.18rem 0 0;
    font-family: var(--san-font-display);
    font-size: clamp(1.6rem, 4vw, 2.35rem);
    line-height: 1.04;
    color: rgba(249, 243, 230, 0.98);
  }

  .shop-pulse__lede {
    margin: 0.42rem 0 0;
    color: rgba(223, 211, 188, 0.78);
    line-height: 1.5;
    max-width: 42rem;
  }

  .shop-pulse__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .pulse-card {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(180deg, rgba(31, 25, 17, 0.64), rgba(15, 18, 20, 0.88)),
      radial-gradient(circle at top, rgba(214, 190, 141, 0.08), transparent 56%);
    padding: 0.85rem;
    display: grid;
    gap: 0.16rem;
  }

  .pulse-card__label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.72);
  }

  .pulse-card strong {
    color: rgba(248, 241, 227, 0.98);
    font-size: 1rem;
  }

  .pulse-card span:last-child {
    color: rgba(219, 208, 185, 0.74);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .wallet-pill {
    background: rgba(31, 25, 17, 0.56);
    border-color: rgba(214, 190, 141, 0.14);
    color: rgba(245, 238, 225, 0.86);
  }

  .wallet-pill__action {
    background: linear-gradient(125deg, rgba(212, 173, 92, 0.94), rgba(166, 121, 61, 0.92));
    color: rgba(22, 16, 9, 0.96);
    text-decoration: none;
  }

  .wallet-pill__action:focus-visible {
    outline: 2px solid rgba(214, 190, 141, 0.28);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .animate-pulse,
    .animate-bounce,
    .animate-spin {
      animation: none !important;
    }
  }

  :global(.scrollbar-hide) {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  :global(.scrollbar-hide::-webkit-scrollbar) {
    display: none;
  }

  .shop-shell {
    width: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
  }

  @media (max-width: 700px) {
    .shop-pulse__stats {
      grid-template-columns: 1fr;
    }
  }
</style>
