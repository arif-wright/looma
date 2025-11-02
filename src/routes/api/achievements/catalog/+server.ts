import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

const CACHE_HEADERS = {
  'cache-control': 'public, s-maxage=60, stale-while-revalidate=300'
} as const;

const fallbackIcon = 'trophy';

export const GET: RequestHandler = async () => {
  const { data, error } = await supabaseAdmin
    .from('achievements')
    .select('id, key, name, description, icon, rarity, points, rule, game_id, game:game_titles ( slug, name )')
    .eq('is_active', true)
    .order('inserted_at', { ascending: true });

  if (error) {
    console.error('[api/achievements/catalog] fetch failed', error);
    return json({ error: 'server_error' }, { status: 500, headers: CACHE_HEADERS });
  }

  const achievements = (data ?? [])
    .map((row) => {
      if (!row || typeof row.key !== 'string') return null;
      const rule = row.rule;
      const ruleKind =
        rule && typeof rule === 'object' && rule !== null && typeof (rule as Record<string, unknown>).kind === 'string'
          ? ((rule as Record<string, unknown>).kind as string)
          : null;

      const gameInfo = row.game as { slug?: string | null; name?: string | null } | null;

      return {
        id: row.id,
        key: row.key,
        name: row.name ?? row.key,
        description: row.description ?? '',
        icon: row.icon ?? fallbackIcon,
        rarity: row.rarity ?? 'common',
        points: typeof row.points === 'number' ? row.points : 0,
        gameId: row.game_id ?? null,
        gameSlug: gameInfo?.slug ?? null,
        gameName: gameInfo?.name ?? null,
        ruleKind
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return json({ achievements }, { headers: CACHE_HEADERS });
};
