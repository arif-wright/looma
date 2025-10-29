type RateBucket = 'reaction' | 'share';

type RateEntry = {
  stamps: number[];
};

type QuoteEntry = {
  text: string;
  timestamp: number;
};

type SafetyState = {
  reactions: Map<string, RateEntry>;
  shares: Map<string, RateEntry>;
  quotes: Map<string, QuoteEntry>;
};

const WINDOW_MS = {
  reaction: 60_000,
  share: 60_000
} satisfies Record<RateBucket, number>;

const LIMITS = {
  reaction: 10,
  share: 5
} satisfies Record<RateBucket, number>;

const globalStateKey = '__loomaSafetyState';

const state: SafetyState =
  (globalThis as unknown as Record<string, SafetyState>)[globalStateKey] ??
  ((globalThis as unknown as Record<string, SafetyState>)[globalStateKey] = {
    reactions: new Map(),
    shares: new Map(),
    quotes: new Map()
  });

function pruneEntries(entry: RateEntry, windowMs: number) {
  const cutoff = Date.now() - windowMs;
  entry.stamps = entry.stamps.filter((stamp) => stamp >= cutoff);
}

export function enforceRateLimit(bucket: RateBucket, userId: string): { ok: true } | { ok: false } {
  if (!userId) return { ok: false };
  const map = state[`${bucket}s` as keyof SafetyState] as Map<string, RateEntry>;
  let entry = map.get(userId);
  if (!entry) {
    entry = { stamps: [] };
    map.set(userId, entry);
  }
  pruneEntries(entry, WINDOW_MS[bucket]);
  if (entry.stamps.length >= LIMITS[bucket]) {
    return { ok: false };
  }
  entry.stamps.push(Date.now());
  return { ok: true };
}

export function validateQuoteShare(userId: string, quote: string | null | undefined): { ok: true } | { ok: false; reason: 'empty' | 'duplicate' } {
  const trimmed = quote?.trim() ?? '';
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const last = state.quotes.get(userId);
  if (last && last.text === trimmed && Date.now() - last.timestamp <= 60_000) {
    return { ok: false, reason: 'duplicate' };
  }

  state.quotes.set(userId, { text: trimmed, timestamp: Date.now() });
  return { ok: true };
}
