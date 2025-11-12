<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import type { PageData } from './$types';
  import type { Companion } from '$lib/stores/companions';
  import RosterFilterBar, { type RosterFilterState } from '$lib/components/companions/RosterFilterBar.svelte';
  import RosterGrid, { type RosterReorderDetail } from '$lib/components/companions/RosterGrid.svelte';
  import CompanionModal from '$lib/components/companions/CompanionModal.svelte';
  import UnlockSlotModal from '$lib/components/companions/UnlockSlotModal.svelte';
  import { logEvent } from '$lib/analytics';

  export let data: PageData;

  const sortRoster = (list: Companion[]) =>
    list
      .slice()
      .sort((a, b) => {
        const slotA = typeof a.slot_index === 'number' ? a.slot_index : Number.MAX_SAFE_INTEGER;
        const slotB = typeof b.slot_index === 'number' ? b.slot_index : Number.MAX_SAFE_INTEGER;
        if (slotA !== slotB) return slotA - slotB;
        return Date.parse(a.created_at) - Date.parse(b.created_at);
      });

  let companions: Companion[] = sortRoster(((data.companions ?? []) as Companion[]) ?? []);
  let maxSlots = data.maxSlots ?? 3;
  let activeCompanionId: string | null = data.activeCompanionId ?? null;
  let selected: Companion | null = null;
  let filters: RosterFilterState = { search: '', archetype: 'all', mood: 'all', sort: 'bond_desc' };
  let toast: { message: string; kind: 'success' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let loading = false;
  let reorderBusy = false;
  let rosterError: string | null = data.error ?? null;
  let showUnlock = false;

  const showToast = (message: string, kind: 'success' | 'error' = 'success') => {
    toast = { message, kind };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 3200);
  };

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
  });

  onMount(() => {
    if (!browser) return;
    logEvent('roster_view');
    const url = new URL(window.location.href);
    const focusId = url.searchParams.get('focus');
    if (focusId) {
      const target = companions.find((entry) => entry.id === focusId);
      if (target) {
        selected = target;
      }
      url.searchParams.delete('focus');
      const search = url.searchParams.toString();
      const next = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
      window.history.replaceState({}, document.title, next);
    }
  });

  const snapshot = () => companions.map((entry) => ({ ...entry }));

  const applyFilters = (list: Companion[]) => {
    let next = list.slice();
    if (filters.search.trim()) {
      const term = filters.search.trim().toLowerCase();
      next = next.filter((companion) => companion.name.toLowerCase().includes(term));
    }
    if (filters.archetype !== 'all') {
      next = next.filter((companion) => companion.species === filters.archetype);
    }
    if (filters.mood !== 'all') {
      next = next.filter((companion) => (companion.state ?? companion.mood) === filters.mood);
    }
    if (filters.sort === 'bond_desc') {
      next = next.sort((a, b) => b.affection + b.trust - (a.affection + a.trust));
    } else if (filters.sort === 'newest') {
      next = next.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    } else if (filters.sort === 'energy') {
      next = next.sort((a, b) => b.energy - a.energy);
    }
    return next;
  };

  const refreshRoster = async () => {
    loading = true;
    try {
      const res = await fetch('/api/companions/list');
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Unable to load companions');
      }
      companions = sortRoster((payload.items as Companion[]) ?? []);
      maxSlots = payload.maxSlots ?? maxSlots;
      activeCompanionId = companions.find((entry) => entry.is_active)?.id ?? null;
      rosterError = null;
    } catch (err) {
      rosterError = err instanceof Error ? err.message : 'Unable to load companions';
      showToast(rosterError, 'error');
    } finally {
      loading = false;
    }
  };

  const handleReorder = async ({ ids, via }: RosterReorderDetail) => {
    if (!ids.length) return;
    const previous = snapshot();
    reorderBusy = true;
    companions = sortRoster(
      companions.map((companion) => {
        const nextIndex = ids.indexOf(companion.id);
        if (nextIndex >= 0) {
          return { ...companion, slot_index: nextIndex };
        }
        return companion;
      })
    );
    try {
      const res = await fetch('/api/companions/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: ids })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Reorder failed');
      }
      showToast('Roster updated');
      logEvent('roster_reorder_success', { via, count: ids.length });
    } catch (err) {
      companions = previous;
      showToast(err instanceof Error ? err.message : 'Reorder failed', 'error');
    } finally {
      reorderBusy = false;
    }
  };

  const renameCompanion = async (id: string, name: string) => {
    const previous = snapshot();
    companions = sortRoster(companions.map((companion) => (companion.id === id ? { ...companion, name } : companion)));
    try {
      const res = await fetch('/api/companions/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: id, name })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Rename failed');
      }
      showToast('Name updated');
      logEvent('companion_rename', { id, name });
    } catch (err) {
      companions = previous;
      throw err instanceof Error ? err : new Error('Rename failed');
    }
  };

  const activateCompanion = async (id: string) => {
    const previous = snapshot();
    const previousActive = activeCompanionId;
    companions = sortRoster(
      companions.map((companion) => {
        if (companion.id === id) {
          return { ...companion, is_active: true, state: 'active' };
        }
        if (companion.is_active) {
          return { ...companion, is_active: false, state: companion.state === 'active' ? 'idle' : companion.state };
        }
        return companion;
      })
    );
    activeCompanionId = id;
    try {
      const res = await fetch('/api/companions/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: id })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Failed to set active');
      }
      showToast('Active companion updated');
      logEvent('companion_set_active', { id });
    } catch (err) {
      companions = previous;
      activeCompanionId = previousActive;
      throw err instanceof Error ? err : new Error('Failed to set active');
    }
  };

  const changeState = async (id: string, state: 'idle' | 'resting' | 'active') => {
    const previous = snapshot();
    const previousActive = activeCompanionId;
    companions = sortRoster(
      companions.map((companion) => {
        if (companion.id === id) {
          return { ...companion, state, is_active: state === 'active' };
        }
        if (state === 'active') {
          return { ...companion, is_active: false, state: companion.state === 'active' ? 'idle' : companion.state };
        }
        return companion;
      })
    );
    activeCompanionId = state === 'active' ? id : state === 'resting' ? (activeCompanionId === id ? null : activeCompanionId) : activeCompanionId === id ? null : activeCompanionId;
    try {
      const res = await fetch('/api/companions/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: id, state })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Failed to update state');
      }
      if (state === 'resting') {
        showToast('Companion is now resting');
      } else if (state === 'idle') {
        showToast('Companion returned to idle');
      }
      logEvent('companion_state_change', { id, state });
    } catch (err) {
      companions = previous;
      activeCompanionId = previousActive;
      throw err instanceof Error ? err : new Error('Failed to update state');
    }
  };

  const filteredCompanions = () => applyFilters(companions);

  const handleSlotBlocked = () => {
    showUnlock = true;
    logEvent('roster_unlock_prompt_shown', { reason: 'drag_blocked' });
  };

  const handleSelectCompanion = (companion: Companion) => {
    selected = companion;
    logEvent('roster_card_open', { id: companion.id });
  };

  const closeUnlockModal = () => {
    showUnlock = false;
  };

  const handleUnlockCta = () => {
    showUnlock = true;
    logEvent('roster_unlock_cta_clicked');
  };

  const handleUnlocked = async (nextSlots: number) => {
    if (typeof nextSlots === 'number' && nextSlots > 0) {
      maxSlots = nextSlots;
    }
    showToast('Slot unlocked');
    await refreshRoster();
  };

  $: visibleCompanions = filteredCompanions();
  $: activeCompanion = companions.find((entry) => entry.is_active) ?? null;
  $: slotsUsed = Math.min(companions.length, maxSlots);
  $: archetypeOptions = Array.from(new Set(companions.map((companion) => companion.species))).filter(Boolean).sort();
  $: moodOptions = Array.from(new Set(companions.map((companion) => companion.state ?? companion.mood))).filter(Boolean).sort();
  $: if (selected) {
    const refreshed = companions.find((entry) => entry.id === selected?.id);
    if (refreshed) {
      selected = refreshed;
    }
  }
</script>

<svelte:head>
  <title>Looma — Companion Roster</title>
</svelte:head>

<main class="roster-page">
  <header class="roster-header">
    <div>
      <p class="eyebrow">Phase 13.3</p>
      <h1>Your Companions</h1>
      <p class="lede">Arrange your squad, mark an active partner, and keep everyone rested.</p>
    </div>
    <div class="header-pills">
      <span class="pill">Active: {activeCompanion ? activeCompanion.name : 'None'}</span>
      <span class="pill">Slots: {slotsUsed}/{maxSlots}</span>
      <button type="button" class="pill pill-action" on:click={handleUnlockCta}>Unlock slot</button>
      <button type="button" class="pill pill-action" on:click={refreshRoster} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  </header>

  {#if rosterError}
    <div class="roster-error">{rosterError}</div>
  {/if}

  <section class="roster-shell">
    <RosterFilterBar
      {filters}
      archetypes={archetypeOptions}
      moods={moodOptions}
      on:change={(event) => {
        filters = event.detail;
      }}
    />
    <RosterGrid
      companions={visibleCompanions}
      {maxSlots}
      activeId={activeCompanionId}
      disableDrag={reorderBusy || loading}
      on:select={(event) => {
        handleSelectCompanion(event.detail.companion);
      }}
      on:reorder={(event) => {
        void handleReorder(event.detail);
      }}
      on:blocked={handleSlotBlocked}
    />
  </section>
</main>

<CompanionModal
  open={Boolean(selected)}
  companion={selected}
  {maxSlots}
  onClose={() => {
    selected = null;
  }}
  {renameCompanion}
  setActive={activateCompanion}
  setState={changeState}
/>

<UnlockSlotModal open={showUnlock} onClose={closeUnlockModal} onUnlocked={handleUnlocked} />

{#if toast}
  <div class={`roster-toast roster-toast--${toast.kind}`} role="status" aria-live="polite">{toast.message}</div>
{/if}

<style>
  .roster-page {
    padding: clamp(2rem, 4vw, 3rem);
    display: grid;
    gap: 2rem;
  }

  .roster-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1.5rem;
    align-items: flex-end;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .lede {
    margin: 0.35rem 0 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .header-pills {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .pill {
    border-radius: 999px;
    padding: 0.45rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(9, 12, 25, 0.8);
  }

  .pill-action {
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .pill-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .roster-shell {
    display: grid;
    gap: 1.5rem;
  }

  .roster-error {
    padding: 0.85rem 1.2rem;
    border-radius: 14px;
    background: rgba(244, 63, 94, 0.12);
    border: 1px solid rgba(244, 63, 94, 0.35);
    color: rgba(255, 255, 255, 0.8);
  }

  .roster-toast {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    border-radius: 999px;
    padding: 0.65rem 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(5, 7, 15, 0.85);
  }

  .roster-toast--error {
    border-color: rgba(248, 113, 113, 0.6);
  }

  @media (max-width: 640px) {
    .roster-page {
      padding: 1.25rem;
    }
  }
</style>
