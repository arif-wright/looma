import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureAuth } from '$lib/server/games/guard';
import { enforceShopRateLimit } from '$lib/server/shop/rate';
import {
  priceOrder,
  finalizeOrder,
  type PurchaseLineInput,
  type PricedLine,
  ShopError,
  checkPerUserLimits,
  checkCooldown
} from '$lib/server/shop';
import { supabaseAdmin } from '$lib/server/supabase';
import { logGameAudit } from '$lib/server/games/audit';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

const parseLines = (payload: unknown): PurchaseLineInput[] => {
  if (!payload || typeof payload !== 'object') {
    throw new ShopError('Body must include lines array.', 'invalid_payload', 400);
  }

  const lines = (payload as Record<string, unknown>).lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ShopError('Body must include lines array.', 'invalid_payload', 400);
  }

  return lines as PurchaseLineInput[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const summarizeLine = (line: PricedLine) => ({
  sku: line.sku,
  qty: line.qty,
  unitPrice: line.unitPrice,
  subtotal: line.subtotal,
  discount: line.discount,
  total: line.total,
  promoPercent: line.promoPercent,
  achievementPercent: Math.round(line.achievementRate * 100),
  effectivePercent: Math.round(line.effectiveRate * 100 * 100) / 100
});

const respondWithShopError = async (
  params: {
    error: ShopError;
    userId: string;
    ip: string | null;
    endpoint: string;
  }
) => {
  const { error, userId, ip, endpoint } = params;
  await logGameAudit({
    userId,
    sessionId: null,
    event: 'shop_reject',
    ip,
    details: { reason: error.code, endpoint }
  });
  return json({ code: error.code, message: error.message }, { status: error.status, headers: CACHE_HEADERS });
};

export const POST: RequestHandler = async (event) => {
  const { user } = await ensureAuth(event);
  const clientIp = typeof event.getClientAddress === 'function' ? event.getClientAddress() : null;

  try {
    enforceShopRateLimit(user.id, clientIp);
  } catch (err) {
    const body = (err as any)?.body ?? null;
    if (body?.code === 'rate_limited') {
      await logGameAudit({
        userId: user.id,
        sessionId: null,
        event: 'shop_reject',
        ip: clientIp,
        details: { reason: 'rate_limit', endpoint: 'shop/purchase' }
      });
      return json(body, { status: 429, headers: CACHE_HEADERS });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    await logGameAudit({
      userId: user.id,
      sessionId: null,
      event: 'shop_reject',
      ip: clientIp,
      details: { reason: 'invalid_json', endpoint: 'shop/purchase' }
    });
    return json({ code: 'bad_request', message: 'Invalid JSON body.' }, { status: 400, headers: CACHE_HEADERS });
  }

  let requestedLines: PurchaseLineInput[];
  try {
    requestedLines = parseLines(body);
  } catch (error) {
    return respondWithShopError({ error: error as ShopError, userId: user.id, ip: clientIp, endpoint: 'shop/purchase' });
  }

  const meta = isRecord((body as any)?.meta) ? ((body as any).meta as Record<string, unknown>) : undefined;

  let summary;
  try {
    summary = await priceOrder({ userId: user.id, lines: requestedLines, client: supabaseAdmin });
  } catch (error) {
    if (error instanceof ShopError) {
      return respondWithShopError({ error, userId: user.id, ip: clientIp, endpoint: 'shop/purchase' });
    }
    console.error('[shop/purchase] priceOrder failed', error);
    return json({ code: 'server_error', message: 'Unable to price order.' }, { status: 500, headers: CACHE_HEADERS });
  }

  for (const line of summary.lines) {
    try {
      await checkPerUserLimits({ userId: user.id, sku: line.sku, qty: line.qty, client: supabaseAdmin });
    } catch (error) {
      if (error instanceof ShopError) {
        return respondWithShopError({ error, userId: user.id, ip: clientIp, endpoint: 'shop/purchase' });
      }
      console.error('[shop/purchase] per-user limit check failed', error, { userId: user.id, sku: line.sku });
      return json({ code: 'server_error', message: 'Unable to verify limits.' }, { status: 500, headers: CACHE_HEADERS });
    }

    try {
      await checkCooldown({ userId: user.id, sku: line.sku, client: supabaseAdmin });
    } catch (error) {
      if (error instanceof ShopError) {
        return respondWithShopError({ error, userId: user.id, ip: clientIp, endpoint: 'shop/purchase' });
      }
      console.error('[shop/purchase] cooldown check failed', error, { userId: user.id, sku: line.sku });
      return json({ code: 'server_error', message: 'Unable to verify cooldowns.' }, { status: 500, headers: CACHE_HEADERS });
    }
  }

  try {
    const result = await finalizeOrder({
      userId: user.id,
      lines: summary.lines,
      total: summary.total,
      currency: summary.currency,
      meta,
      client: supabaseAdmin,
      event
    });

    return json(
      {
        orderId: result.orderId,
        total: summary.total,
        currency: summary.currency,
        balance: result.balance,
        inventoryDeltas: result.inventoryDeltas,
        achievementPercent: Math.round(summary.achievementRate * 100),
        maxPromoPercent: summary.maxPromoPercent,
        lines: summary.lines.map(summarizeLine)
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof ShopError) {
      return respondWithShopError({ error, userId: user.id, ip: clientIp, endpoint: 'shop/purchase' });
    }

    console.error('[shop/purchase] finalize failed', error);
    return json({ code: 'server_error', message: 'Unable to complete purchase.' }, { status: 500, headers: CACHE_HEADERS });
  }
};
