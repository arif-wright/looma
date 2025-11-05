<script lang="ts">
  export let data: {
    items: any[];
    featured: any[];
    shards: number;
    ownedIds: string[];
    error?: string | null;
  };

  import FeaturedSection from '$lib/components/shop/FeaturedSection.svelte';
  import FilterBar, {
    type Category,
    type Rarity,
    type SortKey
  } from '$lib/components/shop/FilterBar.svelte';
  import ShopGrid from '$lib/components/shop/ShopGrid.svelte';
  import ShopModal from '$lib/components/shop/ShopModal.svelte';

  let modalOpen = false;
  let selected: any = null;
  let busy = false;
  let modalError: string | null = null;
  let wallet = data.shards ?? 0;
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
</script>

<!-- Wallet pill -->
<div class="mb-4 flex items-center justify-end gap-2">
  <div class="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-sm text-white/80">
    <span>Wallet</span>
    <span class="font-semibold text-white">💎 {wallet}</span>
  </div>
  <a
    class="flex h-9 items-center rounded-full border border-white/10 px-3 text-sm text-white/85 transition hover:bg-white/5"
    href="/app/(protected)/wallet"
  >
    Add shards
  </a>
</div>

<FeaturedSection items={data.featured} onClickItem={openFeatured} />

<FilterBar {category} {rarity} {sortKey} onChange={onFilterChange} />

{#if data.error}
  <div class="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
    Failed to load shop items: {data.error}
  </div>
{:else}
  <ShopGrid
    items={applyFilters(data.items)}
    on:open={openModal}
  />
{/if}

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
