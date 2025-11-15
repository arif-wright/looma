import type { SupabaseClient } from '@supabase/supabase-js';
import { walletGrant } from '$lib/server/econ/index';
import type { CompanionRitual, CompanionRitualKey, CompanionRitualUpdate } from '$lib/companions/rituals';
import { COMPANION_RITUALS, mapRitualRow, ritualDefinitionMap } from '$lib/companions/rituals';

const table = 'companion_rituals';

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const ensureRows = async (client: SupabaseClient, userId: string, ritualDate: string) => {
  await Promise.all(
    COMPANION_RITUALS.map((def) =>
      client
        .from(table)
        .upsert(
          {
            owner_id: userId,
            ritual_key: def.key,
            ritual_date: ritualDate,
            progress_goal: def.progressMax,
            xp_reward: def.xpReward,
            shard_reward: def.shardReward,
            affection_reward: def.affectionReward,
            trust_reward: def.trustReward
          },
          { onConflict: 'owner_id,ritual_key,ritual_date', ignoreDuplicates: false }
        )
    )
  );
};

export const getCompanionRituals = async (
  client: SupabaseClient,
  userId: string | null | undefined
): Promise<CompanionRitual[]> => {
  if (!userId) return [];
  const ritualDate = todayIsoDate();
  await ensureRows(client, userId, ritualDate);
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('owner_id', userId)
    .eq('ritual_date', ritualDate)
    .order('ritual_key', { ascending: true });
  if (error) {
    console.error('[rituals] fetch failed', error);
    return [];
  }
  return (data ?? []).map((row) => mapRitualRow(row));
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const awardAffection = async (
  client: SupabaseClient,
  userId: string,
  affectionDelta: number,
  trustDelta: number
) => {
  if (!affectionDelta && !trustDelta) return;
  const { data: active } = await client
    .from('companions')
    .select('id, affection, trust')
    .eq('owner_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!active?.id) return;
  const nextAffection = clamp((active.affection ?? 0) + affectionDelta, 0, 100);
  const nextTrust = clamp((active.trust ?? 0) + trustDelta, 0, 100);
  await client
    .from('companions')
    .update({ affection: nextAffection, trust: nextTrust })
    .eq('id', active.id);
};

export const incrementCompanionRitual = async (
  client: SupabaseClient,
  userId: string | null | undefined,
  key: CompanionRitualKey,
  options?: { companionName?: string | null }
): Promise<CompanionRitualUpdate | null> => {
  if (!userId) return null;
  const ritualDate = todayIsoDate();
  await ensureRows(client, userId, ritualDate);
  const def = ritualDefinitionMap.get(key);
  if (!def) return null;
  const { data: row, error } = await client
    .from(table)
    .select('*')
    .eq('owner_id', userId)
    .eq('ritual_date', ritualDate)
    .eq('ritual_key', key)
    .maybeSingle();
  if (error || !row) {
    console.error('[rituals] missing row', error);
    return null;
  }
  if (row.completed) {
    const rituals = await getCompanionRituals(client, userId);
    return { list: rituals, completed: [] };
  }
  const nextProgress = clamp((row.progress ?? 0) + 1, 0, row.progress_goal ?? def.progressMax);
  const completed = !row.completed && nextProgress >= (row.progress_goal ?? def.progressMax);
  const { data: updated, error: updateError } = await client
    .from(table)
    .update({
      progress: nextProgress,
      completed,
      completed_at: completed ? new Date().toISOString() : row.completed_at,
      reward_claimed: row.reward_claimed || completed
    })
    .eq('owner_id', userId)
    .eq('ritual_date', ritualDate)
    .eq('ritual_key', key)
    .select('*')
    .maybeSingle();
  if (updateError || !updated) {
    console.error('[rituals] update failed', updateError);
    return null;
  }
  if (completed && !row.reward_claimed) {
    if (def.xpReward > 0) {
      await client.rpc('fn_award_game_xp', { p_user: userId, p_xp: def.xpReward }).catch((err) => {
        console.error('[rituals] xp grant failed', err);
      });
    }
    if (def.shardReward > 0) {
      await walletGrant({
        userId,
        amount: def.shardReward,
        source: 'companion_ritual',
        refId: `${key}-${ritualDate}`,
        meta: { ritual: key },
        client
      }).catch((err) => console.error('[rituals] shard grant failed', err));
    }
    await awardAffection(client, userId, def.affectionReward, def.trustReward);
  }
  const rituals = await getCompanionRituals(client, userId);
  const completedRituals = completed ? rituals.filter((r) => r.key === key) : [];
  return { list: rituals, completed: completedRituals };
};
