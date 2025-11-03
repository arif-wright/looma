import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';

export type WalletRow = {
  balance: number;
  currency: string;
  updated_at: string;
};

export type WalletTransaction = {
  id: string;
  kind: 'grant' | 'spend' | 'adjust';
  source: string;
  amount: number;
  currency: string;
  ref_id: string | null;
  meta: Record<string, unknown>;
  inserted_at: string;
};

type Supabase = SupabaseClient<any, 'public', any>;

type GrantArgs = {
  userId: string;
  amount: number;
  source: string;
  refId?: string | null;
  meta?: Record<string, unknown>;
  client?: Supabase;
};

type SpendArgs = {
  userId: string;
  amount: number;
  source: string;
  refId?: string | null;
  meta?: Record<string, unknown>;
  client?: Supabase;
};

const withClient = (client?: Supabase) => client ?? supabaseAdmin;

const normalizeMeta = (meta?: Record<string, unknown>) => (meta ? meta : {});

export const walletGrant = async ({ userId, amount, source, refId = null, meta, client }: GrantArgs) => {
  const supabase = withClient(client);
  const { error } = await supabase.rpc('fn_wallet_grant', {
    p_user: userId,
    p_amount: Math.floor(amount),
    p_source: source,
    p_ref: refId,
    p_meta: normalizeMeta(meta)
  });

  if (error) {
    console.error('[econ] wallet grant failed', error, { userId, amount, source, refId, meta });
    throw error;
  }
};

export const walletSpend = async ({ userId, amount, source, refId = null, meta, client }: SpendArgs) => {
  const supabase = withClient(client);
  const { error } = await supabase.rpc('fn_wallet_spend', {
    p_user: userId,
    p_amount: Math.floor(amount),
    p_source: source,
    p_ref: refId,
    p_meta: normalizeMeta(meta)
  });

  if (error) {
    console.error('[econ] wallet spend failed', error, { userId, amount, source, refId, meta });
    throw error;
  }
};

export const fetchWallet = async (client: Supabase, userId: string) => {
  const { data, error } = await client
    .from('wallets')
    .select('balance, currency, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[econ] wallet fetch failed', error, { userId });
    throw error;
  }

  if (!data) {
    return {
      balance: 0,
      currency: 'shards',
      updated_at: new Date(0).toISOString()
    } satisfies WalletRow;
  }

  return {
    balance: Number(data.balance ?? 0),
    currency: data.currency ?? 'shards',
    updated_at: data.updated_at ?? new Date().toISOString()
  } satisfies WalletRow;
};

export const fetchRecentTransactions = async (client: Supabase, userId: string, limit = 20) => {
  const { data, error } = await client
    .from('wallet_tx')
    .select('id, kind, source, amount, currency, ref_id, meta, inserted_at')
    .eq('user_id', userId)
    .order('inserted_at', { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    console.error('[econ] wallet tx fetch failed', error, { userId });
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as WalletTransaction['kind'],
    source: row.source as string,
    amount: Number(row.amount ?? 0),
    currency: (row.currency as string) ?? 'shards',
    ref_id: (row.ref_id as string | null) ?? null,
    meta: (row.meta as Record<string, unknown>) ?? {},
    inserted_at: row.inserted_at as string
  })) satisfies WalletTransaction[];
};

export const getWalletWithTransactions = async (
  client: Supabase,
  userId: string,
  limit = 20
) => {
  const [wallet, tx] = await Promise.all([
    fetchWallet(client, userId),
    fetchRecentTransactions(client, userId, limit)
  ]);
  return { wallet, transactions: tx };
};

const parseFloatOrDefault = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const getAchievementShardFactor = () => {
  const factorRaw = env.ECON_ACH_POINT_TO_SHARDS;
  const factor = factorRaw ? Number.parseInt(factorRaw, 10) : NaN;
  return Number.isFinite(factor) && factor > 0 ? factor : 5;
};

export const convertAchievementPointsToShards = (points: number) => {
  const factor = getAchievementShardFactor();
  const safePoints = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  return safePoints * factor;
};

export const getStreakMultiplier = (streakDays: number) => {
  const cap = parseFloatOrDefault(env.ECON_STREAK_MULTIPLIER_CAP, 2.0);
  const safeDays = Number.isFinite(streakDays) ? Math.max(0, streakDays) : 0;
  const base = 1 + 0.1 * safeDays;
  return Math.min(base, cap > 0 ? cap : 2.0);
};

export const applyStreakMultiplier = (amount: number, streakDays: number) => {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const multiplier = getStreakMultiplier(streakDays);
  return Math.floor(safeAmount * multiplier);
};
