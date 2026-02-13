import { env } from '$env/dynamic/private';

type RateResult =
  | { ok: true }
  | { ok: false; status: 429; code: string; message: string; retryAfter: number };
type TrustTier = 'new' | 'standard' | 'trusted' | 'restricted';

type RateConfig = {
  windowMs: number;
  limit: number;
  code: string;
  message: string;
};

const buckets = new Map<string, number[]>();

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const prune = (entries: number[], now: number, windowMs: number) =>
  entries.filter((stamp) => now - stamp < windowMs);

const touch = (key: string, config: RateConfig): RateResult => {
  const now = Date.now();
  const recent = prune(buckets.get(key) ?? [], now, config.windowMs);
  if (recent.length >= config.limit) {
    const oldest = recent[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((config.windowMs - (now - oldest)) / 1000));
    return {
      ok: false,
      status: 429,
      code: config.code,
      message: config.message,
      retryAfter
    };
  }

  recent.push(now);
  buckets.set(key, recent);
  return { ok: true };
};

const apply = (keys: string[], config: RateConfig): RateResult => {
  for (const key of keys) {
    const result = touch(key, config);
    if (!result.ok) return result;
  }
  return { ok: true };
};

export const enforceFriendRequestRateLimit = (
  userId: string,
  ip: string | null | undefined,
  tier: TrustTier = 'standard'
): RateResult => {
  const baseLimit = parsePositiveInt(env.FRIEND_REQUEST_RATE_LIMIT_PER_HOUR, 10);
  const limit =
    tier === 'restricted'
      ? Math.min(baseLimit, 3)
      : tier === 'new'
        ? Math.min(baseLimit, 6)
        : tier === 'trusted'
          ? Math.max(baseLimit, 14)
          : baseLimit;
  const keys = [`friends:request:user:${userId}`];
  if (ip) {
    keys.push(`friends:request:ip:${ip}`);
  }

  return apply(keys, {
    windowMs: 60 * 60 * 1000,
    limit,
    code: 'friend_request_rate_limited',
    message: 'You are sending friend requests too quickly. Please wait and try again.'
  });
};

export const enforceFriendDecisionRateLimit = (
  userId: string,
  ip: string | null | undefined
): RateResult => {
  const limit = parsePositiveInt(env.FRIEND_DECISION_RATE_LIMIT_PER_MINUTE, 40);
  const keys = [`friends:decision:user:${userId}`];
  if (ip) {
    keys.push(`friends:decision:ip:${ip}`);
  }

  return apply(keys, {
    windowMs: 60_000,
    limit,
    code: 'friend_decision_rate_limited',
    message: 'Too many request actions. Please slow down.'
  });
};
