import { env } from '$env/dynamic/private';

type RateResult =
  | { ok: true }
  | { ok: false; status: 429; code: string; message: string; retryAfter: number };

type Config = {
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

const touch = (key: string, config: Config): RateResult => {
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

const apply = (keys: string[], config: Config): RateResult => {
  for (const key of keys) {
    const result = touch(key, config);
    if (!result.ok) return result;
  }
  return { ok: true };
};

export const enforceEventCreateRateLimit = (
  userId: string,
  ip: string | null | undefined
): RateResult => {
  const limit = parsePositiveInt(env.CIRCLE_EVENT_CREATE_RATE_LIMIT_PER_HOUR, 30);
  const keys = [`events:create:user:${userId}`];
  if (ip) keys.push(`events:create:ip:${ip}`);

  return apply(keys, {
    windowMs: 60 * 60 * 1000,
    limit,
    code: 'event_create_rate_limited',
    message: 'You are creating events too quickly. Please wait and try again.'
  });
};

export const enforceEventJoinActionRateLimit = (
  userId: string,
  ip: string | null | undefined
): RateResult => {
  const limit = parsePositiveInt(env.CIRCLE_EVENT_ACTION_RATE_LIMIT_PER_MINUTE, 60);
  const keys = [`events:action:user:${userId}`];
  if (ip) keys.push(`events:action:ip:${ip}`);

  return apply(keys, {
    windowMs: 60_000,
    limit,
    code: 'event_action_rate_limited',
    message: 'Too many event actions. Please slow down.'
  });
};

export const enforceReminderPullRateLimit = (
  userId: string,
  ip: string | null | undefined
): RateResult => {
  const limit = parsePositiveInt(env.EVENT_REMINDER_PULL_RATE_LIMIT_PER_MINUTE, 8);
  const keys = [`events:reminder:pull:user:${userId}`];
  if (ip) keys.push(`events:reminder:pull:ip:${ip}`);

  return apply(keys, {
    windowMs: 60_000,
    limit,
    code: 'event_reminder_pull_rate_limited',
    message: 'Reminder refresh is rate-limited. Please try again shortly.'
  });
};
