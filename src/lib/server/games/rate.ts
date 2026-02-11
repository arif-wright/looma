import { error } from '@sveltejs/kit';

const WINDOW_MS = 60_000;

const buckets = new Map<string, number[]>();

const prune = (timestamps: number[], now: number) =>
  timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);

export const limit = (key: string, limitPerMinute: number) => {
  if (!limitPerMinute || limitPerMinute <= 0) {
    return;
  }

  const now = Date.now();
  const existing = buckets.get(key) ?? [];
  const recent = prune(existing, now);

  if (recent.length >= limitPerMinute) {
    const oldest = recent[0];
    const retryAfter = oldest
      ? Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000))
      : 1;
    throw error(429, {
      code: 'rate_limited',
      message: 'You are doing that too quickly. Please wait a moment and try again.',
      retryAfter
    });
  }

  recent.push(now);
  buckets.set(key, recent);
};
