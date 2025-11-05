<script lang="ts">
  export let data: { items: any[]; shards: number; ownedIds: string[]; error?: string | null };

  import ShopGrid from '$lib/components/shop/ShopGrid.svelte';
  import ShopModal from '$lib/components/shop/ShopModal.svelte';

  let modalOpen = false;
  let selected: any = null;
  let busy = false;
  let modalError: string | null = null;
  let wallet = data.shards ?? 0;
  let owned = new Set(data.ownedIds);

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
</script>

<!-- Wallet pill -->
<div class="mb-4 flex items-center justify-end">
  <div class="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-sm text-white/80">
    <span>Wallet</span>
    <span class="font-semibold text-white">💎 {wallet}</span>
  </div>
</div>

{#if data.error}
  <div class="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
    Failed to load shop items: {data.error}
  </div>
{:else}
  <ShopGrid
    items={data.items.map((item) => ({ ...item, __owned: owned.has(item.id) }))}
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
