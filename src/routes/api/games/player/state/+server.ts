import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/games/guard';
import { supabaseAdmin } from '$lib/server/supabase';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { memoryStore } from '$lib/server/games/store';

export const GET: RequestHandler = async (event) => {
  const auth = await requireUser(event);

  const [stats, walletRes, rewardsRes] = await Promise.all([
    getPlayerStats(event, auth.supabase),
    auth.supabase
      .from('wallets')
      .select('balance, currency, updated_at')
      .eq('user_id', auth.user.id)
      .maybeSingle(),
    supabaseAdmin
      .from('game_rewards')
      .select(
        'id, xp_delta, currency_delta, meta, inserted_at, session:game_sessions(id, user_id, game:game_titles(slug, name))'
      )
      .eq('session.user_id', auth.user.id)
      .order('inserted_at', { ascending: false })
      .limit(5)
  ]);

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

  const walletMissing = walletRes.error && (walletRes.error.code === 'PGRST205' || walletRes.error.code === 'PGRST202');
  const rewardsMissing = rewardsRes.error && (rewardsRes.error.code === 'PGRST205' || rewardsRes.error.code === 'PGRST202');

  if (walletMissing || rewardsMissing) {
    walletBalance = memoryStore.totalCurrency(auth.user.id);
    rewards = memoryStore.listRewards(auth.user.id).map((row) => ({
      id: row.sessionId,
      xpDelta: row.xpDelta,
      currencyDelta: row.currencyDelta,
      insertedAt: new Date(row.insertedAt).toISOString(),
      game: null,
      gameName: null
    }));
  } else {
    if (walletRes.error) {
      console.error('[games] wallet query failed', walletRes.error);
      return json({ error: 'server_error' }, { status: 500 });
    }

    if (rewardsRes.error) {
      console.error('[games] rewards query failed', rewardsRes.error);
      return json({ error: 'server_error' }, { status: 500 });
    }

    walletBalance = Number(walletRes.data?.balance ?? 0);
    walletCurrency = typeof walletRes.data?.currency === 'string' ? walletRes.data.currency : 'shards';

    rewards = (rewardsRes.data ?? []).map((row) => ({
      id: row.id,
      xpDelta: row.xp_delta,
      currencyDelta: row.currency_delta,
      insertedAt: row.inserted_at,
      game: row.session?.game?.slug ?? null,
      gameName: row.session?.game?.name ?? null,
      baseCurrencyDelta:
        typeof row.meta === 'object' && row.meta !== null
          ? (row.meta as Record<string, unknown>).base_currency ?? (row.meta as Record<string, unknown>).baseCurrency ?? null
          : null,
      currencyMultiplier:
        typeof row.meta === 'object' && row.meta !== null
          ? (row.meta as Record<string, unknown>).multiplier ?? (row.meta as Record<string, unknown>).currencyMultiplier ?? null
          : null
    }));
  }

  return json({
    xp: stats?.xp ?? 0,
    level: stats?.level ?? 1,
    xpNext: stats?.xp_next ?? null,
    energy: stats?.energy ?? null,
    energyMax: stats?.energy_max ?? null,
    currency: walletBalance,
    wallet: {
      balance: walletBalance,
      currency: walletCurrency,
      updatedAt:
        walletRes.data?.updated_at ?? (walletMissing ? new Date().toISOString() : new Date(0).toISOString())
    },
    rewards
  });
};
