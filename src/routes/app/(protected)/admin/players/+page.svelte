<script lang="ts">
  import type { PageData } from './$types';
  import type { User } from '@supabase/supabase-js';
  import { enhance, type SubmitFunction } from '$app/forms';
  import { browser } from '$app/environment';
  import { logEvent } from '$lib/analytics';
  import { tick } from 'svelte';

  export let data: PageData;

  let search = '';
  let grantOpen = false;
  let selectedUser: User | null = null;
  let qty = 1;
  let status = '';
  let errorMessage = '';
  let modalEl: HTMLDivElement | null = null;
  let firstFocusable: HTMLElement | null = null;
  let lastFocusable: HTMLElement | null = null;
  let previousFocus: HTMLElement | null = null;

  const slotsByUser = data.slotsByUser ?? {};
  const licensesByUser = data.licensesByUser ?? {};

  $: filtered = data.users
    .filter((user) => {
      const haystack = `${user.email ?? ''} ${user.user_metadata?.full_name ?? ''} ${user.id ?? ''}`.toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    })
    .sort((a, b) => {
      const slotsA = slotsByUser[a.id] ?? 3;
      const slotsB = slotsByUser[b.id] ?? 3;
      const licA = licensesByUser[a.id] ?? 0;
      const licB = licensesByUser[b.id] ?? 0;
      if (licB !== licA) return licB - licA;
      return slotsB - slotsA;
    });

  const refreshFocusables = async () => {
    if (!grantOpen) return;
    await tick();
    if (!modalEl) return;
    const focusables = Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
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

  function openGrant(user: User) {
    selectedUser = user;
    qty = 1;
    status = '';
    errorMessage = '';
    grantOpen = true;
    if (browser) {
      previousFocus = document.activeElement as HTMLElement | null;
      logEvent('admin_grant_license_open', { target: user.id });
    }
  }

  function closeGrant() {
    grantOpen = false;
    status = '';
    errorMessage = '';
    selectedUser = null;
    qty = 1;
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

  const handleGrantEnhance: SubmitFunction = ({ update }) => {
    status = '';
    errorMessage = '';
    return async ({ result }) => {
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
</script>

<div class="space-y-6">
  <header class="flex flex-wrap gap-3 items-center">
    <div>
      <p class="text-sm text-white/50">Super Admin</p>
      <h1 class="text-xl font-semibold">Players</h1>
      <p class="text-sm text-white/60">Grant slot licenses or lookup accounts</p>
    </div>
    <input
      class="ml-auto rounded-xl px-3 py-2 bg-white/10 ring-1 ring-white/15 w-full sm:w-72"
      placeholder="Search by email, name, or id"
      bind:value={search}
      aria-label="Search players"
    />
  </header>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {#if filtered.length === 0}
      <p class="text-white/60 col-span-full">No players match that search.</p>
    {:else}
      {#each filtered as user (user.id)}
        <div class="rounded-2xl p-4 bg-white/5 ring-1 ring-white/10 space-y-2">
          <div>
            <p class="text-sm font-medium">{user.email ?? 'No email'}</p>
            <p class="text-xs text-white/50">{user.user_metadata?.full_name ?? 'Unnamed'}</p>
          </div>
          <p class="text-xs text-white/40 break-all">{user.id}</p>
          <div class="mt-2 text-xs text-white/60 space-y-1">
            <div>
              Max slots:
              <span class="font-semibold text-white">
                {slotsByUser[user.id] ?? 3}
              </span>
            </div>
            <div>
              Slot licenses:
              <span class="font-semibold text-white">
                {licensesByUser[user.id] ?? 0}
              </span>
            </div>
          </div>
          <div class="pt-2">
            <button
              class="px-3 py-1.5 rounded-xl bg-white/10 ring-1 ring-white/15 hover:bg-white/20 transition"
              type="button"
              on:click={() => openGrant(user)}
            >
              Grant Slot License
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

{#if grantOpen && selectedUser}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4" on:keydown={handleModalKeydown}>
    <div
      class="w-full max-w-md rounded-2xl bg-slate-900 text-white ring-1 ring-white/15 p-6 shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grant-modal-title"
      bind:this={modalEl}
      tabindex="-1"
    >
      <form method="POST" action="?/grant" use:enhance={handleGrantEnhance} class="space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-white/40">Grant license</p>
            <h2 id="grant-modal-title" class="text-lg font-semibold">
              {selectedUser.email ?? 'Player'}
            </h2>
            <p class="text-xs text-white/50 break-all">{selectedUser.id}</p>
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

        <input type="hidden" name="userId" value={selectedUser.id} />

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
