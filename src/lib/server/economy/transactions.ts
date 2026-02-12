import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';

export type EconomyAmounts = {
  shards?: number;
  energy?: number;
  xp?: number;
  energyCap?: number;
};

export type EconomyBalances = {
  xp: number;
  energy: number;
  shards: number;
};

type EconomyTransactionResult = {
  ok: boolean;
  transactionId?: string | null;
  reused?: boolean;
  direction?: 'spend' | 'grant';
  source?: string;
  amountsRequested?: EconomyAmounts;
  amountsApplied?: EconomyAmounts;
  balances?: EconomyBalances;
  idempotencyKey?: string | null;
  error?: string;
};

type ApplyArgs = {
  userId: string;
  source: string;
  amounts: EconomyAmounts;
  meta?: Record<string, unknown>;
  idempotencyKey?: string;
  client?: SupabaseClient;
};

const withClient = (client?: SupabaseClient) => client ?? supabaseAdmin;

const toSafeInt = (value: number | undefined) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value as number));
};

const normalizeAmounts = (amounts: EconomyAmounts): EconomyAmounts => ({
  shards: toSafeInt(amounts.shards),
  energy: toSafeInt(amounts.energy),
  xp: toSafeInt(amounts.xp),
  energyCap: toSafeInt(amounts.energyCap)
});

const normalizeResult = (raw: unknown): EconomyTransactionResult => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'invalid_economy_response' };
  }
  const payload = raw as Record<string, unknown>;
  const balancesRaw = (payload.balances ?? {}) as Record<string, unknown>;
  const requestedRaw = (payload.amountsRequested ?? {}) as Record<string, unknown>;
  const appliedRaw = (payload.amountsApplied ?? {}) as Record<string, unknown>;

  return {
    ok: payload.ok === true,
    transactionId: typeof payload.transactionId === 'string' ? payload.transactionId : null,
    reused: payload.reused === true,
    ...(payload.direction === 'spend' || payload.direction === 'grant' ? { direction: payload.direction } : {}),
    ...(typeof payload.source === 'string' ? { source: payload.source } : {}),
    amountsRequested: {
      shards: toSafeInt(requestedRaw.shards as number | undefined),
      energy: toSafeInt(requestedRaw.energy as number | undefined),
      xp: toSafeInt(requestedRaw.xp as number | undefined)
    },
    amountsApplied: {
      shards: toSafeInt(appliedRaw.shards as number | undefined),
      energy: toSafeInt(appliedRaw.energy as number | undefined),
      xp: toSafeInt(appliedRaw.xp as number | undefined)
    },
    balances: {
      xp: toSafeInt(balancesRaw.xp as number | undefined),
      energy: toSafeInt(balancesRaw.energy as number | undefined),
      shards: toSafeInt(balancesRaw.shards as number | undefined)
    },
    idempotencyKey: typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey : null,
    ...(typeof payload.error === 'string' ? { error: payload.error } : {})
  };
};

const apply = async (direction: 'spend' | 'grant', args: ApplyArgs) => {
  const supabase = withClient(args.client);
  const amounts = normalizeAmounts(args.amounts);
  const idempotencyKey =
    typeof args.idempotencyKey === 'string' && args.idempotencyKey.trim().length > 0
      ? args.idempotencyKey.trim()
      : null;

  const { data, error } = await supabase.rpc('fn_economy_apply', {
    p_user: args.userId,
    p_direction: direction,
    p_source: args.source,
    p_amounts: amounts,
    p_meta: args.meta ?? {},
    p_idempotency_key: idempotencyKey
  });

  if (error) {
    console.error('[economy] transaction failed', {
      error,
      userId: args.userId,
      direction,
      source: args.source,
      idempotencyKey,
      amounts
    });
    throw error;
  }

  return normalizeResult(data);
};

export const spend = async (
  userId: string,
  source: string,
  amounts: EconomyAmounts,
  meta: Record<string, unknown> = {},
  idempotencyKey?: string,
  client?: SupabaseClient
) =>
  apply('spend', {
    userId,
    source,
    amounts,
    meta,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(client ? { client } : {})
  });

export const grant = async (
  userId: string,
  source: string,
  amounts: EconomyAmounts,
  meta: Record<string, unknown> = {},
  idempotencyKey?: string,
  client?: SupabaseClient
) =>
  apply('grant', {
    userId,
    source,
    amounts,
    meta,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(client ? { client } : {})
  });

export const getBalances = async (userId: string, client?: SupabaseClient): Promise<EconomyBalances> => {
  const supabase = withClient(client);
  const { data, error } = await supabase.rpc('fn_economy_get_balances', {
    p_user: userId
  });

  if (error) {
    console.error('[economy] balance lookup failed', { error, userId });
    throw error;
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    xp: toSafeInt(raw.xp as number | undefined),
    energy: toSafeInt(raw.energy as number | undefined),
    shards: toSafeInt(raw.shards as number | undefined)
  };
};
