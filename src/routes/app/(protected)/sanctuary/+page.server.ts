import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;

  if (!supabase || !userId) {
    return { companion: null, items: [], placements: [], latestReaction: null, error: 'unauthorized' };
  }

  const [companionRes, itemsRes, placementsRes, reactionRes] = await Promise.all([
    supabase
      .from('companions')
      .select('id, name, species, avatar_url, mood, is_active')
      .eq('owner_id', userId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('user_items')
      .select(
        'id, source_type, source_key, provenance_json, acquired_at, item:item_id (id, item_key, title, description, tone, visual_key, capabilities)'
      )
      .eq('owner_id', userId)
      .order('acquired_at', { ascending: false }),
    supabase
      .from('sanctuary_placements')
      .select(
        'id, slot_key, placed_at, updated_at, item:item_id (id, item_key, title, description, tone, visual_key)'
      )
      .eq('owner_id', userId),
    supabase
      .from('companion_journal_entries')
      .select('id, title, body, created_at')
      .eq('owner_id', userId)
      .contains('meta_json', { category: 'sanctuary' })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const error =
    companionRes.error?.message ??
    itemsRes.error?.message ??
    placementsRes.error?.message ??
    reactionRes.error?.message ??
    null;

  return {
    companion: companionRes.data ?? null,
    items: (itemsRes.data ?? []).filter((row: any) => {
      const item = Array.isArray(row.item) ? row.item[0] : row.item;
      return Array.isArray(item?.capabilities) && item.capabilities.includes('placeable');
    }),
    placements: placementsRes.data ?? [],
    latestReaction: reactionRes.data ?? null,
    error
  };
};
