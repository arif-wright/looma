import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/games/guard';
import { supabaseAdmin } from '$lib/server/supabase';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { memoryStore } from '$lib/server/games/store';
import { safeGameApiError } from '$lib/server/games/safeApiError';

export const GET: RequestHandler = async (event) => {
  try {
    const auth = await requireUser(event);

    const [stats, walletRes, rewardsRes] = await Promise.all([
      getPlayerStats(event, auth.supabase),
      auth.supabase
        .from('user_wallets')
        .select('shards, updated_at')
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

    const walletMissing =
      walletRes.error && (walletRes.error.code === 'PGRST205' || walletRes.error.code === 'PGRST202');
    const rewardsMissing =
      rewardsRes.error && (rewardsRes.error.code === 'PGRST205' || rewardsRes.error.code === 'PGRST202');

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
        throw walletRes.error;
      }

      if (rewardsRes.error) {
        throw rewardsRes.error;
      }

      walletBalance = Number(walletRes.data?.shards ?? 0);
      walletCurrency = 'shards';

      rewards = (rewardsRes.data ?? []).map((row) => {
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
  } catch (err) {
    return safeGameApiError('default', err);
  }
};
