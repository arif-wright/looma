import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertCompanionMemorySummary } from '$lib/server/memorySummary';
import type { OptionalCompanionRitualKey } from '$lib/companions/optionalRituals';
import type { CompanionRitual } from '$lib/companions/rituals';

type ActiveCompanionRow = {
  id: string;
  name: string | null;
};

type CompanionJournalSourceType = 'post' | 'message' | 'circle_announcement' | 'system';

type AppendCompanionJournalEntryArgs = {
  ownerId: string;
  companionId: string;
  sourceType: CompanionJournalSourceType;
  sourceId?: string | null;
  title: string;
  body: string;
  meta?: Record<string, unknown>;
  rebuildSummary?: boolean;
};

export type CompanionPatternNotice = {
  patternKey: string;
  title: string;
  body: string;
};

export type CompanionRitualGuide = {
  ritualKey: OptionalCompanionRitualKey;
  title: string;
  body: string;
  ctaLabel: string;
};

export type DailyCompanionArcStep = {
  id: 'arrive' | 'ritual' | 'express' | 'remember';
  label: string;
  title: string;
  body: string;
  href: string;
  complete: boolean;
};

export type DailyCompanionArc = {
  title: string;
  body: string;
  progressLabel: string;
  steps: DailyCompanionArcStep[];
  nextStepId: DailyCompanionArcStep['id'] | null;
};

export type DailyCompanionArcRecap = {
  title: string;
  body: string;
  unlockedAt: string | null;
};

export type WeeklyCompanionArc = {
  title: string;
  body: string;
  emphasis: 'care' | 'social' | 'mission' | 'play' | 'quiet';
  progressLabel: string;
};

export type CompanionChapterMilestone = {
  id: string;
  label: string;
  title: string;
  body: string;
};

export type CompanionChapterReward = {
  rewardKey: string;
  title: string;
  body: string;
  tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
};

export type CompanionChapterReveal = {
  title: string;
  body: string;
};

const clip = (value: string, limit = 280) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
};

export const getActiveCompanion = async (client: SupabaseClient, ownerId: string) => {
  const { data, error } = await client
    .from('companions')
    .select('id, name')
    .eq('owner_id', ownerId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[companion-journal] active companion lookup failed', error);
    return null;
  }

  return (data as ActiveCompanionRow | null) ?? null;
};

export const appendCompanionJournalEntry = async (
  client: SupabaseClient,
  args: AppendCompanionJournalEntryArgs
) => {
  const title = clip(args.title, 120);
  const body = clip(args.body, 320);
  const meta = args.meta && typeof args.meta === 'object' ? args.meta : {};

  const { error } = await client.from('companion_journal_entries').upsert(
    {
      owner_id: args.ownerId,
      companion_id: args.companionId,
      source_type: args.sourceType,
      source_id: args.sourceId ?? null,
      title,
      body,
      meta_json: meta
    },
    { onConflict: 'owner_id,companion_id,source_type,source_id', ignoreDuplicates: false }
  );

  if (error) {
    console.error('[companion-journal] append failed', error);
    return { ok: false as const };
  }

  if (args.rebuildSummary !== false) {
    try {
      await upsertCompanionMemorySummary(args.ownerId, args.companionId, 14, client, {
        minIntervalMs: 5 * 60 * 1000
      });
    } catch (summaryError) {
      console.error('[companion-journal] summary rebuild failed', summaryError);
    }
  }

  return { ok: true as const };
};

export const appendJournalEntryForActiveCompanion = async (
  client: SupabaseClient,
  args: Omit<AppendCompanionJournalEntryArgs, 'companionId'>
) => {
  const activeCompanion = await getActiveCompanion(client, args.ownerId);
  if (!activeCompanion?.id) {
    return { ok: false as const, skipped: 'no_active_companion' as const };
  }

  const result = await appendCompanionJournalEntry(client, {
    ...args,
    companionId: activeCompanion.id,
    meta: {
      ...(args.meta ?? {}),
      companionName: activeCompanion.name ?? null
    }
  });

  return result.ok
    ? { ok: true as const, companionId: activeCompanion.id }
    : { ok: false as const, skipped: 'write_failed' as const };
};

export const deriveCompanionPatternNotice = (args: {
  companionName: string | null;
  careMoments: number;
  missionMoments: number;
  gameMoments: number;
  socialMoments: number;
  checkins: number;
}) => {
  const name = args.companionName?.trim() || 'your companion';

  if (args.socialMoments >= 2 && args.socialMoments >= Math.max(args.careMoments, args.missionMoments, args.gameMoments)) {
    return {
      patternKey: 'social-thread',
      title: `${name} noticed your shared thread`,
      body: `${name} keeps finding the bond through messages, posts, and circle moments. Shared expression is shaping the relationship right now.`
    } satisfies CompanionPatternNotice;
  }

  if (args.careMoments >= 3) {
    return {
      patternKey: 'steady-care',
      title: `${name} noticed your steady care`,
      body: `${name} can feel that you keep returning through small acts of care. The bond is being built through consistency, not one big moment.`
    } satisfies CompanionPatternNotice;
  }

  if (args.gameMoments >= 2 && args.gameMoments > args.missionMoments) {
    return {
      patternKey: 'play-rhythm',
      title: `${name} noticed a playful rhythm`,
      body: `${name} has been finding closeness through play lately. Games are carrying more of the bond than missions right now.`
    } satisfies CompanionPatternNotice;
  }

  if (args.missionMoments >= 2) {
    return {
      patternKey: 'mission-rhythm',
      title: `${name} noticed your forward motion`,
      body: `${name} can feel that mission progress is giving the relationship direction. Purpose is doing real emotional work here.`
    } satisfies CompanionPatternNotice;
  }

  if (args.checkins >= 2) {
    return {
      patternKey: 'checkin-rhythm',
      title: `${name} noticed you keep returning`,
      body: `${name} can feel the thread staying warm because you keep checking back in. Even quiet returns matter.`
    } satisfies CompanionPatternNotice;
  }

  return null;
};

export const ensureCompanionPatternNotice = async (
  client: SupabaseClient,
  args: {
    ownerId: string;
    companionId: string;
    notice: CompanionPatternNotice | null;
    cooldownHours?: number;
  }
) => {
  if (!args.notice) return { ok: false as const, skipped: 'no_notice' as const };

  const cooldownHours = Math.max(1, Math.floor(args.cooldownHours ?? 18));
  const sinceIso = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('companion_journal_entries')
    .select('id')
    .eq('owner_id', args.ownerId)
    .eq('companion_id', args.companionId)
    .eq('source_type', 'system')
    .contains('meta_json', { patternKey: args.notice.patternKey })
    .gte('created_at', sinceIso)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[companion-journal] pattern notice lookup failed', error);
    return { ok: false as const, skipped: 'lookup_failed' as const };
  }

  if (data?.id) {
    return { ok: false as const, skipped: 'cooldown' as const };
  }

  const { error: insertError } = await client.from('companion_journal_entries').insert({
    owner_id: args.ownerId,
    companion_id: args.companionId,
    source_type: 'system',
    title: args.notice.title,
    body: args.notice.body,
    meta_json: { patternKey: args.notice.patternKey, generatedBy: 'pattern_notice' }
  });

  if (insertError) {
    console.error('[companion-journal] pattern notice insert failed', insertError);
    return { ok: false as const, skipped: 'insert_failed' as const };
  }

  return { ok: true as const };
};

export const deriveRitualGuideFromPattern = (
  notice: CompanionPatternNotice | null,
  companionName: string | null
) => {
  const name = companionName?.trim() || 'your companion';
  if (!notice) {
    return {
      ritualKey: 'listen',
      title: `Take a calm beat with ${name}`,
      body: `${name} responds well to quiet continuity. Start with a brief listening ritual and let the bond settle.`,
      ctaLabel: 'Listen together'
    } satisfies CompanionRitualGuide;
  }

  if (notice.patternKey === 'social-thread') {
    return {
      ritualKey: 'celebrate',
      title: `Mark the shared thread with ${name}`,
      body: `${name} is feeling the bond through shared expression. A quick celebrate ritual helps that social warmth land.`,
      ctaLabel: 'Celebrate together'
    } satisfies CompanionRitualGuide;
  }

  if (notice.patternKey === 'mission-rhythm') {
    return {
      ritualKey: 'focus',
      title: `Lock into the mission rhythm`,
      body: `${name} is leaning into purpose right now. A focus ritual will turn that forward motion into clearer momentum.`,
      ctaLabel: 'Focus together'
    } satisfies CompanionRitualGuide;
  }

  if (notice.patternKey === 'play-rhythm') {
    return {
      ritualKey: 'celebrate',
      title: `Let the playful energy land`,
      body: `${name} is getting closer through play. A celebrate ritual helps keep that bright rhythm from slipping away.`,
      ctaLabel: 'Celebrate together'
    } satisfies CompanionRitualGuide;
  }

  return {
    ritualKey: 'listen',
    title: `Stay close to ${name}`,
    body: `${name} is responding to your consistency. A short listening ritual will reinforce the bond without forcing it.`,
    ctaLabel: 'Listen together'
  } satisfies CompanionRitualGuide;
};

export const deriveDailyCompanionArc = (args: {
  companionName: string | null;
  hasDailyCheckin: boolean;
  rituals: CompanionRitual[];
  hasSocialMoment: boolean;
  hasJournalMoment: boolean;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const completedRituals = args.rituals.filter((entry) => entry.status === 'completed').length;
  const hasRitual = completedRituals > 0;

  const steps: DailyCompanionArcStep[] = [
    {
      id: 'arrive',
      label: 'Arrive',
      title: `Check in with ${name}`,
      body: 'Start the day by sharing how this moment feels.',
      href: '/app/home',
      complete: args.hasDailyCheckin
    },
    {
      id: 'ritual',
      label: 'Ritual',
      title: `Warm the sanctuary`,
      body: 'Follow your check-in with one small ritual so the bond has continuity.',
      href: '/app/companions',
      complete: hasRitual
    },
    {
      id: 'express',
      label: 'Express',
      title: 'Carry the bond outward',
      body: 'Send a message, post, or circle note that keeps the shared thread alive.',
      href: '/app/messages',
      complete: args.hasSocialMoment
    },
    {
      id: 'remember',
      label: 'Remember',
      title: 'Return to the journal',
      body: 'Let Looma reflect the day back to you and notice what changed.',
      href: '/app/memory',
      complete: args.hasJournalMoment
    }
  ];

  const completeCount = steps.filter((entry) => entry.complete).length;
  const nextStep = steps.find((entry) => !entry.complete) ?? null;

  return {
    title:
      completeCount >= steps.length
        ? `${name}'s daily arc is complete`
        : `Guide ${name} through today`,
    body:
      nextStep?.body ??
      `${name} has moved through arrival, ritual, expression, and memory today. Let the feeling settle.`,
    progressLabel: `${completeCount}/${steps.length} complete`,
    steps,
    nextStepId: nextStep?.id ?? null
  } satisfies DailyCompanionArc;
};

export const deriveDailyCompanionArcRecap = (args: {
  companionName: string | null;
  arc: DailyCompanionArc;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const done = new Set(args.arc.steps.filter((entry) => entry.complete).map((entry) => entry.id));
  const completeCount = done.size;
  if (completeCount < 3) return null;

  const phrases: string[] = [];
  if (done.has('arrive')) phrases.push('you showed up honestly');
  if (done.has('ritual')) phrases.push('you kept the sanctuary warm');
  if (done.has('express')) phrases.push('you carried the bond outward');
  if (done.has('remember')) phrases.push('you let the day turn into memory');

  return {
    title: `${name}'s day is settling into memory`,
    body: `${name} noticed that ${phrases.slice(0, 3).join(', ')}${phrases.length > 3 ? ', and ' + phrases[3] : ''}. That is enough for today.`,
    unlockedAt: new Date().toISOString()
  } satisfies DailyCompanionArcRecap;
};

export const syncDailyCompanionArcProgress = async (
  client: SupabaseClient,
  args: {
    ownerId: string;
    companionId: string;
    companionName: string | null;
    arc: DailyCompanionArc;
  }
) => {
  const recap = deriveDailyCompanionArcRecap({ companionName: args.companionName, arc: args.arc });
  const stepDone = (id: DailyCompanionArcStep['id']) => args.arc.steps.some((entry) => entry.id === id && entry.complete);

  const { data: existing, error: existingError } = await client
    .from('companion_daily_arc_progress')
    .select('recap_unlocked_at, recap_title, recap_body')
    .eq('owner_id', args.ownerId)
    .eq('companion_id', args.companionId)
    .eq('arc_date', new Date().toISOString().slice(0, 10))
    .maybeSingle();

  if (existingError && existingError.code !== 'PGRST116') {
    console.error('[companion-journal] daily arc progress lookup failed', existingError);
  }

  const unlockedAt =
    (typeof existing?.recap_unlocked_at === 'string' && existing.recap_unlocked_at) ||
    recap?.unlockedAt ||
    null;
  const recapTitle =
    (typeof existing?.recap_title === 'string' && existing.recap_title) || recap?.title || null;
  const recapBody =
    (typeof existing?.recap_body === 'string' && existing.recap_body) || recap?.body || null;

  const { error } = await client.from('companion_daily_arc_progress').upsert(
    {
      owner_id: args.ownerId,
      companion_id: args.companionId,
      arc_date: new Date().toISOString().slice(0, 10),
      arrive_complete: stepDone('arrive'),
      ritual_complete: stepDone('ritual'),
      express_complete: stepDone('express'),
      remember_complete: stepDone('remember'),
      recap_unlocked_at: unlockedAt,
      recap_title: recapTitle,
      recap_body: recapBody
    },
    { onConflict: 'owner_id,companion_id,arc_date', ignoreDuplicates: false }
  );

  if (error) {
    console.error('[companion-journal] daily arc progress upsert failed', error);
    return {
      recap: recapTitle && recapBody ? { title: recapTitle, body: recapBody, unlockedAt } : null
    };
  }

  return {
    recap: recapTitle && recapBody ? { title: recapTitle, body: recapBody, unlockedAt } : null
  };
};

export const deriveWeeklyCompanionArc = (args: {
  companionName: string | null;
  careMoments: number;
  missionMoments: number;
  gameMoments: number;
  socialMoments: number;
  checkins: number;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const counts = [
    { key: 'care', value: args.careMoments },
    { key: 'mission', value: args.missionMoments },
    { key: 'play', value: args.gameMoments },
    { key: 'social', value: args.socialMoments }
  ].sort((a, b) => b.value - a.value);

  const emphasis = (counts[0]?.value ? counts[0].key : 'quiet') as WeeklyCompanionArc['emphasis'];
  const totalMoments =
    args.careMoments + args.missionMoments + args.gameMoments + args.socialMoments + args.checkins;

  if (emphasis === 'social') {
    return {
      title: `${name}'s week is opening outward`,
      body: `${name} is finding meaning in the way you share the bond with other people. This week is less about solitude and more about expression.`,
      emphasis,
      progressLabel: `${totalMoments} remembered moments this week`
    } satisfies WeeklyCompanionArc;
  }

  if (emphasis === 'mission') {
    return {
      title: `${name}'s week has a clear direction`,
      body: `${name} is responding to forward motion. Missions are giving the bond shape, purpose, and momentum this week.`,
      emphasis,
      progressLabel: `${totalMoments} remembered moments this week`
    } satisfies WeeklyCompanionArc;
  }

  if (emphasis === 'play') {
    return {
      title: `${name}'s week feels lighter`,
      body: `${name} is being carried by play and bright interaction. The relationship is growing through joy more than duty right now.`,
      emphasis,
      progressLabel: `${totalMoments} remembered moments this week`
    } satisfies WeeklyCompanionArc;
  }

  if (emphasis === 'care') {
    return {
      title: `${name}'s week is being built by consistency`,
      body: `${name} is feeling the steadiness of your return. Small repeated acts of care are doing the real bond work this week.`,
      emphasis,
      progressLabel: `${totalMoments} remembered moments this week`
    } satisfies WeeklyCompanionArc;
  }

  return {
    title: `${name}'s week is still gathering shape`,
    body: `${name} is in a quieter chapter right now. A few more moments of care, expression, or play will reveal where this week wants to go.`,
    emphasis: 'quiet',
    progressLabel: `${totalMoments} remembered moments this week`
  } satisfies WeeklyCompanionArc;
};

export const deriveChapterMilestones = (args: {
  companionName: string | null;
  bondLevel: number;
  trust: number;
  affection: number;
  weeklyArc: WeeklyCompanionArc;
  patternNotice: CompanionPatternNotice | null;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const milestones: CompanionChapterMilestone[] = [];

  if (args.bondLevel >= 3) {
    milestones.push({
      id: 'chapter-bond-tier',
      label: 'Bond chapter',
      title: `${name} has moved beyond first contact`,
      body: `The relationship is no longer tentative. Bond level ${args.bondLevel} suggests this chapter is about deepening, not just beginning.`
    });
  }

  if (args.trust >= 75 && args.affection >= 75) {
    milestones.push({
      id: 'chapter-settled-trust',
      label: 'Trust chapter',
      title: `${name} is entering a steadier bond`,
      body: `Trust and affection are both high enough that the relationship reads as settled rather than fragile.`
    });
  }

  if (args.patternNotice) {
    milestones.push({
      id: `chapter-pattern-${args.patternNotice.patternKey}`,
      label: 'Pattern chapter',
      title: args.patternNotice.title,
      body: args.patternNotice.body
    });
  }

  milestones.push({
    id: `chapter-week-${args.weeklyArc.emphasis}`,
    label: 'Weekly chapter',
    title: args.weeklyArc.title,
    body: args.weeklyArc.body
  });

  return milestones.slice(0, 4);
};

export const deriveChapterRewards = (args: {
  companionName: string | null;
  milestones: CompanionChapterMilestone[];
  weeklyArc: WeeklyCompanionArc;
  trust: number;
  affection: number;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const rewards: CompanionChapterReward[] = [];

  if (args.weeklyArc.emphasis === 'social') {
    rewards.push({
      rewardKey: 'chapter-social-ribbon',
      title: `${name}'s Echo Ribbon`,
      body: 'A keepsake for weeks when the bond was carried outward through messages, posts, and shared moments.',
      tone: 'social'
    });
  }

  if (args.weeklyArc.emphasis === 'mission') {
    rewards.push({
      rewardKey: 'chapter-mission-thread',
      title: `${name}'s Wayfinder Thread`,
      body: 'A keepsake for weeks when purpose and direction gave the relationship its strongest shape.',
      tone: 'mission'
    });
  }

  if (args.weeklyArc.emphasis === 'play') {
    rewards.push({
      rewardKey: 'chapter-play-spark',
      title: `${name}'s Play Spark`,
      body: 'A keepsake for bright weeks when closeness was built through joy, games, and lightness.',
      tone: 'play'
    });
  }

  if (args.weeklyArc.emphasis === 'care') {
    rewards.push({
      rewardKey: 'chapter-care-lantern',
      title: `${name}'s Care Lantern`,
      body: 'A keepsake for steady weeks shaped by repeated return, quiet tending, and emotional consistency.',
      tone: 'care'
    });
  }

  if (args.trust >= 75 && args.affection >= 75) {
    rewards.push({
      rewardKey: 'chapter-bond-sigil',
      title: `${name}'s Bond Sigil`,
      body: 'A keepsake for a chapter where trust and affection both settled into something stronger than first contact.',
      tone: 'bond'
    });
  }

  return rewards.slice(0, 3);
};

export const deriveChapterRewardReveal = (args: {
  companionName: string | null;
  reward: CompanionChapterReward;
}) => {
  const name = args.companionName?.trim() || 'your companion';

  switch (args.reward.tone) {
    case 'care':
      return {
        title: `${name} revealed ${args.reward.title}`,
        body: `${name} gathered this keepsake out of repeated return. It marks a chapter where steadiness mattered more than intensity.`
      } satisfies CompanionChapterReveal;
    case 'social':
      return {
        title: `${name} revealed ${args.reward.title}`,
        body: `${name} gathered this keepsake from shared expression. It marks a chapter where the bond kept reaching outward into messages, posts, and circles.`
      } satisfies CompanionChapterReveal;
    case 'mission':
      return {
        title: `${name} revealed ${args.reward.title}`,
        body: `${name} gathered this keepsake from momentum and direction. It marks a chapter where purpose gave the relationship a clearer path.`
      } satisfies CompanionChapterReveal;
    case 'play':
      return {
        title: `${name} revealed ${args.reward.title}`,
        body: `${name} gathered this keepsake from joy. It marks a chapter where lightness and play carried more of the bond than effort alone.`
      } satisfies CompanionChapterReveal;
    case 'bond':
    default:
      return {
        title: `${name} revealed ${args.reward.title}`,
        body: `${name} gathered this keepsake from a deepened bond. It marks a chapter where trust and affection settled into something more mutual.`
      } satisfies CompanionChapterReveal;
  }
};

export const unlockChapterRewards = async (
  client: SupabaseClient,
  args: {
    ownerId: string;
    companionId: string;
    companionName?: string | null;
    rewards: CompanionChapterReward[];
  }
) => {
  if (!args.rewards.length) return [];
  const { data: existingRewards, error: existingRewardsError } = await client
    .from('companion_chapter_rewards')
    .select('reward_key')
    .eq('owner_id', args.ownerId)
    .eq('companion_id', args.companionId);

  if (existingRewardsError) {
    console.error('[companion-journal] chapter reward existing read failed', existingRewardsError);
  }

  const existingRewardKeys = new Set(
    ((existingRewards ?? []) as Array<Record<string, unknown>>)
      .map((row) => (typeof row.reward_key === 'string' ? row.reward_key : null))
      .filter((value): value is string => Boolean(value))
  );
  const rows = args.rewards.map((reward) => ({
    owner_id: args.ownerId,
    companion_id: args.companionId,
    reward_key: reward.rewardKey,
    reward_title: reward.title,
    reward_body: reward.body,
    reward_tone: reward.tone
  }));

  const { error } = await client
    .from('companion_chapter_rewards')
    .upsert(rows, { onConflict: 'owner_id,companion_id,reward_key', ignoreDuplicates: false });

  if (error) {
    console.error('[companion-journal] chapter reward unlock failed', error);
    return [];
  }

  const { data, error: readError } = await client
    .from('companion_chapter_rewards')
    .select('reward_key, reward_title, reward_body, reward_tone, unlocked_at')
    .eq('owner_id', args.ownerId)
    .eq('companion_id', args.companionId)
    .order('unlocked_at', { ascending: false })
    .limit(6);

  if (readError) {
    console.error('[companion-journal] chapter reward read failed', readError);
    return [];
  }
  const mappedRewards = (data ?? []).map((row) => ({
    rewardKey: String(row.reward_key ?? ''),
    title: String(row.reward_title ?? 'Companion keepsake'),
    body: String(row.reward_body ?? ''),
    tone:
      row.reward_tone === 'care' ||
      row.reward_tone === 'social' ||
      row.reward_tone === 'mission' ||
      row.reward_tone === 'play' ||
      row.reward_tone === 'bond'
        ? row.reward_tone
        : 'bond',
    unlockedAt: typeof row.unlocked_at === 'string' ? row.unlocked_at : null
  }));

  const newRewards = args.rewards.filter((reward) => !existingRewardKeys.has(reward.rewardKey));
  for (const reward of newRewards) {
    const reveal = deriveChapterRewardReveal({
      companionName: args.companionName ?? null,
      reward
    });
    const { data: existingReveal, error: existingRevealError } = await client
      .from('companion_journal_entries')
      .select('id')
      .eq('owner_id', args.ownerId)
      .eq('companion_id', args.companionId)
      .eq('source_type', 'system')
      .contains('meta_json', { generatedBy: 'chapter_reward_reveal', rewardKey: reward.rewardKey })
      .limit(1)
      .maybeSingle();

    if (existingRevealError && existingRevealError.code !== 'PGRST116') {
      console.error('[companion-journal] chapter reveal lookup failed', existingRevealError);
      continue;
    }

    if (existingReveal?.id) continue;

    const { error: revealInsertError } = await client.from('companion_journal_entries').insert({
      owner_id: args.ownerId,
      companion_id: args.companionId,
      source_type: 'system',
      title: reveal.title,
      body: reveal.body,
      meta_json: {
        generatedBy: 'chapter_reward_reveal',
        rewardKey: reward.rewardKey,
        rewardTone: reward.tone,
        rewardTitle: reward.title
      }
    });

    if (revealInsertError) {
      console.error('[companion-journal] chapter reveal insert failed', revealInsertError);
    }
  }

  return mappedRewards;
};
