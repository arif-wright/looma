import { json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID } from 'crypto';
import { supabaseServer } from '$lib/supabaseClient';
import { supabaseAdmin } from '$lib/server/supabase';
import { getShopItem } from '$lib/server/econ/catalog';
import { walletSpend, fetchWallet } from '$lib/server/econ/index';
import { enforceEconomyRateLimit } from '$lib/server/econ/rate';
import { logGameAudit } from '$lib/server/games/audit';
import { logEvent } from '$lib/server/analytics/log';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

const normalizeQuantity = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.floor(numeric));
};

const getDiscountForPoints = (points: number) => {
  if (!Number.isFinite(points) || points <= 0) return 0;
  if (points >= 600) return 0.15;
  if (points >= 300) return 0.1;
  if (points >= 100) return 0.05;
  return 0;
};

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const clientIp = typeof event.getClientAddress === 'function' ? event.getClientAddress() : null;
  const authorization = event.request.headers.get('authorization');
  const bearer = authorization && authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : null;

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser(bearer && bearer.length > 0 ? bearer : undefined);

  if (authError) {
    console.error('[shop/purchase] auth error', authError);
    return json({ code: 'server_error', message: 'Unable to verify session.' }, {
      status: 500,
      headers: CACHE_HEADERS
    });
  }

  if (!user) {
    return json({ code: 'unauthorized', message: 'Authentication required.' }, {
      status: 401,
      headers: CACHE_HEADERS
    });
  }

  let payload: {
    itemId?: unknown;
    qty?: unknown;
  };

  try {
    payload = await event.request.json();
  } catch (err) {
    await logGameAudit({
      userId: user.id,
      sessionId: null,
      event: 'econ_reject',
      ip: clientIp,
      details: { reason: 'invalid_json', endpoint: 'shop/purchase' }
    });
    return json({ code: 'bad_request', message: 'Invalid JSON body.' }, {
      status: 400,
      headers: CACHE_HEADERS
    });
  }

  const itemId = typeof payload.itemId === 'string' && payload.itemId.trim().length > 0 ? payload.itemId.trim() : null;
  const qty = normalizeQuantity(payload.qty);

  const item = getShopItem(itemId);
  if (!item) {
    await logGameAudit({
      userId: user.id,
      sessionId: null,
      event: 'econ_reject',
      ip: clientIp,
      details: { reason: 'unknown_item', endpoint: 'shop/purchase', itemId }
    });
    return json({ code: 'bad_request', message: 'Unknown shop item.' }, {
      status: 400,
      headers: CACHE_HEADERS
    });
  }

  try {
    enforceEconomyRateLimit(user.id, clientIp);
  } catch (err) {
    const httpError = err as HttpError;
    if (httpError?.status === 429) {
      await logGameAudit({
        userId: user.id,
        sessionId: null,
        event: 'econ_reject',
        ip: clientIp,
        details: { reason: 'rate_limit', endpoint: 'shop/purchase', itemId }
      });
    }
    throw err;
  }

  let points = 0;
  try {
    const { data, error } = await supabaseAdmin
      .from('user_points')
      .select('points')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[shop/purchase] failed to load user points', error, { userId: user.id });
    } else {
      points = Number(data?.points ?? 0);
    }
  } catch (err) {
    console.warn('[shop/purchase] user points query failed', err, { userId: user.id });
  }

  const subtotal = item.price * qty;
  const discountPct = getDiscountForPoints(points);
  const discounted = Math.max(0, Math.floor(subtotal * (1 - discountPct)));
  const total = Math.max(1, discounted);
  const orderId = randomUUID();

  try {
    await walletSpend({
      userId: user.id,
      amount: total,
      source: 'shop_purchase',
      refId: orderId,
      meta: {
        itemId: item.id,
        qty,
        unitPrice: item.price,
        subtotal,
        discountPct,
        pointsBefore: points
      }
    });

    await logEvent(event, 'wallet_spend', {
      userId: user.id,
      amount: total,
      currency: 'shards',
      meta: {
        source: 'shop_purchase',
        itemId: item.id,
        qty,
        unitPrice: item.price,
        subtotal,
        discountPct,
        orderId
      }
    });

    const wallet = await fetchWallet(supabaseAdmin, user.id);
    return json(
      {
        balance: wallet.balance,
        currency: wallet.currency,
        orderId,
        discountPct
      },
      { headers: CACHE_HEADERS }
    );
  } catch (err) {
    console.error('[shop/purchase] spend failed', err);
    const message = err instanceof Error && err.message.includes('insufficient')
      ? 'Insufficient funds.'
      : 'Unable to complete purchase.';
    const status = message === 'Insufficient funds.' ? 400 : 500;
    if (status === 400 && message === 'Insufficient funds.') {
      await logGameAudit({
        userId: user.id,
        sessionId: null,
        event: 'econ_reject',
        ip: clientIp,
        details: { reason: 'insufficient_funds', endpoint: 'shop/purchase', itemId: item.id, qty }
      });
    }
    return json({
      code: status === 400 ? 'insufficient_funds' : 'server_error',
      message
    }, {
      status,
      headers: CACHE_HEADERS
    });
  }
};
