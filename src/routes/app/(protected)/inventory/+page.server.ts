import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = (locals as any)?.supabase;

  if (!supabase) {
    return { items: [], error: 'Missing Supabase client' };
  }

  const { data, error } = await supabase
    .from('shop_inventory')
    .select('acquired_at, item:item_id (id, slug, title, subtitle, image_url, rarity, type)')
    .order('acquired_at', { ascending: false });

  return { items: data ?? [], error: error?.message ?? null };
};
