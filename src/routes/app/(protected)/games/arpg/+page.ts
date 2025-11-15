import type { PageLoad } from './$types';

const SLUG = 'arpg';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const response = await fetch('/api/games/config');
    const payload = response.ok ? await response.json() : { games: [] };
    const game = Array.isArray(payload.games)
      ? payload.games.find((entry: { slug: string }) => entry.slug === SLUG) ?? null
      : null;
    return { slug: SLUG, game };
  } catch (err) {
    console.warn('[games] arpg load failed', err);
    return { slug: SLUG, game: null };
  }
};
