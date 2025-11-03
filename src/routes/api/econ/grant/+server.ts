import { env } from '$env/dynamic/private';
import { json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { enforceEconomyRateLimit } from '$lib/server/econ/rate';
import { fetchWallet, walletGrant } from '$lib/server/econ/index';
import { supabaseAdmin } from '$lib/server/supabase';
import { logGameAudit } from '$lib/server/games/audit';
import { logEvent } from '$lib/server/analytics/log';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

const parseList = (value: string | null | undefined) =>
  value
    ?.split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0) ?? [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
    console.error('[econ/grant] auth error', authError);
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

  const adminEmails = new Set(parseList(env.ADMIN_EMAILS));
  const isAdmin = user.email ? adminEmails.has(user.email.toLowerCase()) : false;

  if (!isAdmin) {
    await logGameAudit({
      userId: user.id,
      sessionId: null,
      event: 'econ_reject',
      ip: clientIp,
      details: { reason: 'not_admin', endpoint: 'econ/grant' }
    });
    return json({ code: 'forbidden', message: 'Administrator access required.' }, {
      status: 403,
      headers: CACHE_HEADERS
    });
  }

  let payload: {
    userId?: unknown;
    amount?: unknown;
    source?: unknown;
    refId?: unknown;
    meta?: unknown;
  };

  try {
    payload = await event.request.json();
  } catch (err) {
    await logGameAudit({
      userId: user.id,
      sessionId: null,
      event: 'econ_reject',
      ip: clientIp,
      details: { reason: 'invalid_json', endpoint: 'econ/grant' }
    });
    return json({ code: 'bad_request', message: 'Invalid JSON body.' }, {
      status: 400,
      headers: CACHE_HEADERS
    });
  }

  const targetUserId = typeof payload.userId === 'string' && payload.userId ? payload.userId : null;
  const amountRaw = Number(payload.amount);
  const source = typeof payload.source === 'string' && payload.source.trim() ? payload.source.trim() : null;
  const refId = typeof payload.refId === 'string' && payload.refId.trim().length > 0 ? payload.refId.trim() : null;
  const meta = isRecord(payload.meta) ? payload.meta : undefined;

  if (!targetUserId || !Number.isFinite(amountRaw) || amountRaw <= 0 || !source) {
    await logGameAudit({
      userId: user.id,
      sessionId: null,
      event: 'econ_reject',
      ip: clientIp,
      details: {
        reason: 'invalid_payload',
        endpoint: 'econ/grant',
        payload
      }
    });
    return json({ code: 'bad_request', message: 'userId, amount, and source are required.' }, {
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
        details: { reason: 'rate_limit', endpoint: 'econ/grant' }
      });
    }
    throw err;
  }

  try {
    await walletGrant({
      userId: targetUserId,
      amount: Math.floor(amountRaw),
      source,
      refId,
      meta: {
        ...meta,
        granted_by: user.id
      }
    });

    await logEvent(event, 'wallet_grant', {
      userId: targetUserId,
      amount: Math.floor(amountRaw),
      currency: 'shards',
      meta: {
        source,
        grantedBy: user.id,
        refId,
        ...meta
      }
    });

    const wallet = await fetchWallet(supabaseAdmin, targetUserId);
    return json({
      ok: true,
      balance: wallet.balance,
      currency: wallet.currency,
      updatedAt: wallet.updated_at
    }, { headers: CACHE_HEADERS });
  } catch (err) {
    console.error('[econ/grant] wallet grant failed', err);
    return json({ code: 'server_error', message: 'Unable to grant funds.' }, {
      status: 500,
      headers: CACHE_HEADERS
    });
  }
};
