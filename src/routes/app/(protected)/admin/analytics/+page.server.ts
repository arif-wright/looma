import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ensureAuth, getAdminClient } from '$lib/server/games/guard';

const parseList = (value: string | null | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const DAYS = 7;
const SCORE_MAX = 200000;
const SCORE_BUCKETS = 20;

const toDayKey = (iso: string) => iso.slice(0, 10);

export const load: PageServerLoad = async (event) => {
  const { user } = await ensureAuth(event);
  const admins = new Set(parseList(env.ADMIN_EMAILS));
  const userEmail = user.email?.toLowerCase() ?? '';

  if (!admins.has(userEmail)) {
    throw error(403, { message: 'Access denied.' });
  }

  event.setHeaders({
    'cache-control': 's-maxage=15, stale-while-revalidate=120'
  });

  const admin = getAdminClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() - (DAYS - 1) * 24 * 60 * 60 * 1000);
  const windowIso = windowStart.toISOString();

  const [{ data: games, error: gamesError }, { data: funnelsData, error: funnelsError }, { data: durationData, error: durationError }, { data: sharesData, error: sharesError }, { data: recentEvents, error: eventsError }] =
    await Promise.all([
      admin
        .from('game_titles')
        .select('id, slug, name')
        .order('name', { ascending: true }),
      admin
        .from('mv_game_funnels')
        .select('slug, day_utc, starts, completes')
        .gte('day_utc', windowIso)
        .order('day_utc', { ascending: true }),
      admin
        .from('analytics_events')
        .select('duration_ms')
        .eq('kind', 'game_complete')
        .gte('inserted_at', windowIso)
        .not('duration_ms', 'is', null),
      admin
        .from('analytics_events')
        .select('inserted_at')
        .eq('kind', 'share_post')
        .gte('inserted_at', windowIso),
      admin
        .from('analytics_events')
        .select('inserted_at, kind, user_id, game_id, score, duration_ms, amount, currency, meta')
        .order('inserted_at', { ascending: false })
        .limit(100)
    ]);

  if (gamesError || funnelsError || durationError || sharesError || eventsError) {
    console.error('[admin:analytics] query failed', {
      gamesError,
      funnelsError,
      durationError,
      sharesError,
      eventsError
    });
    throw error(500, { message: 'Unable to load analytics data.' });
  }

  const gameList =
    (games ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string
    })) ?? [];

  const slugToId = new Map(gameList.map((game) => [game.slug, game.id]));
  const selectedSlug =
    event.url.searchParams.get('game') ?? (gameList[0]?.slug ?? null);
  const selectedGameId =
    (selectedSlug && slugToId.get(selectedSlug)) ?? gameList[0]?.id ?? null;

  const bucketSize = SCORE_MAX / SCORE_BUCKETS;
  let scoreDistribution: Array<{ bucket: number; start: number; end: number; count: number }> = [];

  if (selectedGameId) {
    const { data: scoreData, error: scoreError } = await admin
      .from('mv_score_dist')
      .select('bucket, n')
      .eq('game_id', selectedGameId)
      .order('bucket', { ascending: true });

    if (scoreError) {
      console.error('[admin:analytics] score distribution failed', scoreError);
      throw error(500, { message: 'Unable to load score distribution.' });
    }

    scoreDistribution =
      (scoreData ?? []).map((row) => {
        const bucket = Number(row.bucket ?? 0);
        const start = Math.max(0, Math.round((bucket - 1) * bucketSize));
        const end = Math.round(bucket * bucketSize);
        return {
          bucket,
          start,
          end,
          count: Number(row.n ?? 0)
        };
      }) ?? [];
  }

  const funnelTotals = new Map<
    string,
    {
      day: string;
      starts: number;
      completes: number;
    }
  >();

  (funnelsData ?? []).forEach((row) => {
    const day = row.day_utc ? toDayKey(String(row.day_utc)) : null;
    if (!day) return;
    const ref = funnelTotals.get(day) ?? { day, starts: 0, completes: 0 };
    ref.starts += Number(row.starts ?? 0);
    ref.completes += Number(row.completes ?? 0);
    funnelTotals.set(day, ref);
  });

  const funnelSeries = Array.from({ length: DAYS }).map((_, index) => {
    const day = new Date(windowStart.getTime() + index * 24 * 60 * 60 * 1000);
    const key = toDayKey(day.toISOString());
    const entry = funnelTotals.get(key);
    return {
      day: key,
      starts: entry?.starts ?? 0,
      completes: entry?.completes ?? 0
    };
  });

  const shareTotals = new Map<string, number>();
  (sharesData ?? []).forEach((row) => {
    const iso = row.inserted_at ? String(row.inserted_at) : '';
    if (!iso) return;
    const key = toDayKey(iso);
    shareTotals.set(key, (shareTotals.get(key) ?? 0) + 1);
  });

  const shareSeries = Array.from({ length: DAYS }).map((_, index) => {
    const day = new Date(windowStart.getTime() + index * 24 * 60 * 60 * 1000);
    const key = toDayKey(day.toISOString());
    return {
      day: key,
      count: shareTotals.get(key) ?? 0
    };
  });

  let averageDurationMs: number | null = null;
  if (Array.isArray(durationData) && durationData.length > 0) {
    const total = durationData.reduce((sum, row) => sum + Number(row.duration_ms ?? 0), 0);
    averageDurationMs = Math.round(total / durationData.length);
  }

  const recent = (recentEvents ?? []).map((row) => {
    const gameId = row.game_id as string | null;
    const game = gameList.find((g) => g.id === gameId);
    return {
      inserted_at: row.inserted_at as string,
      kind: row.kind as string,
      user_id: row.user_id as string | null,
      game_id: gameId,
      game_slug: game?.slug ?? null,
      game_name: game?.name ?? null,
      score: row.score ?? null,
      duration_ms: row.duration_ms ?? null,
      amount: row.amount ?? null,
      currency: row.currency ?? null,
      meta: row.meta ?? {}
    };
  });

  return {
    games: gameList,
    selectedGame: selectedSlug,
    funnels: funnelSeries,
    scoreDistribution,
    averageDurationMs,
    shares: shareSeries,
    recentEvents: recent
  };
};
