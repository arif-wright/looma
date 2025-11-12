<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import EventRow from '$lib/components/companions/EventRow.svelte';
  import type { Companion } from '$lib/stores/companions';

  export let open = false;
  export let companion: Companion | null = null;
  export let maxSlots = 3;
  export let onClose: () => void = () => {};
  export let renameCompanion: (id: string, name: string) => Promise<void> = async () => {};
  export let setActive: (id: string) => Promise<void> = async () => {};
  export let setState: (id: string, state: 'idle' | 'resting' | 'active') => Promise<void> = async () => {};

  type CareEvent = {
    id: string | number;
    action: string;
    affection_delta: number;
    trust_delta: number;
    energy_delta: number;
    created_at: string;
  };

  let events: CareEvent[] = [];
  let loadingEvents = false;
  let eventsError: string | null = null;
  let renameMode = false;
  let renameValue = '';
  let busy: 'rename' | 'active' | 'state' | null = null;
  let actionMessage: string | null = null;
  let lastFetchedId: string | null = null;

  const startRename = () => {
    if (!companion) return;
    renameValue = companion.name;
    renameMode = true;
    actionMessage = null;
  };

  const cancelRename = () => {
    renameMode = false;
    renameValue = '';
  };

  const submitRename = async () => {
    if (!companion) return;
    const next = renameValue.trim();
    if (next.length < 1 || next.length > 32) {
      actionMessage = 'Name must be 1–32 characters.';
      return;
    }
    busy = 'rename';
    actionMessage = null;
    try {
      await renameCompanion(companion.id, next);
      renameMode = false;
    } catch (err) {
      actionMessage = err instanceof Error ? err.message : 'Rename failed';
    } finally {
      busy = null;
    }
  };

  const handleSetActive = async () => {
    if (!companion || companion.is_active) return;
    busy = 'active';
    actionMessage = null;
    try {
      await setActive(companion.id);
    } catch (err) {
      actionMessage = err instanceof Error ? err.message : 'Failed to set active';
    } finally {
      busy = null;
    }
  };

  const handleStateToggle = async () => {
    if (!companion) return;
    busy = 'state';
    actionMessage = null;
    const nextState = companion.state === 'resting' ? 'idle' : 'resting';
    try {
      await setState(companion.id, nextState);
    } catch (err) {
      actionMessage = err instanceof Error ? err.message : 'Failed to update state';
    } finally {
      busy = null;
    }
  };

  const ensureEvents = async () => {
    if (typeof window === 'undefined') return;
    if (!companion || !open) return;
    if (companion.id === lastFetchedId) return;
    loadingEvents = true;
    eventsError = null;
    try {
      const res = await fetch(`/api/companions/events?id=${companion.id}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(payload?.events)) {
        throw new Error(payload?.error ?? 'Unable to load events');
      }
      events = payload.events as CareEvent[];
      lastFetchedId = companion.id;
    } catch (err) {
      eventsError = err instanceof Error ? err.message : 'Unable to load events';
      events = [];
    } finally {
      loadingEvents = false;
    }
  };

  $: if (open && companion) {
    void ensureEvents();
  }

  $: if (!open) {
    renameMode = false;
    actionMessage = null;
  }

  let currentCompanionId: string | null = null;
  $: if ((companion?.id ?? null) !== currentCompanionId) {
    currentCompanionId = companion?.id ?? null;
    lastFetchedId = null;
    events = [];
    eventsError = null;
    renameMode = false;
    renameValue = '';
    actionMessage = null;
  }

  const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
</script>

<Modal {open} title={companion ? `${companion.name} dossier` : 'Companion dossier'} onClose={onClose}>
  {#if companion}
    <header class="modal-hero">
      <img src={companion.avatar_url ?? '/avatar.svg'} alt={companion.name} class="modal-avatar" />
      <div>
        <p class="modal-species">{companion.species}</p>
        <h2>{companion.name}</h2>
        <div class="modal-tags">
          <span>{companion.rarity}</span>
          <span>Slot {typeof companion.slot_index === 'number' ? companion.slot_index + 1 : '–'} / {maxSlots}</span>
          <span>{companion.state ?? 'idle'}</span>
        </div>
      </div>
    </header>

    <div class="modal-actions">
      <button type="button" class="btn" on:click={handleSetActive} disabled={companion.is_active || busy === 'active'}>
        {companion.is_active ? 'Currently Active' : busy === 'active' ? 'Activating…' : 'Set Active'}
      </button>
      <button type="button" class="btn" on:click={handleStateToggle} disabled={busy === 'state'}>
        {busy === 'state' ? 'Updating…' : companion.state === 'resting' ? 'Recall' : 'Rest'}
      </button>
      <button type="button" class="btn" on:click={startRename} disabled={busy === 'rename'}>
        Rename
      </button>
    </div>

    {#if renameMode}
      <form class="rename-form" on:submit|preventDefault={submitRename}>
        <label>
          <span class="sr-only">New name</span>
          <input
            type="text"
            maxlength="32"
            placeholder="New name"
            bind:value={renameValue}
            required
          />
        </label>
        <div class="rename-actions">
          <button type="button" class="btn-secondary" on:click={cancelRename} disabled={busy === 'rename'}>
            Cancel
          </button>
          <button type="submit" class="btn" disabled={busy === 'rename'}>{busy === 'rename' ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    {/if}

    {#if actionMessage}
      <p class="action-message">{actionMessage}</p>
    {/if}

    <section class="stat-grid" aria-label="Bond stats">
      <article>
        <header>Affection</header>
        <div class="meter" role="progressbar" aria-valuenow={pct(companion.affection)} aria-valuemin="0" aria-valuemax="100">
          <span style={`width:${pct(companion.affection)}%`}></span>
        </div>
      </article>
      <article>
        <header>Trust</header>
        <div class="meter" role="progressbar" aria-valuenow={pct(companion.trust)} aria-valuemin="0" aria-valuemax="100">
          <span style={`width:${pct(companion.trust)}%`}></span>
        </div>
      </article>
      <article>
        <header>Energy</header>
        <div class="meter" role="progressbar" aria-valuenow={pct(companion.energy)} aria-valuemin="0" aria-valuemax="100">
          <span style={`width:${pct(companion.energy)}%`}></span>
        </div>
      </article>
    </section>

    <section class="events-panel">
      <h3>Recent care</h3>
      {#if loadingEvents}
        <p>Loading events…</p>
      {:else if events.length === 0}
        <p>{eventsError ?? 'No recent care events yet.'}</p>
      {:else}
        <ul>
          {#each events.slice(0, 6) as event (event.id)}
            <EventRow {event} />
          {/each}
        </ul>
      {/if}
    </section>
  {:else}
    <p>Select a companion to view their dossier.</p>
  {/if}
</Modal>

<style>
  .modal-hero {
    display: flex;
    gap: 1.25rem;
    align-items: center;
    margin-bottom: 1rem;
  }

  .modal-avatar {
    width: 96px;
    height: 96px;
    border-radius: 24px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .modal-species {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .modal-tags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .modal-tags span {
    padding: 0.2rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .modal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 1rem 0;
  }

  .btn,
  .btn-secondary {
    border-radius: 999px;
    padding: 0.55rem 1.2rem;
    font-size: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease;
  }

  .btn-secondary {
    background: transparent;
  }

  .btn:disabled,
  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .rename-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .rename-form input {
    border-radius: 12px;
    padding: 0.65rem 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(12, 15, 26, 0.8);
    color: rgba(255, 255, 255, 0.9);
    font-size: 1rem;
  }

  .rename-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .action-message {
    color: #f87171;
    font-size: 0.9rem;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    margin: 1.5rem 0;
  }

  .stat-grid header {
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 0.35rem;
  }

  .meter {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(99, 247, 255, 0.9), rgba(85, 121, 255, 0.9));
  }

  .events-panel h3 {
    margin-bottom: 0.5rem;
  }

  .events-panel ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
