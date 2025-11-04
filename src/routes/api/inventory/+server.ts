import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureAuth } from '$lib/server/games/guard';
import { enforceShopRateLimit } from '$lib/server/shop/rate';
import { supabaseAdmin } from '$lib/server/supabase';
import { logGameAudit } from '$lib/server/games/audit';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export const GET: RequestHandler = async (event) => {
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
        details: { reason: 'rate_limit', endpoint: 'inventory' }
      });
      return json(body, { status: 429, headers: CACHE_HEADERS });
    }
    throw err;
  }

  const { data, error } = await supabaseAdmin
    .from('inventory')
    .select('sku, qty')
    .eq('user_id', user.id)
    .order('sku', { ascending: true });

  if (error) {
    console.error('[inventory] query failed', error, { userId: user.id });
    return json({ code: 'server_error', message: 'Unable to load inventory.' }, { status: 500, headers: CACHE_HEADERS });
  }

  const inventory = (data ?? []).map((row) => ({
    sku: row.sku as string,
    qty: Number(row.qty ?? 0)
  }));

  return json({ inventory }, { headers: CACHE_HEADERS });
};
