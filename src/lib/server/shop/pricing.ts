import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';

export type Supabase = SupabaseClient<any, 'public', any>;

type PriceRow = {
  id: string;
  unit_price: number;
  currency: string | null;
  valid_from: string;
  valid_to: string | null;
};

type PromoRow = {
  slug: string;
  percent_off: number;
  sku: string | null;
  rarity: string | null;
  is_flash?: boolean;
};

export type ActivePromotion = {
  slug: string;
  percentOff: number;
  sku: string | null;
  rarity: string | null;
  isFlash: boolean;
};

export type ActivePrice = {
  priceId: string;
  unitPrice: number;
  currency: string;
};

export const ACHIEVEMENT_DISCOUNT_TIERS = [
  { threshold: 600, percent: 0.15 },
  { threshold: 300, percent: 0.1 },
  { threshold: 100, percent: 0.05 }
] as const;

const normalizeClient = (client?: Supabase) => client ?? supabaseAdmin;

const toIso = (value?: Date | string | null) => {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return value.toISOString();
};

const clampPercent = (value: number, min = 0, max = 1) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
};

export const getActivePrice = async (
  variantId: string,
  opts?: { now?: Date | string; client?: Supabase }
): Promise<ActivePrice | null> => {
  const client = normalizeClient(opts?.client);
  const nowIso = toIso(opts?.now);

  let query = client
    .from('shop_prices')
    .select('id, unit_price, currency, valid_from, valid_to')
    .eq('variant_id', variantId)
    .lte('valid_from', nowIso)
    .order('valid_from', { ascending: false })
    .limit(1);

  query = query.or(`valid_to.is.null,valid_to.gt.${nowIso}`);

  const { data, error } = await query;

  if (error) {
    console.error('[shop] getActivePrice failed', error, { variantId });
    throw error;
  }

  if (!data || data.length === 0) return null;

  const row = data[0] as PriceRow;
  const currency = typeof row.currency === 'string' && row.currency.trim().length > 0 ? row.currency : 'shards';

  return {
    priceId: row.id,
    unitPrice: Math.max(0, Number(row.unit_price ?? 0)),
    currency
  } satisfies ActivePrice;
};

export const getActivePrices = async (
  variantIds: string[],
  opts?: { now?: Date | string; client?: Supabase }
): Promise<Map<string, ActivePrice>> => {
  const client = normalizeClient(opts?.client);
  const nowIso = toIso(opts?.now);

  if (!Array.isArray(variantIds) || variantIds.length === 0) {
    return new Map();
  }

  let query = client
    .from('shop_prices')
    .select('id, variant_id, unit_price, currency, valid_from, valid_to')
    .in('variant_id', variantIds)
    .lte('valid_from', nowIso)
    .order('valid_from', { ascending: false });

  query = query.or(`valid_to.is.null,valid_to.gt.${nowIso}`);

  const { data, error } = await query;

  if (error) {
    console.error('[shop] getActivePrices failed', error, { variantIds });
    throw error;
  }

  const map = new Map<string, ActivePrice>();
  for (const row of data ?? []) {
    const record = row as PriceRow & { variant_id: string };
    if (map.has(record.variant_id)) continue;

    const currency = typeof record.currency === 'string' && record.currency.trim().length > 0 ? record.currency : 'shards';
    map.set(record.variant_id, {
      priceId: record.id,
      unitPrice: Math.max(0, Number(record.unit_price ?? 0)),
      currency
    });
  }

  return map;
};

type PromoInput = {
  sku?: string | null;
  rarity?: string | null;
  now?: Date | string;
  client?: Supabase;
};

const matchesPromo = (promo: PromoRow, sku: string | null, rarity: string | null) => {
  const skuMatches = promo.sku === null || (sku !== null && promo.sku === sku);
  const rarityMatches = promo.rarity === null || (rarity !== null && promo.rarity === rarity);
  return skuMatches && rarityMatches;
};

export const findBestPromotion = (
  promos: ActivePromotion[],
  sku: string,
  rarity: string | null
): ActivePromotion | null => {
  if (!promos.length) return null;
  const targetRarity = rarity ?? null;
  let best: ActivePromotion | null = null;

  for (const promo of promos) {
    const matchesSku = promo.sku === null || promo.sku === sku;
    const matchesRarity = promo.rarity === null || (targetRarity !== null && promo.rarity === targetRarity);
    if (!matchesSku || !matchesRarity) continue;
    if (!best || promo.percentOff > best.percentOff) {
      best = promo;
    }
  }

  return best;
};

export const listActivePromotions = async (
  opts?: { now?: Date | string; client?: Supabase }
): Promise<ActivePromotion[]> => {
  const supabase = normalizeClient(opts?.client);
  const nowIso = toIso(opts?.now);

  const { data, error } = await supabase
    .from('shop_promotions')
    .select('slug, percent_off, sku, rarity, is_flash')
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso);

  if (error) {
    console.error('[shop] listActivePromotions failed', error);
    throw error;
  }

  if (!data || data.length === 0) return [];

  return (data as PromoRow[]).map((row) => ({
    slug: row.slug,
    percentOff: Math.max(0, Math.min(90, Number(row.percent_off ?? 0))),
    sku: row.sku ?? null,
    rarity: row.rarity ?? null,
    isFlash: !!row.is_flash
  }));
};

export const getActivePromos = async ({ sku, rarity, now, client }: PromoInput): Promise<number> => {
  const supabase = normalizeClient(client);
  const nowIso = toIso(now);

  const promos = await listActivePromotions({ now: nowIso, client: supabase });
  if (promos.length === 0) return 0;

  const targetSku = sku ?? null;
  const targetRarity = rarity ?? null;

  const best = findBestPromotion(promos, targetSku ?? '', targetRarity);
  return best ? Math.min(best.percentOff, 90) : 0;
};

export const calcAchievementDiscount = async (
  userId: string,
  opts?: { client?: Supabase }
): Promise<number> => {
  const supabase = normalizeClient(opts?.client);

  const { data, error } = await supabase
    .from('user_points')
    .select('points')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[shop] calcAchievementDiscount failed', error, { userId });
    throw error;
  }

  const points = Number(data?.points ?? 0);
  if (!Number.isFinite(points) || points <= 0) return 0;

  for (const { threshold, percent } of ACHIEVEMENT_DISCOUNT_TIERS) {
    if (points >= threshold) {
      return clampPercent(percent, 0, 0.15);
    }
  }

  return 0;
};
