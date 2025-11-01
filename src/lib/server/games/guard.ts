import { error } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';
import type { RequestEvent } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';

type RateBucket = {
  count: number;
  reset: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

const buckets = new Map<string, RateBucket>();

export const takeRateLimit = (key: string, limit: number, windowMs: number): RateLimitResult => {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.max(0, Math.ceil((bucket.reset - now) / 1000));
    return { allowed: false, remaining: 0, retryAfter };
  }

  bucket.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfter: 0 };
};

export const requireUser = async (event: RequestEvent): Promise<{
  user: User;
  supabase: ReturnType<typeof supabaseServer>;
}> => {
  const localsUser = event.locals.user as User | null | undefined;
  const localsClient = event.locals.supabase as ReturnType<typeof supabaseServer> | null | undefined;

  if (localsUser && localsClient) {
    return { user: localsUser, supabase: localsClient };
  }

  const supabase = localsClient ?? supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    if (authError.message?.includes('Auth session missing')) {
      throw error(401, 'unauthorized');
    }
    console.error('[games] auth error', authError);
    throw error(500, 'server_error');
  }

  if (!user) {
    throw error(401, 'unauthorized');
  }

  event.locals.user = user;
  event.locals.supabase = supabase;

  return { user, supabase };
};
