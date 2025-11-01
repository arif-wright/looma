import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
  fetchLeaderboardRows,
  fetchLeaderboardTotal,
  fetchUserMetadata,
  resolveGameBySlug,
  type LeaderboardScope
} from '$lib/server/games/leaderboard';

const clampLimit = (value: number) => {
  if (!Number.isFinite(value)) return 25;
  return Math.min(Math.max(value, 1), 100);
};

export const handleLeaderboardRequest = async (event: RequestEvent, scope: LeaderboardScope) => {
  const slug = event.params.slug;
  if (!slug) {
    return json(
      { code: 'bad_request', message: 'Missing game slug' },
      { status: 400 }
    );
  }

  const url = event.url;
  const pageParam = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '25', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const limit = clampLimit(limitParam);
  const offset = (page - 1) * limit;

  let game;
  try {
    game = await resolveGameBySlug(slug);
  } catch (err) {
    const status = (err as any)?.status ?? 500;
    const message = status === 404 ? 'Game not found' : 'Unable to load game';
    return json({ code: status === 404 ? 'not_found' : 'server_error', message }, { status });
  }

  let rows;
  let total = 0;
  try {
    rows = await fetchLeaderboardRows(game.id, scope, limit, offset);
    total = await fetchLeaderboardTotal(game.id, scope);
  } catch (err) {
    console.error('[games] leaderboard query error', err);
    return json({ code: 'server_error', message: 'Unable to load leaderboard' }, { status: 500 });
  }

  const metaMap = await fetchUserMetadata(rows.map((row) => row.user_id));
  const currentUserId = ((event.locals.user as { id: string } | undefined)?.id) ?? null;

  const formatted = rows.map((row) => {
    const profile = metaMap.get(row.user_id) ?? null;
    return {
      rank: row.rank,
      user: {
        id: row.user_id,
        handle: profile?.handle ?? null,
        displayName: profile?.display_name ?? null,
        avatar: profile?.avatar_url ?? null
      },
      score: row.score,
      when: scope === 'alltime' ? row.achieved_at ?? null : row.period_start ?? null,
      isSelf: currentUserId === row.user_id
    };
  });

  const response = json(
    {
      meta: {
        page,
        limit,
        total,
        scope
      },
      rows: formatted
    },
    {
      status: 200,
      headers: {
        'cache-control': 'public, s-maxage=30, stale-while-revalidate=120'
      }
    }
  );

  return response;
};
