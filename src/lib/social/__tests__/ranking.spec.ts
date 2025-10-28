import { describe, expect, it } from 'vitest';
import { sortFeed } from '../ranking';
import type { FeedItem } from '../types';

const makeItem = (overrides: Partial<FeedItem>): FeedItem => ({
  id: Math.random().toString(36).slice(2),
  user_id: 'user',
  body: 'post',
  created_at: new Date().toISOString(),
  score: 0,
  ...overrides
});

describe('sortFeed', () => {
  it('orders by score descending', () => {
    const items = [
      makeItem({ id: 'a', score: 10, created_at: '2024-10-10T10:00:00Z' }),
      makeItem({ id: 'b', score: 20, created_at: '2024-10-10T10:00:00Z' }),
      makeItem({ id: 'c', score: 5, created_at: '2024-10-10T10:00:00Z' })
    ];

    const sorted = sortFeed(items);
    expect(sorted.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('breaks ties by created_at descending', () => {
    const items = [
      makeItem({ id: 'a', score: 10, created_at: '2024-10-10T09:00:00Z' }),
      makeItem({ id: 'b', score: 10, created_at: '2024-10-10T11:00:00Z' }),
      makeItem({ id: 'c', score: 10, created_at: '2024-10-10T10:00:00Z' })
    ];

    const sorted = sortFeed(items);
    expect(sorted.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });
});
