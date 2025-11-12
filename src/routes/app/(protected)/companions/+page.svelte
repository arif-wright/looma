<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { PageData } from './$types';
  import Panel from '$lib/components/ui/Panel.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import CompanionCard from '$lib/components/companions/CompanionCard.svelte';
  import CarePanel from '$lib/components/companions/CarePanel.svelte';
  import EventRow from '$lib/components/companions/EventRow.svelte';
  import { companionsStore, type CareAction, type Companion } from '$lib/stores/companions';
  import { logEvent } from '$lib/analytics';

  const GOAL_TARGET = 3;

  export let data: PageData;

  type CareEvent = {
    id: string | number;
    companion_id: string;
    owner_id: string;
    action: string;
    affection_delta: number;
    trust_delta: number;
    energy_delta: number;
    created_at: string;
  };

  type CareResult = {
    affection: number;
    trust: number;
    energy: number;
    mood: string;
    streak?: number | null;
    cooldownSecsRemaining: number;
    milestones?: string[];
    goal?: { count?: number; completed?: boolean };
    event?: CareEvent | null;
  };

  type GoalState = {
    count: number;
    completed: boolean;
  };

  const fallbackDeltas: Record<CareAction, { affection: number; trust: number; energy: number }> = {
    feed: { affection: 2, trust: 0, energy: 5 },
    play: { affection: 2, trust: 1, energy: -5 },
    groom: { affection: 1, trust: 2, energy: 0 }
  };

  const normalizeEvents = (rows: any[] = []): CareEvent[] =>
    rows.map((row) => ({
      id: row.id ?? `local-${Date.now()}`,
      companion_id: row.companion_id ?? row.companion ?? '',
      owner_id: row.owner_id ?? '',
      action: (row.action ?? row.kind ?? 'feed') as CareAction | string,
      affection_delta: row.affection_delta ?? row.delta_affection ?? 0,
      trust_delta: row.trust_delta ?? row.delta_trust ?? 0,
      energy_delta: row.energy_delta ?? row.delta_energy ?? 0,
      created_at: row.created_at ?? new Date().toISOString()
    }));

  companionsStore.setList(data.companions ?? []);

  let selected: Companion | null = null;
  let busyAction: CareAction | null = null;
  let panelError: string | null = null;
  let toast: { message: string; kind: 'success' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let goalRibbonTimer: ReturnType<typeof setTimeout> | null = null;
  let milestoneTimer: ReturnType<typeof setTimeout> | null = null;
  let events: CareEvent[] = normalizeEvents(data.events as any[]);
  let latestCompanions: Companion[] = (data.companions as Companion[]) ?? [];
  let eventsCompanionId: string | null = events[0]?.companion_id ?? latestCompanions[0]?.id ?? null;
  let eventsCompanionName: string | null =
    latestCompanions.find((entry) => entry.id === eventsCompanionId)?.name ?? latestCompanions[0]?.name ?? null;
  let eventsLoading = false;
  let milestoneFlags: string[] = [];
  let goalState: GoalState = {
    count: data.goal?.actions_count ?? 0,
    completed: data.goal?.completed ?? false
  };
  let goalRibbon = false;

  const showToast = (message: string, kind: 'success' | 'error' = 'success') => {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, kind };
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 3500);
  };

  const showGoalRibbon = () => {
    goalRibbon = true;
    if (goalRibbonTimer) clearTimeout(goalRibbonTimer);
    goalRibbonTimer = setTimeout(() => {
      goalRibbon = false;
    }, 4000);
  };

  const announceMilestones = (flags: string[]) => {
    milestoneFlags = flags;
    if (milestoneTimer) clearTimeout(milestoneTimer);
    milestoneTimer = setTimeout(() => {
      milestoneFlags = [];
    }, 4000);
  };

  const loadEvents = async (companion: Companion | null, force = false) => {
    if (!companion) return;
    if (!force && eventsCompanionId === companion.id && events.length) return;
    eventsLoading = true;
    eventsCompanionId = companion.id;
    eventsCompanionName = companion.name;
    try {
      const res = await fetch(`/api/companions/events?id=${companion.id}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(payload?.events)) {
        if (force) {
          panelError = payload?.error ?? 'Unable to load events';
        }
        return;
      }
      events = normalizeEvents(payload.events).slice(0, 20);
    } catch (err) {
      if (force) {
        panelError = err instanceof Error ? err.message : 'Unable to load events';
      }
    } finally {
      eventsLoading = false;
    }
  };

  const prependEvent = (event: CareEvent | null | undefined, companion: Companion) => {
    if (!event) return;
    eventsCompanionId = companion.id;
    eventsCompanionName = companion.name;
    events = [event, ...events.filter((entry) => entry.companion_id === companion.id)].slice(0, 20);
  };

  onMount(() => {
    const initialCompanion = eventsCompanionId
      ? latestCompanions.find((entry) => entry.id === eventsCompanionId) ?? latestCompanions[0]
      : latestCompanions[0];
    if (initialCompanion) {
      void loadEvents(initialCompanion, true);
    }
  });

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
    if (goalRibbonTimer) clearTimeout(goalRibbonTimer);
    if (milestoneTimer) clearTimeout(milestoneTimer);
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
    void loadEvents(companion);
  };

  const formatCooldownError = (seconds: number) => {
    if (seconds <= 60) return 'Cooldown active. Try again in a minute.';
    const minutes = Math.ceil(seconds / 60);
    return `Cooldown active. Ready in ${minutes}m.`;
  };

  const performCare = async (companion: Companion, action: CareAction) => {
    if (busyAction) return;
    busyAction = action;
    panelError = null;

    try {
      const res = await fetch('/api/companions/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: companion.id, action })
      });
      const payload = await res.json().catch(() => null);
      if (res.status === 429 && payload?.cooldownSecsRemaining) {
        panelError = formatCooldownError(payload.cooldownSecsRemaining);
        showToast('That action is still on cooldown.', 'error');
        return;
      }
      if (!res.ok || !payload?.result) {
        panelError = payload?.error ?? 'Care action failed';
        showToast('Care action failed', 'error');
        return;
      }

      const result = payload.result as CareResult;
      companionsStore.applyCare(companion.id, {
        affection: result.affection,
        trust: result.trust,
        energy: result.energy,
        mood: result.mood,
        streak: result.streak ?? null
      });
      await companionsStore.refresh();

      if (result.event) {
        const normalized = normalizeEvents([result.event])[0];
        prependEvent(normalized, companion);
      } else {
        const delta = fallbackDeltas[action];
        prependEvent(
          {
            id: `local-${Date.now()}`,
            companion_id: companion.id,
            owner_id: companion.owner_id ?? '',
            action,
            affection_delta: delta.affection,
            trust_delta: delta.trust,
            energy_delta: delta.energy,
            created_at: new Date().toISOString()
          },
          companion
        );
      }

      if (result.goal) {
        goalState = {
          count: result.goal.count ?? goalState.count,
          completed: goalState.completed || Boolean(result.goal.completed)
        };
        if (result.goal.completed) {
          showGoalRibbon();
        }
      }

      if (Array.isArray(result.milestones) && result.milestones.length) {
        announceMilestones(result.milestones);
      }

      const actionCopy =
        action === 'groom' ? 'being groomed' : action === 'feed' ? 'that snack' : action === 'play' ? 'playtime' : 'the care';
      showToast(`${companion.name} loved ${actionCopy}!`);
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
      <p class="eyebrow">Phase 13.2b</p>
      <h1>Companion Core</h1>
      <p class="lede">Raise affection, build trust, and keep your Looma allies energized.</p>
      <div class="goal-meta" aria-live="polite">
        <span>Daily care</span>
        <strong>{Math.min(goalState.count, GOAL_TARGET)}/{GOAL_TARGET}</strong>
      </div>
    </div>
    <div class="hero-meta">
      <span>{latestCompanions.length}</span>
      <small>Active companions</small>
    </div>
  </section>

  {#if goalRibbon}
    <div class="goal-ribbon" role="status">Daily care complete!</div>
  {/if}

  {#if milestoneFlags.length}
    <div class="celebration-chip" role="status">
      Milestone unlocked: {milestoneFlags.join(', ')}
    </div>
  {/if}

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

  <Panel title={`Bond events${eventsCompanionName ? ` — ${eventsCompanionName}` : ''}`}>
    {#if eventsLoading}
      <p class="text-muted">Loading events…</p>
    {:else if !eventsCompanionId}
      <p class="text-muted">Select a companion to view recent care.</p>
    {:else if events.length === 0}
      <p class="text-muted">No care events logged yet.</p>
    {:else}
      <ul class="event-list">
        {#each events as event (event.id)}
          <EventRow {event} />
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

  .goal-meta {
    margin-top: 0.8rem;
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 0.35rem 0.8rem;
    background: rgba(255, 255, 255, 0.04);
    font-size: 0.9rem;
  }

  .goal-meta span {
    text-transform: uppercase;
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    color: rgba(255, 255, 255, 0.6);
  }

  .goal-meta strong {
    font-size: 1.1rem;
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

  .goal-ribbon {
    border-radius: 20px;
    padding: 0.6rem 1rem;
    background: linear-gradient(90deg, rgba(90, 246, 192, 0.25), rgba(255, 212, 133, 0.2));
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.92);
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .celebration-chip {
    border-radius: 999px;
    padding: 0.35rem 0.9rem;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.24);
    font-size: 0.85rem;
    width: fit-content;
    margin-bottom: 0.5rem;
  }

  .text-muted {
    color: rgba(255, 255, 255, 0.65);
  }

  .event-list {
    list-style: none;
    margin: 0;
    padding: 0;
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
