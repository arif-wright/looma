import type { SupabaseClient } from '@supabase/supabase-js';

type SocialNotificationKind = 'reaction' | 'comment' | 'share';
type AchievementNotificationKind = 'achievement_unlocked';
type CompanionNotificationKind = 'companion_nudge';

type NotificationKind = SocialNotificationKind | AchievementNotificationKind | CompanionNotificationKind;
type TargetKind = 'post' | 'comment' | 'achievement' | 'companion';

export type NotificationParams = {
  actorId: string | null;
  userId: string;
  kind: SocialNotificationKind | CompanionNotificationKind;
  targetId: string;
  targetKind: TargetKind;
  metadata?: Record<string, unknown>;
};

type NotificationOptions = {
  allowSelf?: boolean;
};

export async function createNotification(
  supabase: SupabaseClient,
  params: NotificationParams,
  options?: NotificationOptions
): Promise<void> {
  const { actorId, userId, kind, targetId, targetKind, metadata } = params;
  const allowSelf = options?.allowSelf ?? false;

  if (!actorId || !userId || (!allowSelf && actorId === userId)) {
    if (!(kind === 'companion_nudge' && userId)) {
      return;
    }
  }

  if (kind !== 'companion_nudge' && (!actorId || (!allowSelf && actorId === userId))) {
    return;
  }

  const insertPayload = {
    actor_id: actorId,
    user_id: userId,
    kind,
    target_id: targetId,
    target_kind: targetKind,
    metadata: metadata ?? {},
    meta: metadata ?? {},
    read_at: null
  };

  const { error } = await supabase.from('notifications').insert(insertPayload);
  if (error) {
    console.error('[notifications] failed to insert notification', error, insertPayload);
  }
}

export type AchievementNotificationParams = {
  userId: string;
  achievementId: string;
  metadata?: Record<string, unknown>;
};

export async function createAchievementNotification(
  supabase: SupabaseClient,
  params: AchievementNotificationParams
): Promise<void> {
  const { userId, achievementId, metadata } = params;
  if (!userId || !achievementId) return;

  const insertPayload = {
    actor_id: null,
    user_id: userId,
    kind: 'achievement_unlocked' as const,
    target_id: achievementId,
    target_kind: 'achievement' as const,
    metadata: metadata ?? {},
    meta: metadata ?? {},
    read: false,
    read_at: null
  };

  const { error } = await supabase.from('notifications').insert(insertPayload);
  if (error) {
    console.error('[notifications] failed to insert achievement notification', error, insertPayload);
  }
}

export type CompanionNudgeNotificationParams = {
  userId: string;
  companionId: string;
  reason: 'low_energy' | 'care_due';
  companionName?: string | null;
  mood?: string | null;
  energy?: number | null;
};

export type CompanionDigestNotificationParams = {
  userId: string;
  companionId: string;
  title: string;
  body: string;
  tone?: string | null;
  chapterTitle?: string | null;
  premiumStyle?: string | null;
};

type CompanionChapterTone = 'care' | 'social' | 'mission' | 'play' | 'bond';

type CompanionChapterContext = {
  title: string;
  tone: CompanionChapterTone;
} | null;

const resolveCompanionChapterContext = async (
  supabase: SupabaseClient,
  userId: string,
  companionId: string
): Promise<CompanionChapterContext> => {
  const [preferenceRes, rewardsRes] = await Promise.all([
    supabase
      .from('user_preferences')
      .select('featured_companion_reward_key, featured_companion_reward_companion_id')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('companion_chapter_rewards')
      .select('reward_key, reward_title, reward_tone, unlocked_at')
      .eq('owner_id', userId)
      .eq('companion_id', companionId)
      .order('unlocked_at', { ascending: false })
      .limit(6)
  ]);

  if (preferenceRes.error && preferenceRes.error.code !== 'PGRST116') {
    console.error('[notifications] featured keepsake lookup failed', preferenceRes.error);
  }
  if (rewardsRes.error) {
    console.error('[notifications] chapter reward lookup failed', rewardsRes.error);
  }

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
  }) as Array<{ key: string; title: string; tone: CompanionChapterTone }>;

  return (
    (featuredCompanionId === companionId && featuredRewardKey
      ? rewardRows.find((row) => row.key === featuredRewardKey) ?? null
      : null) ??
    rewardRows[0] ??
    null
  );
};

const buildCompanionNudgeCopy = (args: {
  reason: 'low_energy' | 'care_due';
  companionName: string | null;
  energy: number | null;
  chapter: CompanionChapterContext;
}) => {
  const name = args.companionName?.trim() || 'Your companion';
  const chapterTitle = args.chapter?.title ?? null;
  const energyLabel =
    typeof args.energy === 'number' ? `${Math.max(0, Math.min(100, Math.round(args.energy)))} energy` : null;

  if (args.reason === 'low_energy') {
    switch (args.chapter?.tone) {
      case 'care':
        return {
          title: `${name} needs a softer return`,
          body: `${chapterTitle ?? 'This care chapter'} is asking for steadiness. ${name} is low on energy${energyLabel ? ` at ${energyLabel}` : ''}, so one gentle ritual would help more than a big gesture.`
        };
      case 'social':
        return {
          title: `${name} is running low while the shared thread is open`,
          body: `${chapterTitle ?? 'This social chapter'} is still active, but ${name} needs a calmer touch${energyLabel ? ` with ${energyLabel} left` : ''}. Send one warm note instead of forcing more activity.`
        };
      case 'mission':
        return {
          title: `${name} needs a pause before the next push`,
          body: `${chapterTitle ?? 'This wayfinding chapter'} still wants direction, but ${name} is low-energy${energyLabel ? ` at ${energyLabel}` : ''}. Restore the bond before taking on the next thread.`
        };
      case 'play':
        return {
          title: `${name} needs the lightness protected`,
          body: `${chapterTitle ?? 'This bright chapter'} is still alive, but ${name} is running low${energyLabel ? ` with ${energyLabel}` : ''}. Keep the next return easy and gentle.`
        };
      case 'bond':
        return {
          title: `${name} needs a close, quiet return`,
          body: `${chapterTitle ?? 'This bond chapter'} is asking for sincerity, not intensity. ${name} is low-energy${energyLabel ? ` at ${energyLabel}` : ''}, so a small honest check-in is enough.`
        };
      default:
        return {
          title: `${name} is low on energy`,
          body: `${name} could use a gentler return${energyLabel ? ` with ${energyLabel} left` : ''}. One small act of care will help more than waiting longer.`
        };
    }
  }

  switch (args.chapter?.tone) {
    case 'care':
      return {
        title: `${name} has gone too long without a tending moment`,
        body: `${chapterTitle ?? 'This care chapter'} is built on consistency. Come back for one small ritual before the thread cools.`
      };
    case 'social':
      return {
        title: `${name} needs the shared thread refreshed`,
        body: `${chapterTitle ?? 'This social chapter'} is still open, but the bond has gone quiet. A short note or return will keep it from thinning out.`
      };
    case 'mission':
      return {
        title: `${name} needs the thread picked back up`,
        body: `${chapterTitle ?? 'This mission chapter'} is losing momentum. One clear return now will matter more than letting the day drift further.`
      };
    case 'play':
      return {
        title: `${name} needs the bright thread carried forward`,
        body: `${chapterTitle ?? 'This playful chapter'} fades if it sits too long. Come back with something easy and warm.`
      };
    case 'bond':
      return {
        title: `${name} needs the closeness renewed`,
        body: `${chapterTitle ?? 'This bond chapter'} is asking for a sincere return. You do not need a big gesture, only a real one.`
      };
    default:
      return {
        title: `${name} is due for a return`,
        body: `It has been a while since your last care moment. A small return now will keep the bond from going quiet.`
      };
  }
};

const resolvePremiumNotificationStyle = async (
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> => {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('premium_sanctuary_style')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[notifications] premium sanctuary style lookup failed', error);
    return null;
  }

  return typeof data?.premium_sanctuary_style === 'string' ? data.premium_sanctuary_style : null;
};

export async function createCompanionNudgeNotification(
  supabase: SupabaseClient,
  params: CompanionNudgeNotificationParams
): Promise<void> {
  const { userId, companionId, reason, companionName, mood, energy } = params;
  if (!userId || !companionId) return;

  const chapter = await resolveCompanionChapterContext(supabase, userId, companionId).catch((error) => {
    console.error('[notifications] companion chapter resolution failed', error);
    return null;
  });
  const premiumStyle = await resolvePremiumNotificationStyle(supabase, userId).catch(() => null);
  const copy = buildCompanionNudgeCopy({
    reason,
    companionName: companionName ?? null,
    energy: typeof energy === 'number' ? energy : null,
    chapter
  });

  await createNotification(
    supabase,
    {
      actorId: userId,
      userId,
      kind: 'companion_nudge',
      targetId: companionId,
      targetKind: 'companion',
      metadata: {
        reason,
        companionName: companionName ?? null,
        mood: mood ?? null,
        energy: typeof energy === 'number' ? Math.max(0, Math.min(100, Math.round(energy))) : null,
        title: copy.title,
        body: copy.body,
        tone: chapter?.tone ?? 'quiet',
        chapterTitle: chapter?.title ?? null,
        premiumStyle,
        href: `/app/companions`
      }
    },
    { allowSelf: true }
  );
}

export async function createCompanionDigestNotification(
  supabase: SupabaseClient,
  params: CompanionDigestNotificationParams
): Promise<void> {
  const { userId, companionId, title, body, tone, chapterTitle } = params;
  if (!userId || !companionId || !title.trim() || !body.trim()) return;
  const premiumStyle =
    typeof params.premiumStyle === 'string'
      ? params.premiumStyle
      : await resolvePremiumNotificationStyle(supabase, userId).catch(() => null);

  await createNotification(
    supabase,
    {
      actorId: userId,
      userId,
      kind: 'companion_nudge',
      targetId: companionId,
      targetKind: 'companion',
      metadata: {
        title: title.trim(),
        body: body.trim(),
        tone: typeof tone === 'string' ? tone : 'quiet',
        chapterTitle: typeof chapterTitle === 'string' ? chapterTitle : null,
        premiumStyle,
        digest: true,
        href: '/app/memory'
      }
    },
    { allowSelf: true }
  );
}

export async function markNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
  ids?: string[]
): Promise<void> {
  if (!userId) return;

  const query = supabase
    .from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('read', false);

  const finalQuery = Array.isArray(ids) && ids.length > 0 ? query.in('id', ids) : query;

  const { error } = await finalQuery;
  if (error) {
    console.error('[notifications] failed to mark notifications read', error, { userId, ids });
  }
}
