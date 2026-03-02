import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type EventMeta = Record<string, unknown>;
type EventPayload = Record<string, unknown> | null;

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
};

export const deriveEventIdempotencyKey = (args: {
  type: string;
  meta: EventMeta;
  payload: EventPayload;
}) => {
  const explicit =
    typeof args.meta.idempotencyKey === 'string' && args.meta.idempotencyKey.trim().length > 0
      ? args.meta.idempotencyKey.trim()
      : null;
  if (explicit) return explicit;

  const sessionId = typeof args.meta.sessionId === 'string' ? args.meta.sessionId : null;
  const ts = typeof args.meta.ts === 'string' ? args.meta.ts : null;

  if (sessionId && ts) {
    return `${args.type}:${sessionId}:${ts}`;
  }

  if (ts) {
    const payloadHash = createHash('sha256')
      .update(stableStringify(args.payload ?? {}))
      .digest('hex')
      .slice(0, 16);
    return `${args.type}:${ts}:${payloadHash}`;
  }

  return null;
};

export const claimEventIngestReceipt = async (args: {
  supabase: SupabaseClient;
  userId: string;
  type: string;
  idempotencyKey: string | null;
}) => {
  if (!args.idempotencyKey) {
    return { duplicate: false as const };
  }

  const { error } = await args.supabase.from('event_ingest_receipts').insert({
    user_id: args.userId,
    event_type: args.type,
    idempotency_key: args.idempotencyKey
  });

  if (error?.code === '23505') {
    return { duplicate: true as const };
  }

  if (error) {
    throw error;
  }

  return { duplicate: false as const };
};
