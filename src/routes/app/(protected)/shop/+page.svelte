<script lang="ts">
  import ShopGrid from '$lib/components/shop/ShopGrid.svelte';
  export let data: { items: any[]; error?: string };
</script>

<section class="shop-grid-panel panel-glass">
  {#if data.error}
    <div class="shop-alert">
      Failed to load shop items: {data.error}
    </div>
  {:else if !data.items?.length}
    <p class="shop-empty">No items match your filters right now.</p>
  {:else}
    <ShopGrid items={data.items} />
  {/if}
</section>

<style>
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
