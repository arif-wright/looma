import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getStripe, serviceClient } from '$lib/server/billing';
import {
  revokeStripeSubscription,
  syncStripeSubscription
} from '$lib/server/subscriptions';

export const POST: RequestHandler = async ({ request }) => {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const payload = await request.text();

  let event;
  const stripe = getStripe();
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = serviceClient();

  const insertAttempt = await supabase
    .from('webhook_events')
    .insert({ id: event.id })
    .select()
    .single();

  if (insertAttempt.error) {
    if (insertAttempt.error.code === '23505') {
      return new Response('Already processed', { status: 200 });
    }
    console.error('[stripe-webhook] failed to record event start', insertAttempt.error);
    return new Response('Unable to record event', { status: 500 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const userId = session.client_reference_id as string | null;
    const shards = parseInt(session.metadata?.shards ?? '0', 10);
    const paymentIntent = session.payment_intent ?? session.id;

    if (userId && shards > 0) {
      const { error } = await supabase.rpc('credit_wallet', {
        p_user: userId,
        p_amount: shards,
        p_source: 'purchase',
        p_ref: String(paymentIntent),
        p_meta: {
          session_id: session.id,
          amount_total: session.amount_total ?? null,
          currency: session.currency ?? null
        }
      } as any);

      if (error) {
        console.error('[stripe-webhook] credit_wallet error', error);
        return new Response(`RPC error: ${error.message}`, { status: 400 });
      }
    }

    if (userId && session.mode === 'subscription') {
      const { error } = await syncStripeSubscription(supabase as any, {
        userId,
        tier: session.metadata?.tier ?? null,
        status: 'active',
        stripeCustomerId: session.customer ?? null,
        stripeSubscriptionId: session.subscription ?? null,
        metadata: {
          checkout_session_id: session.id
        }
      });

      if (error) {
        console.error('[stripe-webhook] sync subscription from checkout failed', error);
        return new Response(`Subscription sync error: ${error.message}`, { status: 400 });
      }
    }
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as any;
    const userId = subscription.metadata?.user_id as string | undefined;
    if (userId) {
      const { error } = await syncStripeSubscription(supabase as any, {
        userId,
        tier: subscription.metadata?.tier ?? null,
        status: subscription.status,
        stripeCustomerId: subscription.customer ?? null,
        stripeSubscriptionId: subscription.id ?? null,
        startedAt: subscription.start_date ?? subscription.created ?? null,
        endsAt: subscription.cancel_at ?? subscription.current_period_end ?? null,
        renewalAt: subscription.current_period_end ?? null,
        metadata: {
          stripe_status: subscription.status ?? null
        }
      });

      if (error) {
        console.error('[stripe-webhook] sync subscription update failed', error);
        return new Response(`Subscription update error: ${error.message}`, { status: 400 });
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as any;
    const userId = subscription.metadata?.user_id as string | undefined;
    if (userId) {
      const { error } = await revokeStripeSubscription(supabase as any, {
        userId,
        stripeCustomerId: subscription.customer ?? null,
        stripeSubscriptionId: subscription.id ?? null,
        endsAt: subscription.ended_at ?? subscription.cancel_at ?? subscription.current_period_end ?? null,
        metadata: {
          stripe_status: subscription.status ?? null
        }
      });

      if (error) {
        console.error('[stripe-webhook] revoke subscription failed', error);
        return new Response(`Subscription revoke error: ${error.message}`, { status: 400 });
      }
    }
  }

  if (event.type === 'charge.succeeded') {
    const charge = event.data.object as any;
    const chargeCreated = typeof charge.created === 'number' ? charge.created * 1000 : Date.now();
    const { error } = await supabase.from('stripe_payments').upsert({
      id: charge.id,
      amount: charge.amount,
      currency: charge.currency,
      status: charge.status,
      brand: charge.payment_method_details?.card?.brand ?? null,
      last4: charge.payment_method_details?.card?.last4 ?? null,
      created_at: new Date(chargeCreated).toISOString(),
      raw: charge
    });

    if (error) {
      console.error('[stripe-webhook] failed to upsert stripe_payments', error);
      return new Response('Unable to persist charge', { status: 500 });
    }
  }

  return new Response('OK', { status: 200 });
};
