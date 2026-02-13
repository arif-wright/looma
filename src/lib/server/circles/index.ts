import { normalizeHandle } from '$lib/server/messenger';
import { tryGetSupabaseAdminClient } from '$lib/server/supabase';

export const CIRCLES_CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export const isUuid = (value: string | null | undefined): value is string =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );

export const parseCirclePrivacy = (value: unknown): 'public' | 'invite' =>
  value === 'public' ? 'public' : 'invite';

export const cleanText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

export const normalizeInviteCode = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 24) return null;
  return normalized;
};

export const resolveUserByHandle = async (
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
    return null;
  }

  return typeof data?.id === 'string' ? data.id : null;
};
