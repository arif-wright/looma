import { browser } from '$app/environment';
import { derived, writable } from 'svelte/store';
import { supabaseBrowser } from '$lib/supabaseClient';
import { logEvent } from '$lib/analytics';

export type CareAction = 'feed' | 'play' | 'groom';

export type CompanionStats = {
  companion_id: string;
  care_streak: number;
  fed_at: string | null;
  played_at: string | null;
  groomed_at: string | null;
  last_passive_tick?: string | null;
  last_daily_bonus_at?: string | null;
};

export type Companion = {
  id: string;
  owner_id?: string;
  name: string;
  species: string;
  rarity: string;
  level: number;
  xp: number;
  affection: number;
  trust: number;
  energy: number;
  mood: string;
  state?: 'idle' | 'resting' | 'active' | string;
  is_active?: boolean;
  slot_index?: number | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  stats?: CompanionStats | null;
};

export type CareState = {
  affection: number;
  trust: number;
  energy: number;
  mood: string;
  streak?: number | null;
};

export type ActiveCompanionSnapshot = {
  id: string;
  name: string;
  species: string | null;
  mood: string | null;
  affection: number;
  trust: number;
  energy: number;
  avatar_url?: string | null;
};

type RefreshResult = {
  data: Companion[] | null;
  error: Error | null;
};

const deriveActiveSnapshot = (list: Companion[]): ActiveCompanionSnapshot | null => {
  if (!Array.isArray(list) || list.length === 0) return null;
  const preferred =
    list.find((entry) => entry.is_active || entry.state === 'active') ??
    list.find((entry) => typeof entry.slot_index === 'number') ??
    list[0];
  if (!preferred) return null;
  return {
    id: preferred.id,
    name: preferred.name,
    species: preferred.species ?? null,
    mood: preferred.mood ?? preferred.state ?? 'steady',
    affection: preferred.affection ?? 0,
    trust: preferred.trust ?? 0,
    energy: preferred.energy ?? 0,
    avatar_url: preferred.avatar_url ?? null
  };
};

let latestActiveSnapshot: ActiveCompanionSnapshot | null = null;

const createCompanionsStore = () => {
  const { subscribe, set, update } = writable<Companion[]>([]);
  let lastSnapshot: Companion[] = [];

  const applyLevelTracking = (nextList: Companion[]) => {
    if (!browser) {
      lastSnapshot = nextList;
      return;
    }
    const prevLevels = new Map(lastSnapshot.map((companion) => [companion.id, companion.level ?? 0]));
    nextList.forEach((companion) => {
      const previous = prevLevels.get(companion.id);
      if (typeof previous === 'number' && companion.level > previous) {
        logEvent('companion_level', { companionId: companion.id, level: companion.level });
      }
    });
    lastSnapshot = nextList;
  };

  const syncActiveSnapshot = (list: Companion[]) => {
    latestActiveSnapshot = deriveActiveSnapshot(list);
  };

  return {
    subscribe,
    setList: (list: Companion[]) => {
      set(list);
      applyLevelTracking(list);
       syncActiveSnapshot(list);
    },
    refresh: async (): Promise<RefreshResult> => {
      if (!browser) {
        return { data: null, error: new Error('refresh_unavailable') };
      }
      const supabase = supabaseBrowser();
      const { data, error } = await supabase
        .from('companions')
        .select(
          'id, owner_id, name, species, rarity, level, xp, affection, trust, energy, mood, state, is_active, slot_index, avatar_url, created_at, updated_at, stats:companion_stats(companion_id, care_streak, fed_at, played_at, groomed_at)'
        )
        .order('created_at', { ascending: true });

      if (error) {
        return { data: null, error: new Error(error.message) };
      }

      const list = (data as Companion[]) ?? [];
      set(list);
      applyLevelTracking(list);
      syncActiveSnapshot(list);
      return { data: list, error: null };
    },
    applyCare: (id: string, state: CareState) => {
      let nextList: Companion[] = [];
      update((list) => {
        nextList = list.map((companion) => {
          if (companion.id !== id) return companion;
          const nextStats: CompanionStats | null = companion.stats
            ? { ...companion.stats, care_streak: state.streak ?? companion.stats.care_streak }
            : state.streak !== undefined
              ? { companion_id: companion.id, care_streak: state.streak ?? 0, fed_at: null, played_at: null, groomed_at: null }
              : null;
          return {
            ...companion,
            affection: state.affection,
            trust: state.trust,
            energy: state.energy,
            mood: state.mood,
            stats: nextStats
          };
        });
        return nextList;
      });
      applyLevelTracking(nextList);
      syncActiveSnapshot(nextList);
    },
    getActiveSnapshot: () => latestActiveSnapshot ?? null
  };
};

export const companionsStore = createCompanionsStore();
export const activeCompanionStore = derived(companionsStore, (list) => deriveActiveSnapshot(list));
export const getActiveCompanionSnapshot = () => latestActiveSnapshot;
    }
  };
};

export const companionsStore = createCompanionsStore();
