import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';
import { createAchievementEvaluator } from '$lib/server/achievements/evaluator';
import { getBondBonusForLevel, type BondBonus } from '$lib/companions/bond';

export type BondStatsRow = {
  companion_id: string;
  bond_score: number | null;
  bond_level: number | null;
};

type CompanionRow = {
  id: string;
  stats?: { bond_level?: number | null; bond_score?: number | null } | null;
};

const BOND_ACHIEVEMENTS = [
  { key: 'bond_first', minLevel: 1 },
  { key: 'bond_growing', minLevel: 4 },
  { key: 'bond_unbreakable', minLevel: 8 }
];

const toBondStatsRow = (row: Record<string, unknown>): BondStatsRow | null => {
  if (!row || typeof row !== 'object') return null;
  const payload = row as Record<string, unknown>;
  const companionId = typeof payload.companion_id === 'string' ? payload.companion_id : null;
  if (!companionId) return null;
  return {
    companion_id: companionId,
    bond_score: typeof payload.bond_score === 'number' ? payload.bond_score : null,
    bond_level: typeof payload.bond_level === 'number' ? payload.bond_level : null
  } satisfies BondStatsRow;
};

export const recalculateBondsForPlayer = async (
  client: SupabaseClient,
  playerId: string
): Promise<BondStatsRow[]> => {
  if (!playerId) return [];
  const { data, error } = await client.rpc('recalculate_bonds_for_player', {
    p_player_id: playerId
  });

  if (error) {
    console.error('[companions] recalc bonds failed', error, { playerId });
    return [];
  }

  if (!Array.isArray(data)) return [];
  return (data.map(toBondStatsRow).filter(Boolean) ?? []) as BondStatsRow[];
};

const findActiveCompanion = async (
  client: SupabaseClient,
  playerId: string
): Promise<CompanionRow | null> => {
  const { data, error } = await client
    .from('companions')
    .select('id, stats:companion_stats(bond_level, bond_score)')
    .eq('owner_id', playerId)
    .order('is_active', { ascending: false })
    .order('state', { ascending: false })
    .order('slot_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[companions] active companion lookup failed', error, { playerId });
    return null;
  }

  if (!data || typeof data.id !== 'string') return null;
  return data as CompanionRow;
};

const ensureAchievementsForLevel = async (
  client: SupabaseClient,
  playerId: string,
  level: number
) => {
  if (!playerId || level <= 0) return;
  const evaluator = createAchievementEvaluator({ supabase: client });
  const catalog = await evaluator.getCatalogForGame();
  const catalogMap = new Map(catalog.map((entry) => [entry.key, entry]));

  for (const { key, minLevel } of BOND_ACHIEVEMENTS) {
    if (level < minLevel) continue;
    const achievement = catalogMap.get(key);
    if (!achievement) continue;
    if (await evaluator.userHas(playerId, achievement.id)) continue;
    try {
      await evaluator.unlock(playerId, achievement, { bondLevel: level, source: 'companion_bond' });
    } catch (err) {
      console.error('[companions] failed to unlock bond achievement', err, { key, playerId });
    }
  }
};

export const syncPlayerBondState = async (
  client: SupabaseClient,
  playerId: string
): Promise<{ rows: BondStatsRow[]; bonus: BondBonus }> => {
  const rows = await recalculateBondsForPlayer(client, playerId);
  const maxLevel = rows.reduce((acc, row) => Math.max(acc, row.bond_level ?? 0), 0);
  await ensureAchievementsForLevel(client, playerId, maxLevel);
  return { rows, bonus: getBondBonusForLevel(maxLevel) };
};

export const getActiveCompanionBond = async (
  playerId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<{ companionId: string; level: number; score: number; bonus: BondBonus } | null> => {
  if (!playerId) return null;
  const companion = await findActiveCompanion(client, playerId);
  if (!companion) return null;
  const level = companion.stats?.bond_level ?? 0;
  const score = companion.stats?.bond_score ?? 0;
  return {
    companionId: companion.id,
    level,
    score,
    bonus: getBondBonusForLevel(level)
  };
};

export const getCompanionXpMultiplier = async (
  playerId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<number> => {
  const snapshot = await getActiveCompanionBond(playerId, client);
  return snapshot?.bonus.xpMultiplier ?? 1;
};

export const getCompanionMissionBonus = async (
  playerId: string,
  client: SupabaseClient = supabaseAdmin
): Promise<BondBonus> => {
  const snapshot = await getActiveCompanionBond(playerId, client);
  return snapshot?.bonus ?? getBondBonusForLevel(0);
};
