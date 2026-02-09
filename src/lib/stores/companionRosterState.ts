import { get, writable } from 'svelte/store';
import type { Companion, CompanionStats } from '$lib/stores/companions';

type CompanionRosterState = {
  instances: Companion[];
  activeInstanceId: string | null;
};

export type CompanionInteractionType = 'check_in' | 'feed' | 'play' | 'groom';

type CompanionStatsPatch = Partial<
  Pick<Companion, 'affection' | 'trust' | 'energy' | 'mood' | 'updated_at' | 'state' | 'bond_level' | 'bond_score'>
> & {
  stats?: Partial<CompanionStats> | null;
};

const bySlotThenCreated = (a: Companion, b: Companion) => {
  const slotA = typeof a.slot_index === 'number' ? a.slot_index : Number.MAX_SAFE_INTEGER;
  const slotB = typeof b.slot_index === 'number' ? b.slot_index : Number.MAX_SAFE_INTEGER;
  if (slotA !== slotB) return slotA - slotB;
  const createdA = Date.parse(a.created_at ?? '') || 0;
  const createdB = Date.parse(b.created_at ?? '') || 0;
  return createdA - createdB;
};

const normalizeStats = (instance: Companion): CompanionStats => {
  if (instance.stats) {
    return {
      companion_id: instance.id,
      care_streak: instance.stats.care_streak ?? 0,
      fed_at: instance.stats.fed_at ?? null,
      played_at: instance.stats.played_at ?? null,
      groomed_at: instance.stats.groomed_at ?? null,
      last_passive_tick: instance.stats.last_passive_tick ?? null,
      last_daily_bonus_at: instance.stats.last_daily_bonus_at ?? null,
      bond_level: instance.stats.bond_level ?? instance.bond_level ?? 0,
      bond_score: instance.stats.bond_score ?? instance.bond_score ?? 0
    };
  }
  return {
    companion_id: instance.id,
    care_streak: 0,
    fed_at: null,
    played_at: null,
    groomed_at: null,
    last_passive_tick: null,
    last_daily_bonus_at: null,
    bond_level: instance.bond_level ?? 0,
    bond_score: instance.bond_score ?? 0
  };
};

const resolveActiveInstanceId = (instances: Companion[], preferredId?: string | null) => {
  if (!instances.length) return null;
  if (preferredId && instances.some((instance) => instance.id === preferredId)) {
    return preferredId;
  }
  return (
    instances.find((instance) => instance.is_active || instance.state === 'active')?.id ??
    instances[0]?.id ??
    null
  );
};

const normalizeInstances = (instances: Companion[], activeId?: string | null) => {
  const ordered = instances.slice().sort(bySlotThenCreated);
  const resolvedActiveId = resolveActiveInstanceId(ordered, activeId);
  return ordered.map((instance) => {
    const isActive = instance.id === resolvedActiveId;
    return {
      ...instance,
      is_active: isActive,
      state: isActive ? 'active' : instance.state === 'active' ? 'idle' : (instance.state ?? 'idle'),
      stats: normalizeStats(instance)
    };
  });
};

const withPatchedStats = (instance: Companion, patch: CompanionStatsPatch): Companion => {
  const currentStats = normalizeStats(instance);
  const nextStatsBase =
    patch.stats === null
      ? currentStats
      : {
          ...currentStats,
          ...(patch.stats ?? {})
        };
  const nextStats: CompanionStats = {
    ...nextStatsBase,
    bond_level: patch.bond_level ?? nextStatsBase.bond_level ?? instance.bond_level ?? 0,
    bond_score: patch.bond_score ?? nextStatsBase.bond_score ?? instance.bond_score ?? 0
  };
  return {
    ...instance,
    affection: patch.affection ?? instance.affection,
    trust: patch.trust ?? instance.trust,
    energy: patch.energy ?? instance.energy,
    mood: patch.mood ?? instance.mood,
    state: patch.state ?? instance.state ?? 'idle',
    updated_at: patch.updated_at ?? instance.updated_at,
    stats: nextStats,
    bond_level: nextStats.bond_level ?? 0,
    bond_score: nextStats.bond_score ?? 0
  };
};

export const createCompanionRosterState = (
  initialInstances: Companion[] = [],
  initialActiveId: string | null = null
) => {
  const { subscribe, update, set } = writable<CompanionRosterState>({
    instances: normalizeInstances(initialInstances, initialActiveId),
    activeInstanceId: resolveActiveInstanceId(initialInstances, initialActiveId)
  });

  const getActiveCompanion = (): Companion | null => {
    const state = get({ subscribe });
    return state.instances.find((instance) => instance.id === state.activeInstanceId) ?? null;
  };

  const setActiveCompanion = (instanceId: string) => {
    const targetId = typeof instanceId === 'string' ? instanceId.trim() : '';
    if (!targetId) return null;
    let updated = false;
    update((state) => {
      if (!state.instances.some((instance) => instance.id === targetId)) {
        return state;
      }
      const instances = normalizeInstances(state.instances, targetId);
      updated = true;
      return { instances, activeInstanceId: targetId };
    });
    if (!updated) return null;
    return getActiveCompanion();
  };

  const updateCompanionStats = (instanceId: string, patch: CompanionStatsPatch) => {
    if (!instanceId) return null;
    let updatedInstance: Companion | null = null;
    update((state) => {
      const instances = state.instances.map((instance) => {
        if (instance.id !== instanceId) return instance;
        updatedInstance = withPatchedStats(instance, patch);
        return updatedInstance;
      });
      return { ...state, instances };
    });
    return updatedInstance;
  };

  const recordInteraction = (
    instanceId: string,
    interactionType: CompanionInteractionType,
    timestamp: string = new Date().toISOString()
  ) => {
    const statsPatch: Partial<CompanionStats> = {};
    if (interactionType === 'feed') statsPatch.fed_at = timestamp;
    if (interactionType === 'play') statsPatch.played_at = timestamp;
    if (interactionType === 'groom') statsPatch.groomed_at = timestamp;
    if (interactionType === 'check_in') statsPatch.last_passive_tick = timestamp;
    return updateCompanionStats(instanceId, { updated_at: timestamp, stats: statsPatch });
  };

  const replaceInstances = (instances: Companion[], preferredActiveId: string | null = null) => {
    const normalized = normalizeInstances(instances, preferredActiveId);
    const activeId = resolveActiveInstanceId(normalized, preferredActiveId);
    set({ instances: normalized, activeInstanceId: activeId });
  };

  return {
    subscribe,
    getActiveCompanion,
    setActiveCompanion,
    updateCompanionStats,
    recordInteraction,
    replaceInstances
  };
};
