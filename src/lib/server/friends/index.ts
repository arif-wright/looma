import type { SupabaseClient } from '@supabase/supabase-js';
import { tryGetSupabaseAdminClient } from '$lib/server/supabase';
import { normalizeHandle } from '$lib/server/messenger';

export const FRIENDS_CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export const isUuid = (value: string | null | undefined): value is string =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );

export const sanitizeFriendNote = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  if (!next) return null;
  return next.slice(0, 240);
};

export const resolveUserIdFromHandle = async (
  handle: string,
  fallbackSupabase: App.Locals['supabase']
): Promise<string | null> => {
  const normalized = normalizeHandle(handle);
  if (!normalized) return null;

  const admin = tryGetSupabaseAdminClient();
  const client = admin ?? fallbackSupabase;

  const { data, error } = await client
    .from('profiles')
    .select('id')
    .ilike('handle', normalized)
    .maybeSingle();

  if (error) {
    console.error('[friends] handle lookup failed', error);
    return null;
  }

  return typeof data?.id === 'string' ? data.id : null;
};

export const resolveRecipientId = async (
  payload: { recipientId?: string; handle?: string },
  fallbackSupabase: App.Locals['supabase']
): Promise<string | null> => {
  if (typeof payload.recipientId === 'string' && isUuid(payload.recipientId)) {
    return payload.recipientId;
  }

  if (typeof payload.handle === 'string') {
    return resolveUserIdFromHandle(payload.handle, fallbackSupabase);
  }

  return null;
};

export const isBlockedPair = async (
  supabase: SupabaseClient,
  otherUserId: string
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('rpc_is_blocked', {
    p_other_user_id: otherUserId
  });

  if (error) {
    console.error('[friends] rpc_is_blocked failed', error);
    return false;
  }

  return data === true;
};
