import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { consumeApiRateLimit } from '$lib/server/rateLimit';

type RateBucket = 'reaction' | 'share' | 'social_share';

const WINDOW_SECONDS = {
  reaction: 60,
  share: 60,
  social_share: 600
} satisfies Record<RateBucket, number>;

const LIMITS = {
  reaction: 10,
  share: 5,
  social_share: 10
} satisfies Record<RateBucket, number>;

const bucketName = (bucket: RateBucket) => `safety:${bucket}`;

export async function enforceRateLimit(
  supabase: SupabaseClient,
  bucket: RateBucket,
  userId: string
): Promise<{ ok: true } | { ok: false; retryAfter?: number }> {
  if (!userId) return { ok: false };

  const result = await consumeApiRateLimit({
    supabase,
    bucket: bucketName(bucket),
    key: userId,
    limit: LIMITS[bucket],
    windowSeconds: WINDOW_SECONDS[bucket]
  });

  return result.allowed ? { ok: true } : { ok: false, retryAfter: result.retry_after_seconds };
}

export async function validateQuoteShare(
  supabase: SupabaseClient,
  userId: string,
  quote: string | null | undefined
): Promise<{ ok: true } | { ok: false; reason: 'empty' | 'duplicate'; retryAfter?: number }> {
  const trimmed = quote?.trim() ?? '';
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  const hash = createHash('sha256').update(trimmed).digest('hex');
  const result = await consumeApiRateLimit({
    supabase,
    bucket: 'safety:share_quote',
    key: `${userId}:${hash}`,
    limit: 1,
    windowSeconds: 60
  });

  return result.allowed
    ? { ok: true }
    : { ok: false, reason: 'duplicate', retryAfter: result.retry_after_seconds };
}
