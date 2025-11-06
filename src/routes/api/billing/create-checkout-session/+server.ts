import type { RequestHandler } from './$types';
import { stripe, productCatalog } from '$lib/server/billing';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, locals, url }) => {
  const supabase = (locals as any)?.supabase;
  let user = (locals as any)?.user ?? null;

  if (!supabase) {
    return new Response('Supabase client missing', { status: 500 });
  }

  if (!user) {
    const {
      data: { user: fetchedUser }
    } = await supabase.auth.getUser();
    user = fetchedUser;
  }

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const pack = String(body?.pack ?? '500');
  const catalog = productCatalog();
  const item = catalog.find((entry) => entry.key === pack);

  if (!item) {
    return new Response('Invalid pack', { status: 400 });
  }

  const baseUrl = env.PUBLIC_APP_URL ?? url.origin;
  if (!baseUrl) {
    return new Response('App URL not configured', { status: 500 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: user.id,
      line_items: [{ price: item.priceId, quantity: 1 }],
      success_url: `${baseUrl}/app/wallet?status=success`,
      cancel_url: `${baseUrl}/app/wallet?status=cancelled`,
      metadata: {
        shards: String(item.shards)
      }
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (error: any) {
    console.error('[billing] failed to create checkout session', {
      message: error?.message,
      type: error?.type,
      code: error?.code
    });
    return new Response('Unable to start checkout', { status: 500 });
  }
};
