export const SUBSCRIPTION_TIERS = ['sanctuary_plus'] as const;

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const DEFAULT_SUBSCRIPTION_TIER: SubscriptionTier = 'sanctuary_plus';

export const SUBSCRIPTION_TIER_LABELS: Record<SubscriptionTier, string> = {
  sanctuary_plus: 'Sanctuary+'
};

export const formatSubscriptionTier = (tier: string | null | undefined) => {
  if (!tier) return 'None';
  return SUBSCRIPTION_TIER_LABELS[tier as SubscriptionTier] ?? tier.replace(/_/g, ' ');
};

export const formatSubscriptionStatus = (status: string | null | undefined) => {
  if (!status) return 'inactive';
  return status.replace(/_/g, ' ');
};

export const isSubscriptionActive = (subscription: {
  subscription_active?: boolean | null;
  subscription_status?: string | null;
  subscription_ends_at?: string | null;
}) => {
  if (subscription.subscription_active) return true;
  if (!subscription.subscription_status) return false;
  if (!['active', 'grace'].includes(subscription.subscription_status)) return false;
  if (!subscription.subscription_ends_at) return true;
  const endsAt = Date.parse(subscription.subscription_ends_at);
  return Number.isFinite(endsAt) && endsAt > Date.now();
};
