<script lang="ts">
  export let data: { items: any[]; error?: string | null };

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? 'Unknown' : date.toLocaleDateString();
  };
</script>

<h1 class="mb-4 text-lg font-semibold text-white">Inventory</h1>

{#if data.error}
  <div class="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
    Failed to load inventory: {data.error}
  </div>
{:else if !data.items.length}
  <p class="text-sm text-white/60">You don’t own any items yet.</p>
{:else}
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 2xl:grid-cols-5">
    {#each data.items as row}
      <article class="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
        <div class="relative aspect-[16/9]">
          <img
            src={row.item.image_url}
            alt={`${row.item.title} cover`}
            class="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          <span class="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide ring-1 ring-white/10">
            {row.item.rarity}
          </span>
        </div>
        <div class="px-3 py-2">
          <h3 class="text-sm font-semibold text-white">{row.item.title}</h3>
          {#if row.item.subtitle}
            <p class="mt-1 text-xs text-white/60">{row.item.subtitle}</p>
          {/if}
          <p class="mt-2 text-[11px] text-white/50">Acquired {formatDate(row.acquired_at)}</p>
        </div>
      </article>
    {/each}
  </div>
{/if}
