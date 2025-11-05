import type { Actions, PageServerLoad } from './$types';

const FALLBACK_ITEMS = [
  {
    id: 'fallback-radiant',
    slug: 'radiant-shard-pack',
    title: 'Radiant Shard Pack',
    subtitle: '5x premium shards',
    description: 'Bundle of radiant currency',
    type: 'bundle',
    rarity: 'rare',
    price_shards: 200,
    image_url: '/games/tiles-run/cover-640.webp',
    tags: ['boost', 'limited'],
    sort: 10,
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'fallback-tiles-skin',
    slug: 'tiles-run-skin-nebula',
    title: 'Tiles Run – Nebula Skin',
    subtitle: 'Color-burst cosmetic',
    description: 'Reactive prism trail for Tiles Run',
    type: 'cosmetic',
    rarity: 'epic',
    price_shards: 120,
    image_url: '/games/tiles-run/cover-512.webp',
    tags: ['tiles-run', 'cosmetic'],
    sort: 20,
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'fallback-double-xp',
    slug: 'double-xp-30m',
    title: 'Double XP (30m)',
    subtitle: 'Stackable boost',
    description: 'Doubles XP gain for 30 minutes',
    type: 'boost',
    rarity: 'uncommon',
    price_shards: 90,
    image_url: '/games/tiles-run/cover-640.webp',
    tags: ['boost'],
    sort: 30,
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'fallback-avatar-frame',
    slug: 'avatar-frame-prism',
    title: 'Avatar Frame — Prism',
    subtitle: 'Reactive glow',
    description: 'Profile frame that pulses to your level',
    type: 'cosmetic',
    rarity: 'legendary',
    price_shards: 260,
    image_url: '/games/tiles-run/cover-512.webp',
    tags: ['profile', 'cosmetic'],
    sort: 40,
    active: true,
    created_at: new Date().toISOString()
  }
];

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = (locals as any)?.supabase;

  if (!supabase) {
    return { items: FALLBACK_ITEMS, source: 'fallback-no-client' as const };
  }
  const { data, error } = await supabase
    .from('shop_items_view')
    .select('*')
    .order('sort', { ascending: true });

  if (error) {
    console.error('shop load error', error);
    return { items: FALLBACK_ITEMS, error: error.message, source: 'db-error' as const };
  }

  const rows = Array.isArray(data) ? data : [];
  const items = rows.length > 0 ? rows : FALLBACK_ITEMS;

  return { items, source: rows.length > 0 ? 'db' : 'fallback' as const };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const price = Number(form.get('price') ?? 0);
    const slug = String(form.get('slug') ?? '');

    if (!slug || Number.isNaN(price) || price < 0) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid purchase data' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 400));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
};
