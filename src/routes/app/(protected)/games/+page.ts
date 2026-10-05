import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const [configRes, stateRes, walletRes] = await Promise.all([
      // A catalog outage must not discard a successfully loaded reward history.
      fetch('/api/games/config').catch(() => null),
      fetch('/api/games/player/state'),
      fetch('/api/econ/wallet')
    ]);

    const gamesPayload = configRes?.ok ? await configRes.json().catch(() => null) : null;
    const playerState = stateRes.ok ? await stateRes.json() : null;
    const wallet = walletRes.ok ? await walletRes.json() : null;

    return {
      games: Array.isArray(gamesPayload?.games) ? gamesPayload.games : [],
      playerState,
      wallet
    };
  } catch (err) {
    console.warn('[games] config load failed', err);
    return { games: [], playerState: null };
  }
};
