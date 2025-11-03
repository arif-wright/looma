import { json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { enforceEconomyRateLimit } from '$lib/server/econ/rate';
import { fetchWallet, walletSpend } from '$lib/server/econ/index';
import { supabaseAdmin } from '$lib/server/supabase';
import { getShopItem } from '$lib/server/econ/catalog';
import { logGameAudit } from '$lib/server/games/audit';
import { logEvent } from '$lib/server/analytics/log';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeQuantity = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(1, Math.floor(parsed));
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
    console.error('[econ/spend] auth error', authError);
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
    amount?: unknown;
    source?: unknown;
    refId?: unknown;
    meta?: unknown;
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
      details: { reason: 'invalid_json', endpoint: 'econ/spend' }
    });
    return json({ code: 'bad_request', message: 'Invalid JSON body.' }, {
      status: 400,
      headers: CACHE_HEADERS
    });
  }

  const source = typeof payload.source === 'string' && payload.source.trim() ? payload.source.trim() : null;
  const refId = typeof payload.refId === 'string' && payload.refId.trim().length > 0 ? payload.refId.trim() : null;
  const meta = isRecord(payload.meta) ? payload.meta : undefined;

  if (!source) {
    await logGameAudit({
      userId: user.id,
      sessionId: null,
      event: 'econ_reject',
      ip: clientIp,
      details: { reason: 'invalid_payload', endpoint: 'econ/spend', payload }
    });
    return json({ code: 'bad_request', message: 'Source is required.' }, {
      status: 400,
      headers: CACHE_HEADERS
    });
  }

  let finalAmount = 0;
  let spendMeta: Record<string, unknown> = { ...meta };

  if (source === 'shop_purchase') {
    const itemId =
      typeof payload.itemId === 'string' && payload.itemId.trim().length > 0
        ? payload.itemId.trim()
        : typeof spendMeta.itemId === 'string'
        ? spendMeta.itemId
        : null;
    const qty = normalizeQuantity(payload.qty ?? spendMeta.qty ?? 1);
    const item = getShopItem(itemId);

    if (!item) {
      await logGameAudit({
        userId: user.id,
        sessionId: null,
        event: 'econ_reject',
        ip: clientIp,
        details: {
          reason: 'unknown_item',
          endpoint: 'econ/spend',
          itemId
        }
      });
      return json({ code: 'bad_request', message: 'Unknown shop item.' }, {
        status: 400,
        headers: CACHE_HEADERS
      });
    }

    finalAmount = item.price * qty;
    spendMeta = {
      ...spendMeta,
      itemId: item.id,
      qty,
      unitPrice: item.price
    };
  } else {
    const amountRaw = Number(payload.amount);
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      await logGameAudit({
        userId: user.id,
        sessionId: null,
        event: 'econ_reject',
        ip: clientIp,
        details: { reason: 'invalid_amount', endpoint: 'econ/spend', amount: payload.amount }
      });
      return json({ code: 'bad_request', message: 'Amount must be a positive number.' }, {
        status: 400,
        headers: CACHE_HEADERS
      });
    }
    finalAmount = Math.floor(amountRaw);
  }

  if (finalAmount <= 0) {
    return json({ code: 'bad_request', message: 'Unable to determine spend amount.' }, {
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
        details: { reason: 'rate_limit', endpoint: 'econ/spend' }
      });
    }
    throw err;
  }

  try {
    await walletSpend({
      userId: user.id,
      amount: finalAmount,
      source,
      refId,
      meta: spendMeta
    });

    await logEvent(event, 'wallet_spend', {
      userId: user.id,
      amount: finalAmount,
      currency: 'shards',
      meta: {
        source,
        refId,
        ...spendMeta
      }
    });

    const wallet = await fetchWallet(supabaseAdmin, user.id);
    return json(
      {
        balance: wallet.balance,
        currency: wallet.currency,
        updatedAt: wallet.updated_at
      },
      { headers: CACHE_HEADERS }
    );
  } catch (err) {
    console.error('[econ/spend] spend failed', err);
    const message = err instanceof Error && err.message.includes('insufficient')
      ? 'Insufficient funds.'
      : 'Unable to process spend.';
    const status = message === 'Insufficient funds.' ? 400 : 500;
    if (status === 400 && message === 'Insufficient funds.') {
      await logGameAudit({
        userId: user.id,
        sessionId: null,
        event: 'econ_reject',
        ip: clientIp,
        details: { reason: 'insufficient_funds', endpoint: 'econ/spend', amount: finalAmount, source }
      });
    }
    return json({ code: status === 400 ? 'insufficient_funds' : 'server_error', message }, {
      status,
      headers: CACHE_HEADERS
    });
  }
};
