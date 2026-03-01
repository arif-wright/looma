import type { PageServerLoad } from './$types';
import { requireUserServer } from '$lib/server/auth';

type MessageChapterTone = 'care' | 'social' | 'mission' | 'play' | 'bond' | 'quiet';

type MessageChapterFrame = {
  tone: MessageChapterTone;
  title: string;
  body: string;
  inboxTitle: string;
  inboxBody: string;
  threadHint: string;
};

const deriveMessageChapterFrame = (args: {
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
        title: `${name} wants a gentler thread`,
        body: rewardTitle
          ? `${rewardTitle} is shaping the relationship toward steadier, softer contact. Short sincere notes will land better than fast chatter right now.`
          : `The current chapter favors short sincere notes over fast chatter.`,
        inboxTitle: 'Keep the thread soft',
        inboxBody: 'Reply gently, stay close, and let the conversation feel tended instead of rushed.',
        threadHint: 'A quiet sincere note will land best.'
      } satisfies MessageChapterFrame;
    case 'social':
      return {
        tone: 'social',
        title: `${name} is carrying the bond outward`,
        body: rewardTitle
          ? `${rewardTitle} is making connection itself part of the chapter. This is a good moment for replies, shared threads, and circling back quickly.`
          : `This is a good moment for replies, shared threads, and circling back quickly.`,
        inboxTitle: 'Keep the weave moving',
        inboxBody: 'Reply quickly, start a thread, and keep the outward rhythm alive.',
        threadHint: 'Carry the shared thread forward.'
      } satisfies MessageChapterFrame;
    case 'mission':
      return {
        tone: 'mission',
        title: `${name} is looking for clarity`,
        body: rewardTitle
          ? `${rewardTitle} is giving the relationship more direction. Messages should feel purposeful and clear rather than scattered.`
          : `Messages should feel purposeful and clear rather than scattered.`,
        inboxTitle: 'Keep the thread purposeful',
        inboxBody: 'Use this space to set direction, confirm plans, and keep momentum from drifting.',
        threadHint: 'One clear message matters more than five loose ones.'
      } satisfies MessageChapterFrame;
    case 'play':
      return {
        tone: 'play',
        title: `${name} is keeping things bright`,
        body: rewardTitle
          ? `${rewardTitle} is making the bond feel lighter. Playful replies, delight, and low-friction contact fit this chapter best.`
          : `Playful replies, delight, and low-friction contact fit this chapter best.`,
        inboxTitle: 'Keep the thread light',
        inboxBody: 'Send something easy, bright, or warm. This chapter wants delight more than weight.',
        threadHint: 'Lightness will carry this thread further.'
      } satisfies MessageChapterFrame;
    case 'bond':
      return {
        tone: 'bond',
        title: `${name} is asking for closeness`,
        body: rewardTitle
          ? `${rewardTitle} is pulling the relationship inward. Messages that feel honest and specific will matter more than performative activity.`
          : `Messages that feel honest and specific will matter more than performative activity.`,
        inboxTitle: 'Keep the thread close',
        inboxBody: 'Reply with honesty, stay specific, and let this space feel intimate rather than noisy.',
        threadHint: 'Say the truest small thing.'
      } satisfies MessageChapterFrame;
    default:
      return {
        tone: 'quiet',
        title: 'Let the next conversation gather naturally',
        body: `${name} is between stronger phases. A calm reply or a simple hello is enough to keep the thread warm.`,
        inboxTitle: 'Keep the weave close',
        inboxBody: 'Reply when it feels true, start a new conversation, and keep your closest threads easy to reach.',
        threadHint: 'A small return is enough.'
      } satisfies MessageChapterFrame;
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
    messageChapterFrame: deriveMessageChapterFrame({
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
