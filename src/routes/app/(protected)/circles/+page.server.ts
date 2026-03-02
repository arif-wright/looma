import type { PageServerLoad } from './$types';
import { requireUserServer } from '$lib/server/auth';

type CircleChapterTone = 'care' | 'social' | 'mission' | 'play' | 'bond' | 'quiet';

type CircleChapterFrame = {
  tone: CircleChapterTone;
  title: string;
  body: string;
  detailHint: string;
};

const deriveCircleChapterFrame = (args: {
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
        title: `${name} is looking for gentler company`,
        body: rewardTitle
          ? `${rewardTitle} is shaping the chapter toward steadiness. Use circles for quiet support, soft presence, and low-pressure encouragement.`
          : `Use circles for quiet support, soft presence, and low-pressure encouragement.`,
        detailHint: 'Choose a circle that feels steady, not noisy.'
      } satisfies CircleChapterFrame;
    case 'social':
      return {
        tone: 'social',
        title: `${name} wants the thread shared outward`,
        body: rewardTitle
          ? `${rewardTitle} is making communal expression part of the bond. Circles are the right place for announcements, replies, and shared moments right now.`
          : `Circles are the right place for announcements, replies, and shared moments right now.`,
        detailHint: 'Pick a circle and carry the shared thread forward.'
      } satisfies CircleChapterFrame;
    case 'mission':
      return {
        tone: 'mission',
        title: `${name} is looking for purposeful company`,
        body: rewardTitle
          ? `${rewardTitle} is sharpening the relationship toward direction. Use circles to gather momentum, coordinate, and keep communal intent clear.`
          : `Use circles to gather momentum, coordinate, and keep communal intent clear.`,
        detailHint: 'Choose a circle that helps the next thread move.'
      } satisfies CircleChapterFrame;
    case 'play':
      return {
        tone: 'play',
        title: `${name} is carrying more lightness`,
        body: rewardTitle
          ? `${rewardTitle} is keeping the chapter bright. Circles should feel lively, warm, and easy to enter right now.`
          : `Circles should feel lively, warm, and easy to enter right now.`,
        detailHint: 'Choose a circle that feels easy to step into.'
      } satisfies CircleChapterFrame;
    case 'bond':
      return {
        tone: 'bond',
        title: `${name} is protecting the inner thread`,
        body: rewardTitle
          ? `${rewardTitle} is pulling the relationship toward closeness. Use circles for trusted support and meaningful signals, not just activity for its own sake.`
          : `Use circles for trusted support and meaningful signals, not just activity for its own sake.`,
        detailHint: 'Choose a circle that feels trusted enough for a real signal.'
      } satisfies CircleChapterFrame;
    default:
      return {
        tone: 'quiet',
        title: 'Let the next shared thread gather naturally',
        body: `${name} is between stronger phases. Stay near the circles that feel easy to return to and let the next communal rhythm emerge.`,
        detailHint: 'Choose a circle when you want a little shared presence.'
      } satisfies CircleChapterFrame;
  }
};

export const load: PageServerLoad = async (event) => {
  const parent = await event.parent();
  const { supabase, user } = await requireUserServer(event);
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

  return {
    circleChapterFrame: deriveCircleChapterFrame({
      companionName: activeCompanion?.name ?? null,
      reward: chapterReward
        ? {
            title: chapterReward.title,
            tone: chapterReward.tone
          }
        : null
    })
  };
};
