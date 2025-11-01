import { getAdminClient, getGameBySlugAdmin } from '$lib/server/games/guard';

export type LeaderboardScope = 'alltime' | 'daily' | 'weekly';

export type LeaderboardRow = {
  rank: number;
  user_id: string;
  score: number;
  achieved_at?: string | null;
  period_start?: string | null;
};

const scopeConfig: Record<LeaderboardScope, { fetchFn: string; countFn: string }> = {
  alltime: {
    fetchFn: 'fn_leader_fetch_alltime',
    countFn: 'fn_leader_count_alltime'
  },
  daily: {
    fetchFn: 'fn_leader_fetch_daily',
    countFn: 'fn_leader_count_daily'
  },
  weekly: {
    fetchFn: 'fn_leader_fetch_weekly',
    countFn: 'fn_leader_count_weekly'
  }
};

export const resolveGameBySlug = async (slug: string) => {
  const game = await getGameBySlugAdmin(slug);
  if (!game || !game.is_active) {
    const err = new Error('Game not found');
    (err as any).status = 404;
    throw err;
  }
  return game;
};

export const fetchLeaderboardRows = async (
  gameId: string,
  scope: LeaderboardScope,
  limit: number,
  offset: number
): Promise<LeaderboardRow[]> => {
  const admin = getAdminClient();
  const fn = scopeConfig[scope].fetchFn;
  const { data, error } = await admin.rpc(fn, {
    p_game: gameId,
    p_limit: limit,
    p_offset: offset
  });

  if (error) {
    console.error('[games] leaderboard fetch failed', scope, error);
    throw new Error('leaderboard_fetch_failed');
  }

  return (data as Array<any> | null)?.map((row) => ({
    rank: row.rank,
    user_id: row.user_id,
    score: row.best_score,
    achieved_at: row.achieved_at ?? null,
    period_start: row.period_start ?? null
  })) ?? [];
};

export const fetchLeaderboardTotal = async (gameId: string, scope: LeaderboardScope): Promise<number> => {
  const admin = getAdminClient();
  const fn = scopeConfig[scope].countFn;
  const { data, error } = await admin.rpc(fn, { p_game: gameId });
  if (error) {
    console.error('[games] leaderboard count failed', scope, error);
    throw new Error('leaderboard_count_failed');
  }
  const value = Array.isArray(data) ? (data[0] as number) : (data as number);
  return typeof value === 'number' ? value : 0;
};

export type LeaderboardUserMeta = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export const fetchUserMetadata = async (userIds: string[]): Promise<Map<string, LeaderboardUserMeta>> => {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, LeaderboardUserMeta>();
  if (unique.length === 0) return result;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, handle, display_name, avatar_url')
    .in('id', unique);

  if (error) {
    console.error('[games] failed to load profile metadata', error);
    return result;
  }

  (data ?? []).forEach((row) => {
    if (!row || typeof row.id !== 'string') return;
    result.set(row.id, {
      id: row.id,
      handle: row.handle ?? null,
      display_name: row.display_name ?? null,
      avatar_url: row.avatar_url ?? null
    });
  });

  return result;
};
