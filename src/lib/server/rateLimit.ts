import type { SupabaseClient } from '@supabase/supabase-js';

type ConsumeApiRateLimitRow = {
  allowed: boolean;
  retry_after_seconds: number;
  remaining: number;
  reset_at: string;
};

export const consumeApiRateLimit = async (args: {
  supabase: SupabaseClient;
  bucket: string;
  key: string;
  limit: number;
  windowSeconds: number;
}) => {
  const { data, error } = await args.supabase.rpc('consume_api_rate_limit', {
    p_bucket: args.bucket,
    p_rate_key: args.key,
    p_limit: args.limit,
    p_window_seconds: args.windowSeconds
  });

  if (error) throw error;

  const row = Array.isArray(data) ? (data[0] as ConsumeApiRateLimitRow | undefined) : undefined;
  if (!row) {
    throw new Error('rate_limit_unavailable');
  }

  return row;
};
