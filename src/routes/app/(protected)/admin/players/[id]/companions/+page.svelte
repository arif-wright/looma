<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<div class="space-y-4">
  <header class="flex items-center gap-3">
    <div>
      <h1 class="text-xl font-semibold">Player Companions</h1>
      <p class="text-sm text-white/60">
        {data.user?.email ?? 'Unknown user'}
        <span class="text-white/40 text-xs">({data.playerId})</span>
      </p>
    </div>
    <a href="/app/admin/players" class="ml-auto text-xs text-white/60 hover:text-white/90">← Back to Players</a>
  </header>

  {#if data.companions.length === 0}
    <p class="text-sm text-white/60">No companions yet.</p>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each data.companions as companion}
        <div class="rounded-2xl p-4 bg-white/5 ring-1 ring-white/10 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="font-semibold text-sm">{companion.name ?? 'Unnamed companion'}</div>
            {#if companion.is_active}
              <span class="text-xs rounded-full px-2 py-0.5 bg-emerald-500/20 text-emerald-200">Active</span>
            {/if}
          </div>
          <div class="text-xs text-white/60 break-all">ID: {companion.id}</div>
          <div class="text-xs text-white/50">
            Species: {companion.species ?? '—'} • Rarity: {companion.rarity ?? '—'}
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-white/70">
            <span>Affection: {companion.affection ?? 0}</span>
            <span>Trust: {companion.trust ?? 0}</span>
            <span>Energy: {companion.energy ?? 0}</span>
          </div>
          <div class="text-xs text-white/50 mt-1">
            State: {companion.state ?? 'idle'} • Slot: {companion.slot_index ?? '—'}
          </div>
          <div class="text-[10px] text-white/40 mt-1">
            Created: {companion.created_at ?? '—'}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
