<script lang="ts">
  import ShopGrid from '$lib/components/shop/ShopGrid.svelte';
  export let data: { items: any[]; error?: string };
</script>

{#if data.error}
  <div class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
    Failed to load shop items: {data.error}
  </div>
{:else if !data.items?.length}
  <div class="text-sm text-white/60">No items match your filters right now.</div>
{:else}
  <ShopGrid items={data.items} />
{/if}
