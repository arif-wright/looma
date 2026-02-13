import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminFlags } from '$lib/server/admin-guard';

export const MODERATION_CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export type ModerationRole = 'user' | 'moderator' | 'admin';
export type ModerationStatus = 'active' | 'muted' | 'suspended' | 'banned';

export type ModerationState = {
  status: ModerationStatus;
  until: string | null;
};

export const isUuid = (value: string | null | undefined): value is string =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );

export const parseDurationMinutes = (value: unknown, fallback = 60): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(60 * 24 * 365, Math.floor(n)));
};

export const getUserRole = async (
  supabase: SupabaseClient,
  userId: string,
  email?: string | null
): Promise<ModerationRole> => {
  const [prefResult, adminFlags] = await Promise.all([
    supabase
      .from('user_preferences')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle<{ role: ModerationRole | null }>(),
    getAdminFlags(email ?? null, userId)
  ]);

  if (adminFlags.isAdmin || adminFlags.isSuper) {
    return 'admin';
  }

  const role = prefResult.data?.role;
  if (role === 'admin' || role === 'moderator' || role === 'user') {
    return role;
  }

  return 'user';
};

export const isModeratorRole = (role: ModerationRole): boolean =>
  role === 'moderator' || role === 'admin';

export const requireModerator = async (
  supabase: SupabaseClient,
  userId: string,
  email?: string | null
): Promise<{ ok: true; role: ModerationRole } | { ok: false; role: ModerationRole }> => {
  const role = await getUserRole(supabase, userId, email);
  if (!isModeratorRole(role)) {
    return { ok: false, role };
  }
  return { ok: true, role };
};

export const getModerationState = async (
  supabase: SupabaseClient,
  userId: string
): Promise<ModerationState> => {
  const { data } = await supabase
    .from('user_preferences')
    .select('moderation_status, moderation_until')
    .eq('user_id', userId)
    .maybeSingle<{ moderation_status?: ModerationStatus | null; moderation_until?: string | null }>();

  const rawStatus = data?.moderation_status;
  const until = data?.moderation_until ?? null;
  const status: ModerationStatus =
    rawStatus === 'muted' || rawStatus === 'suspended' || rawStatus === 'banned'
      ? rawStatus
      : 'active';

  if ((status === 'muted' || status === 'suspended') && until) {
    const untilMs = Date.parse(until);
    if (Number.isFinite(untilMs) && untilMs <= Date.now()) {
      await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: userId,
            moderation_status: 'active',
            moderation_until: null
          },
          { onConflict: 'user_id', ignoreDuplicates: false }
        );
      return { status: 'active', until: null };
    }
  }

  return { status, until };
};

export const enforceSocialActionAllowed = async (
  supabase: SupabaseClient,
  userId: string,
  scope: 'message_send' | 'friend_request' | 'circle_create'
): Promise<{ ok: true } | { ok: false; status: 403; code: 'moderation_blocked'; message: string; moderationStatus: ModerationStatus }> => {
  const state = await getModerationState(supabase, userId);

  if (scope === 'message_send' && state.status === 'muted') {
    return {
      ok: false,
      status: 403,
      code: 'moderation_blocked',
      moderationStatus: state.status,
      message: 'Messaging is temporarily disabled on your account.'
    };
  }

  if (state.status === 'suspended') {
    return {
      ok: false,
      status: 403,
      code: 'moderation_blocked',
      moderationStatus: state.status,
      message: 'Your social actions are temporarily suspended.'
    };
  }

  if (state.status === 'banned') {
    return {
      ok: false,
      status: 403,
      code: 'moderation_blocked',
      moderationStatus: state.status,
      message: 'Your account is restricted from social actions.'
    };
  }

  return { ok: true };
};
