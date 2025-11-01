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
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    throw error(429, {
      code: 'rate_limit',
      message: 'Too many requests. Try again soon.',
      retryAfter
    });
  }

  recent.push(now);
  buckets.set(key, recent);
};
