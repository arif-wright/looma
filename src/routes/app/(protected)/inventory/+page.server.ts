import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = (locals as any)?.supabase;

  if (!supabase) {
    return { items: [], unifiedItems: [], companionRewards: [], placements: [], error: 'Missing Supabase client' };
  }

  const [inventoryRes, unifiedItemsRes, rewardsRes, placementsRes] = await Promise.all([
    supabase
      .from('shop_inventory')
      .select('acquired_at, item:item_id (id, slug, title, subtitle, image_url, rarity, type)')
      .order('acquired_at', { ascending: false }),
    supabase
      .from('user_items')
      .select(
        'id, source_type, source_key, provenance_json, acquired_at, companion:companion_id (id, name), item:item_id (id, item_key, title, description, kind, tone, visual_key, capabilities)'
      )
      .order('acquired_at', { ascending: false }),
    supabase
      .from('companion_chapter_rewards')
      .select(
        'reward_key, reward_title, reward_body, reward_tone, unlocked_at, companion:companion_id (id, name, species)'
      )
      .order('unlocked_at', { ascending: false }),
    supabase
      .from('sanctuary_placements')
      .select('id, slot_key, item_id')
  ]);

  return {
    items: inventoryRes.data ?? [],
    unifiedItems: unifiedItemsRes.data ?? [],
    companionRewards: rewardsRes.data ?? [],
    placements: placementsRes.data ?? [],
    error:
      inventoryRes.error?.message ??
      unifiedItemsRes.error?.message ??
      rewardsRes.error?.message ??
      placementsRes.error?.message ??
      null
  };
};
