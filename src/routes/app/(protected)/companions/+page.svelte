<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import type { PageData } from './$types';
  import type { Companion } from '$lib/stores/companions';
  import { createCompanionRosterState } from '$lib/stores/companionRosterState';
  import CompanionModal from '$lib/components/companions/CompanionModal.svelte';
  import UnlockSlotModal from '$lib/components/companions/UnlockSlotModal.svelte';
  import CompanionRitualList from '$lib/components/companions/CompanionRitualList.svelte';
  import BondMilestonesPanel from '$lib/components/companions/BondMilestonesPanel.svelte';
  import type { CompanionRitual } from '$lib/companions/rituals';
  import { applyRitualUpdate, companionRitualsStore } from '$lib/stores/companionRituals';
  import type { BondAchievementStatus } from '$lib/companions/bond';
  import Modal from '$lib/components/ui/Modal.svelte';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';
  import { getCompanionMoodMeta } from '$lib/companions/moodMeta';
  import { DEFAULT_COMPANION_COSMETICS, normalizeCompanionCosmetics } from '$lib/companions/cosmetics';
  import { computeCompanionEffectiveState, formatLastCareLabel } from '$lib/companions/effectiveState';
  import { pickMuseAnimationForMood } from '$lib/companions/museAnimations';
  import { logEvent } from '$lib/analytics';
  import { isProbablyValidPortrait } from '$lib/companions/portrait';
  import {
    markPortraitUploaded,
    shouldUploadPortrait,
    uploadCompanionPortrait
  } from '$lib/companions/portraitUpload';

  export let data: PageData;

  type DiscoverCompanionDefinition = {
    key: string;
    name: string;
    description: string;
    color: string;
    seed: string;
  };

  type TabKey = 'owned' | 'discover';
  type SortKey = 'bond_desc' | 'recent_interaction' | 'energy_desc' | 'name_asc';

  type FilterState = {
    search: string;
    archetype: string;
    mood: string;
    sort: SortKey;
  };

  type PrefetchedEvent = {
    id: string;
    action: string;
    affection_delta: number;
    trust_delta: number;
    energy_delta: number;
    created_at: string;
    note?: string | null;
  };

  const SAFE_LOAD_ERROR = 'Something didn\'t load. Try again.';
  const CARE_STALE_HOURS = 18;
  const LOW_ENERGY_THRESHOLD = 25;
  let nowTick = Date.now();
  let nowTimer: number | null = null;

  const toStamp = (value: string | null | undefined) => {
    if (!value) return null;
    const stamp = Date.parse(value);
    return Number.isNaN(stamp) ? null : stamp;
  };

  const formatElapsed = (value: string | null | undefined) => {
    const stamp = toStamp(value);
    if (!stamp) return 'Not yet';
    const diffMs = Math.max(0, Date.now() - stamp);
    const totalMinutes = Math.floor(diffMs / 60000);
    if (totalMinutes < 1) return 'Just now';
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const mins = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h ago`;
    if (hours > 0) return `${hours}h ${mins}m ago`;
    return `${mins}m ago`;
  };

  const cleanArchetype = (value: string | null | undefined) => {
    const raw = (value ?? '').trim();
    if (!raw) return 'Muse';
    if (raw.toLowerCase() === 'looma') return 'Muse';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  };

  const normalizeToken = (value: string | null | undefined) =>
    (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

  const getBondLevel = (companion: Companion) => companion.stats?.bond_level ?? companion.bond_level ?? 0;

  const lastInteractionAt = (companion: Companion) => {
    const stats = companion.stats;
    const stamps = [
      stats?.fed_at,
      stats?.played_at,
      stats?.groomed_at,
      stats?.last_passive_tick,
      companion.updated_at
    ]
      .map((entry) => toStamp(entry))
      .filter((entry): entry is number => typeof entry === 'number');
    if (!stamps.length) return null;
    return new Date(Math.max(...stamps)).toISOString();
  };

  const needsAttention = (companion: Companion) => {
    const lowEnergy = (companion.energy ?? 0) <= LOW_ENERGY_THRESHOLD;
    const lastStamp = toStamp(lastInteractionAt(companion));
    const stale = !lastStamp || lastStamp < Date.now() - CARE_STALE_HOURS * 60 * 60 * 1000;
    return lowEnergy || stale;
  };

  const statusLabel = (companion: Companion, isActive: boolean) => {
    if (isActive) return 'Active';
    if ((companion.state ?? '').toLowerCase() === 'resting') return 'Resting';
    if (needsAttention(companion)) return 'Needs attention';
    return 'Ready';
  };

  const relationshipCopy = (companion: Companion | null) => {
    if (!companion) {
      return {
        title: 'First-time companion view',
        body: 'Your companion check-in will appear here once one is active.'
      };
    }

    const name = companion.name || 'Your companion';
    const effectiveEnergy = computeCompanionEffectiveState(companion, new Date(nowTick)).energy;
    const energyLow = (effectiveEnergy ?? companion.energy ?? 0) <= LOW_ENERGY_THRESHOLD;
    const resting = (companion.state ?? '').toLowerCase() === 'resting';
    const lastStamp = toStamp(lastInteractionAt(companion));

    if (energyLow || resting) {
      return {
        title: `${name} is resting.`,
        body: 'A quiet check-in will help.'
      };
    }

    if (!lastStamp || lastStamp < Date.now() - CARE_STALE_HOURS * 60 * 60 * 1000) {
      return {
        title: `${name} has been waiting for you.`,
        body: 'A short moment together steadies your bond.'
      };
    }

    if (lastStamp >= Date.now() - 2 * 60 * 60 * 1000) {
      return {
        title: `${name} is still glowing from your last check-in.`,
        body: 'Come back when you want another small moment together.'
      };
    }

    return {
      title: `${name} is with you now.`,
      body: 'A quick check-in keeps your connection warm.'
    };
  };

  const sortBySlot = (list: Companion[]) =>
    list.slice().sort((a, b) => {
      const slotA = typeof a.slot_index === 'number' ? a.slot_index : Number.MAX_SAFE_INTEGER;
      const slotB = typeof b.slot_index === 'number' ? b.slot_index : Number.MAX_SAFE_INTEGER;
      if (slotA !== slotB) return slotA - slotB;
      return Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? '');
    });

  const rituals: CompanionRitual[] = (data.rituals ?? []) as CompanionRitual[];
  applyRitualUpdate(rituals);

  const bondMilestones = (data.bondMilestones ?? []) as BondAchievementStatus[];
  let maxSlots = data.maxSlots ?? 3;
  const companionState = createCompanionRosterState(sortBySlot((data.companions ?? []) as Companion[]), data.activeCompanionId ?? null);
  let rosterState = get(companionState);

  let selectedForCare: Companion | null = null;
  let activeTab: TabKey = 'owned';
  let filters: FilterState = {
    search: '',
    archetype: 'all',
    mood: 'all',
    sort: 'bond_desc'
  };

  let setActiveBusyId: string | null = null;
  let loading = false;
  let rosterError: string | null = data.error ? SAFE_LOAD_ERROR : null;
  let showUnlock = false;
  let hydrated = false;
  let toast: { message: string; kind: 'success' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let switchMessage: string | null = null;
  let switchTimer: ReturnType<typeof setTimeout> | null = null;

  let discoverModal: DiscoverCompanionDefinition | null = null;
  let museHostRef: MuseModel | null = null;

  const STORAGE_PORTRAIT_SIG_PREFIX = 'looma:companionPortraitCosSig:';
  const stableSig = (value: Record<string, unknown>) => {
    const keys = Object.keys(value).sort();
    const normalized: Record<string, unknown> = {};
    keys.forEach((key) => {
      normalized[key] = value[key];
    });
    return JSON.stringify(normalized);
  };
  const getPortraitSig = (companionId: string) => {
    if (!browser) return null;
    try {
      return window.localStorage.getItem(`${STORAGE_PORTRAIT_SIG_PREFIX}${companionId}`);
    } catch {
      return null;
    }
  };
  const setPortraitSig = (companionId: string, sig: string) => {
    if (!browser) return;
    try {
      window.localStorage.setItem(`${STORAGE_PORTRAIT_SIG_PREFIX}${companionId}`, sig);
    } catch {
      // Ignore.
    }
  };

  let pendingPrefetches: Record<string, PrefetchedEvent[]> = (data.tickEvents ?? []).reduce<Record<string, PrefetchedEvent[]>>(
    (acc, event) => {
      if (!event?.companionId) return acc;
      const companionId = event.companionId;
      const mapped: PrefetchedEvent = {
        id: event.id,
        action: event.kind,
        affection_delta: event.affectionDelta ?? 0,
        trust_delta: event.trustDelta ?? 0,
        energy_delta: event.energyDelta ?? 0,
        created_at: event.createdAt,
        note: event.message
      };
      const existing = acc[companionId] ?? [];
      acc[companionId] = [mapped, ...existing];
      return acc;
    },
    {}
  );
  let prefetchedForModal: { version: number; events: PrefetchedEvent[] } = { version: 0, events: [] };

  const showToast = (message: string, kind: 'success' | 'error' = 'success') => {
    toast = { message, kind };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 2800);
  };

  const showSwitchMessage = (message: string) => {
    switchMessage = message;
    if (switchTimer) clearTimeout(switchTimer);
    switchTimer = setTimeout(() => {
      switchMessage = null;
      switchTimer = null;
    }, 2600);
  };

  const refreshRoster = async () => {
    loading = true;
    try {
      const res = await fetch('/api/companions/list');
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Unable to load companions');
      }
      const items = sortBySlot((payload.items as Companion[]) ?? []);
      companionState.replaceInstances(items, activeCompanion?.id ?? null);
      rosterState = get(companionState);
      maxSlots = payload.maxSlots ?? maxSlots;
      rosterError = null;
    } catch (err) {
      console.error('[companions] failed to refresh roster', err);
      rosterError = SAFE_LOAD_ERROR;
      showToast(SAFE_LOAD_ERROR, 'error');
    } finally {
      loading = false;
    }
  };

  const persistSetActive = async (id: string) => {
    const res = await fetch('/api/companions/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companionId: id })
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload?.error ?? 'Failed to set active companion');
    }
  };

  const setRosterActiveLocally = (targetId: string) => {
    rosterState = {
      ...rosterState,
      activeInstanceId: targetId,
      instances: rosterState.instances.map((instance) => {
        const isActive = instance.id === targetId;
        const nextState = isActive ? 'active' : instance.state === 'active' ? 'idle' : (instance.state ?? 'idle');
        return { ...instance, is_active: isActive, state: nextState };
      })
    };
  };

  const activateCompanion = async (id: string) => {
    const targetId = typeof id === 'string' ? id.trim() : '';
    if (!targetId || setActiveBusyId || activeCompanion?.id === targetId) return;
    if (!ownedInstances.some((entry) => entry.id === targetId)) return;
    const previousActiveId = activeCompanion?.id ?? null;
    const localLabel = ownedInstances.find((entry) => entry.id === targetId)?.name ?? 'Your companion';

    companionState.setActiveCompanion(targetId);
    setRosterActiveLocally(targetId);

    setActiveBusyId = targetId;
    try {
      await persistSetActive(targetId);
      showToast('Active companion updated');
      showSwitchMessage(`${localLabel} is with you now.`);
      logEvent('companion_set_active', { id: targetId, source: activeTab });
      // Best-effort: ensure we have a Supabase-backed portrait so mobile can render without WebGL capture hosts.
      if (activeCosmeticsSig) void ensureSupabasePortrait(targetId, activeCosmeticsSig);
    } catch (err) {
      console.error('[companions] set active failed', err);
      // Prefer re-syncing from the API rather than leaving the UI in a contradictory state.
      await refreshRoster();
      if (previousActiveId) companionState.setActiveCompanion(previousActiveId);
      showToast(SAFE_LOAD_ERROR, 'error');
    } finally {
      setActiveBusyId = null;
    }
  };

  const portraitUploadInFlight = new Set<string>();
  const portraitUploadAttempts = new Map<string, number>();
  const portraitUploadRetryTimers = new Map<string, number>();
  const schedulePortraitRetry = (attemptKey: string, delayMs: number) => {
    if (!browser) return;
    const existing = portraitUploadRetryTimers.get(attemptKey) ?? null;
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      portraitUploadRetryTimers.delete(attemptKey);
      const [companionId, cosmeticsSig] = attemptKey.split(':', 2);
      if (companionId && cosmeticsSig) void ensureSupabasePortrait(companionId, cosmeticsSig);
    }, delayMs);
    portraitUploadRetryTimers.set(attemptKey, timer);
  };

  const ensureSupabasePortrait = async (companionId: string, cosmeticsSig: string) => {
    if (!browser) return;
    const target = ownedInstances.find((entry) => entry.id === companionId) ?? null;
    if (!target) return;
    const attemptKey = `${companionId}:${cosmeticsSig}`;
    // If we already have an avatar_url AND the cosmetics signature matches the last uploaded portrait, nothing to do.
    if (typeof target.avatar_url === 'string' && target.avatar_url && getPortraitSig(companionId) === cosmeticsSig) return;
    const attempts = portraitUploadAttempts.get(attemptKey) ?? 0;
    if (attempts >= 5) return;
    if (portraitUploadInFlight.has(companionId)) return;

    portraitUploadInFlight.add(companionId);
    portraitUploadAttempts.set(attemptKey, attempts + 1);
    try {
      // Wait for the keyed model to mount after switching.
      await tick();
      await new Promise((r) => setTimeout(r, 120));

      if (!museHostRef) {
        schedulePortraitRetry(attemptKey, 600);
        return;
      }

      const dataUrl = (await museHostRef?.capturePortrait?.()) ?? null;
      if (!isProbablyValidPortrait(dataUrl) || typeof dataUrl !== 'string') {
        // Model likely not ready yet; retry a few times.
        schedulePortraitRetry(attemptKey, 900);
        return;
      }
      if (!shouldUploadPortrait(companionId, dataUrl)) {
        // Even if the screenshot didn't change, mark the signature so we don't retry for this cosmetics state.
        setPortraitSig(companionId, cosmeticsSig);
        return;
      }

      const { url } = await uploadCompanionPortrait({ companionId, dataUrl });
      markPortraitUploaded(companionId, dataUrl);
      setPortraitSig(companionId, cosmeticsSig);

      // Update local roster so the UI (and any downstream surfaces) pick up the new avatar immediately.
      companionState.replaceInstances(
        ownedInstances.map((entry) => (entry.id === companionId ? { ...entry, avatar_url: url } : entry)),
        activeCompanion?.id ?? null
      );
      rosterState = get(companionState);
    } catch (err) {
      console.debug('[companions] portrait upload skipped/failed', err);
      schedulePortraitRetry(attemptKey, 1500);
    } finally {
      portraitUploadInFlight.delete(companionId);
    }
  };

  const handleUnlockCta = () => {
    showUnlock = true;
    logEvent('roster_unlock_prompt_shown', { reason: 'manual_open' });
  };

  const handleUnlocked = async (nextSlots: number) => {
    if (typeof nextSlots === 'number' && nextSlots > 0) {
      maxSlots = nextSlots;
    }
    showToast('Slot unlocked');
    await refreshRoster();
  };

  const openCareModal = (companion: Companion | null) => {
    if (!companion) return;
    selectedForCare = companion;
    logEvent('companion_checkin_open', { id: companion.id });
  };

  const closeCareModal = () => {
    selectedForCare = null;
  };

  const applyCareUpdate = (id: string, updated: Companion) => {
    const nextState = typeof updated.state === 'string' ? updated.state : undefined;
    companionState.updateCompanionStats(id, {
      affection: updated.affection,
      trust: updated.trust,
      energy: updated.energy,
      mood: updated.mood,
      ...(nextState ? { state: nextState } : {}),
      updated_at: updated.updated_at,
      bond_level: updated.bond_level ?? updated.stats?.bond_level ?? 0,
      bond_score: updated.bond_score ?? updated.stats?.bond_score ?? 0,
      stats: updated.stats ?? null
    });
    rosterState = get(companionState);
    companionState.recordInteraction(id, 'check_in', new Date().toISOString());
  };

  const discoverDefinitions = (data.discoverCatalog ?? []) as DiscoverCompanionDefinition[];

  const findActiveFromState = (state: { instances: Companion[]; activeInstanceId: string | null }) =>
    state.instances.find((instance) => instance.id === state.activeInstanceId) ?? null;

  $: ownedInstances = rosterState.instances;
  $: activeCompanion = findActiveFromState(rosterState);
  $: activeEffective = activeCompanion ? computeCompanionEffectiveState(activeCompanion, new Date(nowTick)) : null;
  $: museAnimation = pickMuseAnimationForMood(activeEffective?.moodKey, { nowMs: nowTick, seed: activeCompanion?.id ?? '' });
  $: slotsUsed = Math.min(ownedInstances.length, maxSlots);
  $: portableActiveCompanion = (data as any)?.portableActiveCompanion ?? null;
  $: activeCosmetics =
    portableActiveCompanion?.id && portableActiveCompanion.id === activeCompanion?.id
      ? normalizeCompanionCosmetics(portableActiveCompanion.cosmetics)
      : DEFAULT_COMPANION_COSMETICS;
  $: activeCosmeticsSig = stableSig(activeCosmetics);

  // On mobile, users might never see a WebGL-backed dock. Generate + persist an avatar when missing.
  $: if (browser && activeCompanion?.id && activeCosmeticsSig) {
    void ensureSupabasePortrait(activeCompanion.id, activeCosmeticsSig);
  }
  $: effectiveById = new Map(
    ownedInstances.map((instance) => [instance.id, computeCompanionEffectiveState(instance, new Date(nowTick))] as const)
  );
  $: relationshipState = relationshipCopy(activeCompanion);

  $: ownedArchetypeTokens = new Set(
    ownedInstances.flatMap((instance) => [normalizeToken(instance.species), normalizeToken(cleanArchetype(instance.species))])
  );
  $: discoverEntries = discoverDefinitions.filter((definition) => {
    const byKey = normalizeToken(definition.key);
    const byName = normalizeToken(definition.name);
    return !ownedArchetypeTokens.has(byKey) && !ownedArchetypeTokens.has(byName);
  });

  $: archetypeOptions = Array.from(
    new Set([
      ...ownedInstances.map((instance) => cleanArchetype(instance.species)),
      ...discoverEntries.map((definition) => definition.name)
    ])
  )
    .filter(Boolean)
    .sort();

  $: moodOptions = Array.from(new Set(ownedInstances.map((instance) => getCompanionMoodMeta(instance.mood).label))).sort();

  $: filteredOwned = ownedInstances
    .filter((instance) => {
      const term = filters.search.trim().toLowerCase();
      if (term) {
        const composite = `${instance.name} ${instance.species}`.toLowerCase();
        if (!composite.includes(term)) return false;
      }
      if (filters.archetype !== 'all' && cleanArchetype(instance.species) !== filters.archetype) return false;
      if (filters.mood !== 'all' && getCompanionMoodMeta(instance.mood).label !== filters.mood) return false;
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === 'name_asc') return a.name.localeCompare(b.name);
      if (filters.sort === 'energy_desc') return (b.energy ?? 0) - (a.energy ?? 0);
      if (filters.sort === 'recent_interaction') {
        return (toStamp(lastInteractionAt(b)) ?? 0) - (toStamp(lastInteractionAt(a)) ?? 0);
      }
      if (filters.sort === 'bond_desc') return getBondLevel(b) - getBondLevel(a);
      return 0;
    });

  $: filteredDiscover = discoverEntries
    .filter((entry) => {
      const term = filters.search.trim().toLowerCase();
      if (term) {
        const composite = `${entry.name} ${entry.description} ${entry.seed}`.toLowerCase();
        if (!composite.includes(term)) return false;
      }
      if (filters.archetype !== 'all' && entry.name !== filters.archetype) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  $: if (selectedForCare) {
    const refreshed = ownedInstances.find((entry) => entry.id === selectedForCare?.id);
    if (refreshed) selectedForCare = refreshed;
  }

  $: if (selectedForCare?.id) {
    const seeds = pendingPrefetches[selectedForCare.id] ?? [];
    if (seeds.length) {
      prefetchedForModal = { version: prefetchedForModal.version + 1, events: seeds };
      pendingPrefetches = { ...pendingPrefetches, [selectedForCare.id]: [] };
    } else if (prefetchedForModal.events.length) {
      prefetchedForModal = { ...prefetchedForModal, events: [] };
    }
  } else if (prefetchedForModal.events.length) {
    prefetchedForModal = { ...prefetchedForModal, events: [] };
  }

  onMount(() => {
    if (!browser) return;
    hydrated = true;
    logEvent('companions_page_view');

    nowTimer = window.setInterval(() => {
      nowTick = Date.now();
    }, 30000);
  });

  onDestroy(() => {
    unsubscribeRoster?.();
    if (toastTimer) clearTimeout(toastTimer);
    if (switchTimer) clearTimeout(switchTimer);
    if (nowTimer) window.clearInterval(nowTimer);
    if (browser) {
      portraitUploadRetryTimers.forEach((timer) => window.clearTimeout(timer));
      portraitUploadRetryTimers.clear();
    }
  });

  const unsubscribeRoster = companionState.subscribe((next) => {
    rosterState = next;
  });
</script>

<svelte:head>
  <title>Looma - Companions</title>
</svelte:head>

<main class="companions-page">
  <div class="hydration-flag" data-hydrated={hydrated ? 'true' : 'false'} aria-hidden="true"></div>
  <header class="companions-header">
    <div>
      <h1>Your Companions</h1>
      <p class="lede">One place to check in, care, and switch who stays by your side.</p>
    </div>
    <div class="header-pills">
      <span class="pill">Active: {activeCompanion ? activeCompanion.name : 'None'}</span>
      <span class="pill">Slots: {slotsUsed}/{maxSlots}</span>
      <button type="button" class="pill pill-action" on:click={handleUnlockCta}>Unlock slot</button>
      <button type="button" class="pill pill-action" on:click={refreshRoster} disabled={loading}>
        {loading ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  </header>

  {#if switchMessage}
    <p class="switch-message" role="status" aria-live="polite">{switchMessage}</p>
  {/if}

  <section class="companion-view" aria-labelledby="companion-view-heading">
    <div class="companion-view__content">
      <p class="eyebrow">Companion View</p>
      {#if activeCompanion}
        {#key activeCompanion.id}
          <div class="view-title-block">
            <h2 id="companion-view-heading">{activeCompanion.name} · {cleanArchetype(activeCompanion.species)}</h2>
            <div class="view-chips">
              <span class="chip">Active</span>
              <span class="chip">Bond Lv {getBondLevel(activeCompanion)}</span>
              <span class="chip">{activeEffective?.moodLabel ?? getCompanionMoodMeta(activeCompanion.mood).label}</span>
            </div>
          </div>
        {/key}
        <p class="time-context">
          Last check-in: {activeEffective?.msSinceCheckIn == null ? formatElapsed(lastInteractionAt(activeCompanion)) : formatLastCareLabel(activeEffective.msSinceCheckIn)}
        </p>
        <div class="relationship-copy">
          <p class="relationship-copy__title">{relationshipState.title}</p>
          <p>{relationshipState.body}</p>
        </div>

        <button type="button" class="care-primary" on:click={() => openCareModal(activeCompanion)}>
          Check in with {activeCompanion.name}
        </button>

        <div class="meter-stack" aria-label="Companion instance stats">
          <div class="meter-row">
            <div class="meter-row__label"><span>Affection</span><span>{activeEffective?.affection ?? activeCompanion.affection}</span></div>
            <div class="meter-track meter-track--affection">
              <span
                class="meter-fill"
                style={`width:${Math.max(0, Math.min(100, activeEffective?.affection ?? activeCompanion.affection ?? 0))}%`}
              ></span>
            </div>
          </div>
          <div class="meter-row">
            <div class="meter-row__label"><span>Trust</span><span>{activeEffective?.trust ?? activeCompanion.trust}</span></div>
            <div class="meter-track meter-track--trust">
              <span
                class="meter-fill"
                style={`width:${Math.max(0, Math.min(100, activeEffective?.trust ?? activeCompanion.trust ?? 0))}%`}
              ></span>
            </div>
          </div>
          <div class="meter-row">
            <div class="meter-row__label"><span>Energy</span><span>{activeEffective?.energy ?? activeCompanion.energy}</span></div>
            <div class="meter-track meter-track--energy">
              <span
                class="meter-fill"
                style={`width:${Math.max(0, Math.min(100, activeEffective?.energy ?? activeCompanion.energy ?? 0))}%`}
              ></span>
            </div>
          </div>
        </div>
      {:else}
        <h2 id="companion-view-heading">Companion View</h2>
        <p class="time-context">Last check-in: Not yet</p>
        <div class="relationship-copy">
          <p class="relationship-copy__title">{relationshipState.title}</p>
          <p>{relationshipState.body}</p>
        </div>
      {/if}
    </div>

    <div class="companion-view__model" aria-hidden="true">
      {#if !selectedForCare}
        {#key activeCompanion?.id ?? 'none'}
          <MuseModel
            bind:this={museHostRef}
            size="240px"
            autoplay
            respectReducedMotion={false}
            animationName={museAnimation}
            poster={undefined}
            cameraTarget={undefined}
            preserveDrawingBuffer
            auraColor={activeCosmetics.auraColor}
            glowIntensity={activeCosmetics.glowIntensity}
          />
        {/key}
      {/if}
    </div>
  </section>

  <section class="switcher" aria-label="Companion switcher">
    <div class="panel-title-row">
      <h2>Switcher</h2>
      <p>Quickly choose who is with you right now.</p>
    </div>

    {#if ownedInstances.length === 0}
      <p class="empty-copy">No companions yet. Your switcher will appear here after your first companion joins you.</p>
    {:else}
      <div class="switcher-grid">
        {#each ownedInstances as instance (instance.id)}
          <button
            type="button"
            class={`switcher-item ${activeCompanion?.id === instance.id ? 'is-active' : ''}`}
            data-switcher-item="true"
            disabled={setActiveBusyId !== null}
            on:click={() => {
              void activateCompanion(instance.id);
            }}
          >
            <div>
              <p class="switcher-item__name">{instance.name} · {cleanArchetype(instance.species)}</p>
              <p class="switcher-item__meta">Last check-in {formatElapsed(lastInteractionAt(instance))}</p>
            </div>
            <div class="switcher-item__right">
              <span class={`status-chip status-chip--${statusLabel(instance, activeCompanion?.id === instance.id).toLowerCase().replace(/\s+/g, '-')}`}>
                {statusLabel(instance, activeCompanion?.id === instance.id)}
              </span>
              <span class="mood-chip">{effectiveById.get(instance.id)?.moodLabel ?? getCompanionMoodMeta(instance.mood).label}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="tabbed-list" aria-label="Companion lists">
    <div class="tabs-row" role="tablist" aria-label="Companion tabs">
      <button
        class={`tab ${activeTab === 'owned' ? 'is-active' : ''}`}
        role="tab"
        aria-selected={activeTab === 'owned'}
        on:click={() => (activeTab = 'owned')}
      >
        Your Companions
      </button>
      <button
        class={`tab ${activeTab === 'discover' ? 'is-active' : ''}`}
        role="tab"
        aria-selected={activeTab === 'discover'}
        on:click={() => (activeTab = 'discover')}
      >
        Discover
      </button>
    </div>

    <div class="filters-grid" aria-label="Companion filters">
      <label class="filter-field">
        <span>Search</span>
        <input
          type="search"
          placeholder={activeTab === 'owned' ? 'Search by name or archetype' : 'Search archetypes'}
          bind:value={filters.search}
        />
      </label>
      <label class="filter-field">
        <span>Archetype</span>
        <select bind:value={filters.archetype}>
          <option value="all">All</option>
          {#each archetypeOptions as archetype}
            <option value={archetype}>{archetype}</option>
          {/each}
        </select>
      </label>
      <label class="filter-field">
        <span>Mood</span>
        <select bind:value={filters.mood} disabled={activeTab === 'discover'}>
          <option value="all">All</option>
          {#each moodOptions as mood}
            <option value={mood}>{mood}</option>
          {/each}
        </select>
      </label>
      <label class="filter-field">
        <span>Sort</span>
        <select bind:value={filters.sort}>
          <option value="bond_desc">Bond level</option>
          <option value="recent_interaction">Recently interacted</option>
          <option value="energy_desc">Energy</option>
          <option value="name_asc">Name</option>
        </select>
      </label>
    </div>

    {#if activeTab === 'owned'}
      {#if filteredOwned.length === 0}
        <p class="empty-copy">No companions match this filter yet.</p>
      {:else}
        <div class="list-grid">
          {#each filteredOwned as instance (instance.id)}
            <article class={`list-card ${activeCompanion?.id === instance.id ? 'is-active' : ''}`} data-owned-row="true">
              <div>
                <h3>{instance.name} · {cleanArchetype(instance.species)}</h3>
                <p>Last check-in {formatElapsed(lastInteractionAt(instance))}</p>
                <p>Bond level {getBondLevel(instance)}</p>
              </div>
              <div class="list-card__actions">
                <span class="status-chip">{statusLabel(instance, activeCompanion?.id === instance.id)}</span>
                <button
                  type="button"
                  class="inline-action"
                  disabled={setActiveBusyId !== null || activeCompanion?.id === instance.id}
                  on:click={() => {
                    void activateCompanion(instance.id);
                  }}
                >
                  {activeCompanion?.id === instance.id ? 'Active' : setActiveBusyId === instance.id ? 'Setting...' : 'Set active'}
                </button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    {:else}
      {#if filteredDiscover.length === 0}
        <p class="empty-copy">No discoveries match this filter yet.</p>
      {:else}
        <div class="list-grid discover-grid">
          {#each filteredDiscover as entry (entry.key)}
            <button
              type="button"
              class="list-card discover-card"
              data-discover-row="true"
              on:click={() => {
                discoverModal = entry;
              }}
            >
              <div>
                <h3>{entry.name}</h3>
                <p>{entry.description}</p>
              </div>
              <span class="inline-action">View details</span>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </section>

  {#if rosterError}
    <p class="error-banner" role="alert">{rosterError}</p>
  {/if}

  <section class="bond-milestones-panel">
    <h2>Daily rituals</h2>
    <CompanionRitualList rituals={$companionRitualsStore} emptyCopy="Pick an active companion to begin daily rituals." />
  </section>

  <section class="bond-milestones-panel" aria-label="Bond milestones">
    <h2>Bond milestones</h2>
    <BondMilestonesPanel milestones={bondMilestones} />
  </section>
</main>

<CompanionModal
  open={Boolean(selectedForCare)}
  companion={selectedForCare}
  {maxSlots}
  capturePortrait={() => museHostRef?.capturePortrait?.() ?? Promise.resolve(null)}
  allowLivePortrait={true}
  prefetched={prefetchedForModal}
  onClose={closeCareModal}
  renameCompanion={async (id, name) => {
    const res = await fetch('/api/companions/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companionId: id, name })
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('[companions] rename failed', payload);
      throw new Error(payload?.error ?? SAFE_LOAD_ERROR);
    }
    companionState.replaceInstances(
      ownedInstances.map((entry) => (entry.id === id ? { ...entry, name } : entry)),
      activeCompanion?.id ?? null
    );
  }}
  setActive={async (id) => {
    await activateCompanion(id);
  }}
  setState={async (id, state) => {
    const previous = ownedInstances.find((entry) => entry.id === id);
    if (!previous) return;
    companionState.updateCompanionStats(id, { state });
    try {
      const res = await fetch('/api/companions/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: id, state })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'state_update_failed');
    } catch (err) {
      console.error('[companions] state update failed', err);
      companionState.updateCompanionStats(id, { state: previous.state ?? 'idle' });
      throw new Error(SAFE_LOAD_ERROR);
    }
  }}
  on:careApplied={(event) => {
    const { id, companion: updated } = event.detail;
    applyCareUpdate(id, updated);
  }}
  on:milestone={(event) => {
    showToast(event.detail?.message ?? 'Bond milestone reached!');
  }}
  on:toast={(event) => {
    showToast(event.detail?.message ?? 'Update saved', event.detail?.kind ?? 'success');
  }}
/>

<UnlockSlotModal open={showUnlock} onClose={() => (showUnlock = false)} onUnlocked={handleUnlocked} />

<Modal
  open={Boolean(discoverModal)}
  title={discoverModal ? `${discoverModal.name} archetype` : 'Companion archetype'}
  onClose={() => {
    discoverModal = null;
  }}
>
  {#if discoverModal}
    <section class="discover-modal">
      <p class="discover-modal__eyebrow">Discover</p>
      <h3>{discoverModal.name}</h3>
      <p>{discoverModal.description}</p>
      <p>Who bonds well: people who enjoy {discoverModal.seed.replace(/-/g, ' ')} rhythms.</p>
      <p class="discover-modal__hint">Unlock hint: keep checking in and expanding your slots to meet new companions.</p>
      <button type="button" class="inline-action" on:click={() => (discoverModal = null)}>Close</button>
    </section>
  {/if}
</Modal>

{#if toast}
  <div class={`toast toast--${toast.kind}`} role="status" aria-live="polite">{toast.message}</div>
{/if}

<style>
  .companions-page {
    width: min(100%, 1500px);
    margin: 0 auto;
    padding: clamp(1rem, 2.2vw, 2rem);
    display: grid;
    gap: 1.4rem;
  }

  .companions-header {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3rem);
    line-height: 1.05;
  }

  .lede {
    margin: 0.7rem 0 0;
    color: rgba(221, 228, 255, 0.82);
    max-width: 66ch;
  }

  .header-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    justify-content: flex-end;
  }

  .pill {
    border: 1px solid rgba(175, 217, 255, 0.32);
    border-radius: 999px;
    padding: 0.5rem 0.92rem;
    font-size: 0.98rem;
    background: rgba(8, 13, 34, 0.68);
    color: rgba(244, 248, 255, 0.92);
  }

  .pill-action {
    cursor: pointer;
  }

  .switch-message {
    margin: 0;
    border-radius: 16px;
    border: 1px solid rgba(91, 206, 255, 0.35);
    background: rgba(15, 29, 58, 0.68);
    padding: 0.72rem 0.95rem;
    color: rgba(229, 245, 255, 0.92);
  }

  .companion-view,
  .switcher,
  .tabbed-list,
  .bond-milestones-panel {
    border-radius: 24px;
    border: 1px solid rgba(175, 217, 255, 0.2);
    background: rgba(7, 11, 28, 0.78);
    box-shadow: 0 22px 40px rgba(5, 7, 17, 0.32);
    padding: clamp(1rem, 2vw, 1.4rem);
  }

  .companion-view {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
    gap: 1rem;
    align-items: stretch;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: rgba(205, 216, 255, 0.74);
    font-size: 0.82rem;
  }

  .view-title-block h2 {
    margin: 0.55rem 0 0;
    font-size: clamp(1.7rem, 3vw, 2.2rem);
  }

  .view-chips {
    margin-top: 0.7rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }

  .chip {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    padding: 0.26rem 0.72rem;
    font-size: 0.86rem;
    background: rgba(17, 24, 46, 0.7);
  }

  .time-context {
    margin: 0.7rem 0 0;
    color: rgba(204, 216, 255, 0.78);
  }

  .relationship-copy {
    margin-top: 0.7rem;
  }

  .relationship-copy__title {
    margin: 0;
    font-weight: 600;
    color: rgba(241, 247, 255, 0.96);
  }

  .relationship-copy p {
    margin: 0.25rem 0 0;
    color: rgba(210, 221, 255, 0.84);
  }

  .care-primary {
    margin-top: 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(89, 204, 255, 0.5);
    background: linear-gradient(120deg, rgba(36, 96, 165, 0.62), rgba(61, 45, 127, 0.7));
    color: rgba(247, 251, 255, 0.95);
    padding: 0.62rem 1rem;
    font-weight: 600;
    cursor: pointer;
  }

  .meter-stack {
    margin-top: 0.95rem;
    display: grid;
    gap: 0.7rem;
  }

  .meter-row__label {
    display: flex;
    justify-content: space-between;
    color: rgba(214, 224, 255, 0.88);
    font-size: 0.88rem;
    margin-bottom: 0.22rem;
  }

  .meter-track {
    width: 100%;
    height: 11px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    overflow: hidden;
  }

  .meter-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    transition: width 300ms ease;
  }

  .meter-track--affection .meter-fill {
    background: linear-gradient(90deg, rgba(84, 224, 245, 0.95), rgba(151, 127, 255, 0.95));
  }

  .meter-track--trust .meter-fill {
    background: linear-gradient(90deg, rgba(120, 232, 168, 0.95), rgba(47, 199, 118, 0.95));
  }

  .meter-track--energy .meter-fill {
    background: linear-gradient(90deg, rgba(246, 219, 134, 0.95), rgba(239, 143, 92, 0.95));
  }

  .companion-view__model {
    border-radius: 18px;
    border: 1px solid rgba(180, 223, 255, 0.2);
    background: radial-gradient(circle at center, rgba(62, 145, 255, 0.18), rgba(5, 8, 22, 0.82) 70%);
    display: grid;
    place-items: center;
    min-height: 260px;
  }

  .panel-title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .panel-title-row h2,
  .bond-milestones-panel h2 {
    margin: 0;
    font-size: 1.18rem;
  }

  .panel-title-row p {
    margin: 0;
    color: rgba(195, 208, 255, 0.72);
  }

  .switcher-grid {
    margin-top: 0.8rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.7rem;
  }

  .switcher-item {
    border-radius: 14px;
    border: 1px solid rgba(177, 212, 255, 0.24);
    background: rgba(13, 18, 40, 0.86);
    color: rgba(236, 242, 255, 0.95);
    padding: 0.75rem 0.85rem;
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    text-align: left;
    cursor: pointer;
  }

  .switcher-item.is-active {
    border-color: rgba(92, 205, 255, 0.82);
    box-shadow: 0 0 0 1px rgba(92, 205, 255, 0.35);
  }

  .switcher-item__name {
    margin: 0;
    font-weight: 600;
  }

  .switcher-item__meta {
    margin: 0.2rem 0 0;
    font-size: 0.86rem;
    color: rgba(190, 207, 255, 0.75);
  }

  .switcher-item__right {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    align-items: flex-end;
  }

  .status-chip,
  .mood-chip {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    padding: 0.2rem 0.64rem;
    font-size: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    white-space: nowrap;
  }

  .tabs-row {
    display: inline-flex;
    gap: 0.4rem;
    border-radius: 999px;
    padding: 0.25rem;
    background: rgba(8, 12, 31, 0.85);
    border: 1px solid rgba(179, 213, 255, 0.25);
  }

  .tab {
    border: 0;
    background: transparent;
    color: rgba(210, 223, 255, 0.9);
    border-radius: 999px;
    padding: 0.46rem 0.9rem;
    cursor: pointer;
    font-weight: 600;
  }

  .tab.is-active {
    background: rgba(91, 206, 255, 0.26);
    color: rgba(246, 250, 255, 0.96);
  }

  .filters-grid {
    margin-top: 0.88rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.7rem;
  }

  .filter-field {
    display: grid;
    gap: 0.34rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(197, 210, 255, 0.74);
  }

  .filter-field input,
  .filter-field select {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(12, 16, 36, 0.86);
    color: rgba(240, 245, 255, 0.94);
    padding: 0.48rem 0.82rem;
  }

  .list-grid {
    margin-top: 0.92rem;
    display: grid;
    gap: 0.7rem;
  }

  .list-card {
    border-radius: 14px;
    border: 1px solid rgba(171, 214, 255, 0.24);
    background: rgba(11, 16, 38, 0.84);
    color: rgba(237, 243, 255, 0.95);
    padding: 0.74rem 0.84rem;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .list-card.is-active {
    border-color: rgba(91, 206, 255, 0.84);
    box-shadow: 0 0 0 1px rgba(91, 206, 255, 0.35);
  }

  .list-card h3 {
    margin: 0;
    font-size: 1rem;
  }

  .list-card p {
    margin: 0.2rem 0 0;
    color: rgba(196, 209, 255, 0.79);
    font-size: 0.88rem;
  }

  .list-card__actions {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: flex-end;
  }

  .inline-action {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(241, 247, 255, 0.94);
    padding: 0.33rem 0.76rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .inline-action:disabled {
    opacity: 0.62;
    cursor: not-allowed;
  }

  .discover-card {
    text-align: left;
    cursor: pointer;
  }

  .empty-copy {
    margin: 0.8rem 0 0;
    color: rgba(195, 210, 255, 0.75);
  }

  .discover-modal__eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: rgba(202, 215, 255, 0.76);
    font-size: 0.78rem;
  }

  .discover-modal h3 {
    margin: 0.5rem 0 0;
  }

  .discover-modal p {
    color: rgba(219, 229, 255, 0.84);
  }

  .discover-modal__hint {
    border-radius: 12px;
    border: 1px solid rgba(184, 214, 255, 0.28);
    background: rgba(20, 31, 58, 0.5);
    padding: 0.66rem 0.76rem;
  }

  .error-banner {
    margin: 0;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(31, 39, 66, 0.72);
    border-radius: 12px;
    padding: 0.7rem 0.85rem;
  }

  .toast {
    position: fixed;
    bottom: 1.15rem;
    right: 1rem;
    border-radius: 999px;
    padding: 0.48rem 0.84rem;
    border: 1px solid rgba(255, 255, 255, 0.26);
    background: rgba(11, 16, 36, 0.92);
    color: rgba(240, 246, 255, 0.95);
    z-index: 80;
  }

  .toast--error {
    border-color: rgba(255, 180, 180, 0.45);
  }

  @media (max-width: 980px) {
    .companion-view {
      grid-template-columns: 1fr;
    }

    .companion-view__model {
      min-height: 220px;
    }
  }

  @media (max-width: 700px) {
    .companions-page {
      padding-inline: 0.75rem;
    }

    .header-pills {
      justify-content: flex-start;
    }

    .switcher-item,
    .list-card {
      flex-direction: column;
      align-items: stretch;
    }

    .switcher-item__right,
    .list-card__actions {
      align-items: flex-start;
      flex-direction: row;
      flex-wrap: wrap;
    }
  }

  .hydration-flag {
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
