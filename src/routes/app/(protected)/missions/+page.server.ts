import type { PageServerLoad } from './$types';
import { requireUserServer } from '$lib/server/auth';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { parseMissionDefinition } from '$lib/server/missions/config';
import type { MissionDefinition, MissionSessionRow } from '$lib/server/missions/types';

const MISSION_SELECT =
  'id, owner_id, title, summary, difficulty, status, energy_reward, xp_reward, type, cost, requirements, requires, min_level, tags, weight, cooldown_ms, privacy_tags, created_at';

const SESSION_SELECT =
  'id, mission_id, mission_type, status, started_at, completed_at, cost_json, rewards_json';

type MissionCard = MissionDefinition & {
  created_at?: string | null;
};

type MissionThreadType = 'identity' | 'action' | 'world';
type MissionChapterTone = 'care' | 'social' | 'mission' | 'play' | 'bond' | 'quiet';

type MissionChapterFrame = {
  tone: MissionChapterTone;
  eyebrow: string;
  title: string;
  body: string;
  preferredTypes: MissionThreadType[];
  premiumStyle: 'gilded_dawn' | 'moon_glass' | 'ember_bloom' | 'tide_silk' | null;
  styleVoice: string | null;
};

const byCreatedDesc = (a: MissionCard, b: MissionCard) =>
  Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? '');

const missionTypeRank = (preferredTypes: MissionThreadType[], missionType: MissionThreadType) => {
  const matchIndex = preferredTypes.findIndex((entry) => entry === missionType);
  return matchIndex === -1 ? preferredTypes.length : matchIndex;
};

const deriveMissionChapterFrame = (args: {
  companionName: string | null;
  reward:
    | {
        title: string;
        tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
      }
    | null;
  premiumStyle: 'gilded_dawn' | 'moon_glass' | 'ember_bloom' | 'tide_silk' | null;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const rewardTitle = args.reward?.title;
  const styleVoice =
    args.premiumStyle === 'gilded_dawn'
      ? 'Let the thread feel warmer and more deliberate than urgent.'
      : args.premiumStyle === 'moon_glass'
        ? 'Let the thread stay clear, clean, and unforced.'
        : args.premiumStyle === 'ember_bloom'
          ? 'Let the thread keep a softer ember warmth while it unfolds.'
          : args.premiumStyle === 'tide_silk'
            ? 'Let the thread move with a calmer, easier flow.'
            : null;

  switch (args.reward?.tone) {
    case 'care':
      return {
        tone: 'care',
        eyebrow: 'Care chapter',
        title: `${name} needs a steady thread`,
        body: rewardTitle
          ? `${rewardTitle} is shaping the relationship toward consistency. Identity and gentle action missions will land best right now.`
          : `${name} is responding to steadiness. Identity and gentle action missions will land best right now.`,
        preferredTypes: ['identity', 'action'],
        premiumStyle: args.premiumStyle,
        styleVoice
      } satisfies MissionChapterFrame;
    case 'social':
      return {
        tone: 'social',
        eyebrow: 'Shared thread',
        title: `${name} is carrying the bond outward`,
        body: rewardTitle
          ? `${rewardTitle} is turning this chapter toward expression and connection. Identity and world missions fit better than solitary grind right now.`
          : `${name} is in a socially expressive chapter. Identity and world missions fit better than solitary grind right now.`,
        preferredTypes: ['identity', 'world'],
        premiumStyle: args.premiumStyle,
        styleVoice
      } satisfies MissionChapterFrame;
    case 'mission':
      return {
        tone: 'mission',
        eyebrow: 'Wayfinding chapter',
        title: `${name} wants direction`,
        body: rewardTitle
          ? `${rewardTitle} is sharpening the bond toward purpose. World and action missions should sit at the front of the day.`
          : `${name} is in a wayfinding phase. World and action missions should sit at the front of the day.`,
        preferredTypes: ['world', 'action'],
        premiumStyle: args.premiumStyle,
        styleVoice
      } satisfies MissionChapterFrame;
    case 'play':
      return {
        tone: 'play',
        eyebrow: 'Bright play',
        title: `${name} is bonding through lightness`,
        body: rewardTitle
          ? `${rewardTitle} is keeping the chapter playful. Action missions and lighter identity threads will land better than heavy world-building today.`
          : `${name} is in a playful chapter. Action missions and lighter identity threads will land better than heavy world-building today.`,
        preferredTypes: ['action', 'identity'],
        premiumStyle: args.premiumStyle,
        styleVoice
      } satisfies MissionChapterFrame;
    case 'bond':
      return {
        tone: 'bond',
        eyebrow: 'Deep bond',
        title: `${name} is asking for sincerity`,
        body: rewardTitle
          ? `${rewardTitle} is pulling the relationship inward. Identity missions will usually feel more true than outward proving threads right now.`
          : `${name} is in a deeper bond chapter. Identity missions will usually feel more true than outward proving threads right now.`,
        preferredTypes: ['identity', 'action'],
        premiumStyle: args.premiumStyle,
        styleVoice
      } satisfies MissionChapterFrame;
    default:
      return {
        tone: 'quiet',
        eyebrow: 'Open chapter',
        title: 'Let the next thread gather naturally',
        body: `${name} is between clearer phases. Start with the mission that feels easiest to return to and let momentum build from there.`,
        preferredTypes: ['identity', 'action', 'world'],
        premiumStyle: args.premiumStyle,
        styleVoice
      } satisfies MissionChapterFrame;
  }
};

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const { supabase, user } = await requireUserServer(event);
  const activeCompanion = parent.activeCompanion ?? null;

  const [stats, availableRes, activeRes, recentRes] = await Promise.all([
    getPlayerStats(event, supabase),
    supabase.from('missions').select(MISSION_SELECT).eq('status', 'available').limit(32),
    supabase
      .from('mission_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(8),
    supabase
      .from('mission_sessions')
      .select(SESSION_SELECT)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(8)
  ]);

  const activeSessions = ((activeRes.data ?? []) as MissionSessionRow[]) ?? [];
  const recentSessions = ((recentRes.data ?? []) as MissionSessionRow[]) ?? [];

  const missionIds = Array.from(
    new Set(
      [...activeSessions, ...recentSessions]
        .map((row) => row.mission_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );

  const lookupRes =
    missionIds.length > 0
      ? await supabase.from('missions').select(MISSION_SELECT).in('id', missionIds)
      : { data: [] as Record<string, unknown>[] };

  const missionById = new Map<string, MissionCard>();

  for (const row of ((availableRes.data ?? []) as Record<string, unknown>[]).filter(Boolean)) {
    const mission = parseMissionDefinition(row);
    if (mission) {
      missionById.set(mission.id, {
        ...mission,
        created_at: typeof row.created_at === 'string' ? row.created_at : null
      });
    }
  }

  for (const row of ((lookupRes.data ?? []) as Record<string, unknown>[]).filter(Boolean)) {
    const mission = parseMissionDefinition(row);
    if (mission) {
      missionById.set(mission.id, {
        ...mission,
        created_at: typeof row.created_at === 'string' ? row.created_at : null
      });
    }
  }

  const activeMissionIds = new Set(activeSessions.map((row) => row.mission_id));

  let chapterReward:
    | {
        title: string;
        tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
      }
    | null = null;
  let premiumSanctuaryStyle: 'gilded_dawn' | 'moon_glass' | 'ember_bloom' | 'tide_silk' | null = null;

  if (activeCompanion?.id) {
    const [preferenceRes, rewardsRes] = await Promise.all([
      supabase
        .from('user_preferences')
        .select(
          'featured_companion_reward_key, featured_companion_reward_companion_id, premium_sanctuary_style'
        )
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
    premiumSanctuaryStyle =
      preferenceRes.data?.premium_sanctuary_style === 'gilded_dawn' ||
      preferenceRes.data?.premium_sanctuary_style === 'moon_glass' ||
      preferenceRes.data?.premium_sanctuary_style === 'ember_bloom' ||
      preferenceRes.data?.premium_sanctuary_style === 'tide_silk'
        ? preferenceRes.data.premium_sanctuary_style
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

  const missionChapterFrame = deriveMissionChapterFrame({
    companionName: activeCompanion?.name ?? null,
    reward: chapterReward
      ? {
          title: chapterReward.title,
          tone: chapterReward.tone
        }
      : null,
    premiumStyle: premiumSanctuaryStyle
  });

  const activeMissions = activeSessions
    .map((session) => {
      const mission = missionById.get(session.mission_id);
      if (!mission) return null;
      return { mission, session };
    })
    .filter((entry): entry is { mission: MissionCard; session: MissionSessionRow } => Boolean(entry));

  const availableMissions = Array.from(missionById.values())
    .filter((mission) => !activeMissionIds.has(mission.id) && mission.status === 'available')
    .sort((a, b) => {
      const typeA = (a.type === 'identity' || a.type === 'action' || a.type === 'world' ? a.type : 'identity') as MissionThreadType;
      const typeB = (b.type === 'identity' || b.type === 'action' || b.type === 'world' ? b.type : 'identity') as MissionThreadType;
      const rankA = missionTypeRank(missionChapterFrame.preferredTypes, typeA);
      const rankB = missionTypeRank(missionChapterFrame.preferredTypes, typeB);
      if (rankA !== rankB) return rankA - rankB;
      return byCreatedDesc(a, b);
    })
    .slice(0, 18);

  const recentCompletions = recentSessions
    .map((session) => {
      const mission = missionById.get(session.mission_id);
      if (!mission) return null;
      return { mission, session };
    })
    .filter((entry): entry is { mission: MissionCard; session: MissionSessionRow } => Boolean(entry));

  return {
    stats: stats ?? null,
    activeCompanion,
    missionChapterFrame,
    activeMissions,
    availableMissions,
    recentCompletions
  };
};
