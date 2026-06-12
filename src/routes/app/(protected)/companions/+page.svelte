<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { onDestroy, onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import {
    ChevronDown,
    Gem,
    Heart,
    BookOpen,
    Lock,
    Pencil,
    Play,
    Plus,
    Shield,
    SlidersHorizontal,
    Smile,
    Sparkles,
    Star,
    TrendingUp
  } from 'lucide-svelte';
  import type { PageData } from './$types';
  import type { Companion } from '$lib/stores/companions';
  import { createCompanionRosterState } from '$lib/stores/companionRosterState';
  import GiftPathModal from '$lib/components/companions/GiftPathModal.svelte';
  import GrowthPathModal from '$lib/components/companions/GrowthPathModal.svelte';
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
  import ProtectedTopbar from '$lib/components/layout/ProtectedTopbar.svelte';
  import { getCompanionMoodMeta } from '$lib/companions/moodMeta';
  import { DEFAULT_COMPANION_COSMETICS, normalizeCompanionCosmetics } from '$lib/companions/cosmetics';
  import {
    getCompanionIdentity,
    getElementById,
    getGiftUnlockState,
    type CompanionGift,
    type GiftCategory
  } from '$lib/companions/identity';
  import { getFavoriteGiftItemsForCompanion, calculateGiftBondGain } from '$lib/companions/giftPreferences';
  import { computeCompanionEffectiveState, formatLastCareLabel } from '$lib/companions/effectiveState';
  import { pickMuseAnimationForMood } from '$lib/companions/museAnimations';
  import { logEvent } from '$lib/analytics';
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

  type GiftPathRow = CompanionGift & {
    displayState: ReturnType<typeof getGiftUnlockState>;
    displayLevel: number;
    iconElement: string;
  };

  type GiftPathSummaryRow = {
    label: string;
    value: string;
  };

  type GrowthMilestoneView = {
    title: string;
    description: string;
    time: string;
    type: 'level' | 'bond' | 'gift' | 'trait' | 'story' | 'ritual';
  };

  type StoryMemoryView = {
    index: number;
    title: string;
    label: string;
    body: string;
    unlocked: boolean;
    unlockCondition: string;
  };

  const elementProfileDisplayLabels: Record<string, string> = {
    sound_light: 'Radiant Muse',
    sound_dream: 'Dreamsong Muse',
    sound_tide: 'Tidal Muse',
    sound_spark: 'Pulse Muse',
    sound_echo: 'Echo Muse',
    ember_root: 'Hearth Guardian',
    spark_light: 'Radiant Spark',
    root_tide: 'Tidal Root',
    echo_dream: 'Dream Archive Echo'
  };

  const giftCategoryLabels: Record<GiftCategory, string> = {
    core: 'Core Gift',
    element: 'Element Gift',
    bond: 'Bond Gift',
    story: 'Story Gift'
  };

  const growthStages = [
    { label: 'Hatchling', unlockLevel: 1 },
    { label: 'Youngling', unlockLevel: 4 },
    { label: 'Companion', unlockLevel: 8 },
    { label: 'Guardian', unlockLevel: 14 },
    { label: 'Ascendant', unlockLevel: 20 }
  ];

  const SAFE_LOAD_ERROR = 'Something didn\'t load. Try again.';
  const CARE_STALE_HOURS = 18;
  const LOW_ENERGY_THRESHOLD = 25;
  let nowTick = Date.now();
  let nowTimer: number | null = null;

  const titleCase = (value: string) =>
    value
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

  const getElementProfileDisplayLabel = (variantId: string | null | undefined) => {
    const key = (variantId ?? '').trim().toLowerCase();
    return elementProfileDisplayLabels[key] ?? titleCase(variantId ?? 'Element Profile');
  };

  const getElementAssetPath = (elementId: string | null | undefined) => {
    const normalized = (elementId ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return normalized ? `/assets/Elements/element-${normalized}.png` : '/assets/Elements/element-light.png';
  };

  const giftIconElement = (gift: CompanionGift, fallback: string) =>
    gift.elementRequirement?.secondary ?? gift.elementRequirement?.primary ?? fallback;

  const giftDisplayLevel = (gift: CompanionGift, bond: number, level: number) => {
    if (gift.state === 'locked') return gift.level;
    if (gift.category === 'core') return Math.max(gift.level, Math.min(gift.maxLevel, Math.ceil(level / 6)));
    if (gift.category === 'element') return Math.max(gift.level, Math.min(gift.maxLevel, Math.ceil(bond / 25)));
    if (gift.category === 'bond') return Math.max(gift.level, Math.min(gift.maxLevel, Math.ceil(bond / 20)));
    return gift.level;
  };

  const buildGiftPathRows = (companion: Companion | null | undefined, identity: ReturnType<typeof getCompanionIdentity>) => {
    const bond = identity.bond;
    const fallbackElement = identity.elementProfile.secondary ?? identity.elementProfile.primary;
    return (Object.entries(identity.gifts) as Array<[GiftCategory, CompanionGift[]]>).reduce(
      (acc, [category, gifts]) => {
        const rows = gifts
          .map((gift) => ({
            ...gift,
            displayState: getGiftUnlockState(companion, gift),
            displayLevel: giftDisplayLevel(gift, bond, identity.level),
            iconElement: giftIconElement(gift, fallbackElement)
          }))
          .filter((gift) => category !== 'story' || gift.displayState !== 'locked');
        if (rows.length) acc[category] = rows;
        return acc;
      },
      {} as Partial<Record<GiftCategory, GiftPathRow[]>>
    );
  };

  const flattenGiftPathEntries = (entries: Array<[GiftCategory, GiftPathRow[]]>) => entries.flatMap(([, gifts]) => gifts);

  const getFeaturedGift = (entries: Array<[GiftCategory, GiftPathRow[]]>) => {
    const gifts = flattenGiftPathEntries(entries);
    const activeCore = gifts
      .filter((gift) => gift.category === 'core' && gift.displayState === 'active')
      .sort((a, b) => b.displayLevel - a.displayLevel);
    return (
      activeCore[0] ??
      gifts.find((gift) => gift.displayState === 'active') ??
      gifts.find((gift) => gift.displayState === 'evolving') ??
      gifts[0] ??
      null
    );
  };

  const giftRequiredValue = (gift: GiftPathRow, key: 'Bond' | 'Level') => {
    if (key === 'Bond' && gift.requiredBond != null) return gift.requiredBond;
    if (key === 'Level' && gift.requiredLevel != null) return gift.requiredLevel;
    const match = gift.unlockConditionLabel.match(new RegExp(`${key}\\s*(\\d+)`, 'i'));
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };

  const getNextUnlockableGift = (entries: Array<[GiftCategory, GiftPathRow[]]>) =>
    flattenGiftPathEntries(entries)
      .filter((gift) => gift.displayState === 'locked')
      .sort((a, b) => {
        const aBond = giftRequiredValue(a, 'Bond');
        const bBond = giftRequiredValue(b, 'Bond');
        if (aBond !== bBond) return aBond - bBond;
        const aLevel = giftRequiredValue(a, 'Level');
        const bLevel = giftRequiredValue(b, 'Level');
        if (aLevel !== bLevel) return aLevel - bLevel;
        if (a.category === 'bond' && b.category !== 'bond') return -1;
        if (b.category === 'bond' && a.category !== 'bond') return 1;
        return 0;
      })[0] ?? null;

  const getGiftPathSummary = (entries: Array<[GiftCategory, GiftPathRow[]]>): GiftPathSummaryRow[] =>
    entries.map(([category, gifts]) => {
      const activeCount = gifts.filter((gift) => gift.displayState === 'active').length;
      const evolvingCount = gifts.filter((gift) => gift.displayState === 'evolving').length;
      const lockedCount = gifts.filter((gift) => gift.displayState === 'locked').length;
      const pieces = [
        activeCount > 0 ? `${activeCount} active` : null,
        evolvingCount > 0 ? `${evolvingCount} evolving` : null,
        lockedCount > 0 ? `${lockedCount} locked` : null
      ].filter(Boolean);
      return {
        label: `${giftCategoryLabels[category]}s`,
        value: pieces.length ? pieces.join(' · ') : 'Quiet'
      };
    });

  const getGrowthStageIndex = (level: number) => {
    let index = 0;
    growthStages.forEach((stage, stageIndex) => {
      if (level >= stage.unlockLevel) index = stageIndex;
    });
    return index;
  };

  const getGrowthResonance = (bond: number, level: number) => {
    const score = bond * 0.7 + level * 2;
    if (score >= 92) return { potential: 'Exceptional', harmony: 'Radiant' };
    if (score >= 72) return { potential: 'High', harmony: 'Flourishing' };
    if (score >= 42) return { potential: 'Steady', harmony: 'Steady' };
    if (score >= 14) return { potential: 'Steady', harmony: 'Stirring' };
    return { potential: 'Low', harmony: 'Dormant' };
  };

  const buildStoryMemories = (identity: ReturnType<typeof getCompanionIdentity>): StoryMemoryView[] => {
    const unlockedFragments = [identity.story.origin, ...identity.story.sharedMemories, ...identity.story.unlockedFragments];
    const lockedFragments = identity.story.lockedFragments;
    const defaults = [
      'A Spark of Life',
      'First Awakening',
      'Bonds Formed',
      'Trials of Trust',
      'Embracing Purpose',
      'A Future Together'
    ];
    return defaults.map((title, index) => {
      const unlocked = unlockedFragments[index] ?? null;
      const locked = lockedFragments[index - unlockedFragments.length] ?? null;
      const fragment = unlocked ?? locked;
      const isUnlocked = Boolean(unlocked);
      return {
        index: index + 1,
        title: index === 0 ? title : fragment?.title ?? title,
        label: isUnlocked ? (index === 0 ? 'The beginning' : fragment?.type ?? 'Memory') : 'Locked',
        body:
          fragment?.body ??
          `${identity.name}'s next memory is still gathering. Return through rituals, gifts, and shared moments to open it.`,
        unlocked: isUnlocked,
        unlockCondition: isUnlocked ? 'Unlocked' : fragment?.unlockCondition ?? 'Continue the bond'
      };
    });
  };

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

  let discoverModal: DiscoverCompanionDefinition | null = null;
  let museHostRef: MuseModel | null = null;
  let detailModelLoaded = false;
  let detailModelCompanionId: string | null = null;
  let giftPathOpen = false;
  let giftPathSelectedGiftId: string | null = null;
  let growthPathOpen = false;
  let storyMemoriesOpen = false;
  let careActing: 'feed' | 'play' | 'groom' | null = null;
  let selectedStoryMemoryIndex = 1;

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
    showToast('Companion pop-up interactions are temporarily disabled while this page is rebuilt.');
    logEvent('companion_interaction_deferred', { id: companion.id });
  };

  const performInlineCare = async (companion: Companion, action: 'feed' | 'play' | 'groom') => {
    if (careActing) return;
    careActing = action;
    try {
      const response = await fetch('/api/companions/care', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companionId: companion.id, action })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.companion) {
        showToast(payload?.message ?? 'That care action is not available right now.', 'error');
        return;
      }
      const updated = payload.companion as Companion;
      companionState.updateCompanionStats(companion.id, {
        affection: updated.affection,
        trust: updated.trust,
        energy: updated.energy,
        mood: updated.mood,
        bond_level: updated.bond_level ?? updated.stats?.bond_level ?? 0,
        bond_score: updated.bond_score ?? updated.stats?.bond_score ?? 0,
        stats: updated.stats ?? null
      });
      rosterState = get(companionState);
      showToast(
        payload.itemUnlock?.title
          ? `${payload.itemUnlock.title} earned. It is now in your Inventory.`
          : `${companion.name} received your care.`
      );
    } catch {
      showToast('That care action could not be completed.', 'error');
    } finally {
      careActing = null;
    }
  };

  const openGiftPath = (gift: GiftPathRow | null = null) => {
    giftPathSelectedGiftId = gift?.id ?? featuredGift?.id ?? null;
    giftPathOpen = true;
  };

  const openGrowthPath = () => {
    growthPathOpen = true;
  };

  const openStoryMemories = () => {
    selectedStoryMemoryIndex = activeStoryMemory?.index ?? 1;
    storyMemoriesOpen = true;
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
  $: activeCompanionSanctuaryHref = '/app/sanctuary';
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
  $: detailEffective = detailCompanion ? computeCompanionEffectiveState(detailCompanion, new Date(nowTick)) : null;
  $: if ((detailCompanion?.id ?? null) !== detailModelCompanionId) {
    detailModelCompanionId = detailCompanion?.id ?? null;
    detailModelLoaded = !detailCompanion;
  }
  $: showCompanionsSplash = !hydrated || !detailModelLoaded;
  $: detailIdentity = getCompanionIdentity(detailCompanion);
  $: detailElementProfile = detailIdentity.elementProfile;
  $: detailPrimaryElement = getElementById(detailElementProfile.primary);
  $: detailSecondaryElement = getElementById(detailElementProfile.secondary);
  $: detailElementProfileLabel = getElementProfileDisplayLabel(detailElementProfile.variantId);
  $: detailPrimaryElementAsset = getElementAssetPath(detailElementProfile.primary);
  $: detailSecondaryElementAsset = getElementAssetPath(detailElementProfile.secondary);
  $: detailGiftPath = buildGiftPathRows(detailCompanion, detailIdentity);
  $: detailGiftPathEntries = Object.entries(detailGiftPath) as Array<[GiftCategory, GiftPathRow[]]>;
  $: featuredGift = getFeaturedGift(detailGiftPathEntries);
  $: nextUnlockGift = getNextUnlockableGift(detailGiftPathEntries);
  $: giftPathSummary = getGiftPathSummary(detailGiftPathEntries);
  $: detailLevel = companionLevel(detailCompanion);
  $: detailBond = companionBondScore(detailCompanion);
  $: growthStageIndex = getGrowthStageIndex(detailLevel);
  $: currentGrowthStage = growthStages[growthStageIndex] ?? { label: 'Hatchling', unlockLevel: 1 };
  $: nextGrowthStage = growthStages[growthStageIndex + 1] ?? null;
  $: growthXpCurrent = Math.min(5000, Math.max(0, Math.round(detailLevel * 180 + detailBond * 12)));
  $: growthXpTarget = 5000;
  $: growthXpPercent = growthXpTarget > 0 ? Math.min(100, Math.round((growthXpCurrent / growthXpTarget) * 100)) : 0;
  $: unlockedGiftCount = flattenGiftPathEntries(detailGiftPathEntries).filter((gift) => gift.displayState !== 'locked').length;
  $: growthResonance = getGrowthResonance(detailBond, detailLevel);
  $: xpBonusPercent = Math.min(45, Math.max(0, Math.round(detailLevel * 0.72 + detailBond * 0.06)));
  $: recentGrowthMilestones = (
    [
      {
        title: `Reached Level ${detailLevel}`,
        description: 'Your shared journey has opened a new stage.',
        time: '2h ago',
        type: 'level'
      },
      featuredGift
        ? {
            title: `Learned ${featuredGift.name}`,
            description: 'Opened a new companion Gift.',
            time: '1d ago',
            type: 'gift'
          }
        : null,
      {
        title: `Bond increased to ${detailBond}%`,
        description: `You and ${detailCompanion?.name ?? 'your companion'} are growing closer.`,
        time: '2d ago',
        type: 'bond'
      },
      {
        title: `Unlocked Growth Trait: ${detailIdentity.personality[0] ?? 'Intuitive'}`,
        description: `${detailCompanion?.name ?? 'Your companion'} gained a new trait.`,
        time: '3d ago',
        type: 'trait'
      }
    ].filter(Boolean) as GrowthMilestoneView[]
  );
  $: storyMemories = buildStoryMemories(detailIdentity);
  $: unlockedStoryMemories = storyMemories.filter((memory) => memory.unlocked);
  $: storyProgressPercent =
    storyMemories.length > 0 ? Math.min(100, Math.round((unlockedStoryMemories.length / storyMemories.length) * 100)) : 0;
  $: activeStoryMemory =
    storyMemories.find((memory) => memory.index === selectedStoryMemoryIndex) ?? unlockedStoryMemories[0] ?? storyMemories[0] ?? null;
  $: nextStoryMemory = storyMemories.find((memory) => !memory.unlocked) ?? null;
  $: favoriteGiftItems = getFavoriteGiftItemsForCompanion(detailCompanion, 4);
  $: slotsPercent = maxSlots > 0 ? Math.min(100, Math.round((slotsUsed / maxSlots) * 100)) : 0;


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
  <title>Memvoya - Companions</title>
</svelte:head>

<div class="companions-fantasy-shell">
  {#if showCompanionsSplash}
    <div class="page-splash" role="status" aria-live="polite" aria-label="Loading companions">
      <div class="page-splash__orb" aria-hidden="true"></div>
      <div class="page-splash__copy">
        <strong>Calling companions</strong>
        <span>{detailCompanion ? `Preparing ${detailCompanion.name}` : 'Preparing your roster'}...</span>
      </div>
    </div>
  {/if}

  <FantasySidebar
    activePath="/app/companions"
    playerName={($page.data?.profile as any)?.display_name ?? ($page.data?.user as any)?.email?.split('@')[0] ?? 'Traveler'}
    level={Math.max(1, Math.floor(($page.data as any)?.headerStats?.level ?? masteryLevel ?? 1))}
    xp={Math.max(0, Math.floor(($page.data as any)?.headerStats?.xp ?? 0))}
    xpNext={Math.max(100, Math.floor(($page.data as any)?.headerStats?.xp_next ?? 100))}
  />

  <main class="companions-workspace" aria-label="Companions">
    <ProtectedTopbar
      searchValue={filters.search}
      searchPlaceholder="Search companions..."
      searchAriaLabel="Search companions"
      localSearch
      onSearch={(search) => updateFilters({ search })}
      {shardBalance}
      notifications={(data as any)?.notifications ?? []}
      {profileDisplayName}
      profileAvatarUrl={activeProfileAvatar}
    >
      <svelte:fragment slot="controls">
        <div class="companion-topbar-filters">
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
        </div>
      </svelte:fragment>
    </ProtectedTopbar>

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
                bind:loaded={detailModelLoaded}
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
                    {detailElementProfileLabel}
                    <span class="tooltip-card profile-tooltip" role="tooltip">
                      <span>Element Profile</span>
                      <strong>{detailElementProfileLabel}</strong>
                      <p>{detailIdentity.archetype.overviewIdentity}</p>
                      <small>{detailElementProfile.expressionLine}</small>
                    </span>
                  </strong>
                </div>
                <p class="identity-copy">{detailIdentity.archetype.overviewIdentity}</p>
                <div class="element-pair">
                  <article
                    class="tooltip-host"
                    aria-label={`Primary essence. ${detailPrimaryElement?.emotionalMeaning ?? 'Harmony, resonance, expression, and being emotionally heard.'}`}
                  >
                    <strong class="element-value">
                      <img class="element-image" src={detailPrimaryElementAsset} alt="" loading="lazy" />
                      {detailPrimaryElement?.label ?? 'Sound'}
                    </strong>
                    <p>{detailPrimaryElement?.emotionalMeaning ?? 'Harmony, resonance, expression, and being emotionally heard.'}</p>
                    <div class="tooltip-card compact-tooltip" role="tooltip">
                      <span>Primary Essence</span>
                      <strong>{detailPrimaryElement?.label ?? 'Sound'}</strong>
                      <em>The companion's fixed core identity.</em>
                      <p>{detailPrimaryElement?.emotionalMeaning ?? 'Harmony, resonance, expression, and being emotionally heard.'}</p>
                    </div>
                  </article>
                  <article
                    class="tooltip-host"
                    aria-label={`Secondary expression. ${detailSecondaryElement?.emotionalMeaning ?? 'Hope, warmth, emotional openness, and gentle clarity.'}`}
                  >
                    <strong class="element-value">
                      <img class="element-image" src={detailSecondaryElementAsset} alt="" loading="lazy" />
                      {detailSecondaryElement?.label ?? 'Light'}
                    </strong>
                    <p>{detailSecondaryElement?.emotionalMeaning ?? 'Hope, warmth, emotional openness, and gentle clarity.'}</p>
                    <div class="tooltip-card compact-tooltip" role="tooltip">
                      <span>Secondary Expression</span>
                      <strong>{detailSecondaryElement?.label ?? 'Light'}</strong>
                      <em>The companion's current emotional style and evolution path.</em>
                      <p>{detailSecondaryElement?.emotionalMeaning ?? 'Hope, warmth, emotional openness, and gentle clarity.'}</p>
                    </div>
                  </article>
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
            <div class="detail-tab-panel skills-panel">
              <div class="gift-path-head">
                <strong>{detailCompanion.name}'s Gift Path</strong>
                <p>A quick look at how {detailCompanion.name} is growing.</p>
              </div>
              {#if featuredGift}
                <section class="gift-preview-card" aria-label="Featured Gift">
                  <span>Featured Gift</span>
                  <button
                    type="button"
                    class="skill-row gift-preview-row tooltip-host"
                    aria-label={`Open Gift Path with ${featuredGift.name} selected`}
                    on:click={() => openGiftPath(featuredGift)}
                  >
                    <span class="skill-icon" aria-hidden="true">
                      <img src={getElementAssetPath(featuredGift.iconElement)} alt="" loading="lazy" />
                    </span>
                    <span class="skill-copy">
                      <span class="skill-title-line">
                        <strong>{featuredGift.name}</strong>
                        <small>Lvl {featuredGift.displayLevel}</small>
                      </span>
                      <span class="gift-meta-line"><b>{giftCategoryLabels[featuredGift.category]}</b></span>
                      <span>{featuredGift.description}</span>
                    </span>
                    <div class="tooltip-card compact-tooltip" role="tooltip">
                      <span>{giftCategoryLabels[featuredGift.category]}</span>
                      <strong>{featuredGift.name} · Lvl {featuredGift.displayLevel}</strong>
                      <p>{featuredGift.description}</p>
                      <small>{featuredGift.visualBehavior}</small>
                    </div>
                  </button>
                </section>
              {/if}

              {#if nextUnlockGift}
                <section class="gift-preview-card" aria-label="Next Unlock">
                  <span>Next Unlock</span>
                  <button
                    type="button"
                    class="skill-row gift-preview-row is-locked tooltip-host"
                    aria-label={`Open Gift Path with ${nextUnlockGift.name} selected`}
                    on:click={() => openGiftPath(nextUnlockGift)}
                  >
                    <span class="skill-icon" aria-hidden="true">
                      <img src={getElementAssetPath(nextUnlockGift.iconElement)} alt="" loading="lazy" />
                    </span>
                    <span class="skill-copy">
                      <span class="skill-title-line">
                        <strong>{nextUnlockGift.name}</strong>
                        <small>{nextUnlockGift.unlockConditionLabel}</small>
                      </span>
                      <span class="gift-meta-line">
                        <b>{giftCategoryLabels[nextUnlockGift.category]}</b>
                        <em>Locked</em>
                      </span>
                      <span>{nextUnlockGift.description}</span>
                    </span>
                    <div class="tooltip-card compact-tooltip" role="tooltip">
                      <span>{giftCategoryLabels[nextUnlockGift.category]}</span>
                      <strong>{nextUnlockGift.name} · Locked</strong>
                      <p>{nextUnlockGift.description}</p>
                      <small>{nextUnlockGift.unlockConditionLabel}</small>
                    </div>
                  </button>
                </section>
              {/if}

              <section class="gift-summary-card" aria-label="Path Summary">
                <span>Path Summary</span>
                <div>
                  {#each giftPathSummary as row}
                    <p><strong>{row.label}</strong><small>{row.value}</small></p>
                  {/each}
                </div>
              </section>
              <!-- TODO: Connect Strengthen Gift to the future gift economy once Ritual Resonance, Memory Shards, or Bond Tokens are available server-side. -->
            </div>
          {:else if activeDetailTab === 'growth'}
            <div class="detail-tab-panel growth-detail-panel">
              <button type="button" class="growth-detail-row tooltip-host">
                <span class="growth-detail-icon" aria-hidden="true"><Sparkles size={22} /></span>
                <span class="growth-detail-copy">
                  <small>Growth Stage</small>
                  <strong>{currentGrowthStage.label}</strong>
                  <em>Next: {nextGrowthStage?.label ?? 'Complete'}</em>
                </span>
                <div class="tooltip-card compact-tooltip" role="tooltip">
                  <span>Growth Stage</span>
                  <strong>{currentGrowthStage.label}</strong>
                  <p>{detailIdentity.growth.currentPath}</p>
                </div>
              </button>
              <button type="button" class="growth-detail-row tooltip-host">
                <span class="growth-detail-icon growth-detail-icon--xp" aria-hidden="true">XP</span>
                <span class="growth-detail-copy">
                  <small>Level</small>
                  <strong>{detailLevel} / {nextGrowthStage?.unlockLevel ?? 30}</strong>
                  <span class="growth-detail-meter"><i style={`width:${growthXpPercent}%`}></i></span>
                  <em>{growthXpCurrent.toLocaleString()} / {growthXpTarget.toLocaleString()} XP</em>
                </span>
                <div class="tooltip-card compact-tooltip" role="tooltip">
                  <span>Level Progress</span>
                  <strong>Lvl {detailLevel}</strong>
                  <p>Daily activity and companion time continue this path.</p>
                </div>
              </button>
              <button type="button" class="growth-detail-row tooltip-host">
                <span class="growth-detail-icon" aria-hidden="true"><Sparkles size={22} /></span>
                <span class="growth-detail-copy">
                  <small>Resonance Potential</small>
                  <strong class="green-copy">{growthResonance.potential}</strong>
                  <em>{detailCompanion.name} responds strongly to rituals and gifts.</em>
                </span>
                <div class="tooltip-card compact-tooltip" role="tooltip">
                  <span>Resonance Potential</span>
                  <strong>{growthResonance.potential}</strong>
                  <p>{detailCompanion.name} responds strongly to rituals, gifts, and shared memories.</p>
                </div>
              </button>
              <button type="button" class="growth-detail-row tooltip-host">
                <span class="growth-detail-icon growth-detail-icon--rank" aria-hidden="true"><Heart size={21} fill="currentColor" /></span>
                <span class="growth-detail-copy">
                  <small>Growth Harmony</small>
                  <strong class="green-copy">{growthResonance.harmony}</strong>
                  <em>Your bond is helping {detailCompanion.name} grow steadily.</em>
                </span>
                <div class="tooltip-card compact-tooltip" role="tooltip">
                  <span>Growth Harmony</span>
                  <strong>{growthResonance.harmony}</strong>
                  <p>{detailCompanion.name} is growing with steady resonance.</p>
                </div>
              </button>
            </div>
          {:else}
            <div class="detail-tab-panel story-panel">
              <section class="story-progress-card">
                <strong>Story Progress</strong>
                <p>{unlockedStoryMemories.length} / {storyMemories.length} Memories Unlocked</p>
                <div class="story-progress-meter">
                  <span><i style={`width:${storyProgressPercent}%`}></i></span>
                  <small>{storyProgressPercent}%</small>
                </div>
              </section>

              <button type="button" class="story-bonus-card tooltip-host" on:click={openStoryMemories}>
                <span class="story-orb" aria-hidden="true"><BookOpen size={24} /></span>
                <span>
                  <strong>Lore Bonus</strong>
                  <small>Unlock more memories to gain +5% Bond Growth</small>
                </span>
                <div class="tooltip-card compact-tooltip" role="tooltip">
                  <span>Lore Bonus</span>
                  <strong>Memories deepen the bond</strong>
                  <p>Story memories shape companion reactions, rituals, and emotional continuity.</p>
                </div>
              </button>

              <section class="next-memory-card">
                <span>Next Memory</span>
                {#if nextStoryMemory}
                  <button type="button" class="memory-preview-row tooltip-host" on:click={openStoryMemories}>
                    <span class="memory-lock" aria-hidden="true"><Lock size={16} /></span>
                    <span>
                      <strong>{nextStoryMemory.index}. {nextStoryMemory.title}</strong>
                      <small>{nextStoryMemory.body}</small>
                    </span>
                    <div class="tooltip-card compact-tooltip" role="tooltip">
                      <span>{nextStoryMemory.unlockCondition}</span>
                      <strong>{nextStoryMemory.title}</strong>
                      <p>{nextStoryMemory.body}</p>
                    </div>
                  </button>
                {:else if activeStoryMemory}
                  <button type="button" class="memory-preview-row tooltip-host" on:click={openStoryMemories}>
                    <span class="memory-lock is-open" aria-hidden="true"><Sparkles size={16} /></span>
                    <span>
                      <strong>{activeStoryMemory.index}. {activeStoryMemory.title}</strong>
                      <small>All current memories are open.</small>
                    </span>
                  </button>
                {/if}
              </section>
            </div>
          {/if}
          <div class="detail-actions">
            {#if activeDetailTab === 'skills'}
              <button
                type="button"
                class="primary-action level-skill-action"
                on:click={() => openGiftPath(featuredGift)}
              >
                <Sparkles size={18} />
                <span>Open Gift Path</span>
              </button>
            {:else if activeDetailTab === 'growth'}
              <button
                type="button"
                class="primary-action level-skill-action"
                on:click={openGrowthPath}
              >
                <TrendingUp size={18} />
                <span>View Growth Path</span>
              </button>
            {:else if activeDetailTab === 'story'}
              <button
                type="button"
                class="primary-action level-skill-action"
                on:click={openStoryMemories}
              >
                <BookOpen size={18} />
                <span>View All Memories</span>
              </button>
            {:else}
              <button type="button" class="primary-action interact-action" disabled={Boolean(careActing)} on:click={() => performInlineCare(detailCompanion, 'feed')}>
                {careActing === 'feed' ? 'Caring...' : 'Feed'}
              </button>
              <button type="button" class="secondary-action" disabled={Boolean(careActing)} on:click={() => performInlineCare(detailCompanion, 'play')}>Play</button>
              <button type="button" class="secondary-action" disabled={Boolean(careActing)} on:click={() => performInlineCare(detailCompanion, 'groom')}>Groom</button>
              {#if (detailEffective?.energy ?? detailCompanion.energy ?? 100) <= LOW_ENERGY_THRESHOLD}
                <a class="secondary-action rest-action" href="/app/sanctuary">Rest in Sanctuary</a>
              {/if}
            {/if}
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

<GiftPathModal
  open={giftPathOpen}
  companion={detailCompanion}
  companionName={detailCompanion?.name ?? 'Companion'}
  giftPathEntries={detailGiftPathEntries}
  selectedGiftId={giftPathSelectedGiftId}
  {giftCategoryLabels}
  {getElementAssetPath}
  onClose={() => (giftPathOpen = false)}
/>

<GrowthPathModal
  open={growthPathOpen}
  companionName={detailCompanion?.name ?? 'Companion'}
  stages={growthStages}
  currentStageIndex={growthStageIndex}
  level={detailLevel}
  bond={detailBond}
  growthBonus={xpBonusPercent}
  giftsLearned={unlockedGiftCount}
  resonancePotential={growthResonance.potential}
  growthHarmony={growthResonance.harmony}
  traits={detailIdentity.personality}
  milestones={recentGrowthMilestones}
  nextStageLabel={nextGrowthStage?.label ?? null}
  nextStageLevel={nextGrowthStage?.unlockLevel ?? null}
  onClose={() => (growthPathOpen = false)}
/>

<Modal
  open={storyMemoriesOpen}
  title={detailCompanion ? `${detailCompanion.name}'s Story` : 'Companion Story'}
  onClose={() => (storyMemoriesOpen = false)}
>
  {#if detailCompanion && activeStoryMemory}
    <section class="story-memories-modal">
      <aside class="story-memory-list" aria-label={`${detailCompanion.name}'s memories`}>
        {#each storyMemories as memory}
          <button
            type="button"
            class:is-active={memory.index === activeStoryMemory.index}
            class:is-locked={!memory.unlocked}
            on:click={() => {
              if (memory.unlocked) selectedStoryMemoryIndex = memory.index;
            }}
          >
            <span>
              {#if memory.unlocked}
                <Sparkles size={18} />
              {:else}
                <Lock size={16} />
              {/if}
            </span>
            <strong>{memory.index}. {memory.title}</strong>
            <small>{memory.label}</small>
          </button>
        {/each}
      </aside>

      <article class="story-feature-card">
        <div class="story-feature-art" aria-hidden="true">
          <img src={detailCompanion.avatar_url ?? '/avatar-fallback.png'} alt="" />
        </div>
        <div class="story-feature-copy">
          <h3>{activeStoryMemory.index}. {activeStoryMemory.title}</h3>
          <p>{activeStoryMemory.body}</p>
          <div class="memory-unlocked-row">
            <span><Sparkles size={20} /></span>
            <div>
              <strong>Memory Unlocked</strong>
              <small>You discovered {detailCompanion.name}'s origin.</small>
            </div>
            <b>Unlocked</b>
          </div>
          <button type="button" class="watch-memory-button" on:click={() => showToast('Memory playback is coming soon')}>
            <Play size={16} />
            Watch Memory
          </button>
        </div>
      </article>
    </section>
  {/if}
</Modal>

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
    position: relative;
    display: grid;
    grid-template-columns: 14.25rem minmax(0, 1fr);
    min-height: 100vh;
    background:
      radial-gradient(circle at 80% 8%, rgba(87, 70, 205, 0.22), transparent 36rem),
      radial-gradient(circle at 44% 100%, rgba(125, 66, 210, 0.16), transparent 36rem),
      linear-gradient(180deg, #08091a 0%, #060716 100%);
    color: rgba(248, 246, 255, 0.94);
  }

  .page-splash {
    position: fixed;
    inset: 0;
    z-index: 9000;
    display: grid;
    place-items: center;
    gap: 1.05rem;
    align-content: center;
    background:
      radial-gradient(circle at 54% 42%, rgba(167, 92, 255, 0.3), transparent 18rem),
      radial-gradient(circle at 45% 58%, rgba(221, 170, 92, 0.12), transparent 20rem),
      linear-gradient(180deg, #08091a 0%, #060716 100%);
    color: white;
  }

  .page-splash__orb {
    width: 5.8rem;
    height: 5.8rem;
    border-radius: 999px;
    background:
      radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.94), transparent 0.45rem),
      radial-gradient(circle at 50% 50%, rgba(221, 170, 92, 0.82), rgba(167, 92, 255, 0.58) 46%, rgba(98, 232, 255, 0.12) 74%, transparent 76%);
    box-shadow:
      0 0 34px rgba(167, 92, 255, 0.58),
      0 0 70px rgba(221, 170, 92, 0.2);
    animation: splashPulse 1.6s ease-in-out infinite;
  }

  .page-splash__copy {
    display: grid;
    gap: 0.35rem;
    text-align: center;
  }

  .page-splash__copy strong {
    font-size: clamp(1.05rem, 2vw, 1.3rem);
  }

  .page-splash__copy span {
    color: rgba(231, 225, 255, 0.72);
    font-size: 0.88rem;
  }

  @keyframes splashPulse {
    0%,
    100% {
      transform: translateY(0) scale(1);
      opacity: 0.82;
    }
    50% {
      transform: translateY(-0.35rem) scale(1.04);
      opacity: 1;
    }
  }

  .companions-workspace {
    min-width: 0;
    padding: 1.5rem 1.25rem 1.75rem 1.85rem;
  }

  .title-row,
  .detail-head,
  .bond-row,
  .slots-panel,
  .tabs-row {
    display: flex;
    align-items: center;
  }

  .select-field select {
    width: 100%;
    border: 0;
    background: transparent;
    color: rgba(248, 246, 255, 0.9);
    outline: 0;
  }

  .select-field,
  .icon-button {
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

  .companion-topbar-filters {
    display: flex;
    align-items: center;
    gap: 0.7rem;
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

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .icon-button {
    position: relative;
    width: 2.75rem;
    border-radius: 999px;
    padding: 0;
  }

  .icon-button:hover,
  .icon-button.is-active,
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

  .element-profile-head > span {
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
    display: flex;
    align-items: center;
    gap: 0.82rem;
    flex-wrap: wrap;
  }

  .element-pair article {
    display: inline-flex;
    position: relative;
    align-items: center;
  }

  .element-value {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-width: 0;
  }

  .element-image {
    width: 1.9rem;
    height: 1.9rem;
    flex: 0 0 auto;
    object-fit: contain;
    filter: drop-shadow(0 0 0.55rem rgba(183, 92, 255, 0.34));
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

  .element-pair article p {
    display: none;
  }

  .tag-row,
  .detail-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .tag-row b {
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.075);
    padding: 0.3rem 0.62rem;
    font-size: 0.78rem;
  }

  .section-heading,
  .gift-group,
  .story-card {
    display: grid;
    gap: 0.55rem;
  }

  .skills-panel {
    gap: 0.82rem;
  }

  .gift-path-head strong {
    color: rgba(255, 250, 242, 0.98);
    font-size: 1rem;
    line-height: 1.2;
  }

  .gift-path-head p {
    margin: 0.26rem 0 0;
    color: rgba(220, 216, 237, 0.62);
    font-size: 0.76rem;
    font-weight: 650;
    line-height: 1.34;
  }

  .gift-preview-card,
  .gift-summary-card {
    display: grid;
    gap: 0.55rem;
    border: 1px solid rgba(153, 130, 236, 0.15);
    border-radius: 0.88rem;
    background:
      radial-gradient(circle at 14% 0%, rgba(183, 92, 255, 0.12), transparent 58%),
      rgba(255, 255, 255, 0.04);
    padding: 0.68rem;
  }

  .gift-preview-card > span,
  .gift-summary-card > span {
    color: rgba(220, 216, 237, 0.62);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .skill-row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.78rem;
    min-height: 4.1rem;
    border: 0;
    background: transparent;
    color: rgba(248, 246, 255, 0.94);
    cursor: help;
    font: inherit;
    padding: 0;
    text-align: left;
  }

  .skill-row:hover .skill-icon,
  .skill-row:focus-visible .skill-icon {
    border-color: rgba(183, 92, 255, 0.64);
    box-shadow: 0 0 1.2rem rgba(183, 92, 255, 0.3), inset 0 0 1rem rgba(183, 92, 255, 0.18);
  }

  .skill-row:focus-visible {
    outline: 2px solid rgba(183, 92, 255, 0.72);
    outline-offset: 3px;
    border-radius: 0.78rem;
  }

  .skill-icon {
    display: grid;
    width: 3.12rem;
    height: 3.12rem;
    place-items: center;
    border: 1px solid rgba(153, 88, 255, 0.34);
    border-radius: 999px;
    background:
      radial-gradient(circle at 50% 34%, rgba(183, 92, 255, 0.34), transparent 58%),
      radial-gradient(circle at 50% 100%, rgba(90, 45, 210, 0.42), transparent 64%),
      rgba(13, 15, 38, 0.92);
    box-shadow: inset 0 0 0.8rem rgba(183, 92, 255, 0.14);
  }

  .skill-icon img {
    width: 2.18rem;
    height: 2.18rem;
    object-fit: contain;
    filter: drop-shadow(0 0 0.52rem rgba(183, 92, 255, 0.54));
  }

  .skill-copy {
    display: grid;
    min-width: 0;
    gap: 0.2rem;
  }

  .skill-title-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .skill-title-line strong {
    color: rgba(255, 250, 242, 0.98);
    font-size: 0.95rem;
    line-height: 1.18;
  }

  .skill-title-line small {
    flex: 0 0 auto;
    color: rgba(220, 216, 237, 0.72);
    font-size: 0.82rem;
    font-weight: 800;
  }

  .gift-meta-line {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    flex-wrap: wrap;
  }

  .gift-meta-line b,
  .gift-meta-line em {
    border-radius: 999px;
    font-size: 0.64rem;
    font-style: normal;
    font-weight: 900;
    line-height: 1;
    padding: 0.24rem 0.44rem;
  }

  .gift-meta-line b {
    border: 1px solid rgba(183, 92, 255, 0.24);
    background: rgba(183, 92, 255, 0.12);
    color: rgba(229, 213, 255, 0.92);
  }

  .gift-meta-line em {
    border: 1px solid rgba(221, 170, 92, 0.22);
    background: rgba(221, 170, 92, 0.1);
    color: rgba(255, 234, 196, 0.92);
  }

  .skill-copy > span:last-child {
    color: rgba(220, 216, 237, 0.7);
    font-size: 0.78rem;
    font-weight: 650;
    line-height: 1.32;
  }

  .gift-preview-row.is-locked {
    opacity: 0.68;
  }

  .gift-summary-card > div {
    display: grid;
    gap: 0.42rem;
  }

  .gift-summary-card p {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0;
    color: rgba(248, 246, 255, 0.9);
  }

  .gift-summary-card strong {
    font-size: 0.78rem;
  }

  .gift-summary-card small {
    color: rgba(220, 216, 237, 0.62);
    font-size: 0.72rem;
    font-weight: 800;
    text-align: right;
  }

  .growth-detail-panel {
    gap: 0.72rem;
  }

  .growth-detail-row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.8rem;
    min-height: 4.35rem;
    border: 0;
    background: transparent;
    color: rgba(248, 246, 255, 0.94);
    cursor: help;
    font: inherit;
    padding: 0;
    text-align: left;
  }

  .growth-detail-row:hover .growth-detail-icon,
  .growth-detail-row:focus-visible .growth-detail-icon {
    border-color: rgba(183, 92, 255, 0.64);
    box-shadow: 0 0 1.2rem rgba(183, 92, 255, 0.3), inset 0 0 1rem rgba(183, 92, 255, 0.18);
  }

  .growth-detail-row:focus-visible {
    outline: 2px solid rgba(183, 92, 255, 0.72);
    outline-offset: 3px;
    border-radius: 0.78rem;
  }

  .growth-detail-icon {
    display: grid;
    width: 3.18rem;
    height: 3.18rem;
    place-items: center;
    border: 1px solid rgba(153, 88, 255, 0.36);
    border-radius: 999px;
    background:
      radial-gradient(circle at 50% 34%, rgba(183, 92, 255, 0.34), transparent 58%),
      rgba(13, 15, 38, 0.92);
    color: #b75cff;
    font-size: 0.9rem;
    font-weight: 950;
  }

  .growth-detail-icon--xp,
  .growth-detail-icon--rank {
    font-size: 1rem;
  }

  .growth-detail-copy {
    display: grid;
    min-width: 0;
    gap: 0.2rem;
  }

  .growth-detail-copy small {
    color: rgba(220, 216, 237, 0.62);
    font-size: 0.7rem;
    font-weight: 900;
  }

  .growth-detail-copy strong {
    color: rgba(255, 250, 242, 0.98);
    font-size: 0.88rem;
  }

  .growth-detail-copy .green-copy {
    color: #7df38f;
  }

  .growth-detail-copy em {
    color: rgba(220, 216, 237, 0.66);
    font-size: 0.75rem;
    font-style: normal;
    font-weight: 700;
  }

  .growth-detail-meter {
    display: block;
    height: 0.34rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.09);
  }

  .growth-detail-meter i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #7d4dff, #db63ff);
    box-shadow: 0 0 1rem rgba(183, 92, 255, 0.5);
  }

  .section-heading > span,
  .gift-group > span {
    color: #a97be1;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .section-heading strong {
    color: rgba(248, 246, 255, 0.96);
    font-size: 1rem;
  }

  .story-panel {
    gap: 0.78rem;
  }

  .story-progress-card,
  .story-bonus-card,
  .next-memory-card,
  .memory-preview-row {
    border: 1px solid rgba(153, 130, 236, 0.15);
    border-radius: 0.92rem;
    background:
      radial-gradient(circle at 16% 0%, rgba(183, 92, 255, 0.12), transparent 58%),
      rgba(255, 255, 255, 0.04);
  }

  .story-progress-card,
  .next-memory-card {
    display: grid;
    gap: 0.52rem;
    padding: 0.78rem;
  }

  .story-progress-card strong,
  .story-bonus-card strong,
  .next-memory-card > span,
  .memory-preview-row strong {
    color: rgba(255, 250, 242, 0.96);
  }

  .story-progress-card p,
  .story-bonus-card small,
  .memory-preview-row small {
    margin: 0;
    color: rgba(220, 216, 237, 0.66);
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.45;
  }

  .story-progress-meter {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.6rem;
  }

  .story-progress-meter > span {
    display: block;
    height: 0.34rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.09);
  }

  .story-progress-meter i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #7d4dff, #db63ff);
    box-shadow: 0 0 1rem rgba(183, 92, 255, 0.5);
  }

  .story-progress-meter small {
    color: rgba(220, 216, 237, 0.7);
    font-size: 0.72rem;
    font-weight: 800;
  }

  .story-bonus-card,
  .memory-preview-row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.72rem;
    color: rgba(248, 246, 255, 0.94);
    cursor: pointer;
    font: inherit;
    padding: 0.72rem;
    text-align: left;
  }

  .story-orb,
  .memory-lock {
    display: grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border: 1px solid rgba(153, 88, 255, 0.34);
    border-radius: 999px;
    background:
      radial-gradient(circle at 50% 34%, rgba(183, 92, 255, 0.34), transparent 58%),
      rgba(13, 15, 38, 0.92);
    color: #b75cff;
  }

  .memory-lock {
    width: 2.75rem;
    height: 2.75rem;
    color: rgba(220, 216, 237, 0.7);
  }

  .memory-lock.is-open {
    color: #b75cff;
  }

  .story-bonus-card:hover,
  .memory-preview-row:hover,
  .story-bonus-card:focus-visible,
  .memory-preview-row:focus-visible {
    border-color: rgba(183, 92, 255, 0.55);
    outline: none;
    box-shadow: 0 0 1.1rem rgba(183, 92, 255, 0.16);
  }

  .next-memory-card > span {
    font-size: 0.82rem;
    font-weight: 900;
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

  .story-memories-modal {
    display: grid;
    grid-template-columns: minmax(13rem, 0.82fr) minmax(0, 1.35fr);
    gap: 1rem;
  }

  .story-memory-list {
    display: grid;
    gap: 0.65rem;
    align-content: start;
  }

  .story-memory-list button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.7rem;
    min-height: 4.6rem;
    border: 1px solid rgba(153, 130, 236, 0.14);
    border-radius: 0.86rem;
    background: rgba(255, 255, 255, 0.035);
    color: rgba(248, 246, 255, 0.9);
    cursor: pointer;
    font: inherit;
    padding: 0.72rem;
    text-align: left;
  }

  .story-memory-list button.is-active {
    border-color: rgba(183, 92, 255, 0.78);
    background:
      radial-gradient(circle at 18% 0%, rgba(183, 92, 255, 0.18), transparent 60%),
      rgba(93, 57, 202, 0.12);
    box-shadow: 0 0 1rem rgba(183, 92, 255, 0.14);
  }

  .story-memory-list button.is-locked {
    opacity: 0.55;
  }

  .story-memory-list button > span {
    display: grid;
    grid-row: span 2;
    width: 2.55rem;
    height: 2.55rem;
    place-items: center;
    border-radius: 999px;
    background: rgba(183, 92, 255, 0.12);
    color: #b75cff;
  }

  .story-memory-list strong,
  .story-memory-list small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .story-memory-list strong {
    color: rgba(255, 250, 242, 0.96);
    font-size: 0.86rem;
  }

  .story-memory-list small {
    color: rgba(220, 216, 237, 0.62);
    font-size: 0.76rem;
    font-weight: 750;
  }

  .story-feature-card {
    overflow: hidden;
    border: 1px solid rgba(153, 130, 236, 0.18);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 50% 0%, rgba(183, 92, 255, 0.12), transparent 64%),
      rgba(10, 11, 31, 0.7);
  }

  .story-feature-art {
    display: grid;
    min-height: 16rem;
    place-items: center;
    background:
      radial-gradient(circle at 50% 44%, rgba(183, 92, 255, 0.36), transparent 32%),
      radial-gradient(circle at 20% 20%, rgba(102, 216, 255, 0.12), transparent 25%),
      linear-gradient(135deg, rgba(20, 10, 56, 0.95), rgba(7, 9, 28, 0.95));
  }

  .story-feature-art img {
    width: min(15rem, 70%);
    height: 15rem;
    object-fit: contain;
    filter: drop-shadow(0 0 1.6rem rgba(183, 92, 255, 0.48));
  }

  .story-feature-copy {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
  }

  .story-feature-copy h3 {
    margin: 0;
    color: white;
    font-size: 1.18rem;
  }

  .story-feature-copy p {
    margin: 0;
    color: rgba(220, 216, 237, 0.76);
    font-size: 0.88rem;
    font-weight: 650;
    line-height: 1.48;
  }

  .memory-unlocked-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.7rem;
    border-top: 1px solid rgba(153, 130, 236, 0.12);
    border-bottom: 1px solid rgba(153, 130, 236, 0.12);
    padding: 0.75rem 0;
  }

  .memory-unlocked-row > span {
    display: grid;
    width: 2.7rem;
    height: 2.7rem;
    place-items: center;
    border-radius: 999px;
    background: rgba(183, 92, 255, 0.13);
    color: #b75cff;
  }

  .memory-unlocked-row strong {
    display: block;
    color: rgba(255, 250, 242, 0.96);
    font-size: 0.82rem;
  }

  .memory-unlocked-row small {
    color: rgba(220, 216, 237, 0.62);
    font-size: 0.76rem;
    font-weight: 750;
  }

  .memory-unlocked-row b {
    color: #7df38f;
    font-size: 0.78rem;
  }

  .watch-memory-button {
    display: inline-flex;
    min-height: 2.8rem;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    border: 1px solid rgba(207, 100, 255, 0.52);
    border-radius: 0.82rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), transparent 44%),
      linear-gradient(135deg, #5c39f0 0%, #7f35ee 52%, #9c42f1 100%);
    color: white;
    cursor: pointer;
    font-weight: 900;
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

  .rest-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
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

  .level-skill-action {
    display: inline-flex;
    grid-column: 1 / -1;
    align-items: center;
    justify-content: center;
    gap: 0.58rem;
    min-height: 2.72rem;
    border-radius: 0.72rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), transparent 44%),
      linear-gradient(135deg, #5c39f0 0%, #7f35ee 52%, #9c42f1 100%);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.1),
      0 0.78rem 1.45rem rgba(83, 42, 190, 0.34);
  }

  .level-skill-action:disabled {
    cursor: default;
    filter: grayscale(0.18);
    opacity: 0.64;
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

    .title-row,
    .slots-panel {
      align-items: stretch;
      flex-direction: column;
    }

    .companion-topbar-filters {
      display: none;
    }

    .stats-grid,
    .companion-grid,
    .collection-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
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
