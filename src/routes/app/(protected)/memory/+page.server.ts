import type { PageServerLoad } from './$types';
import {
  deriveEmotionalStateFromCompanionStats,
  type EmotionalStateSnapshot
} from '$lib/server/emotionalState';
import { isSubscriptionActive } from '$lib/subscriptions';
import {
  deriveChapterMilestones,
  deriveChapterRewards,
  deriveCompanionChapterDigest,
  deriveCompanionPatternNotice,
  deriveDailyCompanionArc,
  deriveRitualGuideFromPattern,
  deriveWeeklyCompanionArc,
  ensureCompanionChapterDigest,
  ensureCompanionPatternNotice,
  type PremiumSanctuaryStyle,
  syncDailyCompanionArcProgress,
  unlockChapterRewards
} from '$lib/server/companions/journal';

type CompanionRow = {
  id: string;
  name: string;
  species: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
  updated_at: string | null;
  affection: number | null;
  trust: number | null;
  energy: number | null;
  mood: string | null;
  stats:
    | {
        fed_at?: string | null;
        played_at?: string | null;
        groomed_at?: string | null;
        last_passive_tick?: string | null;
        care_streak?: number | null;
        bond_level?: number | null;
        bond_score?: number | null;
      }
    | {
        fed_at?: string | null;
        played_at?: string | null;
        groomed_at?: string | null;
        last_passive_tick?: string | null;
        care_streak?: number | null;
        bond_level?: number | null;
        bond_score?: number | null;
      }[]
    | null;
};

type MemorySummaryRow = {
  summary_text: string;
  highlights_json: string[] | null;
  last_built_at: string | null;
  source_window_json: {
    windowDays?: number;
    counts?: {
      missionCompletions?: number;
      gameCompletions?: number;
      missionStarts?: number;
    };
  } | null;
};

type EmotionalStateRow = {
  mood: string | null;
  trust: number | null;
  bond: number | null;
  streak_momentum: number | null;
  volatility: number | null;
  recent_tone: string | null;
  last_milestone_at: string | null;
  updated_at: string | null;
};

type CareEventRow = {
  id: string;
  action: string | null;
  affection_delta: number | null;
  trust_delta: number | null;
  energy_delta: number | null;
  note: string | null;
  created_at: string;
};

type CheckinRow = {
  id: string;
  mood: string;
  checkin_date: string;
  created_at: string;
};

type MissionSessionRow = {
  id: string;
  mission_id: string | null;
  mission_type: string | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type MissionTitleRow = {
  id: string;
  title: string | null;
};

type GameSessionRow = {
  id: string;
  game_id: string;
  status: string | null;
  score: number | null;
  duration_ms: number | null;
  completed_at: string | null;
  started_at: string | null;
};

type GameTitleRow = {
  id: string;
  slug: string;
  name: string;
};

type TimelineItem = {
  id: string;
  kind: 'memory' | 'care' | 'checkin' | 'mission' | 'game' | 'social';
  title: string;
  body: string;
  occurredAt: string;
  meta?: string | null;
};

type JournalEntryRow = {
  id: string;
  source_type: string | null;
  title: string | null;
  body: string | null;
  created_at: string;
  meta_json: {
    conversationType?: string;
    circleId?: string;
    generatedBy?: string;
    rewardKey?: string;
    rewardTone?: string;
    rewardTitle?: string;
  } | null;
};

type ChapterHistoryEntry = {
  id: string;
  title: string;
  body: string;
  occurredAt: string;
  tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
};

type KeepsakeInterpretation = {
  title: string;
  body: string;
  tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
  rewardTitle: string;
};

type RelationshipEra = {
  id: string;
  title: string;
  body: string;
  periodLabel: string;
  emphasis: 'care' | 'social' | 'mission' | 'play' | 'quiet' | 'bond';
};

type JournalGuidance = {
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  ritualKey: string | null;
  ritualLabel: string | null;
};

type PremiumChapterInsight = {
  title: string;
  body: string;
  highlights: string[];
};

const COMPANION_SELECT =
  'id, name, species, avatar_url, is_active, updated_at, affection, trust, energy, mood, stats:companion_stats(fed_at, played_at, groomed_at, last_passive_tick, care_streak, bond_level, bond_score)';

const formatMood = (value: string | null | undefined) => {
  if (!value) return 'Steady';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatDuration = (durationMs: number | null | undefined) => {
  if (!durationMs || durationMs <= 0) return null;
  const minutes = Math.round(durationMs / 60000);
  if (minutes < 1) return 'Under 1 min';
  if (minutes === 1) return '1 min';
  return `${minutes} min`;
};

const formatDelta = (value: number | null | undefined, label: string) => {
  if (typeof value !== 'number' || value === 0) return null;
  return `${value > 0 ? '+' : ''}${value} ${label}`;
};

const clipText = (value: string | null | undefined, limit = 180) => {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return '';
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
};

const toStamp = (value: string | null | undefined) => {
  if (!value) return null;
  const stamp = Date.parse(value);
  return Number.isNaN(stamp) ? null : stamp;
};

const pickLatestIso = (values: Array<string | null | undefined>) => {
  let latest: string | null = null;
  let latestStamp = -Infinity;
  for (const value of values) {
    const stamp = toStamp(value);
    if (stamp === null) continue;
    if (stamp > latestStamp) {
      latestStamp = stamp;
      latest = value ?? null;
    }
  }
  return latest;
};

const formatElapsedLabel = (iso: string | null | undefined) => {
  const stamp = toStamp(iso);
  if (stamp === null) return 'No recent care logged';
  const elapsedMs = Math.max(0, Date.now() - stamp);
  if (elapsedMs < 60 * 60 * 1000) return 'Cared for within the hour';
  if (elapsedMs < 24 * 60 * 60 * 1000) return 'Cared for today';
  const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  if (days === 1) return 'Last care was yesterday';
  if (days < 7) return `Last care was ${days} days ago`;
  return 'Care has gone quiet for over a week';
};

const normalizeStats = (value: CompanionRow['stats']) => (Array.isArray(value) ? value[0] ?? null : value ?? null);

const buildRelationshipReasons = (args: {
  companion: CompanionRow;
  emotionalState: EmotionalStateSnapshot;
  summary: MemorySummaryRow | null;
  careRows: CareEventRow[];
  missionRows: MissionSessionRow[];
  gameRows: GameSessionRow[];
  checkins: CheckinRow[];
}) => {
  const { companion, emotionalState, summary, careRows, missionRows, gameRows, checkins } = args;
  const reasons: string[] = [];
  const stats = normalizeStats(companion.stats);
  const lastCareAt = pickLatestIso([stats?.fed_at, stats?.played_at, stats?.groomed_at, careRows[0]?.created_at ?? null]);
  const affection = companion.affection ?? 0;
  const trust = companion.trust ?? 0;
  const energy = companion.energy ?? 0;
  const completedMissions = missionRows.filter((row) => row.status === 'completed').length;
  const completedGames = gameRows.length;

  if (energy <= 20) {
    reasons.push('Energy is low, so this companion is reading as more fragile and quiet.');
  } else if (energy >= 70) {
    reasons.push('Energy is high, which supports a brighter and more responsive presence.');
  }

  if (trust >= 70 && affection >= 70) {
    reasons.push('Trust and affection are both strong, so the relationship feels settled rather than uncertain.');
  } else if (trust <= 35 || affection <= 35) {
    reasons.push('Trust or affection is still rebuilding, so the bond reads as less secure.');
  }

  if (emotionalState.streakMomentum >= 0.55) {
    reasons.push('Recent consistency is reinforcing the emotional state, not just one isolated action.');
  }

  if (completedGames > completedMissions && completedGames > 0) {
    reasons.push('Recent momentum is coming more from play sessions than from missions.');
  } else if (completedMissions > 0) {
    reasons.push('Mission progress is currently doing more of the relationship-shaping work.');
  }

  if (checkins.length > 0) {
    reasons.push(`Your latest check-in was ${formatMood(checkins[0]?.mood)}.`);
  }

  if (!summary?.last_built_at) {
    reasons.push('This journal summary is still new, so it may be missing older context until more events accumulate.');
  }

  return {
    headline:
      emotionalState.mood === 'luminous'
        ? `${companion.name} feels bright and connected`
        : emotionalState.mood === 'dim'
        ? `${companion.name} feels more withdrawn right now`
        : `${companion.name} feels steady right now`,
    reasons: reasons.slice(0, 4),
    lastCareLabel: formatElapsedLabel(lastCareAt)
  };
};

const buildJournalGuidance = (args: {
  companionName: string | null;
  weeklyArc: ReturnType<typeof deriveWeeklyCompanionArc>;
  featuredKeepsake: { title: string; tone: 'care' | 'social' | 'mission' | 'play' | 'bond' } | null;
  ritualGuide: ReturnType<typeof deriveRitualGuideFromPattern> | null;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const tone = args.featuredKeepsake?.tone ?? (args.weeklyArc.emphasis === 'quiet' ? null : args.weeklyArc.emphasis ?? null);

  switch (tone) {
    case 'care':
      return {
        title: 'Treat this like a tending chapter',
        body: `${name} is responding best to steadiness right now. Let one ritual hold the shape of the day, then return here to see what settled.`,
        primaryLabel: args.ritualGuide?.ctaLabel ?? 'Begin ritual',
        primaryHref: '/app/companions',
        secondaryLabel: 'Open sanctuary',
        secondaryHref: '/app/home',
        ritualKey: args.ritualGuide?.ritualKey ?? 'listen',
        ritualLabel: args.ritualGuide?.ctaLabel ?? 'Begin ritual'
      } satisfies JournalGuidance;
    case 'social':
      return {
        title: 'Carry the bond outward',
        body: `${name} is in a shared-thread chapter. Messages, replies, and circle presence are doing more relationship work than staying inward today.`,
        primaryLabel: 'Send a note',
        primaryHref: '/app/messages',
        secondaryLabel: 'Visit circles',
        secondaryHref: '/app/circles',
        ritualKey: null,
        ritualLabel: null
      } satisfies JournalGuidance;
    case 'mission':
      return {
        title: 'Give the chapter a direction',
        body: `${name} is in a wayfinding phase. One clear mission or focused action will strengthen the bond more than drifting between small gestures.`,
        primaryLabel: 'Open missions',
        primaryHref: '/app/missions',
        secondaryLabel: 'Visit sanctuary',
        secondaryHref: '/app/home',
        ritualKey: null,
        ritualLabel: null
      } satisfies JournalGuidance;
    case 'play':
      return {
        title: 'Keep the connection light',
        body: `${name} is bonding through brightness right now. Favor delight, play, and low-friction connection over anything too heavy.`,
        primaryLabel: 'Play together',
        primaryHref: '/app/play',
        secondaryLabel: 'Open sanctuary',
        secondaryHref: '/app/home',
        ritualKey: null,
        ritualLabel: null
      } satisfies JournalGuidance;
    case 'bond':
      return {
        title: 'Protect what is already close',
        body: `${name} is in a deeper bond chapter. A sincere return or quiet ritual will do more than trying to manufacture a bigger moment.`,
        primaryLabel: args.ritualGuide?.ctaLabel ?? 'Return gently',
        primaryHref: '/app/home',
        secondaryLabel: 'Open sanctuary',
        secondaryHref: '/app/companions',
        ritualKey: args.ritualGuide?.ritualKey ?? 'listen',
        ritualLabel: args.ritualGuide?.ctaLabel ?? 'Return gently'
      } satisfies JournalGuidance;
    default:
      return {
        title: 'Let the next phase gather naturally',
        body: `${name} is between clearer chapters. A calm check-in and one small ritual are enough to let the next shape emerge.`,
        primaryLabel: args.ritualGuide?.ctaLabel ?? 'Begin gently',
        primaryHref: '/app/home',
        secondaryLabel: 'Visit companion',
        secondaryHref: '/app/companions',
        ritualKey: args.ritualGuide?.ritualKey ?? 'listen',
        ritualLabel: args.ritualGuide?.ctaLabel ?? 'Begin gently'
      } satisfies JournalGuidance;
  }
};

const buildPremiumChapterInsight = (args: {
  companionName: string;
  weeklyArc: ReturnType<typeof deriveWeeklyCompanionArc>;
  relationshipPulse: ReturnType<typeof buildRelationshipReasons>;
  weeklyPulse: ReturnType<typeof buildWeeklyPulse>;
  chapterHistory: ChapterHistoryEntry[];
  featuredKeepsake: { title: string; tone: 'care' | 'social' | 'mission' | 'play' | 'bond' } | null;
}): PremiumChapterInsight => {
  const name = args.companionName.trim() || 'Your companion';
  const highlights: string[] = [];

  for (const reason of args.relationshipPulse.reasons.slice(0, 2)) {
    highlights.push(reason);
  }

  highlights.push(`This week leaned ${args.weeklyPulse.dominantLabel.toLowerCase()} across ${args.weeklyArc.progressLabel.toLowerCase()}.`);

  if (args.featuredKeepsake) {
    highlights.push(`${args.featuredKeepsake.title} is acting as the visible emblem of this chapter.`);
  } else if (args.chapterHistory[0]) {
    highlights.push(`The latest opening, ${args.chapterHistory[0].title}, is still shaping the tone of the bond.`);
  }

  return {
    title: `${name}'s deeper chapter reading`,
    body:
      args.weeklyArc.emphasis === 'quiet'
        ? `${name} is in a quieter phase. The signal is less about volume and more about consistency, small returns, and whether the bond is holding shape without pressure.`
        : `${name} is in a ${args.weeklyArc.emphasis} chapter right now. The deeper pattern is not just what happened most recently, but what kind of rhythm keeps reappearing across the week.`,
    highlights: highlights.slice(0, 4)
  };
};

const buildWeeklyPulse = (args: {
  careRows: CareEventRow[];
  missionRows: MissionSessionRow[];
  gameRows: GameSessionRow[];
  checkins: CheckinRow[];
  summary: MemorySummaryRow | null;
  socialMoments: number;
}) => {
  const { careRows, missionRows, gameRows, checkins, summary, socialMoments } = args;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const careMoments = careRows.filter((row) => (toStamp(row.created_at) ?? 0) >= weekAgo).length;
  const missionMoments = missionRows.filter((row) => (toStamp(row.completed_at ?? row.started_at) ?? 0) >= weekAgo).length;
  const gameMoments = gameRows.filter((row) => (toStamp(row.completed_at ?? row.started_at) ?? 0) >= weekAgo).length;
  const recentCheckins = checkins.filter((row) => (toStamp(row.created_at) ?? 0) >= weekAgo).length;
  const counts = [
    { key: 'care', count: careMoments, label: 'care' },
    { key: 'missions', count: missionMoments, label: 'missions' },
    { key: 'games', count: gameMoments, label: 'games' },
    { key: 'social', count: socialMoments, label: 'social' }
  ].sort((a, b) => b.count - a.count);

  return {
    careMoments,
    missionMoments,
    gameMoments,
    socialMoments,
    recentCheckins,
    dominantLabel: counts[0]?.count ? counts[0].label : 'quiet',
    summaryWindowDays: summary?.source_window_json?.windowDays ?? null
  };
};

const buildKeepsakeInterpretation = (args: {
  companionName: string;
  reward: {
    title: string;
    tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
  } | null;
}) => {
  const reward = args.reward;
  if (!reward) return null;
  const name = args.companionName;

  switch (reward.tone) {
    case 'care':
      return {
        title: `${name} is treating ${reward.title} like a promise of steadiness`,
        body: `${name} seems to read this keepsake as proof that quiet return matters. It makes the relationship feel protected by consistency rather than intensity.`,
        tone: reward.tone,
        rewardTitle: reward.title
      } satisfies KeepsakeInterpretation;
    case 'social':
      return {
        title: `${name} is treating ${reward.title} like a shared signal`,
        body: `${name} seems to read this keepsake as permission to let the bond reach outward. It frames recent connection as something meant to be expressed, not hidden.`,
        tone: reward.tone,
        rewardTitle: reward.title
      } satisfies KeepsakeInterpretation;
    case 'mission':
      return {
        title: `${name} is treating ${reward.title} like direction`,
        body: `${name} seems to read this keepsake as a reminder that the relationship becomes clearer when it is moving toward something on purpose.`,
        tone: reward.tone,
        rewardTitle: reward.title
      } satisfies KeepsakeInterpretation;
    case 'play':
      return {
        title: `${name} is treating ${reward.title} like permission to stay light`,
        body: `${name} seems to read this keepsake as evidence that joy is not a distraction from closeness. It makes playful moments feel emotionally real.`,
        tone: reward.tone,
        rewardTitle: reward.title
      } satisfies KeepsakeInterpretation;
    case 'bond':
    default:
      return {
        title: `${name} is treating ${reward.title} like a bond marker`,
        body: `${name} seems to read this keepsake as proof that the relationship has crossed into something more settled and mutual.`,
        tone: reward.tone,
        rewardTitle: reward.title
      } satisfies KeepsakeInterpretation;
  }
};

const formatEraPeriod = (iso: string) => {
  const stamp = Date.parse(iso);
  if (!Number.isFinite(stamp)) return 'Earlier chapter';
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(stamp));
};

const buildRelationshipEras = (args: {
  companionName: string;
  weeklyArc: ReturnType<typeof deriveWeeklyCompanionArc>;
  chapterHistory: ChapterHistoryEntry[];
  featuredKeepsake: { title: string; tone: 'care' | 'social' | 'mission' | 'play' | 'bond' } | null;
}) => {
  const name = args.companionName;
  const eras: RelationshipEra[] = [];
  const currentTitle =
    args.weeklyArc.emphasis === 'care'
      ? 'Era of Steady Return'
      : args.weeklyArc.emphasis === 'social'
        ? 'Era of Shared Thread'
        : args.weeklyArc.emphasis === 'mission'
          ? 'Era of Wayfinding'
          : args.weeklyArc.emphasis === 'play'
            ? 'Era of Bright Play'
            : 'Era of Gathering Quiet';

  eras.push({
    id: `era-current-${args.weeklyArc.emphasis}`,
    title: currentTitle,
    body: args.featuredKeepsake
      ? `${args.weeklyArc.body} ${args.featuredKeepsake.title} is acting as the emblem of this chapter for ${name}.`
      : args.weeklyArc.body,
    periodLabel: 'Current',
    emphasis: args.featuredKeepsake?.tone ?? args.weeklyArc.emphasis
  });

  for (const entry of args.chapterHistory.slice(0, 3)) {
    const title =
      entry.tone === 'care'
        ? 'Era of Tending'
        : entry.tone === 'social'
          ? 'Era of Outward Bonding'
          : entry.tone === 'mission'
            ? 'Era of Purpose'
            : entry.tone === 'play'
              ? 'Era of Lightness'
              : 'Era of Deep Bond';
    eras.push({
      id: `era-${entry.id}`,
      title,
      body: entry.body,
      periodLabel: formatEraPeriod(entry.occurredAt),
      emphasis: entry.tone
    });
  }

  return eras.slice(0, 4);
};

export const load: PageServerLoad = async ({ locals, url }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;

  if (!supabase || !userId) {
    return {
      companions: [],
      selectedCompanionId: null,
      selectedCompanion: null,
      summary: null,
      emotionalState: null,
      ritualGuide: null,
      dailyArc: null,
      dailyArcRecap: null,
      weeklyArc: null,
      chapterMilestones: [],
      chapterRewards: [],
      timeline: [] as TimelineItem[]
    };
  }

  const companionsRes = await supabase
    .from('companions')
    .select(COMPANION_SELECT)
    .eq('owner_id', userId)
    .order('is_active', { ascending: false })
    .order('slot_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  const companions = (companionsRes.data ?? []) as CompanionRow[];
  const requestedCompanionId = url.searchParams.get('companion');
  const selectedCompanion =
    companions.find((companion) => companion.id === requestedCompanionId) ??
    companions.find((companion) => companion.is_active) ??
    companions[0] ??
    null;

  if (!selectedCompanion) {
    return {
      companions,
      selectedCompanionId: null,
      selectedCompanion: null,
      summary: null,
      emotionalState: null,
      relationshipPulse: null,
      ritualGuide: null,
      dailyArc: null,
      dailyArcRecap: null,
      weeklyArc: null,
      chapterMilestones: [],
      chapterRewards: [],
      weeklyPulse: null,
      timeline: [] as TimelineItem[]
    };
  }

  const selectedCompanionId = selectedCompanion.id;

  const [summaryRes, emotionalRes, careRes, checkinsRes, missionRes, gameRes, journalEntriesRes, subscriptionRes, premiumStyleRes] = await Promise.all([
    supabase
      .from('companion_memory_summary')
      .select('summary_text, highlights_json, last_built_at, source_window_json')
      .eq('user_id', userId)
      .eq('companion_id', selectedCompanionId)
      .maybeSingle(),
    supabase
      .from('companion_emotional_state')
      .select('mood, trust, bond, streak_momentum, volatility, recent_tone, last_milestone_at, updated_at')
      .eq('user_id', userId)
      .eq('companion_id', selectedCompanionId)
      .maybeSingle(),
    supabase
      .from('companion_care_events')
      .select('id, action, affection_delta, trust_delta, energy_delta, note, created_at')
      .eq('owner_id', userId)
      .eq('companion_id', selectedCompanionId)
      .order('created_at', { ascending: false })
      .limit(24),
    supabase
      .from('user_daily_checkins')
      .select('id, mood, checkin_date, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(24),
    supabase
      .from('mission_sessions')
      .select('id, mission_id, mission_type, status, started_at, completed_at')
      .eq('user_id', userId)
      .in('status', ['active', 'completed'])
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('started_at', { ascending: false })
      .limit(24),
    supabase
      .from('game_sessions')
      .select('id, game_id, status, score, duration_ms, completed_at, started_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(24),
    supabase
      .from('companion_journal_entries')
      .select('id, source_type, title, body, created_at, meta_json')
      .eq('owner_id', userId)
      .eq('companion_id', selectedCompanionId)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('user_subscriptions')
      .select('tier, status, ends_at, renewal_at, source')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_preferences')
      .select('premium_sanctuary_style')
      .eq('user_id', userId)
      .maybeSingle()
  ]);

  const subscription = subscriptionRes.data
    ? {
        tier: subscriptionRes.data.tier,
        status: subscriptionRes.data.status,
        ends_at: subscriptionRes.data.ends_at,
        renewal_at: subscriptionRes.data.renewal_at,
        source: subscriptionRes.data.source,
        active: isSubscriptionActive({
          subscription_status: subscriptionRes.data.status,
          subscription_ends_at: subscriptionRes.data.ends_at
        })
      }
    : null;
  const isSubscriber = Boolean(subscription?.active);
  const premiumSanctuaryStyle =
    isSubscriber &&
    (premiumStyleRes.data?.premium_sanctuary_style === 'gilded_dawn' ||
      premiumStyleRes.data?.premium_sanctuary_style === 'moon_glass' ||
      premiumStyleRes.data?.premium_sanctuary_style === 'ember_bloom' ||
      premiumStyleRes.data?.premium_sanctuary_style === 'tide_silk')
      ? (premiumStyleRes.data.premium_sanctuary_style as PremiumSanctuaryStyle)
      : null;

  const missionRows = (missionRes.data ?? []) as MissionSessionRow[];
  const missionIds = missionRows
    .map((row) => row.mission_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const missionTitlesRes =
    missionIds.length > 0
      ? await supabase.from('missions').select('id, title').in('id', missionIds)
      : { data: [] as MissionTitleRow[] };
  const missionTitles = new Map(
    ((missionTitlesRes.data ?? []) as MissionTitleRow[]).map((row) => [row.id, row.title ?? 'Mission'])
  );

  const gameRows = (gameRes.data ?? []) as GameSessionRow[];
  const gameIds = [...new Set(gameRows.map((row) => row.game_id).filter(Boolean))];
  const gameTitlesRes =
    gameIds.length > 0
      ? await supabase.from('game_titles').select('id, slug, name').in('id', gameIds)
      : { data: [] as GameTitleRow[] };
  const gameTitles = new Map(
    ((gameTitlesRes.data ?? []) as GameTitleRow[]).map((row) => [row.id, row])
  );

  const summary = (summaryRes.data as MemorySummaryRow | null) ?? null;
  const emotionalRow = (emotionalRes.data as EmotionalStateRow | null) ?? null;
  const emotionalState: EmotionalStateSnapshot =
    emotionalRow
      ? {
          mood: emotionalRow.mood === 'luminous' || emotionalRow.mood === 'dim' ? emotionalRow.mood : 'steady',
          trust: emotionalRow.trust ?? 0,
          bond: emotionalRow.bond ?? 0,
          streakMomentum: emotionalRow.streak_momentum ?? 0,
          volatility: emotionalRow.volatility ?? 0,
          recentTone: emotionalRow.recent_tone ?? null,
          lastMilestoneAt: emotionalRow.last_milestone_at ?? null
        }
      : deriveEmotionalStateFromCompanionStats({
          affection: selectedCompanion.affection,
          trust: selectedCompanion.trust,
          energy: selectedCompanion.energy,
          mood: selectedCompanion.mood
        });

  const timeline: TimelineItem[] = [];

  if (summary?.summary_text && summary.last_built_at) {
    timeline.push({
      id: `memory-${selectedCompanionId}`,
      kind: 'memory',
      title: 'Memory refreshed',
      body: summary.summary_text,
      occurredAt: summary.last_built_at,
      meta:
        typeof summary.source_window_json?.windowDays === 'number'
          ? `Built from the last ${summary.source_window_json.windowDays} days`
          : null
    });
  }

  for (const row of (careRes.data ?? []) as CareEventRow[]) {
    const meta = [
      formatDelta(row.affection_delta, 'affection'),
      formatDelta(row.trust_delta, 'trust'),
      formatDelta(row.energy_delta, 'energy')
    ]
      .filter(Boolean)
      .join(' · ');

    timeline.push({
      id: `care-${row.id}`,
      kind: 'care',
      title: row.note?.trim() || `${formatMood(row.action)} ritual`,
      body: row.note?.trim() || 'You spent time tending to your companion.',
      occurredAt: row.created_at,
      meta: meta || null
    });
  }

  for (const row of (checkinsRes.data ?? []) as CheckinRow[]) {
    timeline.push({
      id: `checkin-${row.id}`,
      kind: 'checkin',
      title: `Check-in: ${formatMood(row.mood)}`,
      body: `You checked in on ${row.checkin_date}.`,
      occurredAt: row.created_at,
      meta: null
    });
  }

  for (const row of missionRows) {
    const occurredAt = row.completed_at ?? row.started_at;
    if (!occurredAt) continue;
    const missionTitle = (row.mission_id && missionTitles.get(row.mission_id)) || 'Mission';
    timeline.push({
      id: `mission-${row.id}`,
      kind: 'mission',
      title: row.status === 'completed' ? `Mission completed: ${missionTitle}` : `Mission started: ${missionTitle}`,
      body:
        row.status === 'completed'
          ? 'A meaningful step was completed in your arc.'
          : 'A new mission thread was opened.',
      occurredAt,
      meta: row.mission_type ? `${formatMood(row.mission_type)} mission` : null
    });
  }

  for (const row of gameRows) {
    const occurredAt = row.completed_at ?? row.started_at;
    if (!occurredAt) continue;
    const game = gameTitles.get(row.game_id);
    timeline.push({
      id: `game-${row.id}`,
      kind: 'game',
      title: `Game completed: ${game?.name ?? 'Game session'}`,
      body:
        typeof row.score === 'number'
          ? `You finished with a score of ${row.score.toLocaleString()}.`
          : 'A play session was completed.',
      occurredAt,
      meta: formatDuration(row.duration_ms)
    });
  }

  for (const row of (journalEntriesRes.data ?? []) as JournalEntryRow[]) {
    const body = clipText(row.body ?? 'A companion moment was captured.');
    const isSocial =
      row.source_type === 'message' || row.source_type === 'circle_announcement' || row.source_type === 'post';
    const generatedBy = row.meta_json?.generatedBy ?? null;
    const sourceLabel =
      row.source_type === 'message'
        ? row.meta_json?.conversationType === 'circle'
          ? 'Circle message'
          : 'Message'
        : row.source_type === 'circle_announcement'
          ? 'Circle'
          : row.source_type === 'post'
            ? 'Post'
            : generatedBy === 'chapter_reward_reveal'
              ? 'Chapter reveal'
            : 'Moment';
    timeline.push({
      id: `social-${row.id}`,
      kind: isSocial ? 'social' : 'memory',
      title:
        generatedBy === 'chapter_reward_reveal'
          ? row.title?.trim() || `${selectedCompanion.name} revealed a keepsake`
          : row.title?.trim() || 'Shared moment',
      body,
      occurredAt: row.created_at,
      meta: sourceLabel
    });
  }

  timeline.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  const careRows = (careRes.data ?? []) as CareEventRow[];
  const checkinRows = (checkinsRes.data ?? []) as CheckinRow[];
  const relationshipPulse = buildRelationshipReasons({
    companion: selectedCompanion,
    emotionalState,
    summary,
    careRows,
    missionRows,
    gameRows,
    checkins: checkinRows
  });
  const weeklyPulse = buildWeeklyPulse({
    careRows,
    missionRows,
    gameRows,
    checkins: checkinRows,
    summary,
    socialMoments: timeline.filter((item) => item.kind === 'social' && (toStamp(item.occurredAt) ?? 0) >= Date.now() - 7 * 24 * 60 * 60 * 1000)
      .length
  });
  const patternNotice = deriveCompanionPatternNotice({
    companionName: selectedCompanion.name,
    careMoments: careRows.length,
    missionMoments: missionRows.filter((row) => row.status === 'completed').length,
    gameMoments: gameRows.length,
    socialMoments: timeline.filter((item) => item.kind === 'social').length,
    checkins: checkinRows.length
  });
  const hasStoredPatternNotice = ((journalEntriesRes.data ?? []) as JournalEntryRow[]).some(
    (row) => row.source_type === 'system'
  );
  const ritualGuide = deriveRitualGuideFromPattern(patternNotice, selectedCompanion.name);
  const dailyArc = deriveDailyCompanionArc({
    companionName: selectedCompanion.name,
    hasDailyCheckin: checkinRows.length > 0,
    rituals: [],
    hasSocialMoment: timeline.some((item) => item.kind === 'social'),
    hasJournalMoment: Boolean(summary?.summary_text || timeline.length > 0)
  });
  const weeklyArc = deriveWeeklyCompanionArc({
    companionName: selectedCompanion.name,
    careMoments: weeklyPulse.careMoments,
    missionMoments: weeklyPulse.missionMoments,
    gameMoments: weeklyPulse.gameMoments,
    socialMoments: weeklyPulse.socialMoments,
    checkins: weeklyPulse.recentCheckins
  });
  const selectedStats = normalizeStats(selectedCompanion.stats);
  const chapterMilestones = deriveChapterMilestones({
    companionName: selectedCompanion.name,
    bondLevel: Math.max(0, Math.floor(selectedStats?.bond_level ?? 0)),
    trust: selectedCompanion.trust ?? 0,
    affection: selectedCompanion.affection ?? 0,
    weeklyArc,
    patternNotice
  });
  const chapterRewards = await unlockChapterRewards(supabase, {
    ownerId: userId,
    companionId: selectedCompanionId,
    companionName: selectedCompanion.name,
    rewards: deriveChapterRewards({
      companionName: selectedCompanion.name,
      milestones: chapterMilestones,
      weeklyArc,
      trust: selectedCompanion.trust ?? 0,
      affection: selectedCompanion.affection ?? 0
    })
  });
  const featuredKeepsakePreferenceRes = await supabase
    .from('user_preferences')
    .select('featured_companion_reward_key, featured_companion_reward_companion_id')
    .eq('user_id', userId)
    .maybeSingle();
  const featuredRewardKey =
    typeof featuredKeepsakePreferenceRes.data?.featured_companion_reward_key === 'string'
      ? featuredKeepsakePreferenceRes.data.featured_companion_reward_key
      : null;
  const featuredRewardCompanionId =
    typeof featuredKeepsakePreferenceRes.data?.featured_companion_reward_companion_id === 'string'
      ? featuredKeepsakePreferenceRes.data.featured_companion_reward_companion_id
      : null;
  const featuredKeepsake =
    featuredRewardCompanionId === selectedCompanionId && featuredRewardKey
      ? chapterRewards.find((reward) => reward.rewardKey === featuredRewardKey) ?? null
      : null;
  const keepsakeInterpretation = buildKeepsakeInterpretation({
    companionName: selectedCompanion.name,
    reward: featuredKeepsake
      ? {
          title: featuredKeepsake.title,
          tone: featuredKeepsake.tone
        }
      : null
  });
  const dailyArcRecap = (
    await syncDailyCompanionArcProgress(supabase, {
      ownerId: userId,
      companionId: selectedCompanionId,
      companionName: selectedCompanion.name,
      arc: dailyArc,
      premiumStyle: premiumSanctuaryStyle,
      chapter: featuredKeepsake
        ? {
            title: featuredKeepsake.title,
            tone: featuredKeepsake.tone
          }
        : null
    })
  ).recap;
  const chapterDigest = deriveCompanionChapterDigest({
    companionName: selectedCompanion.name,
    chapter: featuredKeepsake
      ? {
          title: featuredKeepsake.title,
          tone: featuredKeepsake.tone
        }
      : null,
    weeklyArc,
    careMoments: weeklyPulse.careMoments,
    missionMoments: weeklyPulse.missionMoments,
    gameMoments: weeklyPulse.gameMoments,
    socialMoments: weeklyPulse.socialMoments,
    checkins: weeklyPulse.recentCheckins
  });
  const chapterDigestResult = await ensureCompanionChapterDigest(supabase, {
    ownerId: userId,
    companionId: selectedCompanionId,
    digest: chapterDigest,
    chapterTitle: featuredKeepsake?.title ?? weeklyArc.title
  });
  void ensureCompanionPatternNotice(supabase, {
    ownerId: userId,
    companionId: selectedCompanionId,
    notice: patternNotice
  });

  if (patternNotice && !hasStoredPatternNotice) {
    timeline.push({
      id: `noticed-${patternNotice.patternKey}`,
      kind: 'memory',
      title: patternNotice.title,
      body: patternNotice.body,
      occurredAt: new Date().toISOString(),
      meta: 'Noticed by companion'
    });
    timeline.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  }

  if (chapterDigestResult.ok && chapterDigestResult.created && chapterDigestResult.digest) {
    timeline.push({
      id: `digest-${chapterDigestResult.digest.digestKey}`,
      kind: 'memory',
      title: chapterDigestResult.digest.title,
      body: chapterDigestResult.digest.body,
      occurredAt: new Date().toISOString(),
      meta: 'Chapter digest'
    });
    timeline.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  }

  const chapterHistory = ((journalEntriesRes.data ?? []) as JournalEntryRow[])
    .filter((row) => row.meta_json?.generatedBy === 'chapter_reward_reveal')
    .map((row) => ({
      id: row.id,
      title: row.title?.trim() || `${selectedCompanion.name} opened a chapter`,
      body: clipText(row.body ?? ''),
      occurredAt: row.created_at,
      tone:
        row.meta_json?.rewardTone === 'care' ||
        row.meta_json?.rewardTone === 'social' ||
        row.meta_json?.rewardTone === 'mission' ||
        row.meta_json?.rewardTone === 'play' ||
        row.meta_json?.rewardTone === 'bond'
          ? row.meta_json.rewardTone
          : 'bond'
    })) as ChapterHistoryEntry[];
  const relationshipEras = buildRelationshipEras({
    companionName: selectedCompanion.name,
    weeklyArc,
    chapterHistory,
    featuredKeepsake: featuredKeepsake
      ? {
          title: featuredKeepsake.title,
          tone: featuredKeepsake.tone
        }
      : null
  });
  const journalGuidance = buildJournalGuidance({
    companionName: selectedCompanion.name,
    weeklyArc,
    featuredKeepsake: featuredKeepsake
      ? {
          title: featuredKeepsake.title,
          tone: featuredKeepsake.tone
        }
      : null,
    ritualGuide
  });
  const premiumChapterInsight = buildPremiumChapterInsight({
    companionName: selectedCompanion.name,
    weeklyArc,
    relationshipPulse,
    weeklyPulse,
    chapterHistory,
    featuredKeepsake: featuredKeepsake
      ? {
          title: featuredKeepsake.title,
          tone: featuredKeepsake.tone
        }
      : null
  });
  const timelineLimit = isSubscriber ? 90 : 30;
  const chapterHistoryLimit = isSubscriber ? 18 : 6;
  const relationshipEraLimit = isSubscriber ? 6 : 4;
  const archivedMoments = Math.max(0, timeline.length - timelineLimit);
  const archivedOpenings = Math.max(0, chapterHistory.length - chapterHistoryLimit);

  return {
    companions,
    selectedCompanionId,
    selectedCompanion,
    summary,
    emotionalState,
    relationshipPulse,
    ritualGuide,
    journalGuidance,
    dailyArc,
    dailyArcRecap,
    weeklyArc,
    chapterMilestones,
    chapterRewards,
    subscription,
    premiumSanctuaryStyle,
    premiumChapterInsight,
    featuredKeepsake,
    keepsakeInterpretation,
    weeklyPulse,
    chapterHistory: chapterHistory.slice(0, chapterHistoryLimit),
    relationshipEras: relationshipEras.slice(0, relationshipEraLimit),
    timeline: timeline.slice(0, timelineLimit),
    premiumArchivePreview: {
      archivedMoments,
      archivedOpenings,
      timelineLimit,
      chapterHistoryLimit
    }
  };
};
