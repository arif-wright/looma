import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ensureAuth, getAdminClient } from '$lib/server/games/guard';

const parseList = (value: string | null | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

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
  const url = event.url;
  const gameFilter = url.searchParams.get('game');
  const severityFilter = url.searchParams.get('severity');

  const gamesPromise = admin
    .from('game_titles')
    .select('id, slug, name')
    .order('name', { ascending: true });

  const anomalyQuery = admin
    .from('anomalies')
    .select('id, user_id, session_id, type, severity, details, inserted_at, reviewed_at')
    .order('inserted_at', { ascending: false })
    .limit(200);

  if (gameFilter) {
    anomalyQuery.eq('details->>gameId', gameFilter);
  }

  if (severityFilter) {
    const threshold = Number(severityFilter);
    if (!Number.isNaN(threshold)) {
      anomalyQuery.gte('severity', threshold);
    }
  }

  const [{ data: games, error: gamesError }, { data: anomalies, error: anomaliesError }] =
    await Promise.all([gamesPromise, anomalyQuery]);

  if (gamesError || anomaliesError) {
    console.error('[admin:anti] query failed', { gamesError, anomaliesError });
    throw error(500, { message: 'Unable to load anomalies.' });
  }

  const gameList =
    (games ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string
    })) ?? [];

  const typeCounts = new Map<string, number>();

  const items =
    (anomalies ?? []).map((row) => {
      const type = row.type as string;
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      return {
        id: row.id as string,
        user_id: row.user_id as string | null,
        session_id: row.session_id as string | null,
        type,
        severity: Number(row.severity ?? 1),
        details: row.details ?? {},
        inserted_at: row.inserted_at as string,
        reviewed_at: row.reviewed_at as string | null
      };
    }) ?? [];

  const counters = Array.from(typeCounts.entries()).map(([type, count]) => ({
    type,
    count
  }));

  return {
    games: gameList,
    anomalies: items,
    counters,
    filters: {
      game: gameFilter,
      severity: severityFilter
    }
  };
};
