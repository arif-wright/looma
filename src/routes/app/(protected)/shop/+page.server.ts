import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = (locals as any)?.supabase;
  const user = (locals as any)?.user;

  if (!supabase) {
    return {
      items: [],
      shards: null,
      source: 'no-client' as const,
      error: 'Missing Supabase client'
    };
  }

  const [itemsRes, walletRes] = await Promise.all([
    supabase
      .from('shop_items_view')
      .select('*')
      .eq('active', true)
      .order('sort', { ascending: true }),
    supabase.from('user_wallets').select('shards').single()
  ]);

  const items = Array.isArray(itemsRes.data) ? itemsRes.data : [];
  let shards = walletRes.data?.shards ?? null;

  if (walletRes.error && walletRes.error.code === 'PGRST116') {
    if (user?.id) {
      const created = await supabase
        .from('user_wallets')
        .insert({ user_id: user.id })
        .select('shards')
        .single();
      shards = created.data?.shards ?? 1000;
    } else {
      shards = null;
    }
  }

  return {
    items,
    shards,
    source: 'db' as const,
    error: itemsRes.error?.message ?? null
  };
};

export const actions: Actions = {
  purchase: async ({ request, locals }) => {
    const supabase = (locals as any)?.supabase;
    const user = (locals as any)?.user;

    if (!supabase || !user?.id) {
      return new Response(JSON.stringify({ ok: false, error: 'Not authenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    }

    const form = await request.formData();
    const slug = String(form.get('slug') ?? '');

    if (!slug) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing slug' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const { data, error, status } = await supabase
      .rpc('purchase_item', { p_item_slug: slug })
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, error: error?.message ?? 'Purchase failed' }),
        {
          status: status || 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, order_id: data.order_id, shards: data.new_shards }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
};
