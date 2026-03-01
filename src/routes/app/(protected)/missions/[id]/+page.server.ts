import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUserServer } from '$lib/server/auth';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { parseMissionDefinition } from '$lib/server/missions/config';
import type { MissionSessionRow } from '$lib/server/missions/types';

const MISSION_SELECT =
  'id, owner_id, title, summary, difficulty, status, energy_reward, xp_reward, type, cost, requirements, requires, min_level, tags, weight, cooldown_ms, privacy_tags';

const SESSION_SELECT =
  'id, mission_id, mission_type, status, started_at, completed_at, cost_json, rewards_json, idempotency_key';

type MissionChapterTone = 'care' | 'social' | 'mission' | 'play' | 'bond' | 'quiet';

type MissionChapterFrame = {
  tone: MissionChapterTone;
  title: string;
  body: string;
};

const deriveMissionDetailFrame = (args: {
  companionName: string | null;
  missionType: string | null;
  reward:
    | {
        title: string;
        tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
      }
    | null;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const missionTypeLabel = args.missionType ?? 'thread';
  const rewardTitle = args.reward?.title;

  switch (args.reward?.tone) {
    case 'care':
      return {
        tone: 'care',
        title: `${name} is reading this as a tending thread`,
        body: rewardTitle
          ? `${rewardTitle} is shaping the bond toward steadiness. Approach this ${missionTypeLabel} mission as something to carry gently rather than race through.`
          : `Approach this ${missionTypeLabel} mission as something to carry gently rather than race through.`
      } satisfies MissionChapterFrame;
    case 'social':
      return {
        tone: 'social',
        title: `${name} wants this thread to connect outward`,
        body: rewardTitle
          ? `${rewardTitle} is turning the chapter toward expression. Let this mission feel like part of a larger shared thread, not a private checklist.`
          : `Let this mission feel like part of a larger shared thread, not a private checklist.`
      } satisfies MissionChapterFrame;
    case 'mission':
      return {
        tone: 'mission',
        title: `${name} is looking for direction here`,
        body: rewardTitle
          ? `${rewardTitle} is giving the relationship a clearer path. This ${missionTypeLabel} mission matters most if you let it set direction rather than just consume time.`
          : `This ${missionTypeLabel} mission matters most if you let it set direction rather than just consume time.`
      } satisfies MissionChapterFrame;
    case 'play':
      return {
        tone: 'play',
        title: `${name} wants this to stay bright`,
        body: rewardTitle
          ? `${rewardTitle} is keeping the chapter playful. Treat this mission like a lively thread, not a heavy obligation.`
          : `Treat this mission like a lively thread, not a heavy obligation.`
      } satisfies MissionChapterFrame;
    case 'bond':
      return {
        tone: 'bond',
        title: `${name} is using this thread to deepen closeness`,
        body: rewardTitle
          ? `${rewardTitle} is pulling the relationship inward. Let this mission become a sincere expression of closeness rather than only a reward loop.`
          : `Let this mission become a sincere expression of closeness rather than only a reward loop.`
      } satisfies MissionChapterFrame;
    default:
      return {
        tone: 'quiet',
        title: 'Let this thread gather its own meaning',
        body: `There is no strong chapter pressure on this mission yet. Start small and let the relationship decide what this thread becomes.`
      } satisfies MissionChapterFrame;
  }
};

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const { supabase, user } = await requireUserServer(event);
  const missionId = event.params.id;

  const [missionRes, activeRes, completedRes, stats] = await Promise.all([
    supabase.from('missions').select(MISSION_SELECT).eq('id', missionId).maybeSingle(),
    supabase
      .from('mission_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', user.id)
      .eq('mission_id', missionId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('mission_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', user.id)
      .eq('mission_id', missionId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getPlayerStats(event, supabase)
  ]);

  const mission = missionRes.data ? parseMissionDefinition(missionRes.data as Record<string, unknown>) : null;

  if (!mission) {
    throw error(404, 'Mission not found');
  }

  const activeCompanion = parent.activeCompanion ?? null;
  let chapterReward:
    | {
        title: string;
        tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
      }
    | null = null;

  if (activeCompanion?.id) {
    const [preferenceRes, rewardsRes] = await Promise.all([
      supabase
        .from('user_preferences')
        .select('featured_companion_reward_key, featured_companion_reward_companion_id')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('companion_chapter_rewards')
        .select('reward_key, reward_title, reward_tone, unlocked_at')
        .eq('owner_id', user.id)
        .eq('companion_id', activeCompanion.id)
        .order('unlocked_at', { ascending: false })
        .limit(6)
    ]);

    const featuredRewardKey =
      typeof preferenceRes.data?.featured_companion_reward_key === 'string'
        ? preferenceRes.data.featured_companion_reward_key
        : null;
    const featuredCompanionId =
      typeof preferenceRes.data?.featured_companion_reward_companion_id === 'string'
        ? preferenceRes.data.featured_companion_reward_companion_id
        : null;

    const rewardRows = ((rewardsRes.data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
      const tone = row.reward_tone;
      if (
        tone !== 'care' &&
        tone !== 'social' &&
        tone !== 'mission' &&
        tone !== 'play' &&
        tone !== 'bond'
      ) {
        return [];
      }
      return [
        {
          key: typeof row.reward_key === 'string' ? row.reward_key : 'reward',
          title: typeof row.reward_title === 'string' ? row.reward_title : 'Companion keepsake',
          tone
        }
      ];
    }) as Array<{ key: string; title: string; tone: 'care' | 'social' | 'mission' | 'play' | 'bond' }>;

    chapterReward =
      (featuredCompanionId === activeCompanion.id && featuredRewardKey
        ? rewardRows.find((row) => row.key === featuredRewardKey) ?? null
        : null) ??
      rewardRows[0] ??
      null;
  }

  const missionChapterFrame = deriveMissionDetailFrame({
    companionName: activeCompanion?.name ?? null,
    missionType: mission.type ?? null,
    reward: chapterReward
      ? {
          title: chapterReward.title,
          tone: chapterReward.tone
        }
      : null
  });

  return {
    activeCompanion,
    mission,
    stats: stats ?? null,
    missionChapterFrame,
    activeSession: (activeRes.data as MissionSessionRow | null) ?? null,
    completedSession: (completedRes.data as MissionSessionRow | null) ?? null
  };
};
