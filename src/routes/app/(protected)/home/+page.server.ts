import type { PageServerLoad } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '$lib/supabaseClient';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { reportHomeLoadIssue } from '$lib/server/logging';
import { recordAnalyticsEvent } from '$lib/server/analytics';
import type { FeedItem } from '$lib/social/types';
import { getWalletWithTransactions } from '$lib/server/econ/index';
import { ensureBlockedPeers, isBlockedPeer } from '$lib/server/blocks';
import type { ActiveCompanionSnapshot } from '$lib/stores/companions';
import { getCompanionRituals } from '$lib/server/companions/rituals';
import type { CompanionRitual } from '$lib/companions/rituals';
import {
  deriveChapterMilestones,
  deriveChapterRewards,
  deriveCompanionPatternNotice,
  deriveDailyCompanionArc,
  deriveWeeklyCompanionArc,
  syncDailyCompanionArcProgress,
  unlockChapterRewards
} from '$lib/server/companions/journal';
import { getDailySet, getWeeklySet } from '$lib/server/missions/rotation';
import { ingestServerEvent } from '$lib/server/events/ingest';
import { getLoomaTuningConfig } from '$lib/server/tuning/config';

type MissionSummary = {
  id: string;
  title?: string | null;
  summary?: string | null;
  difficulty?: string | null;
  energy_reward?: number | null;
  xp_reward?: number | null;
  type?: 'identity' | 'action' | 'world' | null;
  cost?: { energy?: number } | null;
  requirements?: { minLevel?: number; minEnergy?: number } | null;
  requires?: Record<string, unknown> | null;
  min_level?: number | null;
  tags?: string[] | null;
  weight?: number | null;
  cooldown_ms?: number | null;
  cooldownMs?: number | null;
  privacy_tags?: string[] | null;
};

type CreatureMoment = {
  id: string;
  name?: string | null;
  species?: string | null;
  mood?: string | null;
  mood_label?: string | null;
  state?: string | null;
  is_active?: boolean | null;
  slot_index?: number | null;
  affection?: number | null;
  trust?: number | null;
  energy?: number | null;
  avatar_url?: string | null;
  updated_at?: string | null;
  stats?: Record<string, unknown> | Array<Record<string, unknown>> | null;
};

type DailyCheckin = {
  id: string;
  mood: 'calm' | 'heavy' | 'curious' | 'energized' | 'numb';
  checkin_date: string;
  created_at: string;
};

type MemorySummary = {
  summary_text: string | null;
  highlights_json: unknown;
  last_built_at: string | null;
};

type JournalMoment = {
  id: string;
  label: string;
  body: string;
  href: string;
};

type SanctuaryNudge = {
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
};

type ChapterRevealMoment = {
  id: string;
  title: string;
  body: string;
  href: string;
  rewardTitle: string | null;
  tone: KeepsakeTone | null;
};

type EraAction = {
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

type KeepsakeTone = 'care' | 'social' | 'mission' | 'play' | 'bond';

type KeepsakeTheme = {
  tone: KeepsakeTone;
  title: string;
};

type PremiumSanctuaryStyle = 'gilded_dawn' | 'moon_glass' | 'ember_bloom' | 'tide_silk';

type SanctuaryShelfReward = {
  rewardKey: string;
  title: string;
  body: string;
  tone: KeepsakeTone;
  unlockedAt: string | null;
  featured: boolean;
};

type ChapterPath = {
  id: string;
  label: string;
  title: string;
  body: string;
  href: string;
};

type DailyArc = ReturnType<typeof deriveDailyCompanionArc>;
type DailyArcRecap = Awaited<ReturnType<typeof syncDailyCompanionArcProgress>>['recap'];
type WeeklyArc = ReturnType<typeof deriveWeeklyCompanionArc>;
type ChapterMilestones = ReturnType<typeof deriveChapterMilestones>;
type ChapterRewards = Awaited<ReturnType<typeof unlockChapterRewards>>;

const DEFAULT_ENDCAP = {
  title: 'Welcome back',
  description: 'Explore your community for a quick boost.',
  href: '/app/home'
};

const clipMomentBody = (value: string, limit = 108) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
};

const formatCheckinMood = (value: DailyCheckin['mood']) => {
  switch (value) {
    case 'heavy':
      return 'Heavy';
    case 'curious':
      return 'Curious';
    case 'energized':
      return 'Energized';
    case 'numb':
      return 'Numb';
    case 'calm':
    default:
      return 'Calm';
  }
};

const extractMemoryHighlights = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
};

const buildJournalMoments = (args: {
  activeCompanion: ActiveCompanionSnapshot | null;
  memorySummary: MemorySummary | null;
  latestDailyCheckin: DailyCheckin | null;
  rituals: CompanionRitual[];
}) => {
  const { activeCompanion, memorySummary, latestDailyCheckin, rituals } = args;
  const journalHref = activeCompanion?.id
    ? `/app/memory?companion=${encodeURIComponent(activeCompanion.id)}`
    : '/app/memory';
  const moments: JournalMoment[] = [];
  const pushMoment = (moment: JournalMoment) => {
    if (moments.some((entry) => entry.id === moment.id)) return;
    moments.push(moment);
  };

  const highlights = extractMemoryHighlights(memorySummary?.highlights_json).slice(0, 2);
  highlights.forEach((highlight, index) => {
    pushMoment({
      id: `highlight-${index}`,
      label: 'Memory',
      body: clipMomentBody(highlight),
      href: journalHref
    });
  });

  if (latestDailyCheckin) {
    pushMoment({
      id: `checkin-${latestDailyCheckin.id}`,
      label: 'Check-in',
      body: `You last arrived feeling ${formatCheckinMood(latestDailyCheckin.mood).toLowerCase()}.`,
      href: journalHref
    });
  }

  const completedRitual = rituals.find((entry) => entry.status === 'completed');
  if (completedRitual) {
    pushMoment({
      id: `ritual-${completedRitual.key}`,
      label: 'Ritual',
      body: `${completedRitual.title} helped keep the sanctuary warm.`,
      href: journalHref
    });
  }

  return moments.slice(0, 3);
};

const buildSanctuaryNudge = (args: {
  activeCompanion: ActiveCompanionSnapshot | null;
  journalMoments: JournalMoment[];
  latestDailyCheckin: DailyCheckin | null;
  rituals: CompanionRitual[];
}) => {
  const { activeCompanion, journalMoments, latestDailyCheckin, rituals } = args;
  const companionName = activeCompanion?.name ?? 'your companion';
  const completed = rituals.filter((entry) => entry.status === 'completed').length;
  const socialMoment = journalMoments.find((entry) => entry.label === 'Social');
  const checkinHref = '/app/messages';

  if (socialMoment) {
    return {
      title: 'Carry the shared thread forward',
      body: `${companionName} has been shaped by recent shared moments. Send one more gentle note or reply.`,
      ctaLabel: 'Send a note',
      href: checkinHref
    } satisfies SanctuaryNudge;
  }

  if (latestDailyCheckin && completed === 0) {
    return {
      title: 'Turn your check-in into a ritual',
      body: `You already checked in today. Follow it with one small ritual so ${companionName} feels the continuity.`,
      ctaLabel: 'Visit companion',
      href: '/app/companions'
    } satisfies SanctuaryNudge;
  }

  return {
    title: 'Begin with a small ritual',
    body: `${companionName} responds best to small repeated care. Start with a check-in, then keep the sanctuary warm.`,
    ctaLabel: 'Open sanctuary',
    href: '/app/companions'
  } satisfies SanctuaryNudge;
};

const buildKeepsakeTheme = (chapterRewards: ChapterRewards): KeepsakeTheme | null => {
  const latestReward = chapterRewards.find((reward) =>
    reward.tone === 'care' ||
    reward.tone === 'social' ||
    reward.tone === 'mission' ||
    reward.tone === 'play' ||
    reward.tone === 'bond'
  );

  if (!latestReward) return null;

  return {
    tone: latestReward.tone,
    title: latestReward.title
  };
};

const applyKeepsakeToSanctuaryNudge = (args: {
  nudge: SanctuaryNudge;
  keepsakeTheme: KeepsakeTheme | null;
  companionName: string | null;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const theme = args.keepsakeTheme;
  if (!theme) return args.nudge;

  switch (theme.tone) {
    case 'care':
      return {
        ...args.nudge,
        title: `${theme.title} is asking for steadiness`,
        body: `${name} is in a care-shaped chapter right now. Start gently and let the sanctuary feel tended instead of rushed.`
      } satisfies SanctuaryNudge;
    case 'social':
      return {
        ...args.nudge,
        title: `${theme.title} wants the shared thread carried forward`,
        body: `${name} is responding to outward expression. A note, reply, or small shared gesture will land better than a quiet reset right now.`
      } satisfies SanctuaryNudge;
    case 'mission':
      return {
        ...args.nudge,
        title: `${theme.title} is pointing the day somewhere`,
        body: `${name} is feeling purpose more than drift. Let today's sanctuary move toward one clear action instead of scattering.`
      } satisfies SanctuaryNudge;
    case 'play':
      return {
        ...args.nudge,
        title: `${theme.title} is keeping the day light`,
        body: `${name} is bonding through brightness right now. Choose a ritual or interaction that feels playful rather than heavy.`
      } satisfies SanctuaryNudge;
    case 'bond':
    default:
      return {
        ...args.nudge,
        title: `${theme.title} is holding the bond close`,
        body: `${name} is in a deeper bond chapter. A small sincere return will do more than a dramatic gesture today.`
      } satisfies SanctuaryNudge;
  }
};

const applyKeepsakeToDailyRecap = (args: {
  recap: DailyArcRecap | null;
  keepsakeTheme: KeepsakeTheme | null;
  companionName: string | null;
}) => {
  if (!args.recap || !args.keepsakeTheme) return args.recap;
  const name = args.companionName?.trim() || 'your companion';

  switch (args.keepsakeTheme.tone) {
    case 'care':
      return {
        ...args.recap,
        title: `${name}'s care chapter is settling in`,
        body: `${args.recap.body} ${args.keepsakeTheme.title} made the whole day read as steady care.`
      } satisfies DailyArcRecap;
    case 'social':
      return {
        ...args.recap,
        title: `${name}'s shared thread is settling in`,
        body: `${args.recap.body} ${args.keepsakeTheme.title} turned the day toward connection beyond the sanctuary.`
      } satisfies DailyArcRecap;
    case 'mission':
      return {
        ...args.recap,
        title: `${name}'s purposeful chapter is settling in`,
        body: `${args.recap.body} ${args.keepsakeTheme.title} gave the bond a stronger sense of direction.`
      } satisfies DailyArcRecap;
    case 'play':
      return {
        ...args.recap,
        title: `${name}'s bright chapter is settling in`,
        body: `${args.recap.body} ${args.keepsakeTheme.title} kept the relationship feeling lighter and more alive.`
      } satisfies DailyArcRecap;
    case 'bond':
    default:
      return {
        ...args.recap,
        title: `${name}'s bond chapter is settling in`,
        body: `${args.recap.body} ${args.keepsakeTheme.title} made the closeness of the day feel more explicit.`
      } satisfies DailyArcRecap;
  }
};

const buildEraAction = (args: {
  companionName: string | null;
  keepsakeTheme: KeepsakeTheme | null;
  weeklyArc: WeeklyArc | null;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const tone = args.keepsakeTheme?.tone ?? (args.weeklyArc?.emphasis === 'quiet' ? null : args.weeklyArc?.emphasis ?? null);

  switch (tone) {
    case 'care':
      return {
        title: 'Treat this like a tending day',
        body: `${name} is responding best to small repeated care right now. Favor rituals and quiet return over novelty.`,
        primaryLabel: 'Start a ritual',
        primaryHref: '/app/companions',
        secondaryLabel: 'Open journal',
        secondaryHref: '/app/memory'
      } satisfies EraAction;
    case 'social':
      return {
        title: 'Carry the bond outward',
        body: `${name} is in a shared-thread chapter. Messages, replies, and circle presence will land better than solitude today.`,
        primaryLabel: 'Send a note',
        primaryHref: '/app/messages',
        secondaryLabel: 'Visit circles',
        secondaryHref: '/app/circles'
      } satisfies EraAction;
    case 'mission':
      return {
        title: 'Give the bond a direction',
        body: `${name} is in a wayfinding chapter. One clear mission or focused action will strengthen the relationship more than drifting.`,
        primaryLabel: 'Open missions',
        primaryHref: '/app/missions',
        secondaryLabel: 'Visit companion',
        secondaryHref: '/app/companions'
      } satisfies EraAction;
    case 'play':
      return {
        title: 'Keep things bright and light',
        body: `${name} is bonding through lightness right now. Choose play, delight, and low-friction connection over intensity.`,
        primaryLabel: 'Play together',
        primaryHref: '/app/play',
        secondaryLabel: 'Celebrate ritual',
        secondaryHref: '/app/companions'
      } satisfies EraAction;
    case 'bond':
      return {
        title: 'Protect the closeness that is already here',
        body: `${name} is in a deep bond chapter. A sincere check-in or journal return will do more than chasing a bigger moment.`,
        primaryLabel: 'Check in',
        primaryHref: '/app/home',
        secondaryLabel: 'Open journal',
        secondaryHref: '/app/memory'
      } satisfies EraAction;
    default:
      return {
        title: 'Let the next phase gather naturally',
        body: `${name} is between clearer chapters. A calm check-in and one small ritual are enough to let the next shape emerge.`,
        primaryLabel: 'Begin gently',
        primaryHref: '/app/companions',
        secondaryLabel: 'Open sanctuary',
        secondaryHref: '/app/home'
      } satisfies EraAction;
  }
};

const buildChapterPaths = (args: {
  companionName: string | null;
  keepsakeTheme: KeepsakeTheme | null;
  weeklyArc: WeeklyArc | null;
  notificationsUnread: number;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const tone = args.keepsakeTheme?.tone ?? (args.weeklyArc?.emphasis === 'quiet' ? null : args.weeklyArc?.emphasis ?? null);
  const paths: ChapterPath[] = [];
  const push = (path: ChapterPath) => {
    if (paths.some((entry) => entry.id === path.id)) return;
    paths.push(path);
  };

  if (tone === 'social') {
    push({
      id: 'messages',
      label: 'Shared thread',
      title: 'Reply while the thread is warm',
      body: `${name} is in a social chapter. Keep the conversation moving while it still feels alive.`,
      href: '/app/messages'
    });
    push({
      id: 'circles',
      label: 'Community',
      title: 'Carry the mood into circles',
      body: 'A small announcement, reply, or check-in can keep the wider weave feeling active.',
      href: '/app/circles'
    });
  } else if (tone === 'mission') {
    push({
      id: 'missions',
      label: 'Direction',
      title: 'Choose the clearest next thread',
      body: `${name} is responding to purpose right now. Let one mission carry the day forward.`,
      href: '/app/missions'
    });
    push({
      id: 'journal',
      label: 'Meaning',
      title: 'See what this chapter is aiming toward',
      body: 'Your journal will show how the relationship has been shifting toward direction and momentum.',
      href: '/app/memory'
    });
  } else if (tone === 'play') {
    push({
      id: 'play',
      label: 'Lightness',
      title: 'Keep the chapter bright',
      body: `${name} is bonding through lightness. Choose delight over pressure for the next step.`,
      href: '/app/play'
    });
    push({
      id: 'companions',
      label: 'Ritual',
      title: 'Celebrate the good energy',
      body: 'A quick return to your companion can keep the bright rhythm from fading.',
      href: '/app/companions'
    });
  } else if (tone === 'care' || tone === 'bond' || tone === null) {
    push({
      id: 'companions',
      label: 'Care',
      title: 'Return to the sanctuary gently',
      body: `${name} is asking for steadiness more than novelty. One small act of care is enough.`,
      href: '/app/companions'
    });
    push({
      id: 'journal',
      label: 'Memory',
      title: 'See what your companion is holding',
      body: 'The journal will tell you what is settling into memory from this phase of the bond.',
      href: '/app/memory'
    });
  }

  if (args.notificationsUnread > 0) {
    push({
      id: 'notifications',
      label: 'Signals',
      title: `${args.notificationsUnread} signal${args.notificationsUnread === 1 ? '' : 's'} worth checking`,
      body: 'Only the strongest nudges should surface here. Clear them and keep the rest of the day quiet.',
      href: '/app/notifications'
    });
  }

  return paths.slice(0, 3);
};

const resolveFeaturedKeepsakeTheme = async (args: {
  supabase: SupabaseClient;
  userId: string | null;
  activeCompanionId: string | null;
  chapterRewards: ChapterRewards;
}) => {
  if (!args.userId || !args.activeCompanionId || !args.chapterRewards.length) {
    return buildKeepsakeTheme(args.chapterRewards);
  }

  const { data, error } = await args.supabase
    .from('user_preferences')
    .select('featured_companion_reward_key, featured_companion_reward_companion_id')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[home] featured keepsake preference lookup failed', error);
    return buildKeepsakeTheme(args.chapterRewards);
  }

  const featuredRewardKey =
    typeof data?.featured_companion_reward_key === 'string' ? data.featured_companion_reward_key : null;
  const featuredCompanionId =
    typeof data?.featured_companion_reward_companion_id === 'string' ? data.featured_companion_reward_companion_id : null;

  if (featuredCompanionId !== args.activeCompanionId || !featuredRewardKey) {
    return buildKeepsakeTheme(args.chapterRewards);
  }

  const featuredReward = args.chapterRewards.find((reward) => reward.rewardKey === featuredRewardKey);
  return featuredReward ? buildKeepsakeTheme([featuredReward]) : buildKeepsakeTheme(args.chapterRewards);
};

const resolveSanctuaryShelfRewards = async (args: {
  supabase: SupabaseClient;
  userId: string | null;
  activeCompanionId: string | null;
  chapterRewards: ChapterRewards;
}) => {
  const rewards = args.chapterRewards.slice(0, 6);
  if (!args.userId || !args.activeCompanionId || !rewards.length) {
    return rewards.slice(0, 3).map((reward) => ({ ...reward, featured: false })) as SanctuaryShelfReward[];
  }

  const { data, error } = await args.supabase
    .from('user_preferences')
    .select('featured_companion_reward_key, featured_companion_reward_companion_id')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[home] sanctuary shelf preference lookup failed', error);
  }

  const featuredRewardKey =
    typeof data?.featured_companion_reward_key === 'string' ? data.featured_companion_reward_key : null;
  const featuredCompanionId =
    typeof data?.featured_companion_reward_companion_id === 'string' ? data.featured_companion_reward_companion_id : null;

  const orderedRewards =
    featuredCompanionId === args.activeCompanionId && featuredRewardKey
      ? [
          ...rewards.filter((reward) => reward.rewardKey === featuredRewardKey),
          ...rewards.filter((reward) => reward.rewardKey !== featuredRewardKey)
        ]
      : rewards;

  return orderedRewards.slice(0, 3).map((reward) => ({
    ...reward,
    featured: featuredCompanionId === args.activeCompanionId && featuredRewardKey === reward.rewardKey
  })) as SanctuaryShelfReward[];
};

const resolvePremiumSanctuaryStyle = async (args: {
  supabase: SupabaseClient;
  userId: string | null;
  subscriptionActive: boolean;
}) => {
  if (!args.userId || !args.subscriptionActive) return null;
  const { data, error } = await args.supabase
    .from('user_preferences')
    .select('premium_sanctuary_style')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[home] premium sanctuary style lookup failed', error);
    return null;
  }

  return typeof data?.premium_sanctuary_style === 'string'
    ? (data.premium_sanctuary_style as PremiumSanctuaryStyle)
    : null;
};

const upsertMissionAssignment = async (args: {
  supabase: SupabaseClient;
  period: 'daily' | 'weekly';
  periodKey: string;
  missionIds: string[];
}) => {
  const missionIds = args.missionIds.filter((id) => typeof id === 'string' && id.trim().length > 0);
  if (missionIds.length === 0) return { created: false as const };

  const { data: existing, error: existingError } = await args.supabase
    .from('mission_assignments')
    .select('id')
    .eq('period', args.period)
    .eq('period_key', args.periodKey)
    .maybeSingle();

  if (existingError && existingError.code !== 'PGRST116') {
    console.error('[home] mission assignment lookup failed', existingError);
    return { created: false as const };
  }

  if (existing?.id) {
    return { created: false as const };
  }

  const { error: insertError } = await args.supabase.from('mission_assignments').insert({
    period: args.period,
    period_key: args.periodKey,
    mission_ids: missionIds
  });

  if (insertError) {
    if (insertError.code !== '23505') {
      console.error('[home] mission assignment insert failed', insertError);
    }
    return { created: false as const };
  }

  return { created: true as const };
};

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const session = event.locals.session ?? null;
  const userId = session?.user?.id ?? null;
  const parentActiveCompanion: ActiveCompanionSnapshot | null = (parent as Record<string, any>).activeCompanion ?? null;

  const diagnostics: string[] = [];
  const safe = {
    stats: null as Awaited<ReturnType<typeof getPlayerStats>>,
    feed: [] as FeedItem[],
    missions: [] as MissionSummary[],
    dailyMissions: [] as MissionSummary[],
    weeklyMissions: [] as MissionSummary[],
    creatures: [] as CreatureMoment[],
    endcap: DEFAULT_ENDCAP,
    landingVariant: parent.landingVariant ?? null,
    diagnostics,
    preferences: parent.preferences ?? null,
    notificationsUnread: parent.notificationsUnread ?? 0,
    wallet: null as Awaited<ReturnType<typeof getWalletWithTransactions>>['wallet'] | null,
    walletTx: [] as Awaited<ReturnType<typeof getWalletWithTransactions>>['transactions'],
    flags: { bond_genesis: false },
    companionCount: 0,
    rituals: [] as CompanionRitual[],
    activeCompanion: parentActiveCompanion,
    dailyCheckinToday: null as DailyCheckin | null,
    latestDailyCheckin: null as DailyCheckin | null,
    memorySummary: null as MemorySummary | null,
    journalMoments: [] as JournalMoment[],
    chapterReveal: null as ChapterRevealMoment | null,
    sanctuaryNudge: null as SanctuaryNudge | null,
    dailyArc: null as DailyArc | null,
    dailyArcRecap: null as DailyArcRecap,
    weeklyArc: null as WeeklyArc | null,
    chapterMilestones: [] as ChapterMilestones,
    chapterRewards: [] as ChapterRewards
  };

  try {
    const supabase: SupabaseClient = event.locals.supabase ?? supabaseServer(event);
    const blockPeers = await ensureBlockedPeers(event, supabase);

    let stats = null;
    try {
      stats = await getPlayerStats(event, supabase);
    } catch (err) {
      diagnostics.push('stats_query_failed');
      reportHomeLoadIssue('stats_query_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    let feedItems: FeedItem[] = [];
    try {
      const { data, error } = await supabase
        .from('feed_view')
        .select(
          [
            'id',
            'user_id',
            'author_id',
            'slug',
            'kind',
            'body',
            'text',
            'meta',
            'image_url',
            'is_public',
            'created_at',
            'deep_link_target',
            'author_name',
            'author_handle',
            'author_avatar',
            'comment_count',
            'reaction_like_count',
            'reaction_spark_count',
            'reaction_support_count',
            'current_user_reaction',
            'is_follow',
            'engagement',
            'recency',
            'score'
          ].join(', ')
        )
        .order('score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) {
        throw error;
      }

      feedItems = Array.isArray(data) ? ((data as unknown) as FeedItem[]) : [];
      if (blockPeers.size) {
        feedItems = feedItems.filter((item) => {
          const authorId = (item.author_id ?? item.user_id ?? null) as string | null;
          if (isBlockedPeer(blockPeers, authorId)) return false;
          if (item.sharedBy?.id && isBlockedPeer(blockPeers, item.sharedBy.id)) {
            return false;
          }
          return true;
        });
      }
    } catch (err) {
      diagnostics.push('feed_query_failed');
      reportHomeLoadIssue('feed_query_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    let missionSuggestions: MissionSummary[] = [];
    let dailyMissionSuggestions: MissionSummary[] = [];
    let weeklyMissionSuggestions: MissionSummary[] = [];
    try {
      const { data } = await supabase
        .from('missions')
        .select(
          'id, title, summary, difficulty, status, energy_reward, xp_reward, type, cost, requirements, requires, min_level, tags, weight, cooldown_ms, privacy_tags'
        )
        .eq('status', 'available')
        .limit(32)
        .throwOnError();

      const missionPool = (data as MissionSummary[] | null)?.filter(Boolean) ?? [];
      const tuning = await getLoomaTuningConfig();
      const today = new Date().toISOString().slice(0, 10);
      const baseSeed = `${today}:${userId ?? 'anon'}`;
      const userLevel = typeof stats?.level === 'number' ? stats.level : 0;
      const now = new Date();
      const utcYear = now.getUTCFullYear();
      const janFirstUtc = new Date(Date.UTC(utcYear, 0, 1));
      const dayOfYear = Math.floor((Date.parse(today) - Date.UTC(utcYear, 0, 1)) / 86400000) + 1;
      const isoWeek = Math.ceil((dayOfYear + janFirstUtc.getUTCDay() + 1) / 7);
      const isoWeekSeed = `${utcYear}-W${String(isoWeek).padStart(2, '0')}`;

      dailyMissionSuggestions = getDailySet(missionPool, today, {
        limit: tuning.missions.dailyCount,
        requiredTags: ['daily'],
        userLevel,
        includeIdentityForEnergyDaily: false,
        globalSeed: 'looma-missions-v1',
        scopeKey: `${baseSeed}:daily`,
        repeatAvoidanceWindow: tuning.missions.repeatAvoidanceWindow
      });

      weeklyMissionSuggestions = getWeeklySet(
        missionPool.filter((entry) => !dailyMissionSuggestions.some((pick) => pick.id === entry.id)),
        isoWeekSeed,
        {
          limit: tuning.missions.weeklyCount,
          requiredTags: ['weekly'],
          userLevel,
          globalSeed: 'looma-missions-v1',
          scopeKey: `${baseSeed}:weekly`,
          repeatAvoidanceWindow: tuning.missions.repeatAvoidanceWindow
        }
      );

      missionSuggestions = [...dailyMissionSuggestions, ...weeklyMissionSuggestions].slice(0, 3);

      const dailyAssignment = await upsertMissionAssignment({
        supabase,
        period: 'daily',
        periodKey: today,
        missionIds: dailyMissionSuggestions.map((mission) => mission.id)
      });

      if (dailyAssignment.created) {
        await ingestServerEvent(event, 'missions.daily.refresh', {
          period: 'daily',
          periodKey: today,
          missionIds: dailyMissionSuggestions.map((mission) => mission.id)
        });
      }
    } catch (err) {
      diagnostics.push('missions_query_failed');
      reportHomeLoadIssue('missions_query_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    let creatureMoments: CreatureMoment[] = [];
    if (session?.user?.id) {
      try {
        const { data } = await supabase
          .from('companions')
          .select(
            'id, name, species, mood, state, is_active, slot_index, created_at, updated_at, affection, trust, energy, avatar_url, stats:companion_stats(fed_at, played_at, groomed_at, last_passive_tick, last_daily_bonus_at, bond_level, bond_score)'
          )
          .eq('owner_id', session.user.id)
          .order('is_active', { ascending: false })
          .order('slot_index', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true })
          .limit(3)
          .throwOnError();

        creatureMoments =
          (data as CreatureMoment[] | null)?.map((row) => {
            const statsRaw = (row as any).stats ?? null;
            const stats = Array.isArray(statsRaw) ? statsRaw[0] ?? null : statsRaw;
            return {
              ...row,
              stats,
              mood_label: row.mood ?? row.state ?? 'steady'
            };
          }) ?? [];
      } catch (err) {
        diagnostics.push('creatures_query_failed');
        reportHomeLoadIssue('creatures_query_failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    let wallet = safe.wallet;
    let walletTx = safe.walletTx;
    let flags = { ...safe.flags };
    let companionCount = safe.companionCount;
    let rituals: CompanionRitual[] = safe.rituals;
    let dailyCheckinToday: DailyCheckin | null = null;
    let latestDailyCheckin: DailyCheckin | null = null;

    if (session?.user?.id) {
      try {
        const summary = await getWalletWithTransactions(supabase, session.user.id, 10);
        wallet = summary.wallet;
        walletTx = summary.transactions;
      } catch (err) {
        diagnostics.push('wallet_query_failed');
        reportHomeLoadIssue('wallet_query_failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      }

      try {
        const { count, error } = await supabase
          .from('companions')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', session.user.id);
        if (error) {
          throw error;
        }
        companionCount = count ?? 0;
      } catch (err) {
        diagnostics.push('companion_count_failed');
        reportHomeLoadIssue('companion_count_failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      }

      try {
        const today = new Date().toISOString().slice(0, 10);
        const [{ data: latest, error: latestError }, { data: todayRow, error: todayError }] = await Promise.all([
          supabase
            .from('user_daily_checkins')
            .select('id, mood, checkin_date, created_at')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('user_daily_checkins')
            .select('id, mood, checkin_date, created_at')
            .eq('user_id', session.user.id)
            .eq('checkin_date', today)
            .limit(1)
            .maybeSingle()
        ]);

        if (latestError) throw latestError;
        if (todayError) throw todayError;

        latestDailyCheckin = (latest as DailyCheckin | null) ?? null;
        dailyCheckinToday = (todayRow as DailyCheckin | null) ?? null;
      } catch (err) {
        diagnostics.push('daily_checkin_query_failed');
        reportHomeLoadIssue('daily_checkin_query_failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('key, enabled')
        .eq('key', 'bond_genesis')
        .maybeSingle();
      if (error) {
        throw error;
      }
      flags.bond_genesis = Boolean(data?.enabled);
    } catch (err) {
      diagnostics.push('flags_query_failed');
      reportHomeLoadIssue('flags_query_failed', {
        error: err instanceof Error ? err.message : String(err)
      });
    }

    if (userId) {
      try {
        rituals = await getCompanionRituals(supabase, userId);
      } catch (err) {
        console.error('[home] failed to fetch rituals', err);
      }
    }

    const endcap =
      missionSuggestions[0]
        ? {
            title: 'Knock out a mission',
            description: missionSuggestions[0].title ?? 'Pick up where you left off.',
            href: `/app/missions/${missionSuggestions[0].id}`
          }
        : creatureMoments[0]
        ? {
            title: 'Check on your companion',
            description: 'Spend a moment with your closest companion before you go.',
            href: `/app/companions?focus=${creatureMoments[0].id}`
          }
        : DEFAULT_ENDCAP;

    if (userId) {
      const landedAtCookie = event.cookies.get('looma_landing_at');
      const landedAt = landedAtCookie ? Number(landedAtCookie) : null;
      const dwellMs = landedAt && Number.isFinite(landedAt) ? Date.now() - landedAt : null;
      await recordAnalyticsEvent(supabase, userId, 'app_feed_load', {
        surface: 'home',
        variant: parent.landingVariant ?? null,
        payload: {
          dwell_ms: dwellMs ?? null,
          feed_items: feedItems.length
        }
      });
    }

    const rowToSnapshot = (row: CreatureMoment): ActiveCompanionSnapshot => {
      const statsRaw = (row.stats ?? null) as Record<string, any> | Array<Record<string, any>> | null;
      const statsRow = Array.isArray(statsRaw) ? statsRaw[0] ?? null : statsRaw;
      return {
        id: row.id,
        name: row.name ?? 'Companion',
        species: row.species ?? null,
        mood: row.mood ?? row.state ?? null,
        affection: row.affection ?? 0,
        trust: row.trust ?? 0,
        energy: row.energy ?? 0,
        avatar_url: row.avatar_url ?? null,
        bondLevel: 0,
        bondScore: 0,
        updated_at: row.updated_at ?? null,
        stats: statsRow
          ? {
              fed_at: (statsRow.fed_at as string | null) ?? null,
              played_at: (statsRow.played_at as string | null) ?? null,
              groomed_at: (statsRow.groomed_at as string | null) ?? null,
              last_passive_tick: (statsRow.last_passive_tick as string | null) ?? null,
              last_daily_bonus_at: (statsRow.last_daily_bonus_at as string | null) ?? null,
              bond_level: (statsRow.bond_level as number | null) ?? null,
              bond_score: (statsRow.bond_score as number | null) ?? null
            }
          : null
      };
    };

    const fallbackCompanion = creatureMoments.find((c) => c.is_active) ?? creatureMoments[0] ?? null;
    const activeCompanion =
      parentActiveCompanion ?? (fallbackCompanion ? rowToSnapshot(fallbackCompanion) : null);

    let memorySummary: MemorySummary | null = null;
    if (userId && activeCompanion?.id) {
      try {
        const { data, error } = await supabase
          .from('companion_memory_summary')
          .select('summary_text, highlights_json, last_built_at')
          .eq('user_id', userId)
          .eq('companion_id', activeCompanion.id)
          .maybeSingle();
        if (error) {
          throw error;
        }
        memorySummary = (data as MemorySummary | null) ?? null;
      } catch (err) {
        diagnostics.push('memory_summary_query_failed');
        reportHomeLoadIssue('memory_summary_query_failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const journalMoments = buildJournalMoments({
      activeCompanion,
      memorySummary,
      latestDailyCheckin,
      rituals
    });
    let chapterReveal: ChapterRevealMoment | null = null;
    if (userId && activeCompanion?.id) {
      const [socialEntries, systemEntries] = await Promise.all([
        supabase
        .from('companion_journal_entries')
        .select('id, title, body, source_type, created_at')
        .eq('owner_id', userId)
        .eq('companion_id', activeCompanion.id)
        .in('source_type', ['post', 'message', 'circle_announcement'])
        .order('created_at', { ascending: false })
        .limit(1),
        supabase
          .from('companion_journal_entries')
          .select('id, title, body, source_type, created_at, meta_json')
          .eq('owner_id', userId)
          .eq('companion_id', activeCompanion.id)
          .eq('source_type', 'system')
          .order('created_at', { ascending: false })
          .limit(1)
      ]);
      if (!socialEntries.error) {
        const latestSocial = (socialEntries.data ?? [])[0] as Record<string, unknown> | undefined;
        if (latestSocial) {
          journalMoments.unshift({
            id: `social-${String(latestSocial.id ?? 'recent')}`,
            label: 'Social',
            body: clipMomentBody(
              typeof latestSocial.body === 'string' && latestSocial.body.trim().length
                ? latestSocial.body
                : typeof latestSocial.title === 'string'
                  ? latestSocial.title
                  : 'A shared moment reached your companion.'
            ),
            href: activeCompanion.id ? `/app/memory?companion=${encodeURIComponent(activeCompanion.id)}` : '/app/memory'
          });
        }
      }
      const latestNotice =
        !systemEntries.error ? ((systemEntries.data ?? [])[0] as Record<string, unknown> | undefined) : undefined;
      if (latestNotice) {
        const generatedBy =
          latestNotice.meta_json && typeof latestNotice.meta_json === 'object'
            ? String((latestNotice.meta_json as Record<string, unknown>).generatedBy ?? '')
            : '';
        if (generatedBy === 'chapter_reward_reveal') {
          const meta =
            latestNotice.meta_json && typeof latestNotice.meta_json === 'object'
              ? (latestNotice.meta_json as Record<string, unknown>)
              : null;
          const revealTone =
            meta?.rewardTone === 'care' ||
            meta?.rewardTone === 'social' ||
            meta?.rewardTone === 'mission' ||
            meta?.rewardTone === 'play' ||
            meta?.rewardTone === 'bond'
              ? meta.rewardTone
              : null;
          chapterReveal = {
            id: `reveal-${String(latestNotice.id ?? 'recent')}`,
            title:
              typeof latestNotice.title === 'string' && latestNotice.title.trim().length
                ? latestNotice.title
                : `${activeCompanion.name ?? 'Your companion'} opened a new chapter`,
            body: clipMomentBody(
              typeof latestNotice.body === 'string' && latestNotice.body.trim().length
                ? latestNotice.body
                : `${activeCompanion.name ?? 'Your companion'} revealed a new keepsake.`
            ),
            href: activeCompanion.id ? `/app/memory?companion=${encodeURIComponent(activeCompanion.id)}` : '/app/memory',
            rewardTitle: typeof meta?.rewardTitle === 'string' ? meta.rewardTitle : null,
            tone: revealTone
          };
        }
        journalMoments.unshift({
          id: `${generatedBy === 'chapter_reward_reveal' ? 'reveal' : 'notice'}-${String(latestNotice.id ?? 'recent')}`,
          label: generatedBy === 'chapter_reward_reveal' ? 'Reveal' : 'Noticed',
          body: clipMomentBody(
            typeof latestNotice.body === 'string' && latestNotice.body.trim().length
              ? latestNotice.body
              : typeof latestNotice.title === 'string'
                ? latestNotice.title
                : generatedBy === 'chapter_reward_reveal'
                  ? `${activeCompanion.name ?? 'Your companion'} revealed a new keepsake.`
                  : `${activeCompanion.name ?? 'Your companion'} noticed a new pattern.`
          ),
          href: activeCompanion.id ? `/app/memory?companion=${encodeURIComponent(activeCompanion.id)}` : '/app/memory'
        });
      } else {
        const derivedNotice = deriveCompanionPatternNotice({
          companionName: activeCompanion.name ?? null,
          careMoments: rituals.filter((entry) => entry.status === 'completed').length,
          missionMoments: missionSuggestions.length,
          gameMoments: 0,
          socialMoments: journalMoments.filter((entry) => entry.label === 'Social').length,
          checkins: latestDailyCheckin ? 1 : 0
        });
        if (derivedNotice) {
        journalMoments.unshift({
            id: `notice-derived-${derivedNotice.patternKey}`,
            label: 'Noticed',
            body: clipMomentBody(derivedNotice.body),
            href: activeCompanion.id ? `/app/memory?companion=${encodeURIComponent(activeCompanion.id)}` : '/app/memory'
          });
        }
      }
    }
    const baseSanctuaryNudge = buildSanctuaryNudge({
      activeCompanion,
      journalMoments,
      latestDailyCheckin,
      rituals
    });
    const weeklyArc = deriveWeeklyCompanionArc({
      companionName: activeCompanion?.name ?? null,
      careMoments: rituals.filter((entry) => entry.status === 'completed').length,
      missionMoments: missionSuggestions.length,
      gameMoments: 0,
      socialMoments: journalMoments.filter((entry) => entry.label === 'Social').length,
      checkins: latestDailyCheckin ? 1 : 0
    });
    const chapterMilestones = deriveChapterMilestones({
      companionName: activeCompanion?.name ?? null,
      bondLevel: Math.max(0, Math.floor(activeCompanion?.bondLevel ?? 0)),
      trust: activeCompanion?.trust ?? 0,
      affection: activeCompanion?.affection ?? 0,
      weeklyArc,
      patternNotice: deriveCompanionPatternNotice({
        companionName: activeCompanion?.name ?? null,
        careMoments: rituals.filter((entry) => entry.status === 'completed').length,
        missionMoments: missionSuggestions.length,
        gameMoments: 0,
        socialMoments: journalMoments.filter((entry) => entry.label === 'Social').length,
        checkins: latestDailyCheckin ? 1 : 0
      })
    });
    const chapterRewards =
      userId && activeCompanion?.id
        ? await unlockChapterRewards(supabase, {
            ownerId: userId,
            companionId: activeCompanion.id,
            companionName: activeCompanion.name ?? null,
            rewards: deriveChapterRewards({
              companionName: activeCompanion.name ?? null,
              milestones: chapterMilestones,
              weeklyArc,
              trust: activeCompanion.trust ?? 0,
              affection: activeCompanion.affection ?? 0
            })
          })
        : [];
    const dailyArc = deriveDailyCompanionArc({
      companionName: activeCompanion?.name ?? null,
      hasDailyCheckin: Boolean(dailyCheckinToday || latestDailyCheckin),
      rituals,
      hasSocialMoment: journalMoments.some((entry) => entry.label === 'Social'),
      hasJournalMoment: journalMoments.length > 0
    });
    const keepsakeTheme = await resolveFeaturedKeepsakeTheme({
      supabase,
      userId,
      activeCompanionId: activeCompanion?.id ?? null,
      chapterRewards
    });
    const premiumSanctuaryStyle = await resolvePremiumSanctuaryStyle({
      supabase,
      userId,
      subscriptionActive: Boolean(parent.subscription?.active)
    });
    const dailyArcRecap =
      userId && activeCompanion?.id
        ? (await syncDailyCompanionArcProgress(supabase, {
            ownerId: userId,
            companionId: activeCompanion.id,
            companionName: activeCompanion.name ?? null,
            arc: dailyArc,
            premiumStyle: premiumSanctuaryStyle,
            chapter: keepsakeTheme
              ? {
                  title: keepsakeTheme.title,
                  tone: keepsakeTheme.tone
                }
              : null
          })).recap
        : null;
    const sanctuaryNudge = applyKeepsakeToSanctuaryNudge({
      nudge: baseSanctuaryNudge,
      keepsakeTheme,
      companionName: activeCompanion?.name ?? null
    });
    const sanctuaryShelfRewards = await resolveSanctuaryShelfRewards({
      supabase,
      userId,
      activeCompanionId: activeCompanion?.id ?? null,
      chapterRewards
    });
    const eraAction = buildEraAction({
      companionName: activeCompanion?.name ?? null,
      keepsakeTheme,
      weeklyArc
    });
    const flavoredDailyArcRecap = applyKeepsakeToDailyRecap({
      recap: dailyArcRecap,
      keepsakeTheme,
      companionName: activeCompanion?.name ?? null
    });
    const chapterPaths = buildChapterPaths({
      companionName: activeCompanion?.name ?? null,
      keepsakeTheme,
      weeklyArc,
      notificationsUnread: parent.notificationsUnread ?? 0
    });

    return {
      stats,
      feed: feedItems,
      missions: missionSuggestions,
      dailyMissions: dailyMissionSuggestions,
      weeklyMissions: weeklyMissionSuggestions,
      creatures: creatureMoments,
      endcap,
      landingVariant: parent.landingVariant ?? null,
      diagnostics,
      preferences: parent.preferences ?? null,
      notificationsUnread: parent.notificationsUnread ?? 0,
      wallet,
      walletTx,
      flags,
      companionCount,
      rituals,
      activeCompanion,
      dailyCheckinToday,
      latestDailyCheckin,
      memorySummary,
      journalMoments: journalMoments.slice(0, 3),
      chapterReveal,
      sanctuaryNudge,
      dailyArc,
      dailyArcRecap: flavoredDailyArcRecap,
      weeklyArc,
      chapterMilestones,
      chapterRewards,
      keepsakeTheme,
      premiumSanctuaryStyle,
      sanctuaryShelfRewards,
      eraAction,
      chapterPaths
    };
  } catch (err) {
    diagnostics.push('home_load_failed');
    reportHomeLoadIssue('home_load_failed', {
      error: err instanceof Error ? err.message : String(err)
    });

    return { ...safe, activeCompanion: parentActiveCompanion ?? null };
  }
};
