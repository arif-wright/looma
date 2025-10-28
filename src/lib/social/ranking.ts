import type { FeedItem } from './types';

export function sortFeed(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => {
    const scoreA = typeof a.score === 'number' ? a.score : 0;
    const scoreB = typeof b.score === 'number' ? b.score : 0;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    const timeA = Date.parse(a.created_at ?? '');
    const timeB = Date.parse(b.created_at ?? '');
    if (Number.isFinite(timeA) && Number.isFinite(timeB)) {
      return timeB - timeA;
    }

    return 0;
  });
}
