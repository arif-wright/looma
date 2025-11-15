import type { PageServerLoad } from './$types';

const COMPANION_COLUMNS =
  'id, owner_id, name, species, rarity, level, xp, affection, trust, energy, mood, state, is_active, slot_index, avatar_url, created_at, updated_at, stats:companion_stats(companion_id, care_streak, fed_at, played_at, groomed_at, last_passive_tick, last_daily_bonus_at, bond_level, bond_score)';

type TickSnapshot = {
  id: string;
  affection: number;
  trust: number;
  energy: number;
  mood: string | null;
  lastPassiveTick: string | null;
  lastDailyBonusAt: string | null;
  bondLevel: number;
  bondScore: number;
};

type PassiveTickEvent = {
  id: string;
  companionId: string;
  kind: 'passive' | 'daily_bonus';
  message: string;
  createdAt: string;
  affectionDelta: number;
  trustDelta: number;
  energyDelta: number;
};

export const load: PageServerLoad = async ({ locals, fetch }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;

  if (!supabase || !userId) {
    return { companions: [], maxSlots: 3, activeCompanionId: null, tickEvents: [] };
  }

  let tickedCompanions = new Map<string, TickSnapshot>();
  let tickEvents: PassiveTickEvent[] = [];

  try {
    const resp = await fetch('/api/companions/tick', { method: 'POST' });
    const payload = (await resp.json().catch(() => null)) as {
      companions?: TickSnapshot[];
      newEvents?: PassiveTickEvent[];
    } | null;
    if (resp.ok && payload) {
      tickedCompanions = new Map(
        (Array.isArray(payload.companions) ? payload.companions : []).map((row) => [
          row.id,
          {
            id: row.id,
            affection: row.affection ?? 0,
            trust: row.trust ?? 0,
            energy: row.energy ?? 0,
            mood: row.mood ?? 'neutral',
            lastPassiveTick: row.lastPassiveTick ?? null,
            lastDailyBonusAt: row.lastDailyBonusAt ?? null,
            bondLevel: row.bondLevel ?? 0,
            bondScore: row.bondScore ?? 0
          }
        ])
      );
      tickEvents = Array.isArray(payload.newEvents) ? payload.newEvents : [];
    }
  } catch (err) {
    console.error('[companions:load] failed to tick companions', err);
  }

  const [companionsResult, slotsResult] = await Promise.all([
    supabase
      .from('companions')
      .select(COMPANION_COLUMNS)
      .eq('owner_id', userId)
      .order('slot_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.rpc('ensure_slots')
  ]);

  const companions = (companionsResult.data ?? []).map((companion) => {
    const ticked = tickedCompanions.get(companion.id);
    if (!ticked) {
      return companion;
    }
    const stats = companion.stats
      ? {
          ...companion.stats,
          last_passive_tick: ticked.lastPassiveTick,
          last_daily_bonus_at: ticked.lastDailyBonusAt,
          bond_level: ticked.bondLevel,
          bond_score: ticked.bondScore
        }
      : {
          companion_id: companion.id,
          care_streak: 0,
          fed_at: null,
          played_at: null,
          groomed_at: null,
          last_passive_tick: ticked.lastPassiveTick,
          last_daily_bonus_at: ticked.lastDailyBonusAt,
          bond_level: ticked.bondLevel,
          bond_score: ticked.bondScore
        };
    return {
      ...companion,
      affection: ticked.affection,
      trust: ticked.trust,
      energy: ticked.energy,
      mood: ticked.mood ?? companion.mood,
      stats,
      bond_level: stats.bond_level,
      bond_score: stats.bond_score
    };
  });
  const maxSlotsRaw = slotsResult.data;
  const maxSlots = typeof maxSlotsRaw === 'number' && Number.isFinite(maxSlotsRaw) ? maxSlotsRaw : 3;

  const activeCompanionId = companions.find((companion) => companion.is_active)?.id ?? companions[0]?.id ?? null;

  return {
    companions,
    maxSlots,
    activeCompanionId,
    tickEvents,
    error: companionsResult.error?.message ?? slotsResult.error?.message ?? null
  };
};
