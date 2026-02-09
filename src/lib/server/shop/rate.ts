import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

const prune = (entries: number[], now: number) => entries.filter((stamp) => now - stamp < WINDOW_MS);

const parseLimit = () => {
  const raw = env.SHOP_RATE_LIMIT_PER_MINUTE;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(Math.max(parsed, 1), 120);
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
      code: 'rate_limited',
      message: 'Too many shop requests. Please slow down.',
      retryAfter
    });
  }

  recent.push(now);
  buckets.set(key, recent);
};

export const enforceShopRateLimit = (userId: string | null | undefined, ip: string | null | undefined) => {
  const limit = parseLimit();
  if (limit <= 0) return;
  if (userId) {
    touch(`shop:user:${userId}`, limit);
  }
  if (ip) {
    touch(`shop:ip:${ip}`, limit);
  }
};
