<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<div class="space-y-4">
  <header class="flex items-center gap-3">
    <div>
      <h1 class="text-xl font-semibold">Player Inventory</h1>
      <p class="text-sm text-white/60">
        {data.user?.email ?? 'Unknown user'}
        <span class="text-white/40 text-xs">({data.playerId})</span>
      </p>
    </div>
    <a href="/app/admin/players" class="ml-auto text-xs text-white/60 hover:text-white/90">← Back to Players</a>
  </header>

  {#if data.items.length === 0}
    <p class="text-sm text-white/60">No inventory items yet.</p>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each data.items as entry}
        <div class="rounded-2xl p-4 bg-white/5 ring-1 ring-white/10 space-y-2">
          {#if entry.shop_items}
            <div class="flex items-center gap-3">
              {#if entry.shop_items.image_url}
                <img
                  src={entry.shop_items.image_url}
                  alt={entry.shop_items.title}
                  class="h-10 w-10 rounded-xl object-cover"
                />
              {/if}
              <div>
                <div class="text-sm font-semibold">{entry.shop_items.title}</div>
                <div class="text-xs text-white/50">
                  {entry.shop_items.slug} • {entry.shop_items.type} • {entry.shop_items.rarity}
                </div>
              </div>
            </div>
          {:else}
            <div>
              <div class="text-sm font-semibold">Unknown item</div>
              <div class="text-xs text-white/50">Missing catalog metadata</div>
            </div>
          {/if}

          <div class="text-xs text-white/60 mt-1">
            Quantity: <span class="font-semibold">{entry.quantity}</span>
            {#if entry.shop_items?.price_shards != null}
              • Shop price: {entry.shop_items.price_shards} shards
            {/if}
          </div>
          <div class="text-[10px] text-white/40 mt-1">
            Most recent acquisition: {entry.acquired_at ?? '—'}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
