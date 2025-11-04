import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureAuth } from '$lib/server/games/guard';
import { supabaseAdmin } from '$lib/server/supabase';
import { enforceShopRateLimit } from '$lib/server/shop/rate';
import { getActivePrices, listActivePromotions, findBestPromotion } from '$lib/server/shop/pricing';

const CACHE_HEADERS = { 'cache-control': 's-maxage=30, stale-while-revalidate=120' } as const;

type VariantRow = {
  id: string;
  sku: string;
  display_name: string;
  icon: string | null;
  stackable: boolean | null;
  max_stack: number | null;
  product: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    rarity: string | null;
  };
};

type CatalogVariant = {
  sku: string;
  displayName: string;
  icon: string;
  stackable: boolean;
  maxStack: number | null;
  price: number;
  currency: string;
  promoPercent: number;
  promoSlug: string | null;
  isFlash: boolean;
};

type CatalogProduct = {
  slug: string;
  name: string;
  description: string;
  rarity: string | null;
  variants: CatalogVariant[];
};

export const POST: RequestHandler = async (event) => {
  const { user } = await ensureAuth(event);
  const clientIp = typeof event.getClientAddress === 'function' ? event.getClientAddress() : null;

  try {
    enforceShopRateLimit(user.id, clientIp);
  } catch (err) {
    const body = (err as any)?.body ?? null;
    if (body?.code === 'rate_limited') {
      return json(body, { status: 429 });
    }
    throw err;
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('shop_variants')
    .select('id, sku, display_name, icon, stackable, max_stack, is_active, product:shop_products!inner(id, slug, name, description, rarity, is_active)')
    .eq('is_active', true)
    .eq('product.is_active', true)
    .order('product.name', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    console.error('[shop/catalog] variant query failed', error);
    return json({ code: 'server_error', message: 'Unable to load shop catalog.' }, { status: 500 });
  }

  const variants = (data ?? []) as VariantRow[];
  const variantIds = variants.map((variant) => variant.id);
  const [prices, promos] = await Promise.all([
    getActivePrices(variantIds, { now: nowIso, client: supabaseAdmin }),
    listActivePromotions({ now: nowIso, client: supabaseAdmin })
  ]);

  const products = new Map<string, CatalogProduct>();

  for (const variant of variants) {
    const price = prices.get(variant.id);
    if (!price) {
      continue;
    }

    const productSlug = variant.product.slug;
    if (!products.has(productSlug)) {
      products.set(productSlug, {
        slug: productSlug,
        name: variant.product.name,
        description: variant.product.description ?? '',
        rarity: variant.product.rarity ?? null,
        variants: []
      });
    }

    const product = products.get(productSlug)!;
    const bestPromo = findBestPromotion(promos, variant.sku, variant.product.rarity ?? null);

    const variantEntry: CatalogVariant = {
      sku: variant.sku,
      displayName: variant.display_name,
      icon: variant.icon ?? 'cube',
      stackable: !!variant.stackable,
      maxStack: variant.max_stack ?? null,
      price: price.unitPrice,
      currency: price.currency,
      promoPercent: bestPromo?.percentOff ?? 0,
      promoSlug: bestPromo?.slug ?? null,
      isFlash: bestPromo?.isFlash ?? false
    };

    product.variants.push(variantEntry);
  }

  const payload = { products: Array.from(products.values()) };
  return json(payload, { headers: CACHE_HEADERS });
};
