import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  const slug = params.slug;

  try {
    const response = await fetch('/api/games/config');
    const payload = response.ok ? await response.json() : { games: [] };
    const game = Array.isArray(payload.games)
      ? payload.games.find((entry: { slug: string }) => entry.slug === slug) ?? null
      : null;
    return { slug, game };
  } catch (err) {
    console.warn('[games] embed load failed', err);
    return { slug, game: null };
  }
};
