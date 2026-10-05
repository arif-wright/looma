import { afterEach, describe, expect, it, vi } from 'vitest';
const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock('$lib/server/games/guard', () => ({ requireUser }));
import { GET } from '../../routes/api/games/config/+server';

const tiles = { slug: 'tiles-run', name: 'Tiles Run', min_version: '1.0.0', max_score: 100000 };
const neon = { slug: 'runner', name: 'Neon Run', min_version: '1.0.0', max_score: 100000 };
function fixture(data: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(async () => ({ data, error })) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const from = vi.fn(() => query);
  requireUser.mockResolvedValue({ supabase: { from } });
  return { from, query };
}
afterEach(() => { vi.restoreAllMocks(); });
describe('game config discovery policy', () => {
  it('omits archived Tiles from active database rows without mutating them', async () => {
    const data = [tiles, neon];
    const { from, query } = fixture(data);
    const response = await GET({} as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ games: [neon] });
    expect(data).toEqual([tiles, neon]);
    expect(from).toHaveBeenCalledWith('game_titles');
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
  });
  it.each([[], null])('preserves an empty successful response for the safe UI fallback', async (data) => {
    fixture(data);
    expect(await (await GET({} as never)).json()).toEqual({ games: [] });
  });
  it.each(['PGRST205', 'PGRST202'])('excludes Tiles from %s schema fallback', async (code) => {
    fixture(null, { code });
    const response = await GET({} as never);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.fallback).toBe(true);
    expect(payload.games.length).toBeGreaterThan(0);
    expect(payload.games.some((game: { slug: string }) => game.slug === 'tiles-run')).toBe(false);
  });
  it('does not convert other failures into a successful config response', async () => {
    fixture(null, { code: 'XX000', message: 'database failed' });
    expect((await GET({} as never)).status).toBeGreaterThanOrEqual(400);
  });
});


describe('hub loader preserves history during catalog outages', () => {
  it.each(['failed-response', 'network-error', 'invalid-json', 'invalid-shape', 'empty'])('keeps history on %s', async (scenario) => {
    const { load } = await import('../../routes/app/(protected)/games/+page');
    const playerState = { rewards: [{ id: 'old-tiles', game: 'tiles-run', gameName: 'Tiles Run', xpDelta: 12, currencyDelta: 24 }] };
    const wallet = { shards: 24 };
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/api/games/config') {
        if (scenario === 'network-error') throw new Error('Catalog unavailable');
        if (scenario === 'invalid-json') return new Response('not-json');
        if (scenario === 'invalid-shape') return new Response(JSON.stringify({ games: {} }));
        return new Response(JSON.stringify({ games: [] }), { status: scenario === 'failed-response' ? 503 : 200 });
      }
      return new Response(JSON.stringify(url === '/api/games/player/state' ? playerState : wallet));
    });
    const result = await load({ fetch: fetcher } as never);
    expect(result).toEqual({ games: [], playerState, wallet });
  });
});
