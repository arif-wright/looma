import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = (locals as any)?.supabase;

  if (!supabase) {
    return { items: [], companionRewards: [], error: 'Missing Supabase client' };
  }

  const [inventoryRes, rewardsRes] = await Promise.all([
    supabase
      .from('shop_inventory')
      .select('acquired_at, item:item_id (id, slug, title, subtitle, image_url, rarity, type)')
      .order('acquired_at', { ascending: false }),
    supabase
      .from('companion_chapter_rewards')
      .select(
        'reward_key, reward_title, reward_body, reward_tone, unlocked_at, companion:companion_id (id, name, species)'
      )
      .order('unlocked_at', { ascending: false })
  ]);

  return {
    items: inventoryRes.data ?? [],
    companionRewards: rewardsRes.data ?? [],
    error: inventoryRes.error?.message ?? rewardsRes.error?.message ?? null
  };
};
