import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/games/guard';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { safeGameApiError } from '$lib/server/games/safeApiError';
import { getActiveCompanionBond } from '$lib/server/companions/bonds';
import { computeEffectiveMomentumMax, getSubscriptionMomentumBonus } from '$lib/player/momentum';
import { isSubscriptionActive } from '$lib/subscriptions';

export const GET: RequestHandler = async (event) => {
  try {
    const auth = await requireUser(event);

    const [stats, walletRes, rewardsRes, companionBond, subscriptionRes] = await Promise.all([
      getPlayerStats(event, auth.supabase),
      auth.supabase
        .from('wallets')
        .select('balance, currency, updated_at')
        .eq('user_id', auth.user.id)
        .eq('currency', 'shards')
        .maybeSingle(),
      auth.supabase
        .from('game_rewards')
        .select(
          'id, xp_delta, currency_delta, meta, inserted_at, session:game_sessions!inner(id, user_id, game:game_titles(slug, name))'
        )
        .eq('session.user_id', auth.user.id)
        .order('inserted_at', { ascending: false })
        .limit(5),
      getActiveCompanionBond(auth.user.id, auth.supabase),
      auth.supabase
        .from('user_subscriptions')
        .select('status, ends_at')
        .eq('user_id', auth.user.id)
        .maybeSingle()
    ]);

    if (!stats || !Number.isSafeInteger(stats.xp) || (stats.xp ?? -1) < 0) {
      throw error(500, { code: 'server_error', message: 'Unable to load player progress.' });
    }

    const missionEnergyBonus = companionBond?.bonus?.missionEnergyBonus ?? 0;
    const subscriptionActive = isSubscriptionActive({
      subscription_active: false,
      subscription_status: subscriptionRes.data?.status ?? null,
      subscription_ends_at: subscriptionRes.data?.ends_at ?? null
    });
    const subscriptionMomentumBonus = getSubscriptionMomentumBonus(subscriptionActive);
    const baseEnergyMax = stats?.energy_max ?? null;
    const effectiveEnergyMax =
      typeof baseEnergyMax === 'number'
        ? computeEffectiveMomentumMax(baseEnergyMax, missionEnergyBonus, subscriptionActive)
        : baseEnergyMax;

  let walletBalance = 0;
  let walletCurrency = 'shards';
  let rewards = [] as Array<{
    id: string;
    xpDelta: number;
    currencyDelta: number;
    insertedAt: string | number;
    game: string | null;
    gameName: string | null;
    baseCurrencyDelta?: number | null;
    currencyMultiplier?: number | null;
  }>;

      if (walletRes.error) {
        throw walletRes.error;
      }

      if (rewardsRes.error) {
        throw rewardsRes.error;
      }

      walletBalance = Number(walletRes.data?.balance ?? 0);
      walletCurrency = 'shards';
      if (!Number.isSafeInteger(walletBalance) || walletBalance < 0) throw error(500, { code: 'server_error', message: 'Unable to load wallet.' });

      rewards = (rewardsRes.data ?? []).map((row: Record<string, any>) => {
        const session = Array.isArray(row.session) ? (row.session[0] ?? null) : row.session;
        const game = session && Array.isArray(session.game) ? (session.game[0] ?? null) : session?.game ?? null;
        const gameRow = Array.isArray(game) ? (game[0] ?? null) : game;
        const meta = typeof row.meta === 'object' && row.meta !== null ? (row.meta as Record<string, unknown>) : null;
        const rawBaseCurrency = meta?.base_currency ?? meta?.baseCurrency ?? null;
        const rawCurrencyMultiplier = meta?.multiplier ?? meta?.currencyMultiplier ?? null;
        return {
          id: String(row.id),
          xpDelta: Number(row.xp_delta ?? 0),
          currencyDelta: Number(row.currency_delta ?? 0),
          insertedAt: row.inserted_at,
          game: gameRow?.slug ?? null,
          gameName: gameRow?.name ?? null,
          baseCurrencyDelta: typeof rawBaseCurrency === 'number' ? rawBaseCurrency : null,
          currencyMultiplier: typeof rawCurrencyMultiplier === 'number' ? rawCurrencyMultiplier : null
        };
      });

    return json({
      xp: stats?.xp ?? 0,
      level: stats?.level ?? 1,
      xpNext: stats?.xp_next ?? null,
      energy: stats?.energy ?? null,
      energyMax: effectiveEnergyMax,
      baseEnergyMax,
      missionEnergyBonus,
      subscriptionMomentumBonus,
      currency: walletBalance,
      wallet: {
        balance: walletBalance,
        currency: walletCurrency,
        updatedAt:
          walletRes.data?.updated_at ?? null
      },
      rewards
    });
  } catch (err) {
    return safeGameApiError('default', err);
  }
};
