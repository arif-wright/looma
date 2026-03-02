import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { consumeApiRateLimit } from '$lib/server/rateLimit';

const WINDOW_SECONDS = 60;

export const limit = async (supabase: SupabaseClient, key: string, limitPerMinute: number) => {
  if (!limitPerMinute || limitPerMinute <= 0) {
    return;
  }

  const result = await consumeApiRateLimit({
    supabase,
    bucket: 'games',
    key,
    limit: limitPerMinute,
    windowSeconds: WINDOW_SECONDS
  });

  if (!result.allowed) {
    throw error(429, {
      code: 'rate_limited',
      message: 'You are doing that too quickly. Please wait a moment and try again.',
      retryAfter: result.retry_after_seconds
    });
  }
};
