import { describe, expect, it } from 'vitest';
import { games, discoverableGames, isDiscoverableGame } from '$lib/data/games';
import { filterDiscoverableGames, pickerEntries, pickerArtwork, recentDiscoverableGames } from '$lib/games/discovery';
import type { RewardEntry } from '$lib/games/state';

const tiles = { slug: 'tiles-run', name: 'Tiles Run', min_version: '1.0.0', max_score: 100000 };
const neon = { slug: 'runner', name: 'Neon Run', min_version: '1.0.0', max_score: 100000 };
const reward = (game: string | null, gameName: string | null): RewardEntry => ({
  id: game ?? 'old-name-only', game, gameName, xpDelta: 12, currencyDelta: 24, insertedAt: '2026-10-04T12:00:00Z'
});

describe('presentation-only Tiles Run archive', () => {
  it('retains original metadata and distinct Neon identity', () => {
    expect(games.find((game) => game.slug === 'tiles-run')).toMatchObject({ id: 'tiles-run', name: 'Tiles Run', archived: true });
    expect(games.find((game) => game.slug === 'runner')).toMatchObject({ id: 'runner', name: 'Neon Run' });
    expect(isDiscoverableGame('runner')).toBe(true);
    expect(isDiscoverableGame('unknown-future-game')).toBe(true);
    expect(discoverableGames.some((game) => game.slug === 'tiles-run')).toBe(false);
  });

  it.each([
    ['normal database list', [tiles, neon]], ['empty catalog', []],
    ['failed catalog', undefined], ['only archived catalog rows', [tiles]]
  ] as const)('keeps Tiles out of %s and static append', (_label, input) => {
    const visible = pickerEntries(input);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.some((game) => game.slug === 'tiles-run')).toBe(false);
    const artwork = pickerArtwork(visible);
    expect(artwork.some((game) => game.slug === 'tiles-run')).toBe(false);
    expect(artwork.some((game) => game.slug === 'runner')).toBe(true);
  });

  it('does not mutate the source catalog or historical reward list', () => {
    const entries = [tiles, neon];
    expect(filterDiscoverableGames(entries)).toEqual([neon]);
    expect(entries).toEqual([tiles, neon]);
    const rewards = [reward('tiles-run', 'Tiles Run'), reward(null, 'Tiles Run'), reward('runner', 'Neon Run')];
    const original = structuredClone(rewards);
    expect(recentDiscoverableGames(rewards)).toEqual([{ slug: 'runner', name: 'Neon Run' }]);
    expect(rewards).toEqual(original);
  });

  it('does not feature Tiles when it is the only recent game', () => {
    expect(recentDiscoverableGames([reward('tiles-run', 'Tiles Run')])).toEqual([]);
    expect(pickerEntries([])[0]?.slug).not.toBe('tiles-run');
  });
});

describe('archive retains the old game route access contract', () => {
  it('allows a signed-in user without adding companion or alpha requirements', async () => {
    const { load } = await import('../../routes/app/(archive)/+layout.server');
    const user = { id: 'synthetic-existing-player' };
    await expect(load({ locals: { user } } as never)).resolves.toEqual({ user });
  });
  it('keeps the previous unauthenticated redirect', async () => {
    const { load } = await import('../../routes/app/(archive)/+layout.server');
    await expect(load({ locals: { user: null } } as never)).rejects.toMatchObject({ status: 302, location: '/' });
  });
});
