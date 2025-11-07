<script lang="ts">
  import { onMount } from 'svelte';
  import FeaturedSection from '$lib/components/shop/FeaturedSection.svelte';
  import FilterBar, { type Category, type Rarity, type SortKey } from '$lib/components/shop/FilterBar.svelte';
  import Panel from '$lib/components/ui/Panel.svelte';
  import ShopGrid from '$lib/components/shop/ShopGrid.svelte';
  import ShopModal from '$lib/components/shop/ShopModal.svelte';
  import { walletBalance, setWalletBalance } from '$lib/stores/economy';

  type FilterState = {
    category: Category;
    rarity: Rarity;
    sortKey: SortKey;
  };

  export let data: {
    items: any[];
    featured?: any[];
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

    try {
      const form = new FormData();
      form.set('slug', item.slug);

      const res = await fetch('?/purchase', { method: 'POST', body: form });
      const out = await res.json();

      if (!res.ok || !out?.ok) throw new Error(out?.error || 'Purchase failed');

      const nextBalance = asNumber(out.shards, balance);
      setWalletBalance(nextBalance, balance);
      owned = new Set([...owned, item.id]);
      closeModal();
    } catch (err: any) {
      modalError = err?.message || 'Purchase failed';
    } finally {
      busy = false;
    }
  }

  function onFilterChange(next: FilterState) {
    current = next;
  }

  onMount(() => {
    setWalletBalance(fallbackBalance);
  });

  $: balance = asNumber($walletBalance, fallbackBalance);
  $: featuredItems = Array.isArray(data.featured) ? data.featured : [];
  $: catalogItems = (data.items ?? []).map((item) => ({ ...item, __owned: owned.has(item.id) }));
</script>

<div class="mx-auto max-w-screen-xl px-4 py-6 space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold text-white">Shop</h1>
      <p class="text-sm text-white/60">Browse featured drops, filter gear, and spend shards.</p>
    </div>

    <div class="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm text-white/80 ring-1 ring-white/10">
      <span class="text-white/60 text-xs uppercase tracking-wide">Wallet</span>
      <span class="tabular-nums font-semibold text-white">{numberFormatter.format(balance)}</span>
      <a
        class="rounded-full bg-gradient-to-r from-cyan-400/85 to-fuchsia-400/85 px-2 py-1 text-xs font-semibold text-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
        href="/app/wallet"
      >
        Add shards
      </a>
    </div>
  </header>

  {#if featuredItems.length > 0}
    <FeaturedSection items={featuredItems} />
  {/if}

  <Panel className="space-y-4">
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
  @media (prefers-reduced-motion: reduce) {
    .animate-pulse,
    .animate-bounce,
    .animate-spin {
      animation: none !important;
    }
  }
</style>
