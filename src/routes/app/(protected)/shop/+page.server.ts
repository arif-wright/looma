import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const supabase = (locals as any)?.supabase;
  const user = (locals as any)?.user;

  if (!supabase) {
    return {
      items: [],
      featured: [],
      shards: 0,
      ownedIds: [],
      error: 'Missing Supabase client'
    };
  }

  const [itemsRes, walletRes, inventoryRes, featuredRes] = await Promise.all([
    supabase
      .from('shop_items_view')
      .select('*')
      .eq('active', true)
      .order('sort', { ascending: true }),
    supabase.from('user_wallets').select('shards').single(),
    supabase.from('shop_inventory').select('item_id'),
    supabase
      .from('shop_items')
      .select('*')
      .eq('active', true)
      .eq('featured', true)
      .order('featured_sort', { ascending: true })
  ]);

  const items = Array.isArray(itemsRes.data) ? itemsRes.data : [];
  const featured = Array.isArray(featuredRes.data) ? featuredRes.data : [];
  let shards = walletRes.data?.shards ?? 0;
  const ownedIds = Array.isArray(inventoryRes.data)
    ? inventoryRes.data.map((row: { item_id: string }) => row.item_id)
    : [];

  if (walletRes.error && walletRes.error.code === 'PGRST116') {
    if (user?.id) {
      const created = await supabase
        .from('user_wallets')
        .insert({ user_id: user.id })
        .select('shards')
        .single();
      shards = created.data?.shards ?? 1000;
    } else {
      shards = 0;
    }
  }

  const wallet = typeof shards === 'number' && Number.isFinite(shards) ? shards : Number(shards) || 0;

  return {
    items,
    featured,
    shards: wallet,
    wallet,
    ownedIds,
    error: itemsRes.error?.message ?? null,
    highlightSlug: url.searchParams.get('slug') ?? null
  };
};

export const actions: Actions = {
  purchase: async ({ request, locals }) => {
    const supabase = (locals as any)?.supabase;
    const user = (locals as any)?.user;

    if (!supabase || !user?.id) {
      return fail(401, { error: 'Not authenticated' });
    }

    const form = await request.formData();
    const slug = String(form.get('slug') ?? '');

    if (!slug) {
      return fail(400, { error: 'Missing slug' });
    }

    const { data, error, status } = await supabase
      .rpc('purchase_item', { p_item_slug: slug })
      .single();

    if (error || !data) {
      return fail(status || 400, { error: error?.message ?? 'Purchase failed' });
    }

    return {
      ok: true,
      order_id: data.order_id,
      shards: data.new_shards
    };
  }
};
