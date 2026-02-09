import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

const prune = (entries: number[], now: number) => entries.filter((stamp) => now - stamp < WINDOW_MS);

const getLimit = () => {
  const raw = env.ECON_RATE_LIMIT_PER_MINUTE;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
};

const touch = (key: string, limit: number) => {
  if (limit <= 0) return;
  const now = Date.now();
  const existing = buckets.get(key) ?? [];
  const recent = prune(existing, now);

  if (recent.length >= limit) {
    const oldest = recent[0];
    const retryAfter = oldest
      ? Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000))
      : 1;
    throw error(429, {
      code: 'rate_limit',
      message: 'Too many requests. Try again soon.',
      retryAfter
    });
  }

  recent.push(now);
  buckets.set(key, recent);
};

export const enforceEconomyRateLimit = (userId: string | null | undefined, ip: string | null | undefined) => {
  const limitPerMinute = getLimit();
  if (!limitPerMinute || limitPerMinute <= 0) return;
  if (userId) {
    touch(`econ:user:${userId}`, limitPerMinute);
  }
  if (ip) {
    touch(`econ:ip:${ip}`, limitPerMinute);
  }
};
