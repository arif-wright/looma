import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { DEFAULT_SUBSCRIPTION_TIER, type SubscriptionTier } from '$lib/subscriptions';

type ServiceClient = SupabaseClient<any>;

export const subscriptionCatalog = () => {
  const items = [
    {
      tier: DEFAULT_SUBSCRIPTION_TIER,
      label: 'Sanctuary+',
      priceId: env.STRIPE_PRICE_SANCTUARY_PLUS ?? '',
      intervalLabel: 'monthly'
    }
  ];

  return items.filter((entry) => entry.priceId);
};

export const mapStripeSubscriptionStatus = (status: string | null | undefined) => {
  switch (status) {
    case 'trialing':
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'grace';
    case 'canceled':
      return 'canceled';
    case 'incomplete_expired':
      return 'expired';
    default:
      return 'expired';
  }
};

const toIsoOrNull = (value: number | string | null | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return null;
};

export async function syncStripeSubscription(
  supabase: ServiceClient,
  args: {
    userId: string;
    tier?: string | null;
    status: string | null | undefined;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    startedAt?: number | string | null;
    endsAt?: number | string | null;
    renewalAt?: number | string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  const tier = (args.tier || DEFAULT_SUBSCRIPTION_TIER) as SubscriptionTier;
  const status = mapStripeSubscriptionStatus(args.status);
  const endsAt = toIsoOrNull(args.endsAt);
  const renewalAt = toIsoOrNull(args.renewalAt ?? args.endsAt);
  const startedAt = toIsoOrNull(args.startedAt) ?? new Date().toISOString();

  return supabase.from('user_subscriptions').upsert(
    {
      user_id: args.userId,
      tier,
      status,
      source: 'stripe',
      stripe_customer_id: args.stripeCustomerId ?? null,
      stripe_subscription_id: args.stripeSubscriptionId ?? null,
      started_at: startedAt,
      ends_at: endsAt,
      renewal_at: renewalAt,
      metadata: {
        provider: 'stripe',
        ...(args.metadata ?? {})
      }
    },
    { onConflict: 'user_id' }
  );
}

export async function revokeStripeSubscription(
  supabase: ServiceClient,
  args: {
    userId: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    endsAt?: number | string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  return supabase
    .from('user_subscriptions')
    .update({
      status: 'canceled',
      source: 'stripe',
      stripe_customer_id: args.stripeCustomerId ?? null,
      stripe_subscription_id: args.stripeSubscriptionId ?? null,
      ends_at: toIsoOrNull(args.endsAt) ?? new Date().toISOString(),
      renewal_at: null,
      metadata: {
        provider: 'stripe',
        canceled: true,
        ...(args.metadata ?? {})
      }
    })
    .eq('user_id', args.userId);
}
