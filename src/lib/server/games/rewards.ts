import { supabaseAdmin } from '$lib/server/supabase';

export type RewardResult = {
  xpDelta: number;
  currencyDelta: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const calculateRewards = (score: number): RewardResult => {
  const safeScore = Number.isFinite(score) && score > 0 ? Math.floor(score) : 0;
  const xpDelta = clamp(Math.floor(safeScore / 100), 1, 100);
  const currencyDelta = clamp(Math.floor(safeScore / 50), 1, 200);
  return { xpDelta, currencyDelta };
};

type PersistArgs = RewardResult & {
  sessionId: string;
  userId: string;
};

export const persistRewards = async ({ sessionId, userId, xpDelta, currencyDelta }: PersistArgs) => {
  const rewardInsert = await supabaseAdmin.from('game_rewards').insert({
    session_id: sessionId,
    xp_delta: xpDelta,
    currency_delta: currencyDelta,
    meta: { source: 'game_sdk' }
  });

  if (rewardInsert.error) {
    console.error('[games] persistRewards game_rewards insert failed', rewardInsert.error);
    throw rewardInsert.error;
  }

  const grantInsert = await supabaseAdmin.from('game_grants').insert({
    user_id: userId,
    source: 'game_session',
    amount: currencyDelta,
    currency: 'shards',
    meta: { session_id: sessionId }
  });

  if (grantInsert.error) {
    console.error('[games] persistRewards game_grants insert failed', grantInsert.error);
    throw grantInsert.error;
  }

  if (xpDelta > 0) {
    const xpResult = await supabaseAdmin.rpc('fn_award_game_xp', {
      p_user: userId,
      p_xp: xpDelta
    });

    if (xpResult.error) {
      console.error('[games] persistRewards fn_award_game_xp failed', xpResult.error);
      throw xpResult.error;
    }
  }
};
