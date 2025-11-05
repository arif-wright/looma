<script lang="ts">
  import { get } from 'svelte/store';
  import ShopGrid from '$lib/components/shop/ShopGrid.svelte';
  import ShopModal from '$lib/components/shop/ShopModal.svelte';
  import { shards } from '$lib/stores/wallet';

  export let data: { items: any[]; error?: string };

  let modalOpen = false;
  let selected: any = null;
  let busy = false;
  let modalError: string | null = null;

  const openModal = (event: CustomEvent<{ item: any }>) => {
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
    const current = get(shards);

    if (item.price_shards > current) {
      modalError = 'Insufficient shards';
      return;
    }

    busy = true;
    shards.set(current - item.price_shards);

    try {
      const form = new FormData();
      form.set('id', item.id);
      form.set('slug', item.slug);
      form.set('price', String(item.price_shards));

      const response = await fetch('?/', { method: 'POST', body: form });
      if (!response.ok) {
        throw new Error('Network error');
      }
      const payload = await response.json();
      if (!payload?.ok) {
        throw new Error(payload?.error ?? 'Purchase failed');
      }

      closeModal();
    } catch (error: any) {
      shards.set(current);
      modalError = error?.message ?? 'Purchase failed';
    } finally {
      busy = false;
    }
  }
</script>

<div class="wallet-bar">
  <div class="wallet-chip">
    <span>Wallet</span>
    <span class="amount">💎 {$shards}</span>
  </div>
</div>

<section class="shop-grid-panel panel-glass">
  {#if data.error}
    <div class="shop-alert">
      Failed to load shop items: {data.error}
    </div>
  {:else if !data.items?.length}
    <p class="shop-empty">No items match your filters right now.</p>
  {:else}
    <ShopGrid items={data.items} on:open={openModal} />
  {/if}
</section>

<ShopModal
  item={selected}
  open={modalOpen}
  busy={busy}
  error={modalError}
  onClose={closeModal}
  onPurchase={purchase}
/>

<style>
  .wallet-bar {
    display: flex;
    justify-content: flex-end;
    margin-top: -0.5rem;
    margin-bottom: 0.5rem;
  }

  .wallet-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    height: 2.25rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(8, 12, 28, 0.55);
    padding: 0 1rem;
    font-size: 0.85rem;
    color: rgba(248, 250, 255, 0.8);
  }

  .wallet-chip .amount {
    font-weight: 600;
    color: rgba(248, 250, 255, 0.95);
  }

  .shop-grid-panel {
    display: grid;
    gap: 1.6rem;
    padding: 2.1rem clamp(1.6rem, 3vw, 2.3rem);
    border-radius: 1.75rem;
  }

  .shop-alert {
    border: 1px solid rgba(255, 123, 123, 0.3);
    background: rgba(255, 86, 86, 0.15);
    color: rgba(255, 214, 214, 0.92);
    padding: 0.85rem 1.1rem;
    border-radius: 1rem;
    font-size: 0.95rem;
  }

  .shop-empty {
    margin: 0;
    text-align: center;
    color: rgba(226, 232, 240, 0.72);
    font-size: 0.95rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>
