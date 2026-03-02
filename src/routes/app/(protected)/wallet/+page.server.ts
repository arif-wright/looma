import type { PageServerLoad } from './$types';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { getSubscriptionMomentumBonus, computeEffectiveMomentumMax } from '$lib/player/momentum';
import { isSubscriptionActive } from '$lib/subscriptions';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = (locals as any)?.supabase;
  const user = (locals as any)?.user;

  if (!supabase) {
    return { shards: 0, tx: [], error: 'Missing Supabase client' };
  }

  if (!user) {
    const {
      data: { user: fetched }
    } = await supabase.auth.getUser();
    if (!fetched) {
      return { shards: 0, tx: [], error: 'Not authenticated' };
    }
    (locals as any).user = fetched;
  }

  const [walletRes, txRes, subscriptionRes, statsRes] = await Promise.all([
    supabase.from('user_wallets').select('shards').single(),
    supabase
      .from('wallet_transactions')
      .select('kind, amount, source, ref_id, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('user_subscriptions')
      .select('tier, status, ends_at, renewal_at, source')
      .maybeSingle(),
    getPlayerStats({ locals } as never, supabase)
  ]);

  const subscriptionActive = isSubscriptionActive({
    subscription_active: false,
    subscription_status: subscriptionRes.data?.status ?? null,
    subscription_ends_at: subscriptionRes.data?.ends_at ?? null
  });
  const subscriptionMomentumBonus = getSubscriptionMomentumBonus(subscriptionActive);
  const momentumMax =
    typeof statsRes?.energy_max === 'number'
      ? computeEffectiveMomentumMax(statsRes.energy_max, 0, subscriptionActive)
      : null;

  return {
    shards: walletRes.data?.shards ?? 0,
    tx: txRes.data ?? [],
    subscription: subscriptionRes.data ?? null,
    momentum: {
      current: statsRes?.energy ?? null,
      max: momentumMax,
      baseMax: statsRes?.energy_max ?? null,
      subscriptionBonus: subscriptionMomentumBonus
    },
    error: walletRes.error?.message ?? txRes.error?.message ?? null
  };
};
