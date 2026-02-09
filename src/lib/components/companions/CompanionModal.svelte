<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import EventRow from '$lib/components/companions/EventRow.svelte';
  import type { Companion } from '$lib/stores/companions';
  import { describeMilestoneToast } from '$lib/companions/bond';
  import { applyRitualUpdate } from '$lib/stores/companionRituals';
  import { describeRitualCompletion } from '$lib/companions/rituals';
  import { getBondBonusForLevel, formatBonusSummary } from '$lib/companions/bond';
  import InfoTooltip from '$lib/components/ui/InfoTooltip.svelte';
  import { BOND_LEVEL_TOOLTIP, MOOD_TOOLTIP, describeBondLevelUpToast } from '$lib/companions/companionCopy';

  export let open = false;
  export let companion: Companion | null = null;
  export let maxSlots = 3;
  export let onClose: () => void = () => {};
  export let renameCompanion: (id: string, name: string) => Promise<void> = async () => {};
  export let setActive: (id: string) => Promise<void> = async () => {};
  export let setState: (id: string, state: 'idle' | 'resting' | 'active') => Promise<void> = async () => {};
  export let prefetched: { version: number; events: CareEvent[] } = { version: 0, events: [] };

  type CareEvent = {
    id: string | number;
    action: string;
    affection_delta: number;
    trust_delta: number;
    energy_delta: number;
    created_at: string;
    note?: string | null;
    kind?: string | null;
  };

  const dispatch = createEventDispatcher<{
    careApplied: { id: string; companion: Companion };
    milestone: { id: string; action: string; note?: string | null; message?: string };
    toast: { message: string; kind?: 'success' | 'error' };
  }>();

  type CareAction = 'feed' | 'play' | 'groom';

  const CARE_ACTIONS: Array<{ key: CareAction; label: string; emoji: string; description: string }> = [
    { key: 'feed', label: 'Feed', emoji: '🍓', description: 'Boost energy & affection.' },
    { key: 'play', label: 'Play', emoji: '🪁', description: 'Build trust through fun.' },
    { key: 'groom', label: 'Groom', emoji: '✨', description: 'Keep them calm and relaxed.' }
  ];

  const MOOD_META: Record<string, { label: string; emoji: string }> = {
    happy: { label: 'Happy', emoji: '😊' },
    neutral: { label: 'Neutral', emoji: '😌' },
    tired: { label: 'Tired', emoji: '😴' },
    low_energy: { label: 'Low energy', emoji: '🥱' },
    stressed: { label: 'Stressed', emoji: '😣' }
  };

  const CLIENT_COOLDOWN_MS = 4000;
  const CARE_ERROR_GENERIC = 'Something went wrong while caring for your companion. Please try again.';
  let previousBondLevel: number | null = null;
  let bondLevelCelebration: { level: number } | null = null;
  let bondLevelTimer: ReturnType<typeof setTimeout> | null = null;

  const emitCareErrorToast = () => {
    dispatch('toast', { message: CARE_ERROR_GENERIC, kind: 'error' });
  };

  let events: CareEvent[] = [];
  let loadingEvents = false;
  let eventsError: string | null = null;
  let renameMode = false;
  let renameValue = '';
  let busy: 'rename' | 'active' | 'state' | null = null;
  let actionMessage: string | null = null;
  let careBusy: CareAction | null = null;
  let careError: string | null = null;
  let cooldownUntil: Record<CareAction, number> = { feed: 0, play: 0, groom: 0 };
  let nowTick = Date.now();
  let cooldownTimer: number | null = null;
  let lastFetchedId: string | null = null;
  let lastPrefetchVersion = 0;

  const normalizeEvents = (list: CareEvent[]) => {
    const seen = new Set<string>();
    return list
      .slice()
      .sort((a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''))
      .filter((event) => {
        const key = String(event.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  };

  const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const describeRelativeTime = (iso: string | null) => {
    if (!iso) return 'No care yet';
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return 'just now';
    const diffMs = ts - Date.now();
    const diffMinutes = Math.round(diffMs / 60000);
    if (Math.abs(diffMinutes) < 1) {
      const diffSeconds = Math.round(diffMs / 1000);
      return relativeFormatter.format(diffSeconds, 'second');
    }
    if (Math.abs(diffMinutes) < 60) {
      return relativeFormatter.format(diffMinutes, 'minute');
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
      return relativeFormatter.format(diffHours, 'hour');
    }
    const diffDays = Math.round(diffHours / 24);
    return relativeFormatter.format(diffDays, 'day');
  };

  const pickLatest = (values: Array<string | null | undefined>) => {
    let latest: string | null = null;
    let maxTs = -Infinity;
    for (const value of values) {
      if (!value) continue;
      const ts = Date.parse(value);
      if (Number.isNaN(ts)) continue;
      if (ts > maxTs) {
        maxTs = ts;
        latest = value;
      }
    }
    return latest;
  };

  onMount(() => {
    if (typeof window === 'undefined') return;
    cooldownTimer = window.setInterval(() => {
      nowTick = Date.now();
    }, 500);
    return () => {
      if (cooldownTimer) {
        window.clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    };
  });

  onDestroy(() => {
    clearBondTimer();
  });

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
      events = normalizeEvents((payload.events as CareEvent[]) ?? []);
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
    careError = null;
    resetCareState();
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
    careError = null;
    resetCareState();
  }

  $: if (prefetched && prefetched.version !== lastPrefetchVersion) {
    if (prefetched.events?.length) {
      events = normalizeEvents([...prefetched.events, ...events]);
    }
    lastPrefetchVersion = prefetched.version;
  }

  const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  $: moodKey = (companion?.mood ?? 'neutral').toLowerCase();
  $: moodInfo = MOOD_META[moodKey] ?? { label: 'Neutral', emoji: '😌' };
  $: statsRecord = companion?.stats ?? null;
  $: lastCareActive = statsRecord ? pickLatest([statsRecord.fed_at, statsRecord.played_at, statsRecord.groomed_at]) : null;
  $: lastPassiveTick = statsRecord?.last_passive_tick ?? null;
  $: lastCareAt = lastCareActive ?? lastPassiveTick ?? null;
  $: lastCareLabel = lastCareAt ? describeRelativeTime(lastCareAt) : 'No care yet';
  $: bondLevel = statsRecord?.bond_level ?? companion?.bond_level ?? 0;
  $: bondScore = statsRecord?.bond_score ?? companion?.bond_score ?? 0;
  $: bondBonus = getBondBonusForLevel(bondLevel);
  $: bondBonusSummary = formatBonusSummary(bondBonus);

  const resetCareState = () => {
    careBusy = null;
    careError = null;
    cooldownUntil = { feed: 0, play: 0, groom: 0 };
  };

  const formatCareError = (message: string | null | undefined) => {
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
    return CARE_ERROR_GENERIC;
  };

  const clearBondTimer = () => {
    if (bondLevelTimer) {
      clearTimeout(bondLevelTimer);
      bondLevelTimer = null;
    }
  };

  const triggerBondCelebration = () => {
    clearBondTimer();
    bondLevelCelebration = { level: bondLevel };
    bondLevelTimer = setTimeout(() => {
      bondLevelCelebration = null;
      bondLevelTimer = null;
    }, 3600);
  };

  const startCooldown = (action: CareAction) => {
    cooldownUntil = { ...cooldownUntil, [action]: Date.now() + CLIENT_COOLDOWN_MS };
  };

  $: {
    if (!companion) {
      previousBondLevel = null;
      bondLevelCelebration = null;
      clearBondTimer();
    } else {
      if (previousBondLevel !== null && bondLevel > previousBondLevel) {
        triggerBondCelebration();
        const toastMessage = describeBondLevelUpToast(companion.name, bondLevel);
        dispatch('toast', { message: toastMessage, kind: 'success' });
      }
      previousBondLevel = bondLevel;
    }
  }

  $: actionCooldowns = {
    feed: Math.max(0, Math.ceil((cooldownUntil.feed - nowTick) / 1000)),
    play: Math.max(0, Math.ceil((cooldownUntil.play - nowTick) / 1000)),
    groom: Math.max(0, Math.ceil((cooldownUntil.groom - nowTick) / 1000))
  };

  const handleCareAction = async (action: CareAction) => {
    if (!companion || careBusy || actionCooldowns[action] > 0) return;
    careBusy = action;
    careError = null;
    try {
      const res = await fetch('/api/companions/care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: companion.id, action })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.companion) {
        const message =
          payload?.message ??
          (payload?.error === 'low_energy'
            ? `${companion.name} is too tired to ${action}.`
            : payload?.error ?? null);
        careError = formatCareError(message);
        emitCareErrorToast();
        careBusy = null;
        return;
      }

      const nextCompanion = { ...companion, ...payload.companion };
      companion = nextCompanion;
      if (payload.event) {
        events = normalizeEvents([payload.event as CareEvent, ...events]);
      }
      if (Array.isArray(payload?.milestones) && payload.milestones.length) {
        payload.milestones.forEach((milestone: { action?: string; note?: string | null }) => {
          if (!milestone?.action || !companion) return;
          const toastMessage = describeMilestoneToast(milestone.action, companion.name) ?? 'Bond milestone reached!';
          dispatch('milestone', {
            id: companion.id,
            action: milestone.action,
            note: milestone.note ?? null,
            message: toastMessage
          });
        });
      }
      if (payload?.rituals?.list) {
        applyRitualUpdate(payload.rituals.list);
        if (Array.isArray(payload.rituals.completed) && payload.rituals.completed.length) {
          payload.rituals.completed.forEach((ritual: any) => {
            const toastMessage = describeRitualCompletion(ritual, companion?.name ?? null);
            dispatch('milestone', {
              id: companion?.id ?? '',
              action: ritual.key,
              message: toastMessage
            });
          });
        }
      }
      careError = null;
      startCooldown(action);
      dispatch('careApplied', { id: nextCompanion.id, companion: nextCompanion });
      actionMessage = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : null;
      careError = formatCareError(message);
      emitCareErrorToast();
    } finally {
      careBusy = null;
    }
  };
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
        <div class="mood-pill-row">
          <div class="mood-pill" aria-label={`Mood: ${moodInfo.label}`}>
            <span class="mood-pill__icon" aria-hidden="true">{moodInfo.emoji}</span>
            <span>{moodInfo.label}</span>
          </div>
          <InfoTooltip text={MOOD_TOOLTIP} label="What mood means" className="mood-hint" />
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

    <section class="bond-overview" aria-label="Bond bonuses">
      <div class="bond-overview__meter" aria-live="polite">
        <div class="bond-glyph-wrap">
          <div class={`bond-glyph bond-glyph--${bondBonus.strong ? 'strong' : 'normal'}`}>
            <span class="bond-glyph__level">{bondLevel}</span>
            <span class="bond-glyph__label">Bond</span>
          </div>
          <InfoTooltip text={BOND_LEVEL_TOOLTIP} label="Bond level explainer" className="bond-hint" />
        </div>
        <p class="bond-score">Score {bondScore}</p>
      </div>
      <div class="bond-overview__copy">
        {#if bondLevelCelebration}
          <span class="bond-level-tag" role="status">Bond level up! Lv {bondLevelCelebration.level}</span>
        {/if}
        <p class="bond-kicker">{bondBonus.label}</p>
        <p class="bond-summary">{bondBonusSummary}</p>
        <p class="bond-note">Active companion bonuses apply to XP & missions.</p>
      </div>
    </section>

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
      <div class="stat-grid__meta">
        <h3>Bond stats</h3>
        <span class="last-care-pill">Last care: {lastCareLabel}</span>
      </div>
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

    <section class="care-section" aria-label="Care actions">
      <div class="care-section__head">
        <div>
          <p class="label">Care actions</p>
          <h3>Bond with {companion.name}</h3>
        </div>
      </div>
      {#if careError}
        <p class="care-error" role="alert">{careError}</p>
      {/if}
      <div class="care-buttons">
        {#each CARE_ACTIONS as action}
          <button
            type="button"
            class={`care-button ${careBusy === action.key ? 'busy' : ''}`}
            disabled={!!careBusy || actionCooldowns[action.key] > 0}
            on:click={() => handleCareAction(action.key)}
          >
            <span class="care-icon" aria-hidden="true">{action.emoji}</span>
            <div class="care-copy">
              <span class="care-title">{action.label}</span>
              <p>{action.description}</p>
              <span class="care-cooldown">
                {#if careBusy === action.key}
                  Working…
                {:else if actionCooldowns[action.key] > 0}
                  Ready in {actionCooldowns[action.key]}s
                {:else}
                  Ready
                {/if}
              </span>
            </div>
          </button>
        {/each}
      </div>
    </section>

    <section class="events-panel">
      <h3>Recent care</h3>
      {#if loadingEvents}
        <p>Loading events…</p>
      {:else if events.length === 0}
        <p>{eventsError ?? 'No recent care events yet.'}</p>
      {:else}
        <ul class="event-list">
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

  .mood-pill-row {
    margin-top: 1rem;
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }

  .mood-pill {
    margin-top: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.05);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
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

  .stat-grid__meta {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
  }

  .stat-grid__meta h3 {
    margin: 0;
    font-size: 1rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
  }

  .last-care-pill {
    border-radius: 999px;
    padding: 0.2rem 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.75);
    background: rgba(9, 12, 25, 0.65);
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

  .care-section {
    margin: 1.5rem 0;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 18px;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .care-section__head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .care-section .label {
    margin: 0;
    letter-spacing: 0.18em;
  }

  .care-buttons {
    display: grid;
    gap: 0.75rem;
  }

  .bond-overview {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 1rem;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1rem;
    padding: 1rem;
    background: rgba(12, 15, 26, 0.6);
  }

  .bond-overview__meter {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
  }

  .bond-glyph-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .bond-glyph {
    width: 110px;
    height: 110px;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 0 auto 0.5rem;
    background: radial-gradient(circle at 30% 20%, rgba(173, 216, 255, 0.6), transparent),
      rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(94, 234, 212, 0.35);
    box-shadow: inset 0 0 20px rgba(56, 189, 248, 0.25);
  }

  .bond-glyph--strong {
    border-color: rgba(248, 250, 252, 0.65);
    box-shadow: inset 0 0 28px rgba(248, 250, 252, 0.4);
  }

  .bond-glyph__level {
    font-size: 2.25rem;
    font-weight: 700;
    line-height: 1;
  }

  .bond-glyph__label {
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .bond-score {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(226, 232, 255, 0.75);
  }

  .bond-overview__copy {
    display: grid;
    gap: 0.3rem;
  }

  .bond-level-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border-radius: 999px;
    border: 1px solid rgba(251, 191, 36, 0.5);
    background: rgba(251, 191, 36, 0.15);
    color: rgba(251, 191, 36, 0.95);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.2rem 0.85rem;
    animation: bondTagPop 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .bond-kicker {
    margin: 0;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: rgba(189, 246, 255, 0.85);
  }

  .bond-summary,
  .bond-note {
    margin: 0;
    color: rgba(226, 232, 255, 0.85);
  }

  .bond-note {
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.85);
  }

  @keyframes bondTagPop {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bond-level-tag {
      animation: none;
    }
  }

  .care-button {
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(8, 10, 20, 0.9);
    padding: 0.85rem 1rem;
    display: flex;
    gap: 0.85rem;
    align-items: center;
    text-align: left;
    transition: border-color 150ms ease, background 150ms ease;
  }

  .care-button:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(10, 13, 24, 0.95);
  }

  .care-button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .care-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.08);
    display: grid;
    place-items: center;
    font-size: 1.5rem;
  }

  .care-copy {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .care-title {
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.8rem;
  }

  .care-copy p {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .care-cooldown {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .care-error {
    border-radius: 12px;
    padding: 0.65rem 0.85rem;
    border: 1px solid rgba(248, 113, 113, 0.35);
    background: rgba(248, 113, 113, 0.2);
    font-size: 0.9rem;
  }

  .event-list {
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
