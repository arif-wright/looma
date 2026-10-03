import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildSanctuaryReaction, isSanctuarySlot, type SanctuaryDecor } from '$lib/sanctuary';

type Payload = {
  slot?: unknown;
  itemId?: unknown; // Legacy catalog ID; accepted only when unambiguous.
  userItemId?: unknown;
  clear?: unknown;
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;
  if (!supabase || !userId) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  if (!isSanctuarySlot(payload.slot)) {
    return json({ error: 'invalid_slot' }, { status: 400 });
  }

  if (payload.clear === true) {
    const { error } = await supabase
      .from('sanctuary_placements')
      .delete()
      .eq('owner_id', userId)
      .eq('slot_key', payload.slot);

    if (error) {
      console.error('[sanctuary] clear placement failed', error);
      return json({ error: 'update_failed' }, { status: 500 });
    }
    return json({ ok: true, slot: payload.slot, placement: null });
  }

  const itemId = typeof payload.itemId === 'string' ? payload.itemId.trim() : '';
  const userItemId = typeof payload.userItemId === 'string' ? payload.userItemId.trim() : '';
  if (!itemId && !userItemId) {
    return json({ error: 'invalid_item' }, { status: 400 });
  }

  const [{ data: ownedItem, error: itemError }, { data: companion, error: companionError }] = await Promise.all([
    supabase
      .from('user_items')
      .select('id, quantity, source_type, source_key, provenance_json, acquired_at, companion_id, item:item_id (id, item_key, title, description, tone, visual_key, capabilities)')
      .eq('owner_id', userId)
      .eq(userItemId ? 'id' : 'item_id', userItemId || itemId)
      .maybeSingle(),
    supabase
      .from('companions')
      .select('id, name')
      .eq('owner_id', userId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  ]);

  if (itemError?.code === 'PGRST116') {
    return json({ error: 'owned_item_selection_required' }, { status: 409 });
  }
  if (itemError || companionError) {
    console.error('[sanctuary] placement lookup failed', itemError ?? companionError);
    return json({ error: 'lookup_failed' }, { status: 500 });
  }
  const item = Array.isArray(ownedItem?.item) ? ownedItem.item[0] ?? null : ownedItem?.item ?? null;
  if (!ownedItem || !item || !Array.isArray(item.capabilities) || !item.capabilities.includes('placeable')) {
    return json({ error: 'item_not_placeable' }, { status: 404 });
  }

  const { data: currentPlacement, error: currentPlacementError } = await supabase
    .from('sanctuary_placements')
    .select('id, item_id, user_item_id')
    .eq('owner_id', userId)
    .eq('slot_key', payload.slot)
    .maybeSingle();

  if (currentPlacementError) {
    console.error('[sanctuary] current placement lookup failed', currentPlacementError);
    return json({ error: 'lookup_failed' }, { status: 500 });
  }

  const typedDecor = {
    id: item.id,
    slug: item.item_key,
    title: item.title,
    description: item.description,
    tone: item.tone,
    visual_key: item.visual_key
  } as SanctuaryDecor;
  const reaction = buildSanctuaryReaction(companion?.name ?? 'Your companion', typedDecor);
  if (currentPlacement?.user_item_id === ownedItem.id) {
    return json({ ok: true, unchanged: true, reaction });
  }

  const { data: placement, error: placementError } = await supabase
    .from('sanctuary_placements')
    .upsert(
      {
        owner_id: userId,
        companion_id: companion?.id ?? null,
        item_id: item.id,
        user_item_id: ownedItem.id,
        decor_id: null,
        slot_key: payload.slot
      },
      { onConflict: 'owner_id,slot_key', ignoreDuplicates: false }
    )
    .select('id, slot_key, placed_at, updated_at')
    .single();

  if (placementError) {
    if (placementError.message?.includes('item_quantity_exhausted')) {
      return json({ error: 'item_quantity_exhausted' }, { status: 409 });
    }
    console.error('[sanctuary] placement update failed', placementError);
    return json({ error: 'update_failed' }, { status: 500 });
  }

  let memory: { id: string; companion_id: string; title: string; body: string } | null = null;
  if (companion?.id) {
    const { data: savedMemory, error: journalError } = await supabase.from('companion_journal_entries').insert({
      owner_id: userId,
      companion_id: companion.id,
      source_type: 'system',
      title: `${item.title} found a place`,
      body: reaction,
      meta_json: {
        category: 'sanctuary',
        itemKey: item.item_key,
        userItemId: ownedItem.id,
        placementId: placement.id,
        acquisition: {
          sourceType: ownedItem.source_type, sourceKey: ownedItem.source_key,
          provenance: ownedItem.provenance_json, acquiredAt: ownedItem.acquired_at,
          companionId: ownedItem.companion_id
        },
        itemTitle: item.title,
        slot: payload.slot
      }
    }).select('id, companion_id, title, body').single();
    if (journalError) {
      console.error('[sanctuary] journal reaction failed', journalError);
    } else {
      memory = savedMemory;
    }
  }

  return json({
    ok: true,
    placement: { ...placement, item: typedDecor },
    reaction,
    memory
  });
};
