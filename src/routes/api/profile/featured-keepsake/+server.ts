import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type Payload = {
  rewardKey?: unknown;
  companionId?: unknown;
  clear?: unknown;
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;

  if (!supabase || !userId) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: Payload = {};
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const clear = payload.clear === true;
  const rewardKey = typeof payload.rewardKey === 'string' ? payload.rewardKey.trim() : '';
  const companionId = typeof payload.companionId === 'string' ? payload.companionId.trim() : '';

  if (clear) {
    const { error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          featured_companion_reward_key: null,
          featured_companion_reward_companion_id: null
        },
        { onConflict: 'user_id', ignoreDuplicates: false }
      );

    if (error) {
      console.error('[featured-keepsake] clear failed', error);
      return json({ error: 'update_failed' }, { status: 500 });
    }

    return json({ ok: true, featured: null });
  }

  if (!rewardKey || !companionId) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const { data: reward, error: rewardError } = await supabase
    .from('companion_chapter_rewards')
    .select('reward_key, reward_title, reward_tone, companion_id')
    .eq('owner_id', userId)
    .eq('companion_id', companionId)
    .eq('reward_key', rewardKey)
    .maybeSingle();

  if (rewardError) {
    console.error('[featured-keepsake] reward lookup failed', rewardError);
    return json({ error: 'lookup_failed' }, { status: 500 });
  }

  if (!reward) {
    return json({ error: 'not_found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        featured_companion_reward_key: reward.reward_key,
        featured_companion_reward_companion_id: reward.companion_id
      },
      { onConflict: 'user_id', ignoreDuplicates: false }
    );

  if (error) {
    console.error('[featured-keepsake] update failed', error);
    return json({ error: 'update_failed' }, { status: 500 });
  }

  return json({
    ok: true,
    featured: {
      rewardKey: reward.reward_key,
      title: reward.reward_title,
      tone: reward.reward_tone,
      companionId: reward.companion_id
    }
  });
};
