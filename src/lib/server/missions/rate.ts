import { env } from '$env/dynamic/private';

type EndpointKind = 'start' | 'complete';

type RateResult =
  | { ok: true }
  | { ok: false; status: 429; code: string; message: string; retryAfter: number };

const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const prune = (entries: number[], now: number) => entries.filter((stamp) => now - stamp < WINDOW_MS);

const getEndpointLimit = (kind: EndpointKind) => {
  if (kind === 'start') {
    return parsePositiveInt(env.MISSION_START_RATE_LIMIT_PER_MINUTE, 20);
  }
  return parsePositiveInt(env.MISSION_COMPLETE_RATE_LIMIT_PER_MINUTE, 20);
};

export const getMissionCaps = () => ({
  startsPerMinute: parsePositiveInt(env.MISSION_STARTS_MAX_PER_MINUTE, 6),
  actionRewardsPerHour: parsePositiveInt(env.MISSION_ACTION_REWARDS_MAX_PER_HOUR, 15),
  actionRewardsPerDay: parsePositiveInt(env.MISSION_ACTION_REWARDS_MAX_PER_DAY, 60)
});

const rateCode = (kind: EndpointKind) => (kind === 'start' ? 'mission_start_rate_limited' : 'mission_complete_rate_limited');
const rateMessage = (kind: EndpointKind) =>
  kind === 'start'
    ? 'You are starting missions too quickly. Please wait a moment and try again.'
    : 'You are completing missions too quickly. Please wait a moment and try again.';

const touch = (key: string, limitPerMinute: number, kind: EndpointKind): RateResult => {
  if (limitPerMinute <= 0) return { ok: true };
  const now = Date.now();
  const existing = buckets.get(key) ?? [];
  const recent = prune(existing, now);

  if (recent.length >= limitPerMinute) {
    const oldest = recent[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    return {
      ok: false,
      status: 429,
      code: rateCode(kind),
      message: rateMessage(kind),
      retryAfter
    };
  }

  recent.push(now);
  buckets.set(key, recent);
  return { ok: true };
};

export const enforceMissionRateLimit = (kind: EndpointKind, userId: string | null | undefined, ip: string | null | undefined): RateResult => {
  const limitPerMinute = getEndpointLimit(kind);
  const keys = [
    userId ? `mission:${kind}:user:${userId}` : null,
    ip ? `mission:${kind}:ip:${ip}` : null
  ].filter((entry): entry is string => Boolean(entry));

  for (const key of keys) {
    const result = touch(key, limitPerMinute, kind);
    if (!result.ok) return result;
  }
  return { ok: true };
};
