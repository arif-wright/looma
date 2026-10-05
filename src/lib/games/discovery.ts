import { discoverableGames, isDiscoverableGame } from '$lib/data/games';
import type { RewardEntry } from '$lib/games/state';

export type GameEntry = {
  slug: string;
  name: string;
  min_version: string | null;
  max_score: number | null;
};

export const fallbackGameEntries: GameEntry[] = [
  { slug: 'arpg', name: 'Memvoya ARPG', min_version: '1.0.0', max_score: 150000 },
  { slug: 'astro-match', name: 'Astro Match', min_version: '1.0.0', max_score: 75000 }
];

/** Discovery is separate from historical rewards and API session availability. */
export const filterDiscoverableGames = <T extends { slug: string }>(entries: readonly T[]): T[] =>
  entries.filter((entry) => isDiscoverableGame(entry.slug));

export const pickerEntries = (entries: readonly GameEntry[] | null | undefined): GameEntry[] => {
  const visible = filterDiscoverableGames(entries ?? []);
  return visible.length ? visible : fallbackGameEntries.slice();
};

export const pickerArtwork = (entries: readonly GameEntry[]) => {
  const bySlug = new Map(discoverableGames.map((game) => [game.slug, game]));
  const ordered = entries.flatMap((entry) => {
    const meta = bySlug.get(entry.slug);
    return meta ? [meta] : [];
  });
  return [...ordered, ...discoverableGames.filter((entry) => !ordered.some((game) => game.slug === entry.slug))];
};

/** The caller keeps its original reward list for the history log. */
export const recentDiscoverableGames = (rewards: readonly RewardEntry[]) => {
  const unique = new Map<string, { slug: string; name: string }>();
  for (const reward of rewards) {
    const slug = typeof reward.game === 'string' ? reward.game : null;
    const name = reward.gameName ?? reward.game ?? null;
    if (!slug && !name) continue;
    const key = slug ?? (name ?? '').toLowerCase().replace(/\s+/g, '-');
    if (key && isDiscoverableGame(key) && !unique.has(key)) {
      unique.set(key, { slug: slug ?? key, name: name ?? key.replace(/-/g, ' ') });
    }
  }
  return Array.from(unique.values());
};
