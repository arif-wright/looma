import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';
import { ShopError } from './errors';

type Supabase = SupabaseClient<any, 'public', any>;

type LimitRow = {
  sku: string;
  per_user_daily: number | null;
  per_user_weekly: number | null;
  cooldown_sec: number | null;
};

type OrderItemRow = {
  qty?: number;
  order:
    | {
        inserted_at: string;
        status: string;
        user_id: string;
      }
    | {
        inserted_at: string;
        status: string;
        user_id: string;
      }[];
};

const normalizeOrder = (value: OrderItemRow['order']) => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
};

type NormalizedOrder = {
  inserted_at: string;
  status: string;
  user_id: string;
};

type NormalizedOrderItemRow = {
  qty: number | null;
  order: NormalizedOrder;
};

const normalizeOrderItemRows = (rows: unknown[]): NormalizedOrderItemRow[] =>
  rows.reduce<NormalizedOrderItemRow[]>((acc, raw) => {
    const row = raw as OrderItemRow;
    const order = normalizeOrder(row.order);
    if (!order) return acc;
    acc.push({
      qty: typeof row.qty === 'number' && Number.isFinite(row.qty) ? row.qty : null,
      order
    });
    return acc;
  }, []);

const normalizeClient = (client?: Supabase) => client ?? supabaseAdmin;

const fetchLimitRow = async (client: Supabase, sku: string): Promise<LimitRow | null> => {
  const { data, error } = await client
    .from('shop_limits')
    .select('sku, per_user_daily, per_user_weekly, cooldown_sec')
    .eq('sku', sku)
    .maybeSingle();

  if (error) {
    console.error('[shop] fetchLimitRow failed', error, { sku });
    throw error;
  }

  if (!data) return null;

  return {
    sku: data.sku as string,
    per_user_daily: data.per_user_daily as number | null,
    per_user_weekly: data.per_user_weekly as number | null,
    cooldown_sec: data.cooldown_sec as number | null
  };
};

const DAY_MS = 86_400_000;
const WEEK_MS = DAY_MS * 7;

type LimitInput = {
  userId: string;
  sku: string;
  qty: number;
  now?: Date | string;
  client?: Supabase;
};

export type LimitCheckResult = {
  limit?: LimitRow | null;
  dailyTotal: number;
  weeklyTotal: number;
};

const toDate = (value?: Date | string) => (value instanceof Date ? value : value ? new Date(value) : new Date());

export const checkPerUserLimits = async ({ userId, sku, qty, now, client }: LimitInput): Promise<LimitCheckResult> => {
  const supabase = normalizeClient(client);
  const limit = await fetchLimitRow(supabase, sku);
  if (!limit) {
    return { limit: null, dailyTotal: 0, weeklyTotal: 0 };
  }

  const nowDate = toDate(now);
  const weekStartIso = new Date(nowDate.getTime() - WEEK_MS).toISOString();
  const dayStart = nowDate.getTime() - DAY_MS;

  const { data, error } = await supabase
    .from('shop_order_items')
    .select('qty, order:shop_orders!inner(inserted_at, status, user_id)')
    .eq('sku', sku)
    .eq('order.user_id', userId)
    .eq('order.status', 'paid')
    .gte('order.inserted_at', weekStartIso);

  if (error) {
    console.error('[shop] checkPerUserLimits failed', error, { userId, sku });
    throw error;
  }

  const rows = normalizeOrderItemRows((data ?? []) as unknown[]);

  const { dailyTotal, weeklyTotal } = rows.reduce(
    (acc, row) => {
      const inserted = new Date(row.order.inserted_at).getTime();
      const qtyValue = Number(row.qty ?? 0);
      if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
        return acc;
      }

      if (inserted >= dayStart) {
        acc.dailyTotal += qtyValue;
      }

      acc.weeklyTotal += qtyValue;
      return acc;
    },
    { dailyTotal: 0, weeklyTotal: 0 }
  );

  if (limit.per_user_daily !== null && limit.per_user_daily >= 0) {
    if (dailyTotal + qty > limit.per_user_daily) {
      throw new ShopError('Daily purchase limit reached for this item.', 'limit_exceeded', 409, {
        sku,
        boundary: 'daily',
        limit: limit.per_user_daily,
        attempted: qty,
        consumed: dailyTotal
      });
    }
  }

  if (limit.per_user_weekly !== null && limit.per_user_weekly >= 0) {
    if (weeklyTotal + qty > limit.per_user_weekly) {
      throw new ShopError('Weekly purchase limit reached for this item.', 'limit_exceeded', 409, {
        sku,
        boundary: 'weekly',
        limit: limit.per_user_weekly,
        attempted: qty,
        consumed: weeklyTotal
      });
    }
  }

  return { limit, dailyTotal, weeklyTotal } satisfies LimitCheckResult;
};

type CooldownInput = {
  userId: string;
  sku: string;
  now?: Date | string;
  client?: Supabase;
};

export type CooldownCheckResult = {
  lastPurchaseAt: string | null;
  retryAfter: number | null;
};

export const checkCooldown = async ({ userId, sku, now, client }: CooldownInput): Promise<CooldownCheckResult> => {
  const supabase = normalizeClient(client);
  const limit = await fetchLimitRow(supabase, sku);

  if (!limit || !limit.cooldown_sec || limit.cooldown_sec <= 0) {
    return { lastPurchaseAt: null, retryAfter: null };
  }

  const { data, error } = await supabase
    .from('shop_order_items')
    .select('order:shop_orders!inner(inserted_at, status, user_id)')
    .eq('sku', sku)
    .eq('order.user_id', userId)
    .eq('order.status', 'paid')
    .order('order.inserted_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[shop] checkCooldown failed', error, { userId, sku });
    throw error;
  }

  const row = Array.isArray(data) ? normalizeOrderItemRows(data as unknown[])[0] ?? null : null;
  if (!row) {
    return { lastPurchaseAt: null, retryAfter: null };
  }

  const lastAt = new Date(row.order.inserted_at);
  const nowDate = toDate(now);
  const elapsed = Math.max(0, nowDate.getTime() - lastAt.getTime());
  const cooldownMs = Math.max(0, limit.cooldown_sec * 1000);

  if (elapsed < cooldownMs) {
    const retryAfter = Math.ceil((cooldownMs - elapsed) / 1000);
    throw new ShopError('Item is on cooldown.', 'cooldown_active', 409, {
      sku,
      retryAfter,
      lastPurchaseAt: row.order.inserted_at
    });
  }

  return { lastPurchaseAt: row.order.inserted_at, retryAfter: null } satisfies CooldownCheckResult;
};
