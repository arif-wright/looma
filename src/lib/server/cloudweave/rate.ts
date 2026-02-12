type EndpointKind = 'export' | 'import' | 'clear';

type RateResult =
  | { ok: true }
  | { ok: false; status: 429; code: string; message: string; retryAfter: number };

const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

const prune = (entries: number[], now: number) => entries.filter((stamp) => now - stamp < WINDOW_MS);

const limitFor = (kind: EndpointKind) => {
  if (kind === 'export') return 10;
  if (kind === 'import') return 5;
  return 4;
};

const codeFor = (kind: EndpointKind) => `cloudweave_${kind}_rate_limited`;
const messageFor = (kind: EndpointKind) =>
  kind === 'export'
    ? 'You are exporting too quickly. Please wait a moment.'
    : kind === 'import'
      ? 'You are importing too quickly. Please wait a moment.'
      : 'You are resetting state too quickly. Please wait a moment.';

const touch = (key: string, limitPerMinute: number, kind: EndpointKind): RateResult => {
  const now = Date.now();
  const recent = prune(buckets.get(key) ?? [], now);
  if (recent.length >= limitPerMinute) {
    const oldest = recent[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    return {
      ok: false,
      status: 429,
      code: codeFor(kind),
      message: messageFor(kind),
      retryAfter
    };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { ok: true };
};

export const enforceCloudWeaveRateLimit = (
  kind: EndpointKind,
  userId: string | null | undefined,
  ip: string | null | undefined
): RateResult => {
  const keys = [
    userId ? `cloudweave:${kind}:user:${userId}` : null,
    ip ? `cloudweave:${kind}:ip:${ip}` : null
  ].filter((entry): entry is string => Boolean(entry));
  const limit = limitFor(kind);
  for (const key of keys) {
    const result = touch(key, limit, kind);
    if (!result.ok) return result;
  }
  return { ok: true };
};
