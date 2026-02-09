<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { logEvent } from '$lib/analytics';
  import { onDestroy, tick } from 'svelte';

  export let data: PageData;

  type Player = PageData['players'][number];
  type PlayerSort = 'newest' | 'oldest' | 'slots_desc' | 'slots_asc' | 'licenses_desc' | 'licenses_asc';

  let search = data.q ?? '';
  let sort: PlayerSort = (data.sort as PlayerSort) ?? 'newest';
  let grantOpen = false;
  let selectedPlayer: Player | null = null;
  let qty = 1;
  let status = '';
  let errorMessage = '';
  let modalEl: HTMLDivElement | null = null;
  let firstFocusable: HTMLElement | null = null;
  let lastFocusable: HTMLElement | null = null;
  let previousFocus: HTMLElement | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const refreshFocusables = async () => {
    if (!grantOpen) return;
    await tick();
    if (!modalEl) return;
    const focusables = Array.from(
      modalEl.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((node) => !node.hasAttribute('disabled'));
    firstFocusable = focusables[0] ?? null;
    lastFocusable = focusables[focusables.length - 1] ?? null;
    firstFocusable?.focus();
  };

  $: if (grantOpen) {
    void refreshFocusables();
  } else if (browser && previousFocus) {
    previousFocus.focus();
    previousFocus = null;
  }

  const buildUrl = (params: Record<string, string | number | undefined>) => {
    const url = new URL($page.url.href);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '' || Number.isNaN(value)) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, String(value));
      }
    });
    const query = url.searchParams.toString();
    return query ? `${url.pathname}?${query}` : url.pathname;
  };

  const updateQuery = (params: Record<string, string | number | undefined>, replace = false) => {
    const target = buildUrl(params);
    void goto(target, { keepFocus: true, noScroll: true, replaceState: replace });
  };

  const handleSearchInput = (value: string) => {
    search = value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      updateQuery({ q: search || undefined, page: 1 }, true);
    }, 300);
  };

  const handleSortChange = (value: PlayerSort) => {
    sort = value;
    updateQuery({ sort: value, page: 1 });
  };

  const gotoPage = (next: number) => {
    if (next < 1 || next > data.totalPages) return;
    updateQuery({ page: next });
  };

  function openGrant(player: Player) {
    selectedPlayer = player;
    qty = 1;
    status = '';
    errorMessage = '';
    grantOpen = true;
    if (browser) {
      previousFocus = document.activeElement as HTMLElement | null;
      logEvent('admin_grant_license_open', { target: player.id });
    }
  }

  function closeGrant() {
    grantOpen = false;
    status = '';
    errorMessage = '';
    selectedPlayer = null;
    qty = 1;
  }

  function goToCompanions(player: Player) {
    if (browser) {
      logEvent('admin_view_player_companions', { playerId: player.id });
    }
    void goto(`/app/admin/players/${player.id}/companions`);
  }

  function goToInventory(player: Player) {
    if (browser) {
      logEvent('admin_view_player_inventory', { playerId: player.id });
    }
    void goto(`/app/admin/players/${player.id}/inventory`);
  }

  const handleModalKeydown = (event: KeyboardEvent) => {
    if (!grantOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeGrant();
      return;
    }
    if (event.key !== 'Tab' || !firstFocusable || !lastFocusable) return;
    if (event.shiftKey && document.activeElement === firstFocusable) {
      event.preventDefault();
      lastFocusable.focus();
    } else if (!event.shiftKey && document.activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  };

  const handleGrantEnhance = ({ update }: any) => {
    status = '';
    errorMessage = '';
    return async ({ result }: any) => {
      if (result.type === 'success') {
        status = 'Slot license granted';
        errorMessage = '';
        if (browser) {
          logEvent('admin_grant_license_submit', { qty });
        }
      } else if (result.type === 'failure') {
        status = '';
        errorMessage = (result.data as any)?.error ?? 'Unable to grant license';
      }
      await update(result);
    };
  };

  const showingStart = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const showingEnd = data.total === 0 ? 0 : Math.min(data.total, data.page * data.pageSize);

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });
</script>

<div class="space-y-6">
  <header class="flex flex-wrap items-center gap-4">
    <div>
      <p class="text-sm text-white/50">Super Admin</p>
      <h1 class="text-xl font-semibold">Players</h1>
      <p class="text-sm text-white/60">Grant slot licenses or look up accounts</p>
    </div>
    <div class="ml-auto flex flex-1 flex-wrap items-center justify-end gap-3">
      <input
        class="w-full max-w-xs rounded-xl px-3 py-2 bg-white/10 ring-1 ring-white/15"
        placeholder="Search by email, name, or id"
        value={search}
        on:input={(event) => handleSearchInput((event.currentTarget as HTMLInputElement).value)}
        aria-label="Search players"
      />
      <select
        class="rounded-xl bg-white/10 px-3 py-2 text-sm ring-1 ring-white/15"
        bind:value={sort}
        on:change={(event) =>
          handleSortChange((event.currentTarget as HTMLSelectElement).value as PlayerSort)}
        aria-label="Sort players"
      >
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="slots_desc">Most slots</option>
        <option value="slots_asc">Fewest slots</option>
        <option value="licenses_desc">Most licenses</option>
        <option value="licenses_asc">Fewest licenses</option>
      </select>
    </div>
  </header>

  <div class="hidden md:block">
    <div class="overflow-hidden rounded-2xl ring-1 ring-white/10 bg-white/5">
      <table class="min-w-full divide-y divide-white/10 text-sm">
        <thead class="bg-white/5 text-left text-xs uppercase tracking-wide text-white/50">
          <tr>
            <th class="px-4 py-3 font-semibold">Email</th>
            <th class="px-4 py-3 font-semibold">Name / Handle</th>
            <th class="px-4 py-3 font-semibold">Max slots</th>
            <th class="px-4 py-3 font-semibold">Slot licenses</th>
            <th class="px-4 py-3 font-semibold">Created</th>
            <th class="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/10 text-white/80">
          {#if data.players.length === 0}
            <tr>
              <td colspan="6" class="px-4 py-6 text-center text-sm text-white/60">No players found.</td>
            </tr>
          {:else}
            {#each data.players as player (player.id)}
              <tr class="hover:bg-white/5 transition-colors">
                <td class="px-4 py-3">
                  <div class="font-medium">{player.email ?? 'No email'}</div>
                  <div class="text-xs text-white/40">{player.id}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="font-medium">{player.display_name || 'Unnamed'}</div>
                  {#if player.handle}
                    <div class="text-xs text-white/50">@{player.handle}</div>
                  {/if}
                </td>
                <td class="px-4 py-3 font-semibold">{player.max_slots}</td>
                <td class="px-4 py-3 font-semibold">{player.slot_license_count}</td>
                <td class="px-4 py-3 text-sm text-white/60">
                  {new Date(player.created_at).toLocaleString()}
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap justify-end gap-2">
                    <button
                      class="rounded-xl bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/15 hover:bg-white/20"
                      type="button"
                      on:click={() => openGrant(player)}
                    >
                      Grant
                    </button>
                    <button
                      class="rounded-xl bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-100 ring-1 ring-emerald-400/40 hover:bg-emerald-500/25"
                      type="button"
                      on:click={() => goToCompanions(player)}
                    >
                      Companions
                    </button>
                    <button
                      class="rounded-xl bg-sky-500/15 px-3 py-1.5 text-xs text-sky-100 ring-1 ring-sky-400/40 hover:bg-sky-500/25"
                      type="button"
                      on:click={() => goToInventory(player)}
                    >
                      Inventory
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <div class="space-y-3 md:hidden">
    {#if data.players.length === 0}
      <p class="text-white/60 text-sm">No players found.</p>
    {:else}
      {#each data.players as player (player.id)}
        <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 space-y-2">
          <div class="text-sm font-semibold">{player.email ?? 'No email'}</div>
          <div class="text-xs text-white/40 break-all">{player.id}</div>
          <div class="text-xs text-white/60">
            {player.display_name || 'Unnamed'}
            {#if player.handle} • @{player.handle}{/if}
          </div>
          <div class="text-xs text-white/60">Max slots: <span class="font-semibold">{player.max_slots}</span></div>
          <div class="text-xs text-white/60">
            Slot licenses: <span class="font-semibold">{player.slot_license_count}</span>
          </div>
          <div class="text-[11px] text-white/40">
            Created: {new Date(player.created_at).toLocaleString()}
          </div>
          <div class="flex flex-wrap gap-2 pt-2">
            <button
              class="rounded-xl bg-white/10 px-3 py-1.5 text-xs ring-1 ring-white/15 hover:bg-white/20"
              type="button"
              on:click={() => openGrant(player)}
            >
              Grant
            </button>
            <button
              class="rounded-xl bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-100 ring-1 ring-emerald-400/40 hover:bg-emerald-500/25"
              type="button"
              on:click={() => goToCompanions(player)}
            >
              Companions
            </button>
            <button
              class="rounded-xl bg-sky-500/15 px-3 py-1.5 text-xs text-sky-100 ring-1 ring-sky-400/40 hover:bg-sky-500/25"
              type="button"
              on:click={() => goToInventory(player)}
            >
              Inventory
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
    <p class="text-sm text-white/60">
      {#if data.total === 0}
        Showing 0 players
      {:else}
        Showing {showingStart}–{showingEnd} of {data.total} players
      {/if}
    </p>
    <div class="flex items-center gap-3 text-sm text-white/70">
      <button
        class="rounded-xl px-3 py-1.5 ring-1 ring-white/15 disabled:opacity-40"
        on:click={() => gotoPage(data.page - 1)}
        type="button"
        disabled={data.page <= 1}
      >
        Previous
      </button>
      <span>
        Page {data.page} / {data.totalPages}
      </span>
      <button
        class="rounded-xl px-3 py-1.5 ring-1 ring-white/15 disabled:opacity-40"
        on:click={() => gotoPage(data.page + 1)}
        type="button"
        disabled={data.page >= data.totalPages}
      >
        Next
      </button>
    </div>
  </div>
</div>

{#if grantOpen && selectedPlayer}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4">
    <div
      class="w-full max-w-md rounded-2xl bg-slate-900 text-white ring-1 ring-white/15 p-6 shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grant-modal-title"
      bind:this={modalEl}
      tabindex="-1"
      on:keydown={handleModalKeydown}
    >
      <form method="POST" action="?/grant" use:enhance={handleGrantEnhance} class="space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-white/40">Grant license</p>
            <h2 id="grant-modal-title" class="text-lg font-semibold">
              {selectedPlayer.email ?? selectedPlayer.display_name ?? 'Player'}
            </h2>
            <p class="text-xs text-white/50 break-all">{selectedPlayer.id}</p>
          </div>
          <button
            type="button"
            class="text-white/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            on:click={closeGrant}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <input type="hidden" name="userId" value={selectedPlayer.id} />

        <label class="block">
          <span class="text-sm text-white/70">Quantity</span>
          <input
            name="qty"
            type="number"
            min="1"
            bind:value={qty}
            class="mt-1 w-28 rounded-xl px-3 py-2 bg-white/10 ring-1 ring-white/15 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white"
          />
        </label>

        {#if errorMessage}
          <p class="text-sm text-rose-300">{errorMessage}</p>
        {/if}
        {#if status}
          <p class="text-sm text-emerald-300">{status}</p>
        {/if}

        <div class="flex gap-3 pt-2">
          <button
            class="px-4 py-2 rounded-xl bg-white/10 ring-1 ring-white/15 hover:bg-white/20 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white"
            type="submit"
          >
            Grant
          </button>
          <button
            class="px-4 py-2 rounded-xl ring-1 ring-white/15 hover:bg-white/10 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white"
            type="button"
            on:click={closeGrant}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
