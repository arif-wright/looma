import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;
type AchievementRow = {
  key: string;
  name: string | null;
  description: string | null;
  icon: string | null;
  rarity: string | null;
  points: number | null;
};

type UnlockRow = {
  unlocked_at: string;
  meta: Record<string, unknown> | null;
  achievements: unknown;
};

export const GET: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    console.error('[api/achievements/me] auth error', authError);
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }

  if (!user) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  const [{ data: pointsRow, error: pointsError }, { data: unlockRows, error: unlockError }] = await Promise.all([
    supabase.from('user_points').select('points').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('user_achievements')
      .select(
        'id, unlocked_at, meta, achievements:achievements!user_achievements_achievement_id_fkey ( key, name, description, icon, rarity, points )'
      )
      .eq('user_id', user.id)
      .order('unlocked_at', { ascending: false })
  ]);

  if (pointsError) {
    console.error('[api/achievements/me] points fetch failed', pointsError);
  }

  if (unlockError) {
    console.error('[api/achievements/me] unlocks fetch failed', unlockError);
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }

  const points = typeof pointsRow?.points === 'number' ? pointsRow?.points ?? 0 : 0;

  const unlockRowsTyped = (unlockRows ?? []) as UnlockRow[];

  const unlocks = unlockRowsTyped
    .map((row: UnlockRow) => {
      const rawAchievement = row.achievements as AchievementRow | AchievementRow[] | null;
      const achievement = Array.isArray(rawAchievement) ? rawAchievement[0] ?? null : rawAchievement;
      if (!achievement || typeof achievement.key !== 'string') return null;
      return {
        key: achievement.key,
        name: achievement.name ?? achievement.key,
        description: achievement.description ?? '',
        icon: achievement.icon ?? 'trophy',
        rarity: achievement.rarity ?? 'common',
        points: typeof achievement.points === 'number' ? achievement.points : 0,
        unlockedAt: row.unlocked_at,
        meta: row.meta ?? {}
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return json({ points, unlocks }, { headers: CACHE_HEADERS });
};
