<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PageData } from './$types';
  import Panel from '$lib/components/ui/Panel.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import CompanionCard from '$lib/components/companions/CompanionCard.svelte';
  import CarePanel from '$lib/components/companions/CarePanel.svelte';
  import { companionsStore, type CareAction, type Companion } from '$lib/stores/companions';
  import { logEvent } from '$lib/analytics';

  export let data: PageData;

  type BondEvent = {
    id: string | number;
    companion_id: string;
    owner_id: string;
    kind: string;
    delta_affection: number;
    delta_trust: number;
    delta_energy: number;
    meta?: Record<string, unknown> | null;
    created_at: string;
  };

  const actionDeltas: Record<CareAction, { affection: number; trust: number; energy: number }> = {
    feed: { affection: 6, trust: 2, energy: 15 },
    play: { affection: 5, trust: 4, energy: -10 },
    groom: { affection: 3, trust: 3, energy: -2 }
  };

  companionsStore.setList(data.companions ?? []);

  let selected: Companion | null = null;
  let busyAction: CareAction | null = null;
  let panelError: string | null = null;
  let toast: { message: string; kind: 'success' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let events: BondEvent[] = (data.events as BondEvent[]) ?? [];
  let latestCompanions: Companion[] = (data.companions as Companion[]) ?? [];

  const showToast = (message: string, kind: 'success' | 'error' = 'success') => {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, kind };
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 3500);
  };

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
  });

  $: latestCompanions = $companionsStore;

  $: if (selected && latestCompanions.length) {
    const refreshed = latestCompanions.find((entry) => entry.id === selected?.id);
    if (refreshed) {
      selected = refreshed;
    }
  }

  const handleOpen = (companion: Companion) => {
    selected = companion;
    panelError = null;
  };

  const refreshEventsList = (companion: Companion, action: CareAction) => {
    const delta = actionDeltas[action];
    events = [
      {
        id: `local-${Date.now()}`,
        companion_id: companion.id,
        owner_id: companion.owner_id ?? '',
        kind: action,
        delta_affection: delta.affection,
        delta_trust: delta.trust,
        delta_energy: delta.energy,
        meta: { action },
        created_at: new Date().toISOString()
      },
      ...events
    ].slice(0, 10);
  };

  const performCare = async (companion: Companion, action: CareAction) => {
    if (busyAction) return;
    busyAction = action;
    panelError = null;

    try {
      const res = await fetch('/api/companions/care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: companion.id, action })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.state) {
        panelError = payload?.error ?? 'Care action failed';
        showToast('Care action failed', 'error');
        return;
      }

      companionsStore.applyCare(companion.id, payload.state);
      await companionsStore.refresh();
      refreshEventsList(companion, action);
      showToast(`${companion.name} enjoyed ${action === 'groom' ? 'the grooming' : `being ${action}ed`}!`);
      logEvent('companion_care', { companionId: companion.id, action });
    } catch (err) {
      panelError = err instanceof Error ? err.message : 'Care action failed';
      showToast('Care action failed', 'error');
    } finally {
      busyAction = null;
    }
  };
</script>

<div class="companions-shell">
  <section class="hero">
    <div>
      <p class="eyebrow">Phase 13</p>
      <h1>Companion Core</h1>
      <p class="lede">Raise affection, build trust, and keep your Looma allies energized.</p>
    </div>
    <div class="hero-meta">
      <span>{latestCompanions.length}</span>
      <small>Active companions</small>
    </div>
  </section>

  {#if data.error}
    <div class="error" role="alert">{data.error}</div>
  {/if}

  {#if latestCompanions.length === 0}
    <Panel title="Companions">
      <p class="text-muted">You haven’t bonded with any companions yet.</p>
    </Panel>
  {:else}
    <div class="grid">
      {#each latestCompanions as companion (companion.id)}
        <CompanionCard
          {companion}
          {busyAction}
          on:open={() => handleOpen(companion)}
          on:care={(event) => performCare(companion, event.detail)}
        />
      {/each}
    </div>
  {/if}

  <Panel title="Bond events">
    {#if events.length === 0}
      <p class="text-muted">No care events logged yet.</p>
    {:else}
      <ul class="event-list">
        {#each events as event}
          <li>
            <div>
              <strong>{event.kind}</strong>
              <span>{new Date(event.created_at).toLocaleString()}</span>
            </div>
            <p>
              {event.delta_affection >= 0 ? `+${event.delta_affection}` : event.delta_affection} affection,
              {event.delta_trust >= 0 ? `+${event.delta_trust}` : event.delta_trust} trust,
              {event.delta_energy >= 0 ? `+${event.delta_energy}` : event.delta_energy} energy
            </p>
          </li>
        {/each}
      </ul>
    {/if}
  </Panel>
</div>

<Modal open={Boolean(selected)} title={selected ? `${selected.name} care` : 'Care'} onClose={() => (selected = null)}>
  {#if selected}
    <CarePanel
      companion={selected}
      stats={selected.stats ?? null}
      {busyAction}
      error={panelError}
      on:care={(event) => performCare(selected as Companion, event.detail)}
    />
  {/if}
</Modal>

{#if toast}
  <div class={`care-toast ${toast.kind}`} role="status">{toast.message}</div>
{/if}

<style>
  .companions-shell {
    padding: clamp(2.5rem, 4vw, 3.5rem) clamp(1rem, 4vw, 2.5rem) 5rem;
    color: #fff;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .lede {
    color: rgba(255, 255, 255, 0.75);
  }

  .hero-meta {
    text-align: right;
  }

  .hero-meta span {
    display: block;
    font-size: 2.4rem;
    font-weight: 600;
  }

  .hero-meta small {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.25rem;
  }

  .text-muted {
    color: rgba(255, 255, 255, 0.65);
  }

  .event-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .event-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .event-list li:last-child {
    border-bottom: none;
  }

  .event-list strong {
    text-transform: capitalize;
  }

  .event-list span {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.6);
    display: block;
  }

  .care-toast {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    padding: 0.85rem 1.1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(9, 11, 25, 0.9);
    box-shadow: 0 20px 40px rgba(5, 6, 18, 0.45);
  }

  .care-toast.success {
    border-color: rgba(94, 242, 255, 0.4);
  }

  .care-toast.error {
    border-color: rgba(248, 113, 113, 0.5);
  }

  .error {
    padding: 0.75rem 1rem;
    border-radius: 16px;
    background: rgba(248, 113, 113, 0.2);
    border: 1px solid rgba(248, 113, 113, 0.5);
  }

  @media (max-width: 720px) {
    .hero {
      flex-direction: column;
      align-items: flex-start;
    }

    .hero-meta {
      text-align: left;
    }
  }
</style>
