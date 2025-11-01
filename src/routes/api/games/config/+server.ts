import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/games/guard';

export const GET: RequestHandler = async (event) => {
  const { supabase } = await requireUser(event);

  const { data, error } = await supabase
    .from('game_titles')
    .select('slug, name, min_version, max_score')
    .eq('is_active', true)
    .order('name');

  if (error) {
    if (error.code === 'PGRST205' || error.code === 'PGRST202') {
      console.warn('[games] config fallback engaged, schema missing');
      return json({
        games: [
          { slug: 'tiles-run', name: 'Tiles Run', min_version: '1.0.0', max_score: 100000 }
        ],
        fallback: true
      });
    }
    console.error('[games] config lookup failed', error);
    return json({ error: 'server_error' }, { status: 500 });
  }

  return json({ games: data ?? [] });
};
