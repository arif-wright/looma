import type { PageServerLoad } from './$types';
import { requireUserServer } from '$lib/server/auth';

type NotificationChapterTone = 'care' | 'social' | 'mission' | 'play' | 'bond' | 'quiet';

type NotificationChapterFrame = {
  tone: NotificationChapterTone;
  title: string;
  body: string;
};

type PremiumNotificationStyle = 'gilded_dawn' | 'moon_glass' | 'ember_bloom' | 'tide_silk' | null;

const deriveNotificationChapterFrame = (args: {
  companionName: string | null;
  reward:
    | {
        title: string;
        tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
      }
    | null;
}) => {
  const name = args.companionName?.trim() || 'your companion';
  const rewardTitle = args.reward?.title;

  switch (args.reward?.tone) {
    case 'care':
      return {
        tone: 'care',
        title: `${name} needs gentler signals`,
        body: rewardTitle
          ? `${rewardTitle} is shaping the relationship toward steadiness. Notifications should read like soft nudges, not pressure.`
          : 'Notifications should read like soft nudges, not pressure.'
      } satisfies NotificationChapterFrame;
    case 'social':
      return {
        tone: 'social',
        title: `${name} is carrying the thread outward`,
        body: rewardTitle
          ? `${rewardTitle} is making shared activity more important. Surface only the signals that help the communal rhythm keep moving.`
          : 'Surface only the signals that help the communal rhythm keep moving.'
      } satisfies NotificationChapterFrame;
    case 'mission':
      return {
        tone: 'mission',
        title: `${name} is looking for clear signals`,
        body: rewardTitle
          ? `${rewardTitle} is sharpening the relationship toward direction. Notifications should help you choose the next thread, not add noise.`
          : 'Notifications should help you choose the next thread, not add noise.'
      } satisfies NotificationChapterFrame;
    case 'play':
      return {
        tone: 'play',
        title: `${name} wants lighter prompts`,
        body: rewardTitle
          ? `${rewardTitle} is keeping the chapter bright. Signals should feel easy to return to and never heavier than the moment deserves.`
          : 'Signals should feel easy to return to and never heavier than the moment deserves.'
      } satisfies NotificationChapterFrame;
    case 'bond':
      return {
        tone: 'bond',
        title: `${name} is protecting the inner thread`,
        body: rewardTitle
          ? `${rewardTitle} is pulling the relationship inward. The only notifications that matter are the ones worth an honest return.`
          : 'The only notifications that matter are the ones worth an honest return.'
      } satisfies NotificationChapterFrame;
    default:
      return {
        tone: 'quiet',
        title: 'Only worth-keeping signals should surface',
        body: `${name} is between stronger phases. Let this inbox stay quiet until something truly deserves your attention.`
      } satisfies NotificationChapterFrame;
  }
};

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const { supabase, user } = await requireUserServer(event);
  const activeCompanion = parent.activeCompanion ?? null;
  const subscription = parent.subscription ?? null;

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
        .select('featured_companion_reward_key, featured_companion_reward_companion_id, premium_sanctuary_style')
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

    return {
      notificationChapterFrame: deriveNotificationChapterFrame({
        companionName: activeCompanion?.name ?? null,
        reward: chapterReward
          ? {
              title: chapterReward.title,
              tone: chapterReward.tone
            }
          : null
      }),
      premiumNotificationStyle:
        subscription?.active && typeof preferenceRes.data?.premium_sanctuary_style === 'string'
          ? (preferenceRes.data.premium_sanctuary_style as PremiumNotificationStyle)
          : null,
      subscription
    };
  }

  return {
    notificationChapterFrame: deriveNotificationChapterFrame({
      companionName: activeCompanion?.name ?? null,
      reward: null
    }),
    premiumNotificationStyle: null,
    subscription
  };
};
