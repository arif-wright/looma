import type { SupabaseClient } from '@supabase/supabase-js';

export const EVENTS_CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export type RsvpStatus = 'going' | 'interested' | 'not_going';

export const isUuid = (value: string | null | undefined): value is string =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );

export const parseRsvpStatus = (value: unknown): RsvpStatus | null => {
  if (value === 'going' || value === 'interested' || value === 'not_going') return value;
  return null;
};

export const cleanText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

export const cleanOptionalText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

export const parseIso = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
};

export const parseWindowDays = (value: unknown, fallback: 7 | 14 | 30 = 14): 7 | 14 | 30 => {
  if (value === '7' || value === 7) return 7;
  if (value === '14' || value === 14) return 14;
  if (value === '30' || value === 30) return 30;
  return fallback;
};

export const hasCircleMembership = async (
  supabase: SupabaseClient,
  circleId: string,
  userId: string
): Promise<boolean> => {
  const { data } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data?.circle_id);
};

export const getCircleRole = async (
  supabase: SupabaseClient,
  circleId: string,
  userId: string
): Promise<'owner' | 'admin' | 'member' | null> => {
  const { data } = await supabase
    .from('circle_members')
    .select('role')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .maybeSingle<{ role: 'owner' | 'admin' | 'member' }>();

  if (!data) return null;
  return data.role;
};

export const hasCircleAdminRole = async (
  supabase: SupabaseClient,
  circleId: string,
  userId: string
): Promise<boolean> => {
  const role = await getCircleRole(supabase, circleId, userId);
  return role === 'owner' || role === 'admin';
};
