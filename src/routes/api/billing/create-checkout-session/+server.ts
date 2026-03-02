import type { RequestHandler } from './$types';
import { getStripe, productCatalog, subscriptionCatalog } from '$lib/server/billing';
import { env } from '$env/dynamic/private';
import { DEFAULT_SUBSCRIPTION_TIER } from '$lib/subscriptions';

const jsonResponse = (body: Record<string, unknown>, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {})
    }
  });

export const POST: RequestHandler = async ({ request, locals, url }) => {
  const supabase = (locals as any)?.supabase;
  let user = (locals as any)?.user ?? null;

  if (!supabase) {
    return jsonResponse({ error: 'Supabase client missing', where: 'server' }, { status: 500 });
  }

  if (!user) {
    const {
      data: { user: fetchedUser }
    } = await supabase.auth.getUser();
    user = fetchedUser;
  }

  if (!user) {
    return jsonResponse({ error: 'Unauthorized', where: 'auth' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const kind = String(body?.kind ?? 'pack');
  const pack = String(body?.pack ?? '500');
  const tier = String(body?.tier ?? DEFAULT_SUBSCRIPTION_TIER);

  const baseUrl = env.PUBLIC_APP_URL ?? url.origin;
  if (!baseUrl) {
    return jsonResponse({ error: 'App URL not configured', where: 'config' }, { status: 500 });
  }

  try {
    const stripe = getStripe();
    let session;

    if (kind === 'subscription') {
      const catalog = subscriptionCatalog();
      const item = catalog.find((entry) => entry.tier === tier);
      if (!item) {
        return jsonResponse({ error: 'Invalid subscription tier', where: 'input' }, { status: 400 });
      }

      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: user.id,
        line_items: [{ price: item.priceId, quantity: 1 }],
        success_url: `${baseUrl}/app/wallet?status=subscription-success`,
        cancel_url: `${baseUrl}/app/wallet?status=subscription-cancelled`,
        metadata: {
          tier: item.tier,
          user_id: user.id
        },
        subscription_data: {
          metadata: {
            tier: item.tier,
            user_id: user.id
          }
        }
      });
    } else {
      const catalog = productCatalog();
      const item = catalog.find((entry) => entry.key === pack);

      if (!item) {
        return jsonResponse({ error: 'Invalid pack', where: 'input' }, { status: 400 });
      }

      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: user.id,
        line_items: [{ price: item.priceId, quantity: 1 }],
        success_url: `${baseUrl}/app/wallet?status=success`,
        cancel_url: `${baseUrl}/app/wallet?status=cancelled`,
        metadata: {
          shards: String(item.shards)
        }
      });
    }

    return jsonResponse({ url: session.url });
  } catch (error: any) {
    console.error('[billing] failed to create checkout session', {
      message: error?.message,
      type: error?.type,
      code: error?.code
    });
    return jsonResponse({ error: 'Unable to start checkout', where: 'stripe' }, { status: 500 });
  }
};
