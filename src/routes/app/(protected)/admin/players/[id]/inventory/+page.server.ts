import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { assertSuperAdmin, getAdminServiceClient } from '$lib/server/admin';

type InventoryEntry = {
  quantity: number;
  acquired_at: string | null;
  shop_items: {
    id: string;
    slug: string;
    title: string;
    type: string;
    rarity: string;
    image_url: string | null;
    price_shards: number | null;
  } | null;
};

export const load: PageServerLoad = async (event) => {
  const playerId = event.params.id;
  const { supabase, session } = await getAdminServiceClient(event);
  await assertSuperAdmin(event, session);

  if (!playerId) {
    throw error(400, 'Missing player id');
  }

  const [{ data: userResult }, { data: rawItems, error: invError }] = await Promise.all([
    supabase.auth.admin.getUserById(playerId),
    supabase
      .from('shop_inventory')
      .select(
        `
        acquired_at,
        item:item_id (
          id,
          slug,
          title,
          type,
          rarity,
          image_url,
          price_shards
        )
      `
      )
      .eq('user_id', playerId)
      .order('acquired_at', { ascending: false })
  ]);

  if (invError) {
    console.error('[admin players] inventory query failed', invError);
    throw error(500, 'Unable to load inventory');
  }

  const grouped: Record<string, InventoryEntry> = {};

  for (const row of rawItems ?? []) {
    const rowItem =
      (row as { item: InventoryEntry['shop_items'] | InventoryEntry['shop_items'][]; acquired_at: string | null })
        .item;
    const item = Array.isArray(rowItem) ? (rowItem[0] ?? null) : rowItem;
    const acquiredAt = (row as { acquired_at: string | null }).acquired_at ?? null;
    const key = item?.id ?? `unknown-${acquiredAt ?? Math.random()}`;

    if (!grouped[key]) {
      grouped[key] = {
        quantity: 0,
        acquired_at: acquiredAt,
        shop_items: item ?? null
      };
    }

    grouped[key].quantity += 1;
    if (
      acquiredAt &&
      (!grouped[key].acquired_at || new Date(acquiredAt) > new Date(grouped[key].acquired_at as string))
    ) {
      grouped[key].acquired_at = acquiredAt;
    }
  }

  const items = Object.values(grouped).sort((a, b) => {
    const tsA = a.acquired_at ? new Date(a.acquired_at).getTime() : 0;
    const tsB = b.acquired_at ? new Date(b.acquired_at).getTime() : 0;
    return tsB - tsA;
  });

  return {
    playerId,
    user: userResult?.user ?? null,
    items
  };
};
