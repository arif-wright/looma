import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = (locals as any).supabase;
  const { data, error } = await supabase
    .from('shop_items_view')
    .select('*')
    .eq('active', true)
    .order('sort', { ascending: true });

  if (error) {
    console.error('shop load error', error);
    return { items: [], error: error.message, source: 'db' as const };
  }

  return { items: data ?? [], source: 'db' as const };
};
