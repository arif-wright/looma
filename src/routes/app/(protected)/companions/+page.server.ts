import type { PageServerLoad } from './$types';
import { getCompanionRituals } from '$lib/server/companions/rituals';
import { fetchBondAchievementsForUser } from '$lib/server/achievements/bond';
import { normalizePortableCompanions } from '$lib/server/context/portableCompanions';
import { isMuseCompanion, resolveMuseEvolutionStage } from '$lib/companions/evolution';
import {
  buildCompanionArchetypeMetadataByCompanionId,
  buildCompanionDiscoverCatalog
} from '$lib/companions/definitions';

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
  kind: string;
  message: string;
  createdAt: string;
  affectionDelta: number;
  trustDelta: number;
  energyDelta: number;
};

type CompanionArchetypeRow = {
  key: string;
  name: string;
  description: string;
  color: string;
  seed: string;
};

export const load: PageServerLoad = async ({ locals, fetch }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;

  if (!supabase || !userId) {
    return { companions: [], maxSlots: 3, activeCompanionId: null, tickEvents: [], discoverCatalog: [] };
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

  const [companionsResult, slotsResult, archetypesResult] = await Promise.all([
    supabase
      .from('companions')
      .select(COMPANION_COLUMNS)
      .eq('owner_id', userId)
      .order('slot_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.rpc('ensure_slots'),
    supabase
      .from('companion_archetypes')
      .select('key, name, description, color, seed')
      .order('name', { ascending: true })
  ]);
  const chapterRewardsResult = await supabase
    .from('companion_chapter_rewards')
    .select('companion_id, reward_key, reward_title, reward_body, reward_tone, unlocked_at')
    .eq('owner_id', userId)
    .order('unlocked_at', { ascending: false });
  const chapterRevealHistoryResult = await supabase
    .from('companion_journal_entries')
    .select('companion_id, id, title, body, created_at, meta_json')
    .eq('owner_id', userId)
    .eq('source_type', 'system')
    .contains('meta_json', { generatedBy: 'chapter_reward_reveal' })
    .order('created_at', { ascending: false })
    .limit(24);
  const featuredKeepsakePreferenceResult = await supabase
    .from('user_preferences')
    .select('featured_companion_reward_key, featured_companion_reward_companion_id')
    .eq('user_id', userId)
    .maybeSingle();

  let evolutionStagesByCompanionId: Record<string, string> = {};
  try {
    const { data: prefData, error: prefError } = await supabase
      .from('user_preferences')
      .select('portable_state')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefError && prefError.code !== 'PGRST116') {
      console.error('[companions:load] portable_state lookup failed', prefError);
    } else {
      const portableCompanions = normalizePortableCompanions(
        (prefData?.portable_state as Record<string, unknown> | null)?.companions
      );
      evolutionStagesByCompanionId = portableCompanions.roster.reduce<Record<string, string>>((acc, entry) => {
        if (!isMuseCompanion(entry.id)) return acc;
        acc[entry.id] = resolveMuseEvolutionStage({
          companionId: entry.id,
          unlockedCosmetics: entry.cosmeticsUnlocked
        }).label;
        return acc;
      }, {});
    }
  } catch (err) {
    console.error('[companions:load] failed to compute evolution stages', err);
  }

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
  const bondMilestones = await fetchBondAchievementsForUser(supabase, userId);
  const rituals = await getCompanionRituals(supabase, userId);
  const discoverCatalog = buildCompanionDiscoverCatalog((archetypesResult.data ?? []) as CompanionArchetypeRow[]);
  const archetypeMetadataByCompanionId = buildCompanionArchetypeMetadataByCompanionId(companions);
  const chapterRewardsByCompanionId = ((chapterRewardsResult.data ?? []) as Array<Record<string, unknown>>).reduce<
    Record<
      string,
      Array<{
        rewardKey: string;
        title: string;
        body: string;
        tone: string | null;
        unlockedAt: string | null;
      }>
    >
  >((acc, row) => {
    const companionId = typeof row.companion_id === 'string' ? row.companion_id : '';
    if (!companionId) return acc;
    acc[companionId] ??= [];
    acc[companionId].push({
      rewardKey: typeof row.reward_key === 'string' ? row.reward_key : 'keepsake',
      title: typeof row.reward_title === 'string' ? row.reward_title : 'Companion keepsake',
      body: typeof row.reward_body === 'string' ? row.reward_body : '',
      tone: typeof row.reward_tone === 'string' ? row.reward_tone : null,
      unlockedAt: typeof row.unlocked_at === 'string' ? row.unlocked_at : null
    });
    return acc;
  }, {});
  const chapterRevealHistoryByCompanionId = ((chapterRevealHistoryResult.data ?? []) as Array<Record<string, unknown>>).reduce<
    Record<string, Array<{ id: string; title: string; body: string; createdAt: string | null }>>
  >((acc, row) => {
    const companionId = typeof row.companion_id === 'string' ? row.companion_id : '';
    if (!companionId) return acc;
    acc[companionId] ??= [];
    acc[companionId].push({
      id: typeof row.id === 'string' ? row.id : `reveal-${acc[companionId].length}`,
      title: typeof row.title === 'string' ? row.title : 'Chapter opened',
      body: typeof row.body === 'string' ? row.body : '',
      createdAt: typeof row.created_at === 'string' ? row.created_at : null
    });
    return acc;
  }, {});
  const featuredKeepsakePreference = {
    rewardKey:
      typeof featuredKeepsakePreferenceResult.data?.featured_companion_reward_key === 'string'
        ? featuredKeepsakePreferenceResult.data.featured_companion_reward_key
        : null,
    companionId:
      typeof featuredKeepsakePreferenceResult.data?.featured_companion_reward_companion_id === 'string'
        ? featuredKeepsakePreferenceResult.data.featured_companion_reward_companion_id
        : null
  };

  return {
    companions,
    maxSlots,
    activeCompanionId,
    discoverCatalog,
    tickEvents,
    error: companionsResult.error?.message ?? slotsResult.error?.message ?? archetypesResult.error?.message ?? null,
    bondMilestones,
    rituals,
    evolutionStagesByCompanionId,
    archetypeMetadataByCompanionId,
    chapterRewardsByCompanionId,
    chapterRevealHistoryByCompanionId,
    featuredKeepsakePreference
  };
};
