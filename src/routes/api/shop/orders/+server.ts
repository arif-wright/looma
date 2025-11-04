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
        details: { reason: 'rate_limit', endpoint: 'shop/orders' }
      });
      return json(body, { status: 429, headers: CACHE_HEADERS });
    }
    throw err;
  }

  const { data, error } = await supabaseAdmin
    .from('shop_orders')
    .select('id, total, currency, status, meta, inserted_at, items:shop_order_items!shop_order_items_order_id_fkey(id, sku, name, qty, unit_price, discount)')
    .eq('user_id', user.id)
    .order('inserted_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[shop/orders] query failed', error, { userId: user.id });
    return json({ code: 'server_error', message: 'Unable to load orders.' }, { status: 500, headers: CACHE_HEADERS });
  }

  const orders = (data ?? []).map((order) => ({
    id: order.id,
    total: Number(order.total ?? 0),
    currency: order.currency ?? 'shards',
    status: order.status,
    meta: order.meta ?? {},
    insertedAt: order.inserted_at,
    items: Array.isArray(order.items)
      ? order.items.map((item: any) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          qty: Number(item.qty ?? 0),
          unitPrice: Number(item.unit_price ?? 0),
          discount: Number(item.discount ?? 0)
        }))
      : []
  }));

  return json({ orders }, { headers: CACHE_HEADERS });
};
