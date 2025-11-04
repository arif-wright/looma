import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureAuth } from '$lib/server/games/guard';
import { enforceShopRateLimit } from '$lib/server/shop/rate';
import { priceOrder, type PurchaseLineInput, ShopError } from '$lib/server/shop';
import { supabaseAdmin } from '$lib/server/supabase';
import { logGameAudit } from '$lib/server/games/audit';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

const toLines = (payload: unknown): PurchaseLineInput[] => {
  if (!payload || typeof payload !== 'object') {
    throw new ShopError('Body must include lines array.', 'invalid_payload', 400);
  }

  const lines = (payload as Record<string, unknown>).lines;
  if (!Array.isArray(lines)) {
    throw new ShopError('Body must include lines array.', 'invalid_payload', 400);
  }

  return lines as PurchaseLineInput[];
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
        details: { reason: 'rate_limit', endpoint: 'shop/price' }
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
      details: { reason: 'invalid_json', endpoint: 'shop/price' }
    });
    return json({ code: 'bad_request', message: 'Invalid JSON body.' }, { status: 400, headers: CACHE_HEADERS });
  }

  let lines: PurchaseLineInput[];
  try {
    lines = toLines(body);
  } catch (err) {
    const shopErr = err as ShopError;
    await logGameAudit({
      userId: user.id,
      sessionId: null,
      event: 'shop_reject',
      ip: clientIp,
      details: { reason: shopErr.code, endpoint: 'shop/price' }
    });
    return json({ code: shopErr.code, message: shopErr.message }, { status: shopErr.status, headers: CACHE_HEADERS });
  }

  try {
    const summary = await priceOrder({ userId: user.id, lines, client: supabaseAdmin });

    const response = {
      total: summary.total,
      currency: summary.currency,
      achievementPercent: Math.round(summary.achievementRate * 100),
      maxPromoPercent: summary.maxPromoPercent,
      combinedDiscountPercent: Math.round(summary.combinedDiscountRate * 100 * 100) / 100,
      lines: summary.lines.map((line) => ({
        sku: line.sku,
        qty: line.qty,
        unitPrice: line.unitPrice,
        subtotal: line.subtotal,
        discount: line.discount,
        total: line.total,
        promoPercent: line.promoPercent,
        achievementPercent: Math.round(line.achievementRate * 100),
        effectivePercent: Math.round(line.effectiveRate * 100 * 100) / 100
      }))
    };

    return json(response, { headers: CACHE_HEADERS });
  } catch (error) {
    if (error instanceof ShopError) {
      await logGameAudit({
        userId: user.id,
        sessionId: null,
        event: 'shop_reject',
        ip: clientIp,
        details: { reason: error.code, endpoint: 'shop/price' }
      });
      return json({ code: error.code, message: error.message }, { status: error.status, headers: CACHE_HEADERS });
    }

    console.error('[shop/price] pricing failed', error);
    return json({ code: 'server_error', message: 'Unable to price order.' }, { status: 500, headers: CACHE_HEADERS });
  }
};
