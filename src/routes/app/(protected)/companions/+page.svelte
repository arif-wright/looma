<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { onDestroy, onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import {
    Bell,
    ChevronDown,
    Gem,
    Heart,
    MessageCircle,
    Pencil,
    Plus,
    Search,
    Settings,
    Shield,
    SlidersHorizontal,
    Smile,
    Sparkles,
    Star,
    UserRound
  } from 'lucide-svelte';
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
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import FantasySidebar from '$lib/components/home/fantasy/FantasySidebar.svelte';
  import ShardIcon from '$lib/components/ui/ShardIcon.svelte';
  import type { MessengerConversation } from '$lib/components/messenger/types';
  import { getCompanionMoodMeta } from '$lib/companions/moodMeta';
  import { DEFAULT_COMPANION_COSMETICS, normalizeCompanionCosmetics } from '$lib/companions/cosmetics';
  import { getCompanionIdentity, getElementById, type GiftCategory } from '$lib/companions/identity';
  import { getFavoriteGiftItemsForCompanion, calculateGiftBondGain } from '$lib/companions/giftPreferences';
  import { computeCompanionEffectiveState, formatLastCareLabel } from '$lib/companions/effectiveState';
  import { pickMuseAnimationForMood } from '$lib/companions/museAnimations';
  import { logEvent } from '$lib/analytics';
  import { relativeTime } from '$lib/social/commentHelpers';
  import { isProbablyNonBlankPortrait, isProbablyValidPortrait } from '$lib/companions/portrait';
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
    renderHook: string;
    locked: boolean;
  };

  type TabKey = 'owned' | 'discover';
  type DetailTabKey = 'overview' | 'skills' | 'growth' | 'story';
  type SortKey = 'bond_desc' | 'recent_interaction' | 'energy_desc' | 'name_asc';

  type FilterState = {
    search: string;
    element: string;
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

  type ChapterReward = {
    rewardKey: string;
    title: string;
    body: string;
    tone: string | null;
    unlockedAt: string | null;
  };

  type KeepsakeTone = 'care' | 'social' | 'mission' | 'play' | 'bond';
  type EraView = {
    title: string;
    body: string;
    label: string;
    tone: KeepsakeTone | 'quiet';
  };

  type EraAction = {
    title: string;
    body: string;
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
    secondaryHref: string;
  };

  type IdentitySignal = {
    label: string;
    title: string;
    body: string;
    href: string;
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
  const evolutionStagesByCompanionId = (data.evolutionStagesByCompanionId ?? {}) as Record<string, string>;
  const archetypeMetadataByCompanionId = (data.archetypeMetadataByCompanionId ?? {}) as Record<
    string,
    { renderHook: string; archetypeKey: string | null }
  >;
  applyRitualUpdate(rituals);

  const bondMilestones = (data.bondMilestones ?? []) as BondAchievementStatus[];
  const chapterRewardsByCompanionId = (data.chapterRewardsByCompanionId ?? {}) as Record<string, ChapterReward[]>;
  const chapterRevealHistoryByCompanionId = (data.chapterRevealHistoryByCompanionId ?? {}) as Record<
    string,
    Array<{ id: string; title: string; body: string; createdAt: string | null }>
  >;
  const featuredKeepsakePreference = (data.featuredKeepsakePreference ?? {
    rewardKey: null,
    companionId: null,
    premiumStyle: null
  }) as { rewardKey: string | null; companionId: string | null; premiumStyle: string | null };
  const subscriptionActive = Boolean(data.subscription?.active);
  const premiumStyle = subscriptionActive ? featuredKeepsakePreference.premiumStyle : null;
  let maxSlots = data.maxSlots ?? 3;
  const companionState = createCompanionRosterState(sortBySlot((data.companions ?? []) as Companion[]), data.activeCompanionId ?? null);
  let rosterState = get(companionState);

  let selectedForCare: Companion | null = null;
  let activeTab: TabKey = 'owned';
  let activeDetailTab: DetailTabKey = 'overview';
  let filters: FilterState = {
    search: '',
    element: 'all',
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
  let notificationsOpen = false;
  let messagesOpen = false;
  let profileMenuOpen = false;
  let markingNotifications = false;
  let conversations: MessengerConversation[] = [];
  let conversationsLoading = false;
  let conversationsLoaded = false;
  let conversationsError: string | null = null;
  let topbarActionsRef: HTMLDivElement | null = null;

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
  const clearPortraitSig = (companionId: string) => {
    if (!browser) return;
    try {
      window.localStorage.removeItem(`${STORAGE_PORTRAIT_SIG_PREFIX}${companionId}`);
    } catch {
      // Ignore.
    }
  };

  const STORAGE_PORTRAIT_VERIFIED_PREFIX = 'looma:companionPortraitVerified:';
  const getPortraitVerified = (companionId: string) => {
    if (!browser) return null;
    try {
      return window.localStorage.getItem(`${STORAGE_PORTRAIT_VERIFIED_PREFIX}${companionId}`);
    } catch {
      return null;
    }
  };
  const setPortraitVerified = (companionId: string, sig: string) => {
    if (!browser) return;
    try {
      window.localStorage.setItem(`${STORAGE_PORTRAIT_VERIFIED_PREFIX}${companionId}`, sig);
    } catch {
      // Ignore.
    }
  };

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string | null>((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      } catch {
        resolve(null);
      }
    });

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

    // If we already have an avatar_url AND the cosmetics signature matches the last uploaded portrait,
    // verify the stored image isn't blank (older versions could upload empty frames and then "lock" the sig).
    if (typeof target.avatar_url === 'string' && target.avatar_url && getPortraitSig(companionId) === cosmeticsSig) {
      const verified = getPortraitVerified(companionId);
      if (verified === cosmeticsSig) return;
      try {
        const res = await fetch(target.avatar_url, { cache: 'no-store' });
        const blob = await res.blob();
        const asDataUrl = await blobToDataUrl(blob);
        if (asDataUrl && (await isProbablyNonBlankPortrait(asDataUrl))) {
          setPortraitVerified(companionId, cosmeticsSig);
          return;
        }
      } catch {
        // If verification fails, fall through and attempt a fresh capture/upload.
      }

      // Signature was locked but the stored portrait is blank or unverifiable; clear and re-attempt.
      clearPortraitSig(companionId);
    }

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
      if (!(await isProbablyNonBlankPortrait(dataUrl))) {
        // Sometimes model-viewer returns a "valid" data URL before the first fully-rendered frame.
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
  $: activeCompanionEvolutionStage =
    activeCompanion?.id ? evolutionStagesByCompanionId[activeCompanion.id] ?? null : null;
  $: activeCompanionRenderHook =
    activeCompanion?.id ? archetypeMetadataByCompanionId[activeCompanion.id]?.renderHook ?? null : null;
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
  $: activeCompanionJournalHref =
    activeCompanion?.id ? `/app/memory?companion=${activeCompanion.id}` : '/app/memory';
  $: activeCompanionSanctuaryHref = '/app/home';
  $: activeChapterRewards = activeCompanion?.id ? chapterRewardsByCompanionId[activeCompanion.id] ?? [] : [];
  $: activeChapterHistory = activeCompanion?.id ? chapterRevealHistoryByCompanionId[activeCompanion.id] ?? [] : [];
  $: activeShelfRewards =
    activeChapterRewards.length > 0
      ? [
          ...activeChapterRewards.filter(
            (reward) =>
              reward.rewardKey === featuredKeepsakePreference.rewardKey &&
              activeCompanion?.id === featuredKeepsakePreference.companionId
          ),
          ...activeChapterRewards.filter(
            (reward) =>
              !(
                reward.rewardKey === featuredKeepsakePreference.rewardKey &&
                activeCompanion?.id === featuredKeepsakePreference.companionId
              )
          )
        ].slice(0, 3)
      : [];
  $: activeKeepsake = activeChapterRewards[0] ?? null;
  $: activeKeepsakeTone =
    activeKeepsake?.tone === 'care' ||
    activeKeepsake?.tone === 'social' ||
    activeKeepsake?.tone === 'mission' ||
    activeKeepsake?.tone === 'play' ||
    activeKeepsake?.tone === 'bond'
      ? (activeKeepsake.tone as KeepsakeTone)
      : 'bond';
  $: activeCareStatus = activeCompanion
    ? needsAttention(activeCompanion)
      ? 'Needs a gentle check-in'
      : (activeEffective?.energy ?? activeCompanion.energy ?? 0) <= LOW_ENERGY_THRESHOLD
        ? 'Spark is running low'
        : 'Bond is steady'
    : 'Waiting for your first companion';
  $: activeCareCadence = activeCompanion
    ? activeEffective?.msSinceCheckIn == null
      ? formatElapsed(lastInteractionAt(activeCompanion))
      : formatLastCareLabel(activeEffective.msSinceCheckIn)
    : 'Not yet';
  $: activeMoodLabel = activeCompanion
    ? activeEffective?.moodLabel ?? getCompanionMoodMeta(activeCompanion.mood).label
    : 'Quiet';
  $: activeBondLabel = activeCompanion ? `Bond Lv ${getBondLevel(activeCompanion)}` : 'Bond unavailable';
  $: activeIdentitySignals = activeCompanion
    ? ([
        {
          label: 'Memory anchor',
          title: activeChapterHistory[0]?.title ?? activeKeepsake?.title ?? 'No clear chapter memory yet',
          body:
            activeChapterHistory[0]?.body ??
            activeKeepsake?.body ??
            `${activeCompanion.name} is still waiting for enough shared moments to form a stronger continuity anchor.`,
          href: activeCompanionJournalHref
        },
        {
          label: 'Temperament',
          title: activeMoodLabel,
          body: `${activeCompanion.name}'s current presentation is shaped by recent care, Spark, affection, and trust.`,
          href: activeCompanionSanctuaryHref
        },
        {
          label: 'Care rhythm',
          title: activeCareCadence,
          body: activeCareStatus,
          href: activeCompanionSanctuaryHref
        },
        {
          label: 'Next invitation',
          title: activeEraAction.title,
          body: activeEraAction.body,
          href: activeEraAction.primaryHref
        }
      ] satisfies IdentitySignal[])
    : ([
        {
          label: 'Memory anchor',
          title: 'Waiting to begin',
          body: 'Activate a companion and start with one check-in to create the first relationship signal.',
          href: '/app/home'
        }
      ] satisfies IdentitySignal[]);
  $: activeEra = (() => {
    if (!activeCompanion) {
      return {
        title: 'First era waiting',
        body: 'Spend a few days together and the relationship will start resolving into clearer eras.',
        label: 'Quiet',
        tone: 'quiet'
      } satisfies EraView;
    }
    const latestReveal = activeChapterHistory[0] ?? null;
    if (activeKeepsakeTone === 'care') {
      return {
        title: 'Era of Steady Return',
        body: latestReveal?.body ?? `${activeCompanion.name} is in a chapter shaped by consistency, tending, and small faithful returns.`,
        label: 'Care era',
        tone: 'care'
      } satisfies EraView;
    }
    if (activeKeepsakeTone === 'social') {
      return {
        title: 'Era of Shared Thread',
        body: latestReveal?.body ?? `${activeCompanion.name} is in a chapter where closeness keeps reaching outward through messages, posts, and shared moments.`,
        label: 'Social era',
        tone: 'social'
      } satisfies EraView;
    }
    if (activeKeepsakeTone === 'mission') {
      return {
        title: 'Era of Wayfinding',
        body: latestReveal?.body ?? `${activeCompanion.name} is in a chapter where purpose and direction are giving the relationship a clearer path.`,
        label: 'Mission era',
        tone: 'mission'
      } satisfies EraView;
    }
    if (activeKeepsakeTone === 'play') {
      return {
        title: 'Era of Bright Play',
        body: latestReveal?.body ?? `${activeCompanion.name} is in a chapter where joy and lightness are carrying more of the bond.`,
        label: 'Play era',
        tone: 'play'
      } satisfies EraView;
    }
    if (activeKeepsakeTone === 'bond') {
      return {
        title: 'Era of Deep Bond',
        body: latestReveal?.body ?? `${activeCompanion.name} is in a chapter where trust and affection feel more settled and mutual.`,
        label: 'Bond era',
        tone: 'bond'
      } satisfies EraView;
    }
    return {
      title: 'Era of Gathering Quiet',
      body: `${activeCompanion.name} is still gathering enough moments for the next clearer phase to emerge.`,
      label: 'Quiet',
      tone: 'quiet'
    } satisfies EraView;
  })();
  $: activeEraAction = (() => {
    if (!activeCompanion) {
      return {
        title: 'Begin with one small return',
        body: 'Your first few check-ins will give the relationship enough shape for clearer guidance to emerge.',
        primaryLabel: 'Go to sanctuary',
        primaryHref: '/app/home',
        secondaryLabel: 'Open journal',
        secondaryHref: '/app/memory'
      } satisfies EraAction;
    }

    switch (activeEra.tone) {
      case 'care':
        return {
          title: 'Treat this as a tending chapter',
          body: `${activeCompanion.name} responds best to steadiness right now. Feed the bond with one ritual, then let the quiet hold.`,
          primaryLabel: 'Start a ritual',
          primaryHref: activeCompanionSanctuaryHref,
          secondaryLabel: 'Open journal',
          secondaryHref: activeCompanionJournalHref
        } satisfies EraAction;
      case 'social':
        return {
          title: 'Carry the bond outward',
          body: `${activeCompanion.name} is leaning toward shared-thread moments. A message or circle interaction will land better than staying inward.`,
          primaryLabel: 'Send a note',
          primaryHref: '/app/messages',
          secondaryLabel: 'Visit circles',
          secondaryHref: '/app/circles'
        } satisfies EraAction;
      case 'mission':
        return {
          title: 'Give the chapter a direction',
          body: `${activeCompanion.name} is ready for one clear path. A focused mission will strengthen this phase more than drifting.`,
          primaryLabel: 'Open missions',
          primaryHref: '/app/missions',
          secondaryLabel: 'Visit sanctuary',
          secondaryHref: activeCompanionSanctuaryHref
        } satisfies EraAction;
      case 'play':
        return {
          title: 'Keep the connection light',
          body: `${activeCompanion.name} is bonding through brightness. Choose delight, play, or celebration over anything too heavy.`,
          primaryLabel: 'Play together',
          primaryHref: '/app/play',
          secondaryLabel: 'Open journal',
          secondaryHref: activeCompanionJournalHref
        } satisfies EraAction;
      case 'bond':
        return {
          title: 'Protect what is already close',
          body: `${activeCompanion.name} is in a deep bond phase. A sincere check-in or return to the journal matters more than a bigger gesture.`,
          primaryLabel: `Check in with ${activeCompanion.name}`,
          primaryHref: activeCompanionSanctuaryHref,
          secondaryLabel: 'Open journal',
          secondaryHref: activeCompanionJournalHref
        } satisfies EraAction;
      case 'quiet':
      default:
        return {
          title: 'Let the next phase gather gently',
          body: `${activeCompanion.name} is between clearer chapters. One calm visit and one small act of care are enough.`,
          primaryLabel: 'Visit sanctuary',
          primaryHref: activeCompanionSanctuaryHref,
          secondaryLabel: 'Open journal',
          secondaryHref: activeCompanionJournalHref
        } satisfies EraAction;
    }
  })();
  let keepsakeSaving = false;
  let keepsakeError: string | null = null;

  const isFeaturedKeepsake = (reward: ChapterReward) =>
    Boolean(
      activeCompanion?.id &&
        featuredKeepsakePreference.companionId === activeCompanion.id &&
        featuredKeepsakePreference.rewardKey === reward.rewardKey
    );

  const featureKeepsake = async (reward: ChapterReward) => {
    if (!activeCompanion?.id) return;
    keepsakeSaving = true;
    keepsakeError = null;
    try {
      const response = await fetch('/api/profile/featured-keepsake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rewardKey: reward.rewardKey,
          companionId: activeCompanion.id
        })
      });
      if (!response.ok) {
        keepsakeError = 'Could not feature that keepsake right now.';
        return;
      }
      await refreshRoster();
    } catch {
      keepsakeError = 'Could not feature that keepsake right now.';
    } finally {
      keepsakeSaving = false;
    }
  };

  type TopbarNotification = {
    id: string;
    kind?: string | null;
    read?: boolean | null;
    created_at: string;
    metadata?: Record<string, unknown> | null;
    target_kind?: string | null;
    target_id?: string | null;
  };

  const getMetaString = (meta: Record<string, unknown> | null | undefined, ...keys: string[]) => {
    if (!meta) return null;
    for (const key of keys) {
      const value = meta[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };

  const notificationTitle = (item: TopbarNotification) => {
    const meta = item.metadata ?? {};
    if (item.kind === 'achievement_unlocked') {
      return getMetaString(meta, 'name', 'achievementName', 'title') ?? 'Achievement unlocked';
    }
    if (item.kind === 'companion_nudge') {
      return getMetaString(meta, 'companionName', 'companion_name') ?? 'Companion update';
    }
    if (item.kind === 'comment') return 'New comment';
    if (item.kind === 'reaction') return 'New reaction';
    if (item.kind === 'share') return 'Post shared';
    if (item.kind === 'event_reminder') return getMetaString(meta, 'title', 'eventTitle') ?? 'Event reminder';
    return 'New notification';
  };

  const notificationBody = (item: TopbarNotification) => {
    const meta = item.metadata ?? {};
    if (item.kind === 'companion_nudge') {
      const reason = getMetaString(meta, 'reason');
      if (reason === 'low_energy') return 'Energy is running low.';
      if (reason === 'care_due') return 'Ready for a care check-in.';
      return 'A new companion moment is ready.';
    }
    if (item.kind === 'achievement_unlocked') return 'A reward opened in your journey.';
    if (item.kind === 'comment') return 'Someone added to a thread.';
    if (item.kind === 'reaction') return 'Someone reacted to your post.';
    if (item.kind === 'share') return 'Someone shared something you made.';
    return getMetaString(meta, 'body', 'message', 'description') ?? 'Open notifications to view details.';
  };

  const notificationHref = (item: TopbarNotification) => {
    if (item.target_kind === 'companion') return `/app/companions?focus=${item.target_id ?? ''}`;
    if (item.target_kind === 'event') return `/app/events?eventId=${encodeURIComponent(item.target_id ?? '')}`;
    return '/app/notifications';
  };

  const closeTopbarMenus = () => {
    notificationsOpen = false;
    messagesOpen = false;
    profileMenuOpen = false;
  };

  const toggleNotifications = () => {
    notificationsOpen = !notificationsOpen;
    messagesOpen = false;
    profileMenuOpen = false;
  };

  const conversationName = (conversation: MessengerConversation) =>
    conversation.type === 'group'
      ? conversation.group_name ?? 'Group conversation'
      : conversation.peer?.display_name ?? conversation.peer?.handle ?? 'Someone';

  const conversationPreview = (conversation: MessengerConversation) =>
    conversation.blocked ? 'This conversation is blocked.' : conversation.preview?.trim() || 'No messages yet.';

  const conversationInitial = (conversation: MessengerConversation) =>
    conversationName(conversation).trim().slice(0, 1).toUpperCase() || 'M';

  const fetchConversations = async () => {
    if (conversationsLoading || conversationsLoaded) return;
    conversationsLoading = true;
    conversationsError = null;
    try {
      const response = await fetch('/api/messenger/conversations', { headers: { 'cache-control': 'no-store' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        conversationsError = typeof payload?.message === 'string' ? payload.message : 'Could not load messages.';
        return;
      }
      conversations = Array.isArray(payload?.items) ? payload.items.slice(0, 5) : [];
      conversationsLoaded = true;
    } catch {
      conversationsError = 'Could not load messages.';
    } finally {
      conversationsLoading = false;
    }
  };

  const toggleMessages = () => {
    messagesOpen = !messagesOpen;
    notificationsOpen = false;
    profileMenuOpen = false;
    if (messagesOpen) void fetchConversations();
  };

  const toggleProfileMenu = () => {
    profileMenuOpen = !profileMenuOpen;
    notificationsOpen = false;
    messagesOpen = false;
  };

  const handleTopbarDocumentClick = (event: MouseEvent) => {
    if (!topbarActionsRef || !(event.target instanceof Node)) return;
    if (!topbarActionsRef.contains(event.target)) closeTopbarMenus();
  };

  const markNotificationsRead = async () => {
    if (markingNotifications || unreadNotifications === 0) return;
    markingNotifications = true;
    try {
      const response = await fetch('/api/notifications', { method: 'POST' });
      if (!response.ok) throw new Error('mark_read_failed');
      notificationItems = notificationItems.map((item) => ({ ...item, read: true }));
    } catch (err) {
      console.error('[companions] failed to mark notifications read', err);
      showToast(SAFE_LOAD_ERROR, 'error');
    } finally {
      markingNotifications = false;
    }
  };

  $: ownedArchetypeTokens = new Set(
    ownedInstances.flatMap((instance) => [normalizeToken(instance.species), normalizeToken(cleanArchetype(instance.species))])
  );
  $: discoverEntries = discoverDefinitions.filter((definition) => {
    const byKey = normalizeToken(definition.key);
    const byName = normalizeToken(definition.name);
    return !ownedArchetypeTokens.has(byKey) && !ownedArchetypeTokens.has(byName);
  });

  $: moodOptions = Array.from(new Set(ownedInstances.map((instance) => getCompanionMoodMeta(instance.mood).label))).sort();
  const searchTerms = (value: string) => value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchesSearchTerms = (haystack: string, terms: string[]) => {
    const normalized = haystack.toLowerCase();
    return terms.every((term) => normalized.includes(term));
  };
  const searchableIdentityText = (identity: ReturnType<typeof getCompanionIdentity>) => {
    const giftText = Object.values(identity.gifts)
      .flat()
      .map((gift) => `${gift.name} ${gift.category} ${gift.description} ${gift.effectSummary} ${gift.emotionalPurpose}`)
      .join(' ');
    const storyText = [
      identity.story.origin,
      ...identity.story.sharedMemories,
      ...identity.story.unlockedFragments,
      ...identity.story.lockedFragments
    ]
      .map((fragment) => `${fragment.title} ${fragment.type} ${fragment.unlockCondition} ${fragment.body}`)
      .join(' ');
    const primary = getElementById(identity.elementProfile.primary);
    const secondary = getElementById(identity.elementProfile.secondary);
    return [
      identity.name,
      identity.archetype.label,
      identity.archetype.role,
      identity.archetype.emotionalDomain,
      identity.archetype.overviewIdentity,
      identity.rarity,
      identity.mood,
      identity.elementProfile.variantId.replace(/_/g, ' '),
      identity.elementProfile.emotionalDomain,
      identity.elementProfile.expressionLine,
      identity.elementProfile.bondExpression,
      identity.elementProfile.preferredRituals.join(' '),
      primary?.label,
      primary?.description,
      primary?.emotionalMeaning,
      secondary?.label,
      secondary?.description,
      secondary?.emotionalMeaning,
      identity.personality.join(' '),
      identity.favoriteGifts.join(' '),
      giftText,
      storyText
    ]
      .filter(Boolean)
      .join(' ');
  };
  const identityMatchesElement = (identity: ReturnType<typeof getCompanionIdentity>, selectedElement: string) => {
    if (selectedElement === 'all') return true;
    const token = normalizeToken(selectedElement);
    const primary = getElementById(identity.elementProfile.primary);
    const secondary = getElementById(identity.elementProfile.secondary);
    return [
      identity.elementProfile.primary,
      identity.elementProfile.secondary,
      identity.elementProfile.variantId,
      identity.elementProfile.emotionalDomain,
      primary?.label,
      secondary?.label
    ]
      .filter(Boolean)
      .some((value) => normalizeToken(value) === token);
  };
  const discoverIdentity = (entry: DiscoverCompanionDefinition) =>
    getCompanionIdentity({
      id: entry.key,
      name: entry.name,
      species: entry.name,
      rarity: entry.locked ? 'Locked' : 'Epic',
      level: 1,
      mood: 'steady',
      affection: 0,
      trust: 0,
      energy: 0
    } as Companion);
  $: elementOptions = Array.from(
    new Set(
      [...ownedInstances.map((instance) => getCompanionIdentity(instance)), ...discoverEntries.map(discoverIdentity)].flatMap(
        (identity) => {
          const primary = getElementById(identity.elementProfile.primary);
          const secondary = getElementById(identity.elementProfile.secondary);
          return [primary?.label, secondary?.label].filter(Boolean) as string[];
        }
      )
    )
  ).sort();
  $: activeSearchTerms = searchTerms(filters.search);
  $: hasActiveFilters =
    filters.search.trim().length > 0 || filters.element !== 'all' || filters.mood !== 'all' || filters.sort !== 'bond_desc';
  const updateFilters = (partial: Partial<FilterState>) => {
    filters = { ...filters, ...partial };
  };
  const clearFilters = () => {
    filters = { search: '', element: 'all', mood: 'all', sort: 'bond_desc' };
  };

  $: filteredOwned = ownedInstances
    .filter((instance) => {
      const identity = getCompanionIdentity(instance);
      const chapterText = (chapterRewardsByCompanionId[instance.id] ?? [])
        .map((reward) => `${reward.title} ${reward.body} ${reward.tone ?? ''}`)
        .join(' ');
      if (activeSearchTerms.length && !matchesSearchTerms(`${searchableIdentityText(identity)} ${chapterText}`, activeSearchTerms)) {
        return false;
      }
      if (!identityMatchesElement(identity, filters.element)) return false;
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
      const identity = discoverIdentity(entry);
      const composite = `${entry.name} ${entry.description} ${entry.seed} ${entry.renderHook} ${searchableIdentityText(identity)}`;
      if (activeSearchTerms.length && !matchesSearchTerms(composite, activeSearchTerms)) return false;
      if (!identityMatchesElement(identity, filters.element)) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const clampPercent = (value: number | null | undefined) => Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const companionBondScore = (companion: Companion | null | undefined) => {
    if (!companion) return 0;
    const raw = companion.stats?.bond_score ?? companion.bond_score;
    if (typeof raw === 'number' && Number.isFinite(raw)) return clampPercent(raw);
    return clampPercent(((companion.affection ?? 0) + (companion.trust ?? 0)) / 2);
  };
  const companionLevel = (companion: Companion | null | undefined) => {
    if (!companion) return 1;
    const raw = companion.stats?.bond_level ?? companion.bond_level ?? companion.level;
    return Math.max(1, Math.round(Number(raw) || 1));
  };
  const companionTone = (companion: Companion, index = 0) => {
    const token = normalizeToken(companion.species);
    if (token.includes('guardian') || token.includes('tova')) return 'silver';
    if (token.includes('spark') || token.includes('aurex') || token.includes('vexel')) return 'ember';
    if (token.includes('root') || token.includes('kynth') || token.includes('elar')) return 'verdant';
    if (token.includes('echo') || token.includes('nira')) return 'violet';
    return ['violet', 'silver', 'ember', 'verdant'][index % 4] ?? 'violet';
  };
  const companionElement = (companion: Companion | null | undefined) => cleanArchetype(companion?.species) || 'Arcane';
  const companionPersonality = (companion: Companion | null | undefined) => {
    const mood = getCompanionMoodMeta(companion?.mood ?? companion?.state ?? 'steady').label;
    const element = companionElement(companion);
    return [mood, element, 'Loyal'].slice(0, 3);
  };
  const giftFallbackIcon = '/assets/shard_icon.png';
  const detailTabs: Array<{ key: DetailTabKey; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'skills', label: 'Skills' },
    { key: 'growth', label: 'Growth' },
    { key: 'story', label: 'Story' }
  ];
  const giftGroups: Array<{ key: GiftCategory; label: string }> = [
    { key: 'core', label: 'Core Gifts' },
    { key: 'element', label: 'Element Gifts' },
    { key: 'bond', label: 'Bond Gifts' },
    { key: 'story', label: 'Story Gifts' }
  ];
  const activeProfileAvatar =
    ($page.data?.profile as any)?.avatar_url ??
    ($page.data?.user as any)?.user_metadata?.avatar_url ??
    ($page.data?.user as any)?.user_metadata?.picture ??
    null;
  const profileDisplayName =
    ($page.data?.profile as any)?.display_name ??
    ($page.data?.profile as any)?.username ??
    ($page.data?.user as any)?.email?.split('@')[0] ??
    'Traveler';
  let notificationItems: TopbarNotification[] = (((data as any)?.notifications ?? []) as TopbarNotification[]).map((item) => ({
    ...item,
    metadata: (item.metadata ?? {}) as Record<string, unknown>
  }));
  $: unreadNotifications = notificationItems.filter((item) => !item.read).length;
  $: notificationPreview = notificationItems.slice(0, 5);
  $: unreadMessages = conversations.reduce((total, conversation) => total + Math.max(0, conversation.unreadCount ?? 0), 0);
  $: shardBalance =
    typeof ($page.data?.wallet as any)?.shards === 'number' ? (($page.data?.wallet as any).shards as number) : 0;
  $: activeCompanionCount = activeCompanion ? 1 : 0;
  $: companionsCollected = ownedInstances.length;
  $: companionCollectionTotal = companionsCollected + discoverEntries.length;
  $: activeCompanionProgress = activeCompanionCount > 0 ? 100 : 0;
  $: collectionProgress =
    companionCollectionTotal > 0 ? Math.min(100, Math.round((companionsCollected / companionCollectionTotal) * 100)) : 0;
  $: averageBond =
    ownedInstances.length > 0
      ? Math.round(ownedInstances.reduce((total, companion) => total + companionBondScore(companion), 0) / ownedInstances.length)
      : 0;
  $: masteryLevel = ownedInstances.length > 0 ? Math.max(...ownedInstances.map((companion) => companionLevel(companion))) : 1;
  $: detailCompanion = activeCompanion ?? filteredOwned[0] ?? ownedInstances[0] ?? null;
  $: detailIdentity = getCompanionIdentity(detailCompanion);
  $: detailElementProfile = detailIdentity.elementProfile;
  $: detailPrimaryElement = getElementById(detailElementProfile.primary);
  $: detailSecondaryElement = getElementById(detailElementProfile.secondary);
  $: favoriteGiftItems = getFavoriteGiftItemsForCompanion(detailCompanion, 4);
  $: slotsPercent = maxSlots > 0 ? Math.min(100, Math.round((slotsUsed / maxSlots) * 100)) : 0;

  $: if (selectedForCare) {
    const refreshed = ownedInstances.find((entry) => entry.id === selectedForCare?.id);
    if (refreshed) selectedForCare = refreshed;
  }
  $: selectedCompanionEvolutionStage =
    selectedForCare?.id ? evolutionStagesByCompanionId[selectedForCare.id] ?? null : null;
  $: selectedCompanionRenderHook =
    selectedForCare?.id ? archetypeMetadataByCompanionId[selectedForCare.id]?.renderHook ?? null : null;

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
    document.addEventListener('click', handleTopbarDocumentClick, true);

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
      document.removeEventListener('click', handleTopbarDocumentClick, true);
      portraitUploadRetryTimers.forEach((timer) => window.clearTimeout(timer));
      portraitUploadRetryTimers.clear();
    }
  });

  const unsubscribeRoster = companionState.subscribe((next) => {
    rosterState = next;
  });
</script>

<svelte:head>
  <title>Memvoya - Companions</title>
</svelte:head>

<div class="companions-fantasy-shell">
  <FantasySidebar
    activePath="/app/companions"
    playerName={($page.data?.profile as any)?.display_name ?? ($page.data?.user as any)?.email?.split('@')[0] ?? 'Traveler'}
    level={masteryLevel}
    xp={Math.round(slotsPercent * 50)}
    xpNext={5000}
  />

  <main class="companions-workspace" aria-label="Companions">
    <header class="topbar">
      <label class="search-field" aria-label="Search companions">
        <Search size={18} />
        <input
          type="search"
          placeholder="Search companions..."
          value={filters.search}
          on:input={(event) => updateFilters({ search: (event.currentTarget as HTMLInputElement).value })}
        />
      </label>
      <div class="topbar-controls" bind:this={topbarActionsRef}>
        <label class="select-field">
          <span>Sort companions</span>
          <select
            value={filters.sort}
            on:change={(event) => updateFilters({ sort: (event.currentTarget as HTMLSelectElement).value as SortKey })}
          >
            <option value="bond_desc">Bond</option>
            <option value="recent_interaction">Recent</option>
            <option value="energy_desc">Spark</option>
            <option value="name_asc">Name</option>
          </select>
          <ChevronDown size={16} />
        </label>
        <label class="select-field">
          <span>Filter by element</span>
          <select
            value={filters.element}
            on:change={(event) => updateFilters({ element: (event.currentTarget as HTMLSelectElement).value })}
          >
            <option value="all">All Elements</option>
            {#each elementOptions as element}
              <option value={element}>{element}</option>
            {/each}
          </select>
          <ChevronDown size={16} />
        </label>
        <button
          type="button"
          class={`icon-button ${hasActiveFilters ? 'is-active' : ''}`}
          aria-label={hasActiveFilters ? 'Clear companion filters' : 'Companion filters are clear'}
          aria-pressed={hasActiveFilters}
          on:click={clearFilters}
        >
          <SlidersHorizontal size={18} />
        </button>
        <a class="shard-pill topbar-action" href="/app/wallet" aria-label={`Open wallet, ${shardBalance.toLocaleString()} shards`}>
          <ShardIcon size={18} />
          <span>{shardBalance.toLocaleString()}</span>
        </a>
        <div class="topbar-menu" class:open={notificationsOpen}>
          <button
            type="button"
            class="icon-button topbar-action"
            aria-label={unreadNotifications > 0 ? `Notifications (${unreadNotifications} unread)` : 'Notifications'}
            aria-expanded={notificationsOpen}
            aria-haspopup="dialog"
            on:click={toggleNotifications}
          >
            <Bell size={18} />
            {#if unreadNotifications > 0}
              <span class="topbar-badge">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>
            {/if}
          </button>
          {#if notificationsOpen}
            <div class="topbar-dropdown notification-dropdown" role="dialog" aria-label="Notifications">
              <header>
                <h2>Notifications</h2>
                <button type="button" on:click={markNotificationsRead} disabled={markingNotifications || unreadNotifications === 0}>
                  Mark all as read
                </button>
              </header>
              <div class="dropdown-list">
                {#if notificationPreview.length > 0}
                  {#each notificationPreview as item, index (item.id)}
                    <a class="dropdown-item" class:unread={!item.read} href={notificationHref(item)}>
                      <span class="dropdown-icon" style={`--tone:${['#a75cff', '#ddaa5c', '#62e8ff', '#ff6fb8'][index % 4]}`}>
                        <ShardIcon size={19} />
                      </span>
                      <span class="dropdown-copy">
                        <strong>{notificationTitle(item)}</strong>
                        <small>{notificationBody(item)}</small>
                        <time datetime={item.created_at}>{relativeTime(item.created_at)}</time>
                      </span>
                      {#if !item.read}
                        <i aria-hidden="true"></i>
                      {/if}
                    </a>
                  {/each}
                {:else}
                  <p class="dropdown-empty">No notifications yet.</p>
                {/if}
              </div>
              <a class="dropdown-footer" href="/app/notifications">
                <span>View All Notifications</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
          {/if}
        </div>
        <div class="topbar-menu message-menu" class:open={messagesOpen}>
          <button
            type="button"
            class="icon-button topbar-action"
            aria-label={unreadMessages > 0 ? `Messages (${unreadMessages} unread)` : 'Messages'}
            aria-expanded={messagesOpen}
            aria-haspopup="dialog"
            on:click={toggleMessages}
          >
            <MessageCircle size={18} />
            {#if unreadMessages > 0}
              <span class="topbar-badge">{unreadMessages > 9 ? '9+' : unreadMessages}</span>
            {/if}
          </button>
          {#if messagesOpen}
            <div class="topbar-dropdown message-dropdown" role="dialog" aria-label="Messages">
              <header>
                <h2>Messages</h2>
                <a href="/app/messages">Open inbox</a>
              </header>
              <div class="dropdown-list">
                {#if conversationsLoading}
                  <p class="dropdown-empty">Loading messages...</p>
                {:else if conversationsError}
                  <p class="dropdown-empty">{conversationsError}</p>
                {:else if conversations.length > 0}
                  {#each conversations as conversation, index (conversation.conversationId)}
                    <a
                      class="dropdown-item message-item"
                      class:unread={conversation.unreadCount > 0}
                      href={`/app/messages?conversation=${conversation.conversationId}`}
                    >
                      <span class="message-avatar" style={`--tone:${['#a75cff', '#ddaa5c', '#62e8ff', '#ff6fb8'][index % 4]}`}>
                        {#if conversation.peer?.avatar_url}
                          <img src={conversation.peer.avatar_url} alt="" loading="lazy" />
                        {:else}
                          <span>{conversationInitial(conversation)}</span>
                        {/if}
                      </span>
                      <span class="dropdown-copy">
                        <strong>{conversationName(conversation)}</strong>
                        <small>{conversationPreview(conversation)}</small>
                        {#if conversation.last_message_at}
                          <time datetime={conversation.last_message_at}>{relativeTime(conversation.last_message_at)}</time>
                        {/if}
                      </span>
                      {#if conversation.unreadCount > 0}
                        <i aria-label={`${conversation.unreadCount} unread`}>{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</i>
                      {/if}
                    </a>
                  {/each}
                {:else}
                  <p class="dropdown-empty">No conversations yet.</p>
                {/if}
              </div>
              <a class="dropdown-footer" href="/app/messages">
                <span>View All Messages</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
          {/if}
        </div>
        <div class="topbar-menu profile-menu" class:open={profileMenuOpen}>
          <button
            type="button"
            class="profile-pill topbar-action"
            aria-label="Open profile menu"
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            on:click={toggleProfileMenu}
          >
            {#if activeProfileAvatar}
              <img src={activeProfileAvatar} alt="" />
            {:else}
              <span>{profileDisplayName.slice(0, 1).toUpperCase()}</span>
            {/if}
            <ChevronDown size={14} />
          </button>
          {#if profileMenuOpen}
            <div class="topbar-dropdown profile-dropdown" role="menu" aria-label="Profile menu">
              <header>
                <h2>{profileDisplayName}</h2>
              </header>
              <div class="dropdown-list">
                <a class="dropdown-item profile-link" href="/app/profile" role="menuitem">
                  <span class="dropdown-icon" style="--tone:#a75cff"><UserRound size={18} /></span>
                  <span class="dropdown-copy">
                    <strong>View Profile</strong>
                    <small>Open your public profile page.</small>
                  </span>
                </a>
                <a class="dropdown-item profile-link" href="/app/preferences" role="menuitem">
                  <span class="dropdown-icon" style="--tone:#ddaa5c"><Settings size={18} /></span>
                  <span class="dropdown-copy">
                    <strong>User Settings</strong>
                    <small>Manage account and experience settings.</small>
                  </span>
                </a>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </header>

    <section class="roster-layout">
      <div class="roster-main">
        <div class="title-row">
          <div>
            <h1>Companions</h1>
            <div class="tabs-row" role="tablist" aria-label="Companion tabs">
              <button
                class={`tab ${activeTab === 'owned' ? 'is-active' : ''}`}
                role="tab"
                aria-selected={activeTab === 'owned'}
                on:click={() => (activeTab = 'owned')}
              >
                My Companions
              </button>
              <button
                class={`tab ${activeTab === 'discover' ? 'is-active' : ''}`}
                role="tab"
                aria-selected={activeTab === 'discover'}
                on:click={() => (activeTab = 'discover')}
              >
                Companion Collection
              </button>
            </div>
          </div>
          <div class="mobile-actions">
            <button type="button" class="soft-button" on:click={refreshRoster} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {#if switchMessage}
          <p class="switch-message" role="status" aria-live="polite">{switchMessage}</p>
        {/if}

        <section class="stats-grid" aria-label="Companion overview">
          <article class="stat-cluster">
            <div class="stat-segment">
              <span class="stat-orb stat-orb--blue" style={`--progress:${activeCompanionProgress}%`}><Shield size={20} /></span>
              <div>
                <strong>{activeCompanionCount}</strong>
                <span>Active Companions</span>
              </div>
            </div>
            <div class="stat-segment">
              <span class="stat-orb stat-orb--gold" style={`--progress:${collectionProgress}%`}><Sparkles size={20} /></span>
              <div>
                <strong>{companionsCollected}</strong>
                <span>Companions Collected</span>
              </div>
            </div>
            <div class="stat-segment">
              <span class="stat-orb stat-orb--heart" style={`--progress:${averageBond}%`}><Heart size={20} fill="currentColor" /></span>
              <div>
                <strong>{averageBond}%</strong>
                <span>Average Bond</span>
              </div>
            </div>
          </article>
          <article class="stat-card mastery-card">
            <span class="stat-orb stat-orb--violet"><Gem size={24} /></span>
            <div>
              <strong>Lvl {masteryLevel}</strong>
              <span>Companion Mastery</span>
            </div>
          </article>
        </section>

        {#if activeTab === 'owned'}
          <section class="companion-grid" aria-label="My companions">
            {#if filteredOwned.length === 0}
              <p class="empty-copy">No companions match this filter yet.</p>
            {:else}
              {#each filteredOwned as instance, index (instance.id)}
                <button
                  type="button"
                  class={`roster-card ${activeCompanion?.id === instance.id ? 'is-active' : ''}`}
                  data-tone={companionTone(instance, index)}
                  on:click={() => {
                    void activateCompanion(instance.id);
                  }}
                  on:dblclick={() => openCareModal(instance)}
                >
                  {#if activeCompanion?.id === instance.id}
                    <span class="active-badge">Active</span>
                  {/if}
                  <span class="favorite-star" aria-hidden="true"><Star size={18} fill="currentColor" /></span>
                  <div class="avatar-stage">
                    <img src={instance.avatar_url ?? '/avatar-fallback.png'} alt="" loading="lazy" />
                  </div>
                  <div class="roster-copy">
                    <strong>{instance.name}</strong>
                    <div class="roster-meta-line">
                      <span>Level {companionLevel(instance)}</span>
                      <span class="bond-mini"><Heart size={14} fill="currentColor" /> {companionBondScore(instance)}%</span>
                    </div>
                  </div>
                  <div class="roster-foot">
                    <div class="element-dots" aria-hidden="true">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </button>
              {/each}
            {/if}

            <button type="button" class="summon-card" on:click={handleUnlockCta}>
              <span><Plus size={32} /></span>
              <strong>Summon</strong>
              <small>New Companion</small>
            </button>
          </section>
        {:else}
          <section class="collection-grid" aria-label="Companion collection">
            {#if filteredDiscover.length === 0}
              <p class="empty-copy">No discoveries match this filter yet.</p>
            {:else}
              {#each filteredDiscover as entry (entry.key)}
                <button type="button" class="collection-card" on:click={() => (discoverModal = entry)}>
                  <span class="stat-orb stat-orb--violet"><Sparkles size={24} /></span>
                  <strong>{entry.name}</strong>
                  <p>{entry.description}</p>
                  <small>{entry.locked ? 'Locked preview' : 'View details'}</small>
                </button>
              {/each}
            {/if}
          </section>
        {/if}

        <section class="slots-panel">
          <div>
            <strong>Companion Slots</strong>
            <span>{slotsUsed}/{maxSlots}</span>
          </div>
          <div class="slot-meter" aria-hidden="true"><span style={`width:${slotsPercent}%`}></span></div>
          <button type="button" class="upgrade-button" on:click={handleUnlockCta}>
            <img src="/assets/shard_icon.png" alt="" />
            Upgrade Slots
          </button>
        </section>
      </div>

      <aside class="detail-panel" aria-label="Active companion details">
        {#if detailCompanion}
          <div class="detail-hero">
            <div class="detail-head">
              <div>
                <div class="name-row">
                  <h2>{detailCompanion.name}</h2>
                  <button
                    type="button"
                    class="edit-button"
                    aria-label={`Edit ${detailCompanion.name}`}
                    on:click={() => openCareModal(detailCompanion)}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
                <span>Level {companionLevel(detailCompanion)}</span>
                <p class="rarity-row"><img src="/assets/shard_icon.png" alt="" /> {detailCompanion.rarity ?? 'Epic'}</p>
              </div>
            </div>
            <div class="hero-particles" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span><span></span>
            </div>
            <div class="detail-model">
              <MuseModel
                bind:this={museHostRef}
                size="270px"
                minSize="0px"
                autoplay
                framed={false}
                transparent={true}
                respectReducedMotion={false}
                animationName={museAnimation}
                poster={undefined}
                cameraOrbit="205deg 78deg 88%"
                cameraTarget="0m 0.34m 0m"
                modelScale="1.18 1.18 1.18"
                auraColor={activeCosmetics.auraColor}
                glowIntensity={activeCosmetics.glowIntensity}
              />
              <img class="model-platform" src="/assets/platform.png" alt="" aria-hidden="true" />
            </div>
          </div>
          <div class="mood-row">
            <span><Smile size={23} fill="currentColor" /> {getCompanionMoodMeta(detailCompanion.mood).label}</span>
          </div>
          <div class="bond-row">
            <div><Heart size={22} fill="currentColor" /> <span>Bond</span></div>
            <strong>{companionBondScore(detailCompanion)}%</strong>
          </div>
          <div class="bond-meter"><span style={`width:${companionBondScore(detailCompanion)}%`}></span></div>

          <div class="detail-tabs" aria-label="Companion detail sections">
            {#each detailTabs as tab}
              <button
                class:is-active={activeDetailTab === tab.key}
                type="button"
                aria-pressed={activeDetailTab === tab.key}
                on:click={() => (activeDetailTab = tab.key)}
              >
                {tab.label}
              </button>
            {/each}
          </div>

          {#if activeDetailTab === 'overview'}
            <div class="detail-tab-panel">
              <div
                class="detail-section element-profile-section"
                aria-label={`Element profile. ${detailIdentity.archetype.overviewIdentity}`}
              >
                <div class="element-profile-head">
                  <span>Element Profile</span>
                  <strong class="profile-title-tooltip tooltip-host">
                    {detailElementProfile.variantId.replace(/_/g, ' ')}
                    <span class="tooltip-card profile-tooltip" role="tooltip">
                      <span>Element Profile</span>
                      <strong>{detailElementProfile.variantId.replace(/_/g, ' ')}</strong>
                      <p>{detailIdentity.archetype.overviewIdentity}</p>
                      <small>{detailElementProfile.expressionLine}</small>
                    </span>
                  </strong>
                </div>
                <p class="identity-copy">{detailIdentity.archetype.overviewIdentity}</p>
                <div class="element-pair">
                  <article
                    class="tooltip-host"
                    aria-label={`Primary element. ${detailPrimaryElement?.emotionalMeaning ?? 'Harmony, resonance, expression, and being emotionally heard.'}`}
                  >
                    <span>Primary</span>
                    <strong><Gem size={18} /> {detailPrimaryElement?.label ?? 'Sound'}</strong>
                    <p>{detailPrimaryElement?.emotionalMeaning ?? 'Harmony, resonance, expression, and being emotionally heard.'}</p>
                    <div class="tooltip-card compact-tooltip" role="tooltip">
                      <span>Primary Element</span>
                      <strong>{detailPrimaryElement?.label ?? 'Sound'}</strong>
                      <p>{detailPrimaryElement?.emotionalMeaning ?? 'Harmony, resonance, expression, and being emotionally heard.'}</p>
                    </div>
                  </article>
                  <article
                    class="tooltip-host"
                    aria-label={`Secondary element. ${detailSecondaryElement?.emotionalMeaning ?? 'Hope, warmth, emotional openness, and gentle clarity.'}`}
                  >
                    <span>Secondary</span>
                    <strong><Sparkles size={18} /> {detailSecondaryElement?.label ?? 'Light'}</strong>
                    <p>{detailSecondaryElement?.emotionalMeaning ?? 'Hope, warmth, emotional openness, and gentle clarity.'}</p>
                    <div class="tooltip-card compact-tooltip" role="tooltip">
                      <span>Secondary Element</span>
                      <strong>{detailSecondaryElement?.label ?? 'Light'}</strong>
                      <p>{detailSecondaryElement?.emotionalMeaning ?? 'Hope, warmth, emotional openness, and gentle clarity.'}</p>
                    </div>
                  </article>
                </div>
                <div class="element-domain">
                  <span>Emotional Domain</span>
                  <strong>{detailElementProfile.emotionalDomain}</strong>
                  <p>{detailElementProfile.expressionLine}</p>
                </div>
                <div class="ritual-row" aria-label="Preferred rituals">
                  {#each detailElementProfile.preferredRituals as ritual}
                    <b>{ritual}</b>
                  {/each}
                </div>
              </div>
              <div class="detail-section">
                <span>Personality</span>
                <div class="tag-row">
                  {#each detailIdentity.personality as trait}
                    <b>{trait}</b>
                  {/each}
                </div>
              </div>
              <div class="detail-section">
                <span>Favorite Gifts</span>
                <div class="favorite-gift-grid">
                  {#each favoriteGiftItems as gift (gift.id)}
                    {@const preview = calculateGiftBondGain(detailCompanion, gift)}
                    <button
                      type="button"
                      class="favorite-gift-item tooltip-host"
                      aria-label={`${gift.name}, ${preview.preference} gift`}
                    >
                      <img
                        src={gift.icon}
                        alt=""
                        on:error={(event) => {
                          const image = event.currentTarget as HTMLImageElement;
                          if (!image.src.endsWith(giftFallbackIcon)) image.src = giftFallbackIcon;
                        }}
                      />
                      <span>{gift.name}</span>
                      <small>{gift.categoryDefinition.label}</small>
                      <div class="tooltip-card gift-tooltip" role="tooltip">
                        <span>{gift.rarity} {gift.categoryDefinition.label}</span>
                        <strong>{gift.name}</strong>
                        <p>{gift.description}</p>
                        <em>{preview.response}</em>
                        <b>Expected bond +{preview.bondGain}</b>
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          {:else if activeDetailTab === 'skills'}
            <div class="detail-tab-panel">
              <div class="compact-section-head">
                <span>Companion Gifts</span>
                <strong>{detailCompanion.name}'s Gifts</strong>
              </div>
              {#each giftGroups as group}
                {#if detailIdentity.gifts[group.key].length > 0}
                  <div class="gift-group compact-group">
                    <span>{group.label}</span>
                    <div class="compact-tile-grid">
                    {#each detailIdentity.gifts[group.key] as gift (gift.id)}
                      <button type="button" class="compact-tile gift-card tooltip-host" aria-label={`${gift.name}. ${gift.description}`}>
                        <span class="tile-icon" aria-hidden="true">
                          {#if group.key === 'core'}
                            <Sparkles size={17} />
                          {:else if group.key === 'element'}
                            <Gem size={17} />
                          {:else if group.key === 'bond'}
                            <Heart size={17} fill="currentColor" />
                          {:else}
                            <Star size={17} />
                          {/if}
                        </span>
                        <span class="tile-copy">
                          <strong>{gift.name}</strong>
                          <small>{gift.state}</small>
                        </span>
                        <div class="tooltip-card gift-tooltip" role="tooltip">
                          <span>{group.label}</span>
                          <strong>{gift.name}</strong>
                          <p>{gift.description}</p>
                          <em>{gift.effectSummary}</em>
                          <small>{gift.visualBehavior}</small>
                          {#if gift.state === 'locked'}
                            <b>{gift.unlockCondition}</b>
                          {:else}
                            <b>{gift.state}</b>
                          {/if}
                        </div>
                      </button>
                    {/each}
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          {:else if activeDetailTab === 'growth'}
            <div class="detail-tab-panel">
              <button type="button" class="compact-tile growth-summary tooltip-host">
                <span class="tile-icon" aria-hidden="true"><Sparkles size={17} /></span>
                <span class="tile-copy">
                  <strong>{detailIdentity.growth.currentPath}</strong>
                  <small>Current Growth Path</small>
                </span>
                <div class="tooltip-card growth-tooltip" role="tooltip">
                  <span>Current Growth Path</span>
                  <strong>{detailIdentity.growth.currentPath}</strong>
                  <p>Next: {detailIdentity.growth.nextMilestone?.label ?? 'All current milestones are open.'}</p>
                </div>
              </button>
              <div class="compact-section-head">
                <span>Influence</span>
                <strong>Secondary Element</strong>
              </div>
              <div class="influence-bars compact-tile-grid" aria-label="Secondary element influence">
                {#each detailIdentity.growth.secondaryElementInfluence as influence}
                  <button type="button" class="compact-tile influence-row tooltip-host" aria-label={`${influence.label}: ${influence.value}%`}>
                    <span class="tile-icon" aria-hidden="true"><Gem size={17} /></span>
                    <span class="tile-copy">
                      <strong>{influence.label}</strong>
                      <small>{influence.value}%</small>
                    </span>
                    <div class="influence-track"><span style={`width:${influence.value}%`}></span></div>
                    <div class="tooltip-card compact-tooltip" role="tooltip">
                      <span>Influence</span>
                      <strong>{influence.label} · {influence.value}%</strong>
                      <p>{influence.description}</p>
                    </div>
                  </button>
                {/each}
              </div>
              <div class="compact-section-head">
                <span>Milestones</span>
                <strong>Growth Track</strong>
              </div>
              <div class="milestone-track compact-tile-grid">
                {#each detailIdentity.growth.milestones as milestone}
                  <button type="button" class="compact-tile milestone-tile tooltip-host" class:unlocked={milestone.unlocked}>
                    <span class="milestone-dot" aria-hidden="true"></span>
                    <span class="tile-copy">
                      <strong>{milestone.label}</strong>
                      <small>{milestone.unlocked ? 'Opened' : `Level ${milestone.unlockLevel} or Bond ${milestone.unlockBond}`}</small>
                    </span>
                    <div class="tooltip-card compact-tooltip" role="tooltip">
                      <span>{milestone.unlocked ? 'Opened Milestone' : 'Locked Milestone'}</span>
                      <strong>{milestone.label}</strong>
                      <p>{milestone.description}</p>
                      <b>{milestone.unlocked ? 'Opened' : `Level ${milestone.unlockLevel} or Bond ${milestone.unlockBond}`}</b>
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="detail-tab-panel story-panel">
              <button type="button" class="compact-tile story-card origin tooltip-host">
                <span class="tile-icon" aria-hidden="true"><Sparkles size={17} /></span>
                <span class="tile-copy">
                  <strong>{detailIdentity.story.origin.title}</strong>
                  <small>Origin</small>
                </span>
                <div class="tooltip-card story-tooltip" role="tooltip">
                  <span>Origin</span>
                  <strong>{detailIdentity.story.origin.title}</strong>
                  <p>{detailIdentity.story.origin.body}</p>
                </div>
              </button>
              {#each detailIdentity.story.sharedMemories as memory}
                <button type="button" class="compact-tile story-card tooltip-host">
                  <span class="tile-icon" aria-hidden="true"><Heart size={17} fill="currentColor" /></span>
                  <span class="tile-copy">
                    <strong>{memory.title}</strong>
                    <small>Shared Memory</small>
                  </span>
                  <div class="tooltip-card story-tooltip" role="tooltip">
                    <span>Shared Memory</span>
                    <strong>{memory.title}</strong>
                    <p>{memory.body}</p>
                  </div>
                </button>
              {/each}
              {#each detailIdentity.story.unlockedFragments as fragment}
                <button type="button" class="compact-tile story-card tooltip-host">
                  <span class="tile-icon" aria-hidden="true"><Star size={17} /></span>
                  <span class="tile-copy">
                    <strong>{fragment.title}</strong>
                    <small>{fragment.type}</small>
                  </span>
                  <div class="tooltip-card story-tooltip" role="tooltip">
                    <span>{fragment.type}</span>
                    <strong>{fragment.title}</strong>
                    <p>{fragment.body}</p>
                    <b>{fragment.unlockCondition}</b>
                  </div>
                </button>
              {/each}
              {#each detailIdentity.story.lockedFragments as fragment}
                <button type="button" class="compact-tile story-card locked tooltip-host">
                  <span class="tile-icon" aria-hidden="true"><Shield size={17} /></span>
                  <span class="tile-copy">
                    <strong>{fragment.title}</strong>
                    <small>{fragment.unlockCondition}</small>
                  </span>
                  <div class="tooltip-card story-tooltip" role="tooltip">
                    <span>{fragment.unlockCondition}</span>
                    <strong>{fragment.title}</strong>
                    <p>{fragment.body}</p>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
          <div class="detail-actions">
            <button type="button" class="primary-action interact-action" on:click={() => openCareModal(detailCompanion)}>Interact</button>
            <button type="button" class="secondary-action" on:click={() => openCareModal(detailCompanion)}>Give Gift</button>
          </div>
          <p class="active-note"><span></span> {activeCompanion?.id === detailCompanion.id ? 'Active Companion' : 'Ready to activate'}</p>
        {:else}
          <div class="empty-detail">
            <Sparkles size={36} />
            <h2>No companion yet</h2>
            <p>Your first companion details will appear here once the bond begins.</p>
            <button type="button" class="primary-action" on:click={handleUnlockCta}>Summon companion</button>
          </div>
        {/if}
      </aside>
    </section>
  </main>
</div>


<CompanionModal
  open={Boolean(selectedForCare)}
  companion={selectedForCare}
  evolutionStageLabel={selectedCompanionEvolutionStage}
  archetypeRenderHook={selectedCompanionRenderHook}
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
  title={discoverModal ? `${discoverModal.name} archetype${discoverModal.locked ? ' (locked)' : ''}` : 'Companion archetype'}
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
      <p class="discover-modal__hint">
        Render hook: <code>{discoverModal.renderHook}</code>
      </p>
      {#if discoverModal.locked}
        <p class="discover-modal__hint">This archetype is a placeholder and will unlock in a future release.</p>
      {:else}
        <p class="discover-modal__hint">Unlock hint: keep checking in and expanding your slots to meet new companions.</p>
      {/if}
      <button type="button" class="inline-action" on:click={() => (discoverModal = null)}>Close</button>
    </section>
  {/if}
</Modal>

{#if toast}
  <div class={`toast toast--${toast.kind}`} role="status" aria-live="polite">{toast.message}</div>
{/if}

<style>
  .companions-fantasy-shell {
    display: grid;
    grid-template-columns: 14.25rem minmax(0, 1fr);
    min-height: 100vh;
    background:
      radial-gradient(circle at 80% 8%, rgba(87, 70, 205, 0.22), transparent 36rem),
      radial-gradient(circle at 44% 100%, rgba(125, 66, 210, 0.16), transparent 36rem),
      linear-gradient(180deg, #08091a 0%, #060716 100%);
    color: rgba(248, 246, 255, 0.94);
  }

  .companions-workspace {
    min-width: 0;
    padding: 1.5rem 1.25rem 1.75rem 1.85rem;
  }

  .topbar,
  .topbar-controls,
  .title-row,
  .detail-head,
  .bond-row,
  .slots-panel,
  .tabs-row {
    display: flex;
    align-items: center;
  }

  .topbar {
    gap: 1rem;
    justify-content: space-between;
    margin-bottom: 1.85rem;
  }

  .search-field {
    display: flex;
    min-height: 3rem;
    width: min(100%, 27rem);
    align-items: center;
    gap: 0.75rem;
    border: 1px solid rgba(153, 130, 236, 0.18);
    border-radius: 1rem;
    background: rgba(9, 10, 29, 0.78);
    padding: 0 1rem;
    color: rgba(198, 193, 226, 0.76);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .search-field input,
  .select-field select {
    width: 100%;
    border: 0;
    background: transparent;
    color: rgba(248, 246, 255, 0.9);
    outline: 0;
  }

  .search-field input::placeholder {
    color: rgba(205, 200, 230, 0.56);
  }

  .topbar-controls {
    gap: 0.75rem;
    position: relative;
  }

  .select-field,
  .topbar-action {
    min-height: 2.75rem;
    border: 1px solid rgba(153, 130, 236, 0.18);
    border-radius: 0.95rem;
    background: rgba(10, 11, 31, 0.78);
    color: rgba(248, 246, 255, 0.88);
    text-decoration: none;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .select-field {
    position: relative;
    display: grid;
    grid-template-columns: minmax(7.2rem, 1fr) auto;
    align-items: center;
    gap: 0.45rem;
    padding: 0 0.85rem;
  }

  .select-field > span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .select-field select {
    appearance: none;
    cursor: pointer;
    font-size: 0.86rem;
  }

  .icon-button,
  .profile-pill,
  .shard-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .topbar-menu {
    position: relative;
    display: inline-flex;
    z-index: 80;
  }

  .icon-button {
    position: relative;
    width: 2.75rem;
    border-radius: 999px;
    padding: 0;
  }

  .icon-button:hover,
  .icon-button.is-active,
  .topbar-menu.open .icon-button,
  .topbar-menu.open .profile-pill,
  .profile-pill:hover,
  .profile-pill:focus-visible,
  .soft-button:hover,
  .upgrade-button:hover,
  .primary-action:hover,
  .secondary-action:hover,
  .summon-card:hover,
  .roster-card:hover,
  .collection-card:hover {
    border-color: rgba(179, 113, 255, 0.55);
    transform: translateY(-1px);
  }

  .topbar-badge {
    position: absolute;
    top: -0.22rem;
    right: -0.12rem;
    min-width: 1.08rem;
    height: 1.08rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #a75cff;
    color: white;
    font-size: 0.63rem;
    font-weight: 900;
    box-shadow: 0 0 16px rgba(167, 92, 255, 0.72);
  }

  .shard-pill {
    gap: 0.55rem;
    min-width: 6.2rem;
    padding: 0 0.9rem;
    font-weight: 800;
  }

  .shard-pill :global(svg) {
    filter: drop-shadow(0 0 0.45rem rgba(178, 83, 255, 0.75));
  }

  .profile-pill {
    gap: 0.45rem;
    border-radius: 999px;
    padding: 0 0.42rem;
    cursor: pointer;
  }

  .profile-pill img,
  .profile-pill span {
    width: 2.15rem;
    height: 2.15rem;
    border-radius: 999px;
  }

  .profile-pill img {
    object-fit: cover;
  }

  .profile-pill span {
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #ddaa5c, #a75cff);
    font-weight: 900;
  }

  .topbar-dropdown {
    position: absolute;
    top: calc(100% + 0.72rem);
    right: -0.4rem;
    z-index: 1000;
    width: min(21.5rem, calc(100vw - 2rem));
    border: 1px solid rgba(169, 123, 225, 0.24);
    border-radius: 0.95rem;
    background:
      radial-gradient(circle at 12% 8%, rgba(126, 92, 255, 0.24), transparent 14rem),
      linear-gradient(180deg, rgba(15, 16, 40, 0.98), rgba(8, 10, 27, 0.98));
    box-shadow:
      0 24px 70px rgba(2, 3, 14, 0.62),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    color: rgba(249, 247, 255, 0.95);
    overflow: hidden;
    backdrop-filter: blur(24px);
  }

  .profile-dropdown {
    right: 0;
    width: min(19rem, calc(100vw - 2rem));
  }

  .topbar-dropdown header {
    min-height: 2.85rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgba(169, 123, 225, 0.14);
    padding: 0 0.85rem;
  }

  .topbar-dropdown h2 {
    margin: 0;
    font-size: 0.88rem;
  }

  .topbar-dropdown header button,
  .topbar-dropdown header a {
    border: 0;
    background: transparent;
    color: rgba(221, 211, 246, 0.74);
    font: inherit;
    font-size: 0.68rem;
    text-decoration: none;
    cursor: pointer;
  }

  .topbar-dropdown header button:hover:not(:disabled),
  .topbar-dropdown header button:focus-visible:not(:disabled),
  .topbar-dropdown header a:hover,
  .topbar-dropdown header a:focus-visible {
    color: #ddaa5c;
  }

  .topbar-dropdown header button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .dropdown-list {
    display: grid;
    gap: 0.12rem;
    padding: 0.52rem;
  }

  .dropdown-item {
    min-height: 4.05rem;
    border-radius: 0.6rem;
    display: grid;
    grid-template-columns: 2.35rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.72rem;
    padding: 0.52rem 0.5rem;
    color: inherit;
    text-decoration: none;
  }

  .dropdown-item:hover,
  .dropdown-item:focus-visible {
    background: rgba(169, 123, 225, 0.09);
    outline: none;
  }

  .dropdown-item.unread {
    background: rgba(169, 123, 225, 0.08);
  }

  .dropdown-icon,
  .message-avatar {
    display: grid;
    width: 2.15rem;
    height: 2.15rem;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tone), transparent 36%);
    border-radius: 0.72rem;
    background:
      radial-gradient(circle at 50% 34%, color-mix(in srgb, var(--tone), white 8%), transparent 46%),
      rgba(10, 10, 29, 0.82);
    color: white;
    box-shadow: 0 0 18px color-mix(in srgb, var(--tone), transparent 52%);
  }

  .message-avatar {
    border-radius: 999px;
    overflow: hidden;
    font-size: 0.78rem;
    font-weight: 900;
  }

  .message-avatar img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .dropdown-copy {
    min-width: 0;
    display: grid;
    gap: 0.16rem;
  }

  .dropdown-copy strong,
  .dropdown-copy small,
  .dropdown-copy time {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-copy strong {
    font-size: 0.78rem;
  }

  .dropdown-copy small,
  .dropdown-copy time,
  .dropdown-empty {
    color: rgba(225, 222, 245, 0.7);
    font-size: 0.7rem;
  }

  .dropdown-copy time {
    color: rgba(225, 222, 245, 0.48);
  }

  .dropdown-item i {
    min-width: 1.3rem;
    height: 1.3rem;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: #a75cff;
    color: white;
    font-size: 0.64rem;
    font-style: normal;
    font-weight: 900;
    box-shadow: 0 0 14px rgba(167, 92, 255, 0.7);
  }

  .dropdown-empty {
    margin: 0;
    padding: 1.6rem 0.75rem;
    text-align: center;
  }

  .dropdown-footer {
    min-height: 3.1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-top: 1px solid rgba(169, 123, 225, 0.14);
    padding: 0 1.1rem;
    color: #c99cff;
    font-size: 0.78rem;
    font-weight: 800;
    text-decoration: none;
  }

  .dropdown-footer:hover,
  .dropdown-footer:focus-visible {
    color: #ddaa5c;
  }

  .profile-link {
    grid-template-columns: 2.35rem minmax(0, 1fr);
  }

  .roster-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(19rem, 22rem);
    gap: 1.55rem;
    align-items: start;
  }

  .roster-main {
    min-width: 0;
  }

  .title-row {
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgba(153, 130, 236, 0.16);
    padding-bottom: 0.9rem;
  }

  .title-row h1 {
    margin: 0 0 0.85rem;
    font-size: clamp(1.7rem, 3vw, 2rem);
    letter-spacing: -0.03em;
  }

  .tabs-row {
    gap: 1.8rem;
  }

  .tab {
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: rgba(218, 213, 236, 0.7);
    padding: 0 0 0.7rem;
    cursor: pointer;
  }

  .tab.is-active {
    border-color: #b75cff;
    color: white;
    box-shadow: 0 0.55rem 1.6rem rgba(183, 92, 255, 0.2);
  }

  .soft-button,
  .upgrade-button,
  .primary-action,
  .secondary-action {
    border: 1px solid rgba(153, 130, 236, 0.24);
    border-radius: 0.8rem;
    background: rgba(255, 255, 255, 0.045);
    color: white;
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }

  .soft-button {
    padding: 0.55rem 0.85rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(12rem, 15rem);
    gap: 0.72rem;
    margin: 1.55rem 0 1.45rem;
  }

  .stat-cluster,
  .stat-card {
    border: 1px solid rgba(153, 130, 236, 0.18);
    border-radius: 1.08rem;
    background:
      radial-gradient(circle at 16% 22%, rgba(139, 82, 255, 0.16), transparent 56%),
      rgba(13, 15, 39, 0.84);
  }

  .stat-cluster {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    min-height: 5.15rem;
  }

  .stat-segment {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.72rem;
    padding: 1rem 1.05rem;
  }

  .stat-segment + .stat-segment::before {
    content: '';
    position: absolute;
    left: 0;
    top: 1rem;
    bottom: 1rem;
    width: 1px;
    background: rgba(183, 164, 255, 0.1);
  }

  .stat-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.72rem;
    min-height: 5.15rem;
    padding: 1rem 1.1rem;
  }

  .stat-card strong,
  .stat-segment strong {
    display: block;
    font-size: 1.34rem;
    line-height: 1;
  }

  .stat-card div > span,
  .stat-segment div > span {
    color: rgba(220, 216, 237, 0.78);
    font-size: 0.72rem;
  }

  .stat-orb {
    display: grid;
    width: 2.85rem;
    height: 2.85rem;
    place-items: center;
    border-radius: 999px;
    border: 1px solid transparent;
    background:
      linear-gradient(rgba(13, 15, 39, 0.92), rgba(13, 15, 39, 0.92)) padding-box,
      conic-gradient(currentColor var(--progress, 0%), rgba(255, 255, 255, 0.1) 0) border-box;
    box-shadow: inset 0 0 0 0.48rem rgba(255, 255, 255, 0.035);
  }

  .stat-orb--blue {
    color: #6d8cff;
  }

  .stat-orb--gold {
    color: #ddaa5c;
  }

  .stat-orb--heart {
    color: #ff6fb8;
  }

  .stat-orb--violet {
    color: #b75cff;
    background: rgba(183, 92, 255, 0.17);
    border-color: rgba(255, 255, 255, 0.14);
  }

  .companion-grid,
  .collection-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
  }

  .roster-card,
  .summon-card,
  .collection-card,
  .detail-panel,
  .slots-panel {
    border: 1px solid rgba(153, 130, 236, 0.22);
    background: rgba(13, 15, 38, 0.84);
    box-shadow: 0 1.35rem 3rem rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.045);
  }

  .roster-card,
  .summon-card,
  .collection-card {
    position: relative;
    min-height: 16rem;
    overflow: hidden;
    border-radius: 1rem;
    color: white;
    text-align: left;
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }

  .roster-card {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto auto;
    padding: 0.95rem;
  }

  .roster-card.is-active {
    border-color: rgba(183, 92, 255, 0.78);
    box-shadow: 0 0 0 1px rgba(183, 92, 255, 0.28), 0 1.45rem 3.2rem rgba(88, 43, 181, 0.28);
  }

  .roster-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--card-accent), transparent 44%), transparent 46%),
      linear-gradient(180deg, color-mix(in srgb, var(--card-accent), transparent 88%), transparent 58%);
    opacity: 0.9;
    pointer-events: none;
  }

  .roster-card[data-tone='violet'] {
    --card-accent: #9e5cff;
  }

  .roster-card[data-tone='silver'] {
    --card-accent: #b9c1d3;
  }

  .roster-card[data-tone='ember'] {
    --card-accent: #ff7a2c;
  }

  .roster-card[data-tone='verdant'] {
    --card-accent: #91d34d;
  }

  .active-badge,
  .favorite-star,
  .avatar-stage,
  .roster-copy,
  .roster-foot {
    position: relative;
    z-index: 1;
  }

  .active-badge {
    position: absolute;
    left: 0.8rem;
    top: 0.8rem;
    border-radius: 999px;
    background: rgba(84, 176, 104, 0.9);
    padding: 0.26rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 800;
  }

  .favorite-star {
    position: absolute;
    right: 0.75rem;
    top: 0.75rem;
    color: #ffcc4c;
    filter: drop-shadow(0 0 0.55rem rgba(255, 203, 76, 0.45));
  }

  .avatar-stage {
    display: grid;
    place-items: center;
    min-height: 10.8rem;
  }

  .avatar-stage img {
    width: min(100%, 11.5rem);
    height: 11.5rem;
    object-fit: contain;
    filter: drop-shadow(0 1rem 1.5rem color-mix(in srgb, var(--card-accent), transparent 45%));
  }

  .roster-copy {
    display: grid;
    gap: 0.32rem;
  }

  .roster-copy strong {
    font-size: 1.04rem;
  }

  .roster-copy span,
  .collection-card p,
  .collection-card small {
    color: rgba(220, 216, 237, 0.74);
  }

  .roster-meta-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    color: rgba(220, 216, 237, 0.74);
    font-size: 0.86rem;
  }

  .roster-foot {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    margin-top: 0.65rem;
    border-top: 1px solid rgba(183, 164, 255, 0.12);
    padding-top: 0.5rem;
  }

  .element-dots {
    display: flex;
    gap: 0.32rem;
  }

  .element-dots span {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-accent), #090a1d 35%);
    box-shadow: 0 0 0.7rem color-mix(in srgb, var(--card-accent), transparent 42%);
  }

  .bond-mini {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: #ff75b8;
    font-weight: 800;
  }

  .summon-card {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.55rem;
    border-style: dashed;
    text-align: center;
  }

  .summon-card span {
    display: grid;
    width: 4rem;
    height: 4rem;
    place-items: center;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(248, 246, 255, 0.86);
  }

  .summon-card small {
    color: rgba(220, 216, 237, 0.72);
  }

  .collection-card {
    display: grid;
    gap: 0.75rem;
    align-content: start;
    padding: 1.1rem;
  }

  .slots-panel {
    justify-content: space-between;
    gap: 1.2rem;
    margin-top: 1.6rem;
    border-radius: 1rem;
    padding: 1rem 1.1rem;
  }

  .slots-panel > div:first-child {
    display: flex;
    gap: 0.8rem;
    align-items: center;
    white-space: nowrap;
  }

  .slot-meter {
    flex: 1;
    height: 0.35rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
  }

  .slot-meter span,
  .bond-meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #7d4dff, #db63ff);
    box-shadow: 0 0 1rem rgba(183, 92, 255, 0.58);
  }

  .upgrade-button {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.68rem 0.95rem;
  }

  .upgrade-button img {
    width: 1rem;
    height: 1rem;
  }

  .detail-panel {
    position: sticky;
    z-index: 30;
    top: 1.25rem;
    display: grid;
    gap: 0.48rem;
    overflow: visible;
    border-radius: 1.25rem;
    padding: 0;
    font-size: 0.92rem;
  }

  .detail-hero {
    position: relative;
    min-height: 21.35rem;
    overflow: hidden;
    border-radius: 1.25rem 1.25rem 0 0;
    background:
      radial-gradient(circle at 75% 20%, rgba(67, 151, 255, 0.18), transparent 12%),
      radial-gradient(circle at 58% 38%, rgba(91, 55, 221, 0.26), transparent 34%),
      radial-gradient(circle at 50% 72%, rgba(167, 92, 255, 0.2), transparent 42%),
      linear-gradient(180deg, rgba(14, 17, 52, 0.2) 0%, rgba(10, 11, 31, 0.74) 72%, rgba(13, 15, 38, 0.84) 100%);
    isolation: isolate;
  }

  .detail-hero::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 52%;
    background:
      radial-gradient(70% 44% at 50% 62%, rgba(121, 83, 255, 0.12), transparent 72%),
      linear-gradient(180deg, transparent 0%, rgba(10, 11, 31, 0.58) 54%, rgba(13, 15, 38, 0.86) 100%);
    pointer-events: none;
    z-index: 5;
  }

  .detail-head {
    position: relative;
    z-index: 10;
    align-items: flex-start;
    justify-content: flex-start;
    padding: 1.12rem 1.18rem 0;
  }

  .name-row {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
  }

  .detail-head h2 {
    margin: 0;
    font-size: 1.08rem;
    line-height: 1.1;
  }

  .detail-head span,
  .rarity-row,
  .detail-section > span,
  .active-note {
    color: rgba(220, 216, 237, 0.7);
  }

  .detail-head span {
    display: block;
    margin-top: 0.18rem;
    font-size: 0.75rem;
  }

  .edit-button {
    border: 0;
    background: transparent;
    color: rgba(220, 216, 237, 0.8);
    cursor: pointer;
    line-height: 0;
    padding: 0.12rem;
  }

  .rarity-row {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    margin: 0.58rem 0 0;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .rarity-row img {
    width: 0.9rem;
    height: 0.9rem;
  }

  .detail-model {
    position: absolute;
    inset: 2.42rem 0 0;
    z-index: 4;
    display: grid;
    min-height: 18.9rem;
    place-items: center;
    border-radius: 0;
    background: transparent;
    overflow: visible;
  }

  .detail-model :global(.muse-shell) {
    position: relative;
    z-index: 3;
    width: 100%;
    transform: translateY(0.15rem);
    filter: drop-shadow(0 1.2rem 1.9rem rgba(48, 17, 102, 0.46));
  }

  .model-platform {
    position: absolute;
    left: 50%;
    bottom: -5.4rem;
    z-index: 1;
    width: min(74%, 15.2rem);
    transform: translateX(-50%) perspective(30rem) rotateX(5deg) scaleY(0.72);
    opacity: 0.7;
    filter:
      drop-shadow(0 0 1.1rem rgba(108, 75, 255, 0.44))
      drop-shadow(0 1.1rem 1.3rem rgba(0, 0, 0, 0.38));
    pointer-events: none;
  }

  .hero-particles {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }

  .hero-particles span {
    position: absolute;
    width: 0.22rem;
    height: 0.22rem;
    border-radius: 999px;
    background: #66d8ff;
    box-shadow: 0 0 0.65rem rgba(102, 216, 255, 0.95);
    animation: detailParticleFloat 5.6s ease-in-out infinite;
  }

  .hero-particles span:nth-child(1) {
    left: 18%;
    top: 35%;
  }

  .hero-particles span:nth-child(2) {
    left: 76%;
    top: 19%;
    animation-delay: -1.4s;
  }

  .hero-particles span:nth-child(3) {
    left: 84%;
    top: 42%;
    background: #a97be1;
    animation-delay: -2.6s;
  }

  .hero-particles span:nth-child(4) {
    left: 24%;
    top: 68%;
    background: #ddaa5c;
    animation-delay: -3.2s;
  }

  .hero-particles span:nth-child(5) {
    left: 67%;
    top: 63%;
    animation-delay: -4.1s;
  }

  .hero-particles span:nth-child(6) {
    left: 40%;
    top: 24%;
    width: 0.16rem;
    height: 0.16rem;
    animation-delay: -0.8s;
  }

  .mood-row span,
  .bond-row div,
  .detail-section strong {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
  }

  .mood-row span {
    color: #91f4a4;
    font-weight: 800;
  }

  .mood-row {
    position: relative;
    margin-top: -0.08rem;
  }

  .mood-row::before {
    content: '';
    position: absolute;
    left: -1.18rem;
    right: -1.18rem;
    top: -1.05rem;
    height: 1.25rem;
    background: linear-gradient(180deg, rgba(13, 15, 38, 0), rgba(13, 15, 38, 0.86));
    pointer-events: none;
  }

  .bond-row {
    justify-content: space-between;
    color: rgba(248, 246, 255, 0.9);
  }

  .mood-row,
  .bond-row,
  .bond-meter,
  .detail-tabs,
  .detail-tab-panel,
  .detail-actions,
  .active-note {
    margin-left: 1.18rem;
    margin-right: 1.18rem;
  }

  .bond-row :global(svg) {
    color: #ff75b8;
  }

  .bond-meter {
    height: 0.32rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
  }

  .detail-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-bottom: 1px solid rgba(153, 130, 236, 0.15);
  }

  .detail-tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: rgba(220, 216, 237, 0.64);
    padding: 0.62rem 0.15rem;
    cursor: pointer;
    font-size: 0.76rem;
  }

  .detail-tabs button.is-active {
    border-color: #b75cff;
    color: white;
  }

  .detail-section {
    display: grid;
    gap: 0.46rem;
  }

  .detail-tab-panel {
    display: grid;
    gap: 0.55rem;
    max-height: none;
    overflow: visible;
    padding-right: 0.18rem;
  }

  .detail-tab-panel::-webkit-scrollbar {
    width: 0.38rem;
  }

  .detail-tab-panel::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(183, 92, 255, 0.35);
  }

  .element-profile-section {
    position: relative;
    border: 1px solid rgba(153, 130, 236, 0.16);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 20% 0%, rgba(183, 92, 255, 0.13), transparent 52%),
      rgba(255, 255, 255, 0.035);
    padding: 0.68rem;
  }

  .element-profile-section:focus-visible,
  .element-pair article:focus-visible,
  .favorite-gift-item:focus-visible {
    outline: 2px solid rgba(183, 92, 255, 0.72);
    outline-offset: 2px;
  }

  .identity-copy {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .element-profile-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .element-profile-head > span,
  .element-pair article > span,
  .element-domain > span {
    color: rgba(220, 216, 237, 0.68);
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .element-profile-head strong {
    color: #ddaa5c;
    font-size: 0.8rem;
  }

  .profile-title-tooltip {
    position: relative;
    cursor: help;
  }

  .element-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.48rem;
  }

  .element-pair article,
  .element-domain {
    display: grid;
    position: relative;
    gap: 0.3rem;
    border: 1px solid rgba(153, 130, 236, 0.12);
    border-radius: 0.78rem;
    background: rgba(9, 10, 29, 0.38);
    padding: 0.58rem;
  }

  .tooltip-host {
    isolation: isolate;
  }

  .tooltip-card {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 0.58rem);
    z-index: 1000;
    display: grid;
    width: min(18.5rem, calc(100vw - 2rem));
    gap: 0.34rem;
    padding: 0.84rem 0.9rem;
    border: 1px solid rgba(153, 130, 236, 0.28);
    border-radius: 0.92rem;
    background:
      radial-gradient(circle at 16% 0%, rgba(183, 92, 255, 0.24), transparent 58%),
      radial-gradient(circle at 92% 12%, rgba(221, 170, 92, 0.14), transparent 48%),
      rgba(10, 11, 31, 0.97);
    box-shadow: 0 1.1rem 2.6rem rgba(3, 5, 14, 0.58), 0 0 1.2rem rgba(183, 92, 255, 0.16);
    color: rgba(235, 231, 248, 0.86);
    font-size: 0.78rem;
    line-height: 1.42;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 0.38rem) scale(0.98);
    transform-origin: bottom center;
    transition: opacity 150ms ease, transform 150ms ease;
    visibility: hidden;
    backdrop-filter: blur(16px);
    text-align: left;
  }

  .tooltip-card::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    width: 0;
    height: 0;
    border-left: 0.42rem solid transparent;
    border-right: 0.42rem solid transparent;
    border-top: 0.42rem solid rgba(10, 11, 31, 0.97);
    transform: translateX(-50%);
  }

  .tooltip-host:hover > .tooltip-card,
  .tooltip-host:focus-within > .tooltip-card,
  .tooltip-host:focus-visible > .tooltip-card {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
    visibility: visible;
  }

  .tooltip-card > span {
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
    clip: auto;
    color: #ddaa5c;
    font-size: 0.64rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .tooltip-card strong {
    color: rgba(255, 250, 242, 0.98);
    font-size: 0.9rem;
    line-height: 1.25;
  }

  .tooltip-card p,
  .tooltip-card small,
  .tooltip-card em,
  .tooltip-card b {
    position: static;
    width: auto;
    height: auto;
    margin: 0;
    overflow: visible;
    clip: auto;
    color: rgba(220, 216, 237, 0.76);
    font-size: 0.78rem;
    font-style: normal;
    font-weight: 700;
    line-height: 1.42;
  }

  .tooltip-card small {
    border-top: 1px solid rgba(153, 130, 236, 0.16);
    margin-top: 0.18rem;
    padding-top: 0.48rem;
  }

  .tooltip-card em {
    color: rgba(255, 234, 196, 0.9);
  }

  .tooltip-card b {
    width: fit-content;
    border: 1px solid rgba(221, 170, 92, 0.22);
    border-radius: 999px;
    background: rgba(221, 170, 92, 0.09);
    color: rgba(255, 234, 196, 0.94);
    padding: 0.26rem 0.54rem;
    font-size: 0.7rem;
  }

  .profile-tooltip {
    left: auto;
    right: 0;
    bottom: calc(100% + 0.64rem);
    width: min(18.5rem, calc(100vw - 2rem));
    transform: translateY(0.38rem) scale(0.98);
    transform-origin: bottom right;
  }

  .tooltip-host:hover > .profile-tooltip,
  .tooltip-host:focus-within > .profile-tooltip,
  .tooltip-host:focus-visible > .profile-tooltip {
    transform: translateY(0) scale(1);
  }

  .compact-tooltip {
    width: min(15.5rem, calc(100vw - 2rem));
  }

  .element-pair article p,
  .element-domain p {
    display: none;
  }

  .element-domain strong {
    color: rgba(248, 246, 255, 0.95);
  }

  .element-domain {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }

  .tag-row,
  .ritual-row,
  .detail-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .tag-row b,
  .ritual-row b {
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.075);
    padding: 0.3rem 0.62rem;
    font-size: 0.78rem;
  }

  .ritual-row b {
    border: 1px solid rgba(221, 170, 92, 0.22);
    background: rgba(221, 170, 92, 0.08);
    color: rgba(255, 234, 196, 0.94);
  }

  .section-heading,
  .growth-summary,
  .gift-group,
  .gift-card,
  .influence-row,
  .milestone-track,
  .story-card {
    display: grid;
    gap: 0.55rem;
  }

  .compact-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .compact-section-head span,
  .compact-group > span {
    color: #a97be1;
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .compact-section-head strong {
    color: rgba(248, 246, 255, 0.94);
    font-size: 0.86rem;
  }

  .compact-group {
    display: grid;
    gap: 0.45rem;
  }

  .compact-tile-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .compact-tile {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.55rem;
    min-height: 3.45rem;
    border: 1px solid rgba(153, 130, 236, 0.16);
    border-radius: 0.8rem;
    background:
      radial-gradient(circle at 50% 0%, rgba(183, 92, 255, 0.12), transparent 60%),
      rgba(255, 255, 255, 0.045);
    color: rgba(248, 246, 255, 0.92);
    cursor: help;
    font: inherit;
    padding: 0.52rem 0.58rem;
    text-align: left;
  }

  .compact-tile:hover,
  .compact-tile:focus-visible {
    border-color: rgba(183, 92, 255, 0.48);
    outline: none;
    box-shadow: 0 0 1.1rem rgba(183, 92, 255, 0.16);
  }

  .tile-icon {
    display: grid;
    width: 2.12rem;
    height: 2.12rem;
    place-items: center;
    border: 1px solid rgba(221, 170, 92, 0.22);
    border-radius: 0.7rem;
    background:
      radial-gradient(circle at 50% 34%, rgba(221, 170, 92, 0.22), transparent 52%),
      rgba(10, 11, 31, 0.58);
    color: #ddaa5c;
  }

  .tile-copy {
    display: grid;
    min-width: 0;
    gap: 0.18rem;
  }

  .tile-copy strong,
  .tile-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-copy strong {
    color: rgba(255, 250, 242, 0.96);
    font-size: 0.78rem;
    line-height: 1.18;
  }

  .tile-copy small {
    color: rgba(220, 216, 237, 0.64);
    font-size: 0.68rem;
    font-weight: 800;
    text-transform: capitalize;
  }

  .compact-tile .tooltip-card {
    bottom: calc(100% + 0.5rem);
  }

  .growth-summary {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .influence-row {
    grid-template-columns: auto minmax(0, 1fr);
    align-content: center;
  }

  .influence-row .influence-track {
    grid-column: 1 / -1;
  }

  .milestone-tile {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .milestone-dot {
    width: 0.78rem;
    height: 0.78rem;
    border: 1px solid rgba(153, 130, 236, 0.44);
    border-radius: 999px;
    background: rgba(13, 15, 38, 0.95);
    box-shadow: 0 0 0.9rem rgba(183, 92, 255, 0.22);
  }

  .milestone-tile.unlocked .milestone-dot {
    background: #a75cff;
    box-shadow: 0 0 1rem rgba(183, 92, 255, 0.72);
  }

  .section-heading > span,
  .gift-group > span,
  .growth-summary > span,
  .story-card > span {
    color: #a97be1;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .section-heading strong,
  .growth-summary strong {
    color: rgba(248, 246, 255, 0.96);
    font-size: 1rem;
  }

  .growth-summary,
  .gift-card,
  .story-card {
    border: 1px solid rgba(153, 130, 236, 0.15);
    border-radius: 0.85rem;
    background: rgba(255, 255, 255, 0.045);
    padding: 0.78rem;
  }

  .gift-card {
    grid-template-columns: minmax(0, 1fr);
  }

  .gift-card strong,
  .story-card strong,
  .milestone-track strong {
    color: rgba(255, 250, 242, 0.96);
  }

  .gift-card p,
  .growth-summary p,
  .influence-row p,
  .milestone-track p,
  .story-card p {
    margin: 0;
    color: rgba(220, 216, 237, 0.66);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .gift-card small,
  .milestone-track small {
    width: fit-content;
    border: 1px solid rgba(153, 130, 236, 0.16);
    border-radius: 999px;
    background: rgba(10, 11, 31, 0.56);
    color: rgba(230, 225, 244, 0.74);
    font-size: 0.7rem;
    font-style: normal;
    font-weight: 800;
    padding: 0.26rem 0.5rem;
    text-transform: capitalize;
  }

  .influence-row > div:first-child {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    color: rgba(248, 246, 255, 0.9);
    font-size: 0.82rem;
    font-weight: 800;
  }

  .influence-track {
    height: 0.34rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .influence-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #7d4dff, #ddaa5c);
    box-shadow: 0 0 1rem rgba(183, 92, 255, 0.5);
  }

  .milestone-track {
    position: relative;
  }

  .story-panel {
    max-height: 24rem;
  }

  .story-card.origin {
    background:
      radial-gradient(circle at 18% 0%, rgba(221, 170, 92, 0.13), transparent 52%),
      rgba(255, 255, 255, 0.045);
  }

  .story-card.locked {
    border-style: dashed;
    opacity: 0.78;
  }

  .growth-summary.compact-tile,
  .gift-card.compact-tile,
  .story-card.compact-tile {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.55rem;
    min-height: 3.45rem;
    padding: 0.52rem 0.58rem;
  }

  .story-card.origin.compact-tile {
    background:
      radial-gradient(circle at 18% 0%, rgba(221, 170, 92, 0.16), transparent 56%),
      rgba(255, 255, 255, 0.045);
  }

  .favorite-gift-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .favorite-gift-item {
    position: relative;
    display: grid;
    min-height: 3.82rem;
    place-items: center;
    border: 1px solid rgba(153, 130, 236, 0.16);
    border-radius: 0.8rem;
    background:
      radial-gradient(circle at 50% 0%, rgba(221, 170, 92, 0.12), transparent 60%),
      rgba(255, 255, 255, 0.055);
    color: rgba(248, 246, 255, 0.9);
    cursor: help;
    padding: 0.38rem;
    text-align: center;
  }

  .favorite-gift-item img {
    width: 1.78rem;
    height: 1.78rem;
    object-fit: contain;
    filter: drop-shadow(0 0 0.45rem rgba(183, 92, 255, 0.45));
  }

  .favorite-gift-item span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    font-size: 0.74rem;
    font-weight: 900;
    line-height: 1.1;
  }

  .favorite-gift-item small {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .element-pair article .tooltip-card p,
  .favorite-gift-item .tooltip-card > span,
  .favorite-gift-item .tooltip-card p,
  .favorite-gift-item .tooltip-card em,
  .favorite-gift-item .tooltip-card b {
    position: static;
    display: block;
    width: auto;
    height: auto;
    overflow: visible;
    clip: auto;
  }

  .detail-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .primary-action,
  .secondary-action {
    min-height: 2.72rem;
    border: 1px solid rgba(153, 130, 236, 0.24);
    border-radius: 0.82rem;
    color: rgba(255, 255, 255, 0.96);
    font-weight: 900;
    font-size: 0.82rem;
    cursor: pointer;
    transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease, filter 150ms ease;
  }

  .primary-action {
    border-color: rgba(207, 100, 255, 0.5);
    background: linear-gradient(135deg, #745cff, #cf55ff);
    box-shadow: 0 0.8rem 1.7rem rgba(158, 82, 255, 0.3);
  }

  .primary-action:hover,
  .secondary-action:hover {
    transform: translateY(-1px);
  }

  .primary-action:focus-visible,
  .secondary-action:focus-visible {
    outline: 2px solid rgba(183, 92, 255, 0.72);
    outline-offset: 2px;
  }

  .interact-action {
    min-height: 3.18rem;
    border: 1px solid rgba(190, 145, 255, 0.68);
    border-radius: 1.02rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), transparent 42%),
      linear-gradient(135deg, #5d45f5 0%, #7f35ee 48%, #b23df0 100%);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.12),
      inset 0 0.08rem 0 rgba(255, 255, 255, 0.24),
      0 0 0.72rem rgba(128, 92, 255, 0.4),
      0 0.92rem 1.7rem rgba(83, 42, 190, 0.36);
    font-size: 1.02rem;
    letter-spacing: 0;
    text-shadow: 0 0.08rem 0.18rem rgba(20, 10, 56, 0.45);
  }

  .interact-action:hover {
    border-color: rgba(221, 205, 255, 0.86);
    filter: saturate(1.08) brightness(1.06);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.14),
      inset 0 0.08rem 0 rgba(255, 255, 255, 0.28),
      0 0 0.92rem rgba(144, 104, 255, 0.5),
      0 1rem 1.9rem rgba(83, 42, 190, 0.42);
  }

  .active-note {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 1.18rem 0.72rem;
    border-top: 1px solid rgba(153, 130, 236, 0.12);
    padding: 0.82rem 0.25rem 0.72rem;
    font-size: 0.82rem;
  }

  .active-note span {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    background: #73eb83;
    box-shadow: 0 0 0.65rem rgba(115, 235, 131, 0.7);
  }

  .empty-detail {
    display: grid;
    min-height: 30rem;
    place-items: center;
    align-content: center;
    gap: 0.85rem;
    text-align: center;
    color: rgba(220, 216, 237, 0.74);
  }

  @media (max-width: 1280px) {
    .companions-fantasy-shell {
      grid-template-columns: 1fr;
    }

    .roster-layout {
      grid-template-columns: 1fr;
    }

    .detail-panel {
      position: relative;
      top: auto;
    }
  }

  @media (max-width: 960px) {
    .companions-workspace {
      padding: 1rem 1rem calc(5.5rem + env(safe-area-inset-bottom));
    }

    .topbar,
    .topbar-controls,
    .title-row,
    .slots-panel {
      align-items: stretch;
      flex-direction: column;
    }

    .search-field {
      width: 100%;
    }

    .topbar-controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stats-grid,
    .companion-grid,
    .collection-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    .topbar-controls,
    .stats-grid,
    .companion-grid,
    .collection-grid,
    .detail-actions {
      grid-template-columns: 1fr;
    }

    .roster-card,
    .summon-card,
    .collection-card {
      min-height: 14rem;
    }

    .stat-cluster {
      grid-template-columns: 1fr;
    }

    .stat-segment + .stat-segment::before {
      inset: 0.05rem 1rem auto;
      width: auto;
      height: 1px;
    }
  }

  @keyframes detailParticleFloat {
    0%,
    100% {
      opacity: 0.28;
      transform: translate3d(0, 0.45rem, 0) scale(0.82);
    }
    45% {
      opacity: 1;
      transform: translate3d(0.28rem, -0.45rem, 0) scale(1.18);
    }
  }
</style>
