import type { SupabaseClient } from '@supabase/supabase-js';
import { tryGetSupabaseAdminClient } from '$lib/server/supabase';

export type TrustTier = 'new' | 'standard' | 'trusted' | 'restricted';

export type TrustRecord = {
  userId: string;
  score: number;
  tier: TrustTier;
  forcedTier: TrustTier | null;
  notes: string | null;
  lastComputedAt: string;
};

export type TrustActionScope =
  | 'dm_start'
  | 'message_send'
  | 'friend_request'
  | 'circle_create'
  | 'event_create';

export type TrustActionContext = {
  scope: TrustActionScope;
  conversationType?: 'dm' | 'group' | null;
  otherUserId?: string | null;
};

export type TrustRestrictionResult =
  | { ok: true; trust: TrustRecord }
  | { ok: false; status: 403 | 429; code: string; message: string; retryAfter?: number; trust: TrustRecord };

type TrustRow = {
  user_id: string;
  score: number;
  tier: TrustTier;
  forced_tier: TrustTier | null;
  notes: string | null;
  last_computed_at: string;
};

type TrustEventRow = {
  delta: number;
};

const SCORE_MIN = 0;
const SCORE_MAX = 100;
const BASE_SCORE = 50;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const DAILY_BUCKETS = new Map<string, number[]>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseDateMs = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getAccountAgeDays = async (userId: string): Promise<number | null> => {
  const admin = tryGetSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.created_at) return null;

  const createdAtMs = parseDateMs(data.user.created_at);
  if (createdAtMs === null) return null;

  return Math.max(0, Math.floor((Date.now() - createdAtMs) / ONE_DAY_MS));
};

const computeAccountAgeBoost = (accountAgeDays: number | null): number => {
  if (accountAgeDays === null) return 0;
  return clamp(Math.floor(accountAgeDays / 7), 0, 10);
};

const mapTier = (score: number, accountAgeDays: number | null, forcedTier: TrustTier | null): TrustTier => {
  if (forcedTier) return forcedTier;
  if (score <= 24) return 'restricted';
  if (accountAgeDays !== null && accountAgeDays < 7 && score < 75) return 'new';
  if (score >= 75) return 'trusted';
  return 'standard';
};

const getTrustRow = async (supabase: SupabaseClient, userId: string): Promise<TrustRow | null> => {
  const { data } = await supabase
    .from('user_trust')
    .select('user_id, score, tier, forced_tier, notes, last_computed_at')
    .eq('user_id', userId)
    .maybeSingle<TrustRow>();

  return data ?? null;
};

const buildTrustRecord = (row: TrustRow, accountAgeDays: number | null): TrustRecord => {
  const tier = mapTier(row.score, accountAgeDays, row.forced_tier);
  return {
    userId: row.user_id,
    score: row.score,
    tier,
    forcedTier: row.forced_tier,
    notes: row.notes,
    lastComputedAt: row.last_computed_at
  };
};

const getFallbackTrustRecord = async (userId: string): Promise<TrustRecord> => {
  const accountAgeDays = await getAccountAgeDays(userId);
  const score = clamp(BASE_SCORE + computeAccountAgeBoost(accountAgeDays), SCORE_MIN, SCORE_MAX);
  const tier = mapTier(score, accountAgeDays, null);
  return {
    userId,
    score,
    tier,
    forcedTier: null,
    notes: null,
    lastComputedAt: new Date().toISOString()
  };
};

const touchDailyLimit = (
  key: string,
  limit: number
): { ok: true } | { ok: false; status: 429; retryAfter: number } => {
  const now = Date.now();
  const entries = (DAILY_BUCKETS.get(key) ?? []).filter((stamp) => now - stamp < ONE_DAY_MS);

  if (entries.length >= limit) {
    const oldest = entries[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((ONE_DAY_MS - (now - oldest)) / 1000));
    return { ok: false, status: 429, retryAfter };
  }

  entries.push(now);
  DAILY_BUCKETS.set(key, entries);
  return { ok: true };
};

export const isTrustedFriend = async (
  supabase: SupabaseClient,
  userId: string,
  otherUserId: string
): Promise<boolean> => {
  const { data } = await supabase
    .from('friends')
    .select('user_id')
    .eq('user_id', userId)
    .eq('friend_id', otherUserId)
    .maybeSingle<{ user_id: string }>();

  return Boolean(data?.user_id);
};

export const getTrust = async (supabase: SupabaseClient, userId: string): Promise<TrustRecord> => {
  const row = await getTrustRow(supabase, userId);
  if (!row) {
    return getFallbackTrustRecord(userId);
  }

  const accountAgeDays = await getAccountAgeDays(userId);
  return buildTrustRecord(row, accountAgeDays);
};

export const recomputeTrust = async (
  adminSupabase: SupabaseClient,
  userId: string
): Promise<TrustRecord> => {
  const accountAgeDays = await getAccountAgeDays(userId);
  const ageBoost = computeAccountAgeBoost(accountAgeDays);

  const { data: eventRows } = await adminSupabase
    .from('trust_events')
    .select('delta')
    .eq('user_id', userId)
    .returns<TrustEventRow[]>();

  const eventsDelta = (eventRows ?? []).reduce((sum, row) => sum + (row.delta ?? 0), 0);

  const existing = await getTrustRow(adminSupabase, userId);
  const forcedTier = existing?.forced_tier ?? null;
  const notes = existing?.notes ?? null;

  const score = clamp(BASE_SCORE + ageBoost + eventsDelta, SCORE_MIN, SCORE_MAX);
  const tier = mapTier(score, accountAgeDays, forcedTier);
  const now = new Date().toISOString();

  const { error } = await adminSupabase.from('user_trust').upsert(
    {
      user_id: userId,
      score,
      tier,
      forced_tier: forcedTier,
      notes,
      last_computed_at: now
    },
    { onConflict: 'user_id', ignoreDuplicates: false }
  );

  if (error) {
    return {
      userId,
      score,
      tier,
      forcedTier,
      notes,
      lastComputedAt: now
    };
  }

  return {
    userId,
    score,
    tier,
    forcedTier,
    notes,
    lastComputedAt: now
  };
};

export const applyTrustDelta = async (
  adminSupabase: SupabaseClient,
  userId: string,
  kind: string,
  delta: number,
  metadata: Record<string, unknown> = {}
): Promise<TrustRecord> => {
  const now = new Date();
  const lookbackIso = new Date(now.getTime() - 30 * ONE_DAY_MS).toISOString();

  let effectiveDelta = delta;
  if (delta < 0) {
    const { count } = await adminSupabase
      .from('trust_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('kind', ['warn', 'mute', 'suspend', 'ban', 'report_upheld'])
      .gte('created_at', lookbackIso);

    const recentCount = count ?? 0;
    if (recentCount >= 2) {
      const multiplier = Math.min(2, 1 + recentCount * 0.1);
      effectiveDelta = Math.floor(delta * multiplier);
    }
  }

  await adminSupabase.from('trust_events').insert({
    user_id: userId,
    kind,
    delta: effectiveDelta,
    metadata
  });

  return recomputeTrust(adminSupabase, userId);
};

export const setForcedTrustTier = async (
  adminSupabase: SupabaseClient,
  userId: string,
  forcedTier: TrustTier | null,
  actorId: string,
  note: string | null = null
): Promise<TrustRecord> => {
  const current = await getTrust(adminSupabase, userId);
  const { error } = await adminSupabase.from('user_trust').upsert(
    {
      user_id: userId,
      score: current.score,
      tier: forcedTier ?? current.tier,
      forced_tier: forcedTier,
      notes: note ?? current.notes,
      last_computed_at: new Date().toISOString()
    },
    { onConflict: 'user_id', ignoreDuplicates: false }
  );

  if (!error) {
    await adminSupabase.from('trust_events').insert({
      user_id: userId,
      kind: 'manual_override',
      delta: 0,
      metadata: {
        actorId,
        forcedTier,
        note
      }
    });
  }

  return recomputeTrust(adminSupabase, userId);
};

const limitedMessage = 'Your account has temporary limits. Please try again later or contact support.';

export const getTrustStanding = async (
  supabase: SupabaseClient,
  userId: string
): Promise<{ trust: TrustRecord; standing: 'normal' | 'limited'; limits: string[] }> => {
  const trust = await getTrust(supabase, userId);
  if (trust.tier === 'restricted') {
    return {
      trust,
      standing: 'limited',
      limits: [
        'You can only DM friends.',
        'New chat starts are limited each day.',
        'Friend requests are limited each day.',
        'Circle creation is disabled temporarily.'
      ]
    };
  }

  if (trust.tier === 'new') {
    return {
      trust,
      standing: 'limited',
      limits: ['New chat starts are limited each day.', 'Friend requests are limited each day.']
    };
  }

  return { trust, standing: 'normal', limits: [] };
};

export const enforceTrustActionAllowed = async (
  supabase: SupabaseClient,
  userId: string,
  context: TrustActionContext
): Promise<TrustRestrictionResult> => {
  const trust = await getTrust(supabase, userId);

  if (trust.tier === 'restricted') {
    if (context.scope === 'circle_create') {
      return {
        ok: false,
        status: 403,
        code: 'trust_restricted',
        message: limitedMessage,
        trust
      };
    }

    if (context.scope === 'dm_start') {
      const otherUserId = context.otherUserId ?? null;
      if (otherUserId) {
        const friend = await isTrustedFriend(supabase, userId, otherUserId);
        if (!friend) {
          return {
            ok: false,
            status: 403,
            code: 'trust_restricted',
            message: limitedMessage,
            trust
          };
        }
      }

      const dayLimit = touchDailyLimit(`trust:restricted:dm_start:${userId}`, 5);
      if (!dayLimit.ok) {
        return {
          ok: false,
          status: 429,
          code: 'trust_daily_limit',
          message: limitedMessage,
          retryAfter: dayLimit.retryAfter,
          trust
        };
      }
    }

    if (context.scope === 'message_send' && context.conversationType === 'dm' && context.otherUserId) {
      const friend = await isTrustedFriend(supabase, userId, context.otherUserId);
      if (!friend) {
        return {
          ok: false,
          status: 403,
          code: 'trust_restricted',
          message: limitedMessage,
          trust
        };
      }
    }

    if (context.scope === 'friend_request') {
      const dayLimit = touchDailyLimit(`trust:restricted:friend_request:${userId}`, 3);
      if (!dayLimit.ok) {
        return {
          ok: false,
          status: 429,
          code: 'trust_daily_limit',
          message: limitedMessage,
          retryAfter: dayLimit.retryAfter,
          trust
        };
      }
    }
  }

  if (trust.tier === 'new') {
    if (context.scope === 'friend_request') {
      const dayLimit = touchDailyLimit(`trust:new:friend_request:${userId}`, 6);
      if (!dayLimit.ok) {
        return {
          ok: false,
          status: 429,
          code: 'trust_daily_limit',
          message: limitedMessage,
          retryAfter: dayLimit.retryAfter,
          trust
        };
      }
    }

    if (context.scope === 'dm_start') {
      const dayLimit = touchDailyLimit(`trust:new:dm_start:${userId}`, 8);
      if (!dayLimit.ok) {
        return {
          ok: false,
          status: 429,
          code: 'trust_daily_limit',
          message: limitedMessage,
          retryAfter: dayLimit.retryAfter,
          trust
        };
      }
    }
  }

  return { ok: true, trust };
};
