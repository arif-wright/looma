<script lang="ts">
  import { onMount } from 'svelte';
  import FeaturedSection from '$lib/components/shop/FeaturedSection.svelte';
  import FilterBar, {
    type Category,
    type Rarity,
    type SortKey
  } from '$lib/components/shop/FilterBar.svelte';
  import Panel from '$lib/components/ui/Panel.svelte';
  import ShopGrid from '$lib/components/shop/ShopGrid.svelte';
  import ShopModal from '$lib/components/shop/ShopModal.svelte';
  import { walletBalance, formatShards } from '$lib/stores/economy';

  export let data: {
    items: any[];
    featured: any[];
    shards: number;
    wallet?: number;
    ownedIds: string[];
    error?: string | null;
  };

  let modalOpen = false;
  let selected: any = null;
  let busy = false;
  let modalError: string | null = null;
  const initialWallet = data.wallet ?? data.shards ?? 0;
  let wallet = initialWallet;
  let walletReady = false;
  let owned = new Set(data.ownedIds);

  let category: Category = 'all';
  let rarity: Rarity = 'all';
  let sortKey: SortKey = 'newest';

  const openModal = (e: CustomEvent) => {
    selected = e.detail.item;
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

    if (item.price_shards > wallet) {
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

      wallet = typeof out.shards === 'number' ? out.shards : wallet;
      walletBalance.set(wallet);
      walletReady = true;
      owned = new Set([...owned, item.id]);
      closeModal();
    } catch (err: any) {
      modalError = err?.message || 'Purchase failed';
    } finally {
      busy = false;
    }
  }

  function applyFilters(list: any[]) {
    let out = Array.isArray(list) ? [...list] : [];

    if (category !== 'all') {
      out = out.filter((item) => item.type === category);
    }

    if (rarity !== 'all') {
      out = out.filter((item) => item.rarity === rarity);
    }

    switch (sortKey) {
      case 'priceAsc':
        out.sort((a, b) => a.price_shards - b.price_shards);
        break;
      case 'priceDesc':
        out.sort((a, b) => b.price_shards - a.price_shards);
        break;
      case 'rarity': {
        const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
        out.sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
        break;
      }
      default:
        out.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }

    return out.map((item) => ({ ...item, __owned: owned.has(item.id) }));
  }

  const onFilterChange = (state: {
    category: Category;
    rarity: Rarity;
    sortKey: SortKey;
  }) => {
    category = state.category;
    rarity = state.rarity;
    sortKey = state.sortKey;
  };

  const openFeatured = (item: any) => {
    selected = item;
    modalError = null;
    modalOpen = true;
  };

  onMount(() => {
    walletBalance.set(initialWallet);
    walletReady = true;
  });

  $: displayWallet = walletReady ? $walletBalance : wallet;
  $: if (walletReady && typeof $walletBalance === 'number') {
    wallet = $walletBalance;
  }
  $: formattedWallet = formatShards(displayWallet ?? wallet);
</script>

<div class="shop-root bg-neuro">
  <main class="shop-shell">
    <div class="shop-container">
      <header class="shop-header">
        <div>
          <p class="eyebrow">Economy</p>
          <h1>Shop</h1>
          <p class="lede">Browse featured drops, filter gear, and spend shards.</p>
        </div>
        <a
          href="/app/wallet"
          class="wallet-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
          aria-label="Go to wallet"
        >
          Wallet
          <span aria-live="polite" aria-atomic="true">💎 {formattedWallet}</span>
        </a>
      </header>

      <Panel className="wallet-panel">
        <div class="wallet-pill" role="status" aria-live="polite">
          <span class="wallet-label">Balance</span>
          <strong>💎 {formattedWallet}</strong>
        </div>
        <a
          href="/app/wallet"
          class="wallet-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
          aria-label="Add shards"
        >
          Add shards
        </a>
      </Panel>

      <Panel title="Featured Drops" className="featured-panel">
        <FeaturedSection items={data.featured} onClickItem={openFeatured} />
      </Panel>

      <Panel title="Filters">
        <FilterBar {category} {rarity} {sortKey} onChange={onFilterChange} />
      </Panel>

      <Panel title="Catalog">
        {#if data.error}
          <div class="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            Failed to load shop items: {data.error}
          </div>
        {:else}
          <ShopGrid items={applyFilters(data.items)} on:open={openModal} />
        {/if}
      </Panel>
    </div>
  </main>
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
  .shop-root {
    min-height: 100vh;
    color: #fff;
  }

  .shop-shell {
    padding: clamp(2.5rem, 4vw, 3.5rem) 1.5rem 3rem;
  }

  .shop-container {
    width: 100%;
    max-width: 72rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .shop-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.28em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 0.4rem;
  }

  .shop-header h1 {
    margin: 0;
    font-size: clamp(1.7rem, 4vw, 2.2rem);
  }

  .lede {
    margin: 0.25rem 0 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .wallet-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 0.4rem 0.9rem;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.85);
    text-decoration: none;
  }

  .wallet-panel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .wallet-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 23, 42, 0.35);
    padding: 0.4rem 0.9rem;
    font-size: 0.95rem;
  }

  .wallet-label {
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .wallet-cta {
    text-decoration: none;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 0.45rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.85rem;
    transition: background 0.2s ease;
  }

  .wallet-cta:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .featured-panel :global(.featured-section) {
    margin-bottom: 0;
  }

  @media (max-width: 640px) {
    .shop-shell {
      padding: 2rem 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.animate-pulse-slow),
    :global(.animate-in) {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
