import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const [configRes, stateRes] = await Promise.all([
      fetch('/api/games/config'),
      fetch('/api/games/player/state')
    ]);

    const gamesPayload = configRes.ok ? await configRes.json() : { games: [] };
    const playerState = stateRes.ok ? await stateRes.json() : null;

    return {
      games: gamesPayload.games ?? [],
      playerState
    };
  } catch (err) {
    console.warn('[games] config load failed', err);
    return { games: [], playerState: null };
  }
};
