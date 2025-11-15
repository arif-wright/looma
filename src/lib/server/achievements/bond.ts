import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BOND_ACHIEVEMENTS,
  type BondAchievementStatus,
  BOND_ACHIEVEMENT_KEYS
} from '$lib/companions/bond';

export const fetchBondAchievementsForUser = async (
  client: SupabaseClient,
  userId: string | null | undefined
): Promise<BondAchievementStatus[]> => {
  if (!userId) {
    return BOND_ACHIEVEMENTS.map((entry) => ({ ...entry, unlocked: false, unlocked_at: null }));
  }

  const { data, error } = await client
    .from('user_achievements')
    .select(
      'unlocked_at, achievements:achievements!user_achievements_achievement_id_fkey ( key )'
    )
    .eq('user_id', userId)
    .in('achievements.key', BOND_ACHIEVEMENT_KEYS);

  if (error) {
    console.error('[bond achievements] lookup failed', error);
    return BOND_ACHIEVEMENTS.map((entry) => ({ ...entry, unlocked: false, unlocked_at: null }));
  }

  const unlockedKeys = new Map<string, string | null>();
  (data ?? []).forEach((row) => {
    const key = (row.achievements as { key?: string | null } | null)?.key;
    if (key) {
      unlockedKeys.set(key, row.unlocked_at ?? null);
    }
  });

  return BOND_ACHIEVEMENTS.map((entry) => ({
    ...entry,
    unlocked: unlockedKeys.has(entry.key),
    unlocked_at: unlockedKeys.get(entry.key) ?? null
  }));
};
