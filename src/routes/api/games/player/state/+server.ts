import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/games/guard';
import { supabaseAdmin } from '$lib/server/supabase';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { memoryStore } from '$lib/server/games/store';

export const GET: RequestHandler = async (event) => {
  const auth = await requireUser(event);

  const [stats, grantsRes, rewardsRes] = await Promise.all([
    getPlayerStats(event, auth.supabase),
    supabaseAdmin
      .from('game_grants')
      .select('amount, currency, inserted_at')
      .eq('user_id', auth.user.id)
      .order('inserted_at', { ascending: false })
      .limit(100),
    supabaseAdmin
      .from('game_rewards')
      .select(
        'id, xp_delta, currency_delta, inserted_at, session:game_sessions(id, user_id, game:game_titles(slug, name))'
      )
      .eq('session.user_id', auth.user.id)
      .order('inserted_at', { ascending: false })
      .limit(5)
  ]);

  let totalCurrency = 0;
  let rewards = [] as Array<{ id: string; xpDelta: number; currencyDelta: number; insertedAt: string | number; game: string | null; gameName: string | null }>;

  const grantsMissing = grantsRes.error && (grantsRes.error.code === 'PGRST205' || grantsRes.error.code === 'PGRST202');
  const rewardsMissing = rewardsRes.error && (rewardsRes.error.code === 'PGRST205' || rewardsRes.error.code === 'PGRST202');

  if (grantsMissing || rewardsMissing) {
    totalCurrency = memoryStore.totalCurrency(auth.user.id);
    rewards = memoryStore.listRewards(auth.user.id).map((row) => ({
      id: row.sessionId,
      xpDelta: row.xpDelta,
      currencyDelta: row.currencyDelta,
      insertedAt: new Date(row.insertedAt).toISOString(),
      game: null,
      gameName: null
    }));
  } else {
    if (grantsRes.error) {
      console.error('[games] grants query failed', grantsRes.error);
      return json({ error: 'server_error' }, { status: 500 });
    }

    if (rewardsRes.error) {
      console.error('[games] rewards query failed', rewardsRes.error);
      return json({ error: 'server_error' }, { status: 500 });
    }

    totalCurrency = (grantsRes.data ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0);

    rewards = (rewardsRes.data ?? []).map((row) => ({
      id: row.id,
      xpDelta: row.xp_delta,
      currencyDelta: row.currency_delta,
      insertedAt: row.inserted_at,
      game: row.session?.game?.slug ?? null,
      gameName: row.session?.game?.name ?? null
    }));
  }

  return json({
    xp: stats?.xp ?? 0,
    level: stats?.level ?? 1,
    xpNext: stats?.xp_next ?? null,
    energy: stats?.energy ?? null,
    energyMax: stats?.energy_max ?? null,
    currency: totalCurrency,
    rewards
  });
};
