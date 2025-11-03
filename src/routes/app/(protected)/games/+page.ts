import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const [configRes, stateRes, walletRes] = await Promise.all([
      fetch('/api/games/config'),
      fetch('/api/games/player/state'),
      fetch('/api/econ/wallet')
    ]);

    const gamesPayload = configRes.ok ? await configRes.json() : { games: [] };
    const playerState = stateRes.ok ? await stateRes.json() : null;
    const wallet = walletRes.ok ? await walletRes.json() : null;

    return {
      games: gamesPayload.games ?? [],
      playerState,
      wallet
    };
  } catch (err) {
    console.warn('[games] config load failed', err);
    return { games: [], playerState: null };
  }
};
