import { json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { enforceEconomyRateLimit } from '$lib/server/econ/rate';
import { getWalletWithTransactions } from '$lib/server/econ/index';
import { logGameAudit } from '$lib/server/games/audit';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export const GET: RequestHandler = async (event) => {
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
    console.error('[econ/wallet] auth error', authError);
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
        details: { reason: 'rate_limit', endpoint: 'econ/wallet' }
      });
    }
    throw err;
  }

  try {
    const { wallet, transactions } = await getWalletWithTransactions(supabase, user.id, 20);
    return json(
      {
        balance: wallet.balance,
        currency: wallet.currency,
        updatedAt: wallet.updated_at,
        recentTx: transactions
      },
      { headers: CACHE_HEADERS }
    );
  } catch (err) {
    console.error('[econ/wallet] fetch failed', err);
    return json({ code: 'server_error', message: 'Unable to load wallet.' }, {
      status: 500,
      headers: CACHE_HEADERS
    });
  }
};
