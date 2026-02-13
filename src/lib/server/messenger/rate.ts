type RateConfig = {
  windowMs: number;
  limit: number;
  code: string;
  message: string;
};
type TrustTier = 'new' | 'standard' | 'trusted' | 'restricted';

type RateResult =
  | { ok: true }
  | { ok: false; status: 429; code: string; message: string; retryAfter: number };

const buckets = new Map<string, number[]>();

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
    if (!result.ok) {
      return result;
    }
  }
  return { ok: true };
};

export const enforceMessengerStartDmRateLimit = (
  userId: string,
  ip: string | null | undefined,
  tier: TrustTier = 'standard'
): RateResult => {
  const limit = tier === 'restricted' ? 4 : tier === 'new' ? 7 : tier === 'trusted' ? 14 : 10;
  const keys = [`messenger:start:user:${userId}`];
  if (ip) {
    keys.push(`messenger:start:ip:${ip}`);
  }

  return apply(keys, {
    windowMs: 60_000,
    limit,
    code: 'messenger_start_dm_rate_limited',
    message: 'You are starting conversations too quickly. Please wait a moment.'
  });
};

export const enforceMessengerSendRateLimit = (
  userId: string,
  conversationId: string,
  ip: string | null | undefined,
  tier: TrustTier = 'standard'
): RateResult => {
  const userLimit10s = tier === 'restricted' ? 8 : tier === 'trusted' ? 24 : 20;
  const burstLimit2s = tier === 'restricted' ? 3 : tier === 'trusted' ? 10 : 8;
  const conversationLimit10s = tier === 'restricted' ? 35 : tier === 'trusted' ? 60 : 50;
  const userKeys = [`messenger:send:user:${userId}`];
  if (ip) {
    userKeys.push(`messenger:send:ip:${ip}`);
  }

  const userWindow = apply(userKeys, {
    windowMs: 10_000,
    limit: userLimit10s,
    code: 'messenger_send_rate_limited',
    message: 'You are sending messages too quickly. Please slow down.'
  });
  if (!userWindow.ok) {
    return userWindow;
  }

  const burstWindow = apply(userKeys, {
    windowMs: 2_000,
    limit: burstLimit2s,
    code: 'messenger_send_burst_limited',
    message: 'Message burst protection triggered. Please wait a moment.'
  });
  if (!burstWindow.ok) {
    return burstWindow;
  }

  return apply([`messenger:send:conversation:${conversationId}`], {
    windowMs: 10_000,
    limit: conversationLimit10s,
    code: 'messenger_conversation_rate_limited',
    message: 'This conversation is receiving messages too quickly. Please wait a moment.'
  });
};
