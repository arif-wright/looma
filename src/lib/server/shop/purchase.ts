import { randomUUID } from 'crypto';
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';
import { walletSpend, walletGrant, fetchWallet } from '$lib/server/econ/index';
import { logEvent } from '$lib/server/analytics/log';
import { ShopError } from './errors';
import {
  calcAchievementDiscount,
  listActivePromotions,
  getActivePrices,
  findBestPromotion,
  type Supabase as ShopSupabase
} from './pricing';

type Supabase = SupabaseClient<any, 'public', any>;

const normalizeClient = (client?: Supabase) => client ?? supabaseAdmin;

const parseEnvInt = (value: string | undefined, fallback: number, minimum = 1, maximum?: number) => {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  const clamped = Math.max(minimum, parsed);
  return maximum ? Math.min(clamped, maximum) : clamped;
};

const getMaxLines = () => parseEnvInt(env.SHOP_MAX_LINES, 6, 1, 20);
const getMaxQtyPerLine = () => parseEnvInt(env.SHOP_MAX_QTY_PER_LINE, 5, 1, 99);

const toIso = (value?: Date | string) => {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
};

type VariantRow = {
  id: string;
  sku: string;
  display_name: string;
  stackable: boolean;
  max_stack: number | null;
  is_active: boolean | null;
  product: {
    id: string;
    slug: string;
    name: string;
    rarity: string | null;
    is_active: boolean | null;
  };
};

type InventoryRow = {
  sku: string;
  qty: number;
};

export type PurchaseLineInput = {
  sku: string;
  qty: number;
};

export type PricedLine = {
  sku: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  rarity: string | null;
  qty: number;
  unitPrice: number;
  subtotal: number;
  discount: number;
  total: number;
  promoRate: number;
  promoPercent: number;
  promoSlug: string | null;
  achievementRate: number;
  achievementPercent: number;
  effectiveRate: number;
  stackable: boolean;
  maxStack: number | null;
  currency: string;
};

export type PriceOrderResult = {
  lines: PricedLine[];
  total: number;
  currency: string;
  achievementRate: number;
  achievementPercent: number;
  maxPromoPercent: number;
  combinedDiscountRate: number;
};

type PriceOrderInput = {
  userId: string;
  lines: PurchaseLineInput[];
  now?: Date | string;
  client?: Supabase;
};

type VariantMap = Map<string, VariantRow>;
const normalizeSku = (sku: string) => sku.trim();

const aggregateLines = (lines: PurchaseLineInput[], maxLines: number, maxQty: number): PurchaseLineInput[] => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ShopError('At least one line item is required.', 'invalid_payload', 400);
  }

  const aggregate = new Map<string, number>();

  for (const line of lines) {
    if (!line || typeof line !== 'object') {
      throw new ShopError('Invalid line payload.', 'invalid_payload', 400);
    }

    const skuRaw = typeof line.sku === 'string' ? normalizeSku(line.sku) : '';
    if (!skuRaw) {
      throw new ShopError('SKU is required for each line item.', 'invalid_payload', 400);
    }

    const qtyRaw = typeof line.qty === 'number' ? line.qty : Number(line.qty);
    if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) {
      throw new ShopError('Quantity must be a positive number.', 'invalid_payload', 400, {
        sku: skuRaw,
        qty: line.qty
      });
    }

    const qty = Math.floor(qtyRaw);
    if (qty > maxQty) {
      throw new ShopError('Quantity exceeds per-line maximum.', 'invalid_payload', 400, {
        sku: skuRaw,
        qty,
        max: maxQty
      });
    }

    aggregate.set(skuRaw, (aggregate.get(skuRaw) ?? 0) + qty);
  }

  if (aggregate.size > maxLines) {
    throw new ShopError('Too many distinct items in order.', 'invalid_payload', 400, {
      limit: maxLines
    });
  }

  return Array.from(aggregate.entries()).map(([sku, qty]) => ({ sku, qty }));
};

const fetchVariants = async (client: Supabase, skus: string[]): Promise<VariantMap> => {
  const { data, error } = await client
    .from('shop_variants')
    .select('id, sku, display_name, stackable, max_stack, is_active, product:shop_products!inner(id, slug, name, rarity, is_active)')
    .in('sku', skus);

  if (error) {
    console.error('[shop] fetchVariants failed', error, { skus });
    throw new ShopError('Failed to load variants.', 'internal_error', 500);
  }

  const map: VariantMap = new Map();
  for (const row of data ?? []) {
    const variant = row as unknown as VariantRow;
    map.set(variant.sku, variant);
  }
  return map;
};

export const priceOrder = async ({ userId, lines, now, client }: PriceOrderInput): Promise<PriceOrderResult> => {
  if (!userId) {
    throw new ShopError('User is required.', 'invalid_payload', 400);
  }

  const maxLines = getMaxLines();
  const maxQty = getMaxQtyPerLine();
  const normalizedLines = aggregateLines(lines, maxLines, maxQty);
  const skus = normalizedLines.map((line) => line.sku);
  const supabase = normalizeClient(client);
  const nowIso = toIso(now);

  const variants = await fetchVariants(supabase, skus);

  if (variants.size !== skus.length) {
    const missing = skus.filter((sku) => !variants.has(sku));
    throw new ShopError('Requested items are unavailable.', 'sku_inactive', 404, { skus: missing });
  }

  const variantIds = Array.from(
    new Set(
      skus
        .map((sku) => variants.get(sku)?.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const prices = await getActivePrices(variantIds, { now: nowIso, client: supabase as ShopSupabase });
  const promos = await listActivePromotions({ now: nowIso, client: supabase as ShopSupabase });
  const achievementRate = await calcAchievementDiscount(userId, { client: supabase as ShopSupabase });
  const achievementPercent = Math.round(achievementRate * 100);

  const pricedLines: PricedLine[] = [];
  let orderTotal = 0;
  let maxPromoPercent = 0;
  let maxCombinedRate = 0;
  let currency = 'shards';

  for (const line of normalizedLines) {
    const variant = variants.get(line.sku)!;

    if (variant.is_active === false || variant.product?.is_active === false) {
      throw new ShopError('Item is not available for purchase.', 'sku_inactive', 404, {
        sku: line.sku
      });
    }

    if (!variant.stackable && line.qty > 1) {
      throw new ShopError('Non-stackable items can only be purchased once per order.', 'invalid_payload', 400, {
        sku: line.sku
      });
    }

    const price = prices.get(variant.id);
    if (!price) {
      throw new ShopError('Pricing unavailable for requested item.', 'price_missing', 409, {
        sku: line.sku
      });
    }

    currency = price.currency ?? currency;
    const subtotal = price.unitPrice * line.qty;

    const bestPromo = findBestPromotion(promos, line.sku, variant.product?.rarity ?? null);
    const promoRate = bestPromo ? Math.max(0, bestPromo.percentOff) / 100 : 0;
    const promoPercent = bestPromo?.percentOff ?? 0;
    const promoSlug = bestPromo?.slug ?? null;

    const combinedRateRaw = 1 - (1 - promoRate) * (1 - achievementRate);
    const effectiveRate = Math.min(combinedRateRaw, 0.25);
    const discount = Math.min(subtotal, Math.floor(subtotal * effectiveRate));
    const total = Math.max(0, subtotal - discount);

    orderTotal += total;
    maxPromoPercent = Math.max(maxPromoPercent, promoPercent);
    maxCombinedRate = Math.max(maxCombinedRate, effectiveRate);

    pricedLines.push({
      sku: line.sku,
      variantId: variant.id,
      productId: variant.product.id,
      productSlug: variant.product.slug,
      productName: variant.product.name,
      rarity: variant.product.rarity ?? null,
      qty: line.qty,
      unitPrice: price.unitPrice,
      subtotal,
      discount,
      total,
      promoRate,
      promoPercent,
      promoSlug,
      achievementRate,
      achievementPercent,
      effectiveRate,
      stackable: !!variant.stackable,
      maxStack: variant.max_stack ?? null,
      currency: price.currency ?? 'shards'
    });
  }

  if (orderTotal <= 0) {
    throw new ShopError('Order total must be positive.', 'invalid_payload', 400);
  }

  return {
    lines: pricedLines,
    total: orderTotal,
    currency,
    achievementRate,
    achievementPercent,
    maxPromoPercent,
    combinedDiscountRate: maxCombinedRate
  } satisfies PriceOrderResult;
};

type FinalizeInput = {
  userId: string;
  lines: PricedLine[];
  total: number;
  currency: string;
  meta?: Record<string, unknown>;
  client?: Supabase;
  event?: RequestEvent | null;
  now?: Date | string;
};

export type FinalizeResult = {
  orderId: string;
  balance: number;
  currency: string;
  inventoryDeltas: Array<{ sku: string; delta: number; qty: number }>;
};

const computeInventoryUpdates = (
  lines: PricedLine[],
  existing: Map<string, number>
): { updates: Array<{ sku: string; qty: number }>; deltas: Array<{ sku: string; delta: number; qty: number }> } => {
  const updates: Array<{ sku: string; qty: number }> = [];
  const deltas: Array<{ sku: string; delta: number; qty: number }> = [];

  for (const line of lines) {
    const currentQty = existing.get(line.sku) ?? 0;
    let nextQty: number;

    if (!line.stackable) {
      if (currentQty >= 1) {
        throw new ShopError('Item already owned.', 'inventory_cap', 409, { sku: line.sku });
      }
      nextQty = 1;
    } else {
      nextQty = currentQty + line.qty;
      const maxStack = line.maxStack ?? null;
      if (maxStack !== null && nextQty > maxStack) {
        throw new ShopError('Item stack limit reached.', 'inventory_cap', 409, {
          sku: line.sku,
          maxStack,
          attempted: line.qty,
          current: currentQty
        });
      }
    }

    updates.push({ sku: line.sku, qty: nextQty });
    deltas.push({ sku: line.sku, delta: nextQty - currentQty, qty: nextQty });
  }

  return { updates, deltas };
};

const fetchInventory = async (client: Supabase, userId: string, skus: string[]): Promise<Map<string, number>> => {
  if (!skus.length) return new Map();

  const { data, error } = await client
    .from('inventory')
    .select('sku, qty')
    .eq('user_id', userId)
    .in('sku', skus);

  if (error) {
    console.error('[shop] fetchInventory failed', error, { userId, skus });
    throw new ShopError('Failed to load inventory.', 'internal_error', 500);
  }

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const record = row as InventoryRow;
    map.set(record.sku, Number(record.qty ?? 0));
  }
  return map;
};

const buildOrderMeta = (input: FinalizeInput, lines: PricedLine[]) => ({
  ...input.meta,
  achievementRate: lines[0]?.achievementRate ?? 0,
  promos: lines
    .filter((line) => line.promoSlug)
    .map((line) => ({ sku: line.sku, promoSlug: line.promoSlug, promoPercent: line.promoPercent })),
  lines: lines.map((line) => ({
    sku: line.sku,
    qty: line.qty,
    unitPrice: line.unitPrice,
    discount: line.discount,
    total: line.total
  }))
});

export const finalizeOrder = async ({
  userId,
  lines,
  total,
  currency,
  meta,
  client,
  event,
  now
}: FinalizeInput): Promise<FinalizeResult> => {
  if (!userId) throw new ShopError('User is required.', 'invalid_payload', 400);
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ShopError('Priced lines are required.', 'invalid_payload', 400);
  }
  if (!Number.isFinite(total) || total <= 0) {
    throw new ShopError('Order total must be positive.', 'invalid_payload', 400);
  }

  const supabase = normalizeClient(client);
  const nowIso = toIso(now);
  const skus = lines.map((line) => line.sku);
  const inventory = await fetchInventory(supabase, userId, skus);
  const { updates, deltas } = computeInventoryUpdates(lines, inventory);

  const orderId = randomUUID();
  const spendMeta = {
    orderId,
    currency,
    lines: lines.map((line) => ({
      sku: line.sku,
      qty: line.qty,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      discount: line.discount,
      total: line.total,
      promoPercent: line.promoPercent,
      promoSlug: line.promoSlug
    }))
  } satisfies Record<string, unknown>;

  let walletSpent = false;

  try {
    await walletSpend({
      userId,
      amount: total,
      source: 'shop_purchase',
      refId: orderId,
      meta: spendMeta,
      client: supabase as ShopSupabase
    });
    walletSpent = true;

    const orderMeta = buildOrderMeta({ userId, lines, total, currency, meta, client, event, now }, lines);

    const { error: orderError } = await supabase.from('shop_orders').insert({
      id: orderId,
      user_id: userId,
      total,
      currency,
      meta: orderMeta,
      inserted_at: nowIso
    });

    if (orderError) {
      console.error('[shop] order insert failed', orderError, { orderId });
      throw new ShopError('Failed to record order.', 'internal_error', 500);
    }

    const orderItemsPayload = lines.map((line) => ({
      order_id: orderId,
      sku: line.sku,
      name: line.productName,
      qty: line.qty,
      unit_price: line.unitPrice,
      discount: line.discount
    }));

    const { error: itemsError } = await supabase.from('shop_order_items').insert(orderItemsPayload);
    if (itemsError) {
      console.error('[shop] order items insert failed', itemsError, { orderId });
      throw new ShopError('Failed to record order items.', 'internal_error', 500);
    }

    if (updates.length > 0) {
      const upsertPayload = updates.map((update) => ({
        user_id: userId,
        sku: update.sku,
        qty: update.qty
      }));

      const { error: inventoryError } = await supabase
        .from('inventory')
        .upsert(upsertPayload, { onConflict: 'user_id,sku' });

      if (inventoryError) {
        console.error('[shop] inventory upsert failed', inventoryError, { orderId });
        throw new ShopError('Failed to deliver items.', 'internal_error', 500);
      }
    }

    const wallet = await fetchWallet(supabase as ShopSupabase, userId);

    const analyticsMeta = {
      orderId,
      currency,
      lines: spendMeta.lines,
      achievementPercent: Math.round((lines[0]?.achievementRate ?? 0) * 100),
      total
    } satisfies Record<string, unknown>;

    await logEvent(event ?? null, 'wallet_spend', {
      userId,
      amount: total,
      currency,
      meta: {
        source: 'shop_purchase',
        ...spendMeta
      }
    });

    await logEvent(event ?? null, 'shop_purchase', {
      userId,
      amount: total,
      currency,
      meta: analyticsMeta
    });

    return {
      orderId,
      balance: wallet.balance,
      currency: wallet.currency,
      inventoryDeltas: deltas
    } satisfies FinalizeResult;
  } catch (error) {
    if (walletSpent) {
      try {
        await walletGrant({
          userId,
          amount: total,
          source: 'shop_purchase_refund',
          refId: orderId,
          meta: { reason: 'rollback', orderId },
          client: supabase as ShopSupabase
        });
      } catch (refundError) {
        console.error('[shop] failed to refund after error', refundError, { orderId, userId });
      }
    }

    if (error instanceof ShopError) {
      throw error;
    }

    if (typeof (error as any)?.message === 'string' && /(insufficient funds|insufficient_funds)/i.test((error as any).message)) {
      throw new ShopError('Insufficient funds.', 'insufficient_funds', 400);
    }

    console.error('[shop] finalizeOrder failed', error, { orderId, userId });
    throw new ShopError('Unable to finalize purchase.', 'internal_error', 500);
  }
};
