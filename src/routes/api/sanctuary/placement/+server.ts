import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildSanctuaryReaction, isSanctuarySlot, type SanctuaryDecor } from '$lib/sanctuary';

type Payload = {
  slot?: unknown;
  decorId?: unknown;
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

  const decorId = typeof payload.decorId === 'string' ? payload.decorId.trim() : '';
  if (!decorId) {
    return json({ error: 'invalid_decor' }, { status: 400 });
  }

  const [{ data: decor, error: decorError }, { data: companion, error: companionError }] = await Promise.all([
    supabase
      .from('sanctuary_decor_catalog')
      .select('id, slug, title, description, tone, visual_key')
      .eq('id', decorId)
      .eq('starter', true)
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

  if (decorError || companionError) {
    console.error('[sanctuary] placement lookup failed', decorError ?? companionError);
    return json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!decor) {
    return json({ error: 'decor_not_available' }, { status: 404 });
  }

  const { data: currentPlacement, error: currentPlacementError } = await supabase
    .from('sanctuary_placements')
    .select('id, decor_id')
    .eq('owner_id', userId)
    .eq('slot_key', payload.slot)
    .maybeSingle();

  if (currentPlacementError) {
    console.error('[sanctuary] current placement lookup failed', currentPlacementError);
    return json({ error: 'lookup_failed' }, { status: 500 });
  }

  const typedDecor = decor as SanctuaryDecor;
  const reaction = buildSanctuaryReaction(companion?.name ?? 'Your companion', typedDecor);
  if (currentPlacement?.decor_id === decor.id) {
    return json({ ok: true, unchanged: true, reaction });
  }

  const { data: placement, error: placementError } = await supabase
    .from('sanctuary_placements')
    .upsert(
      {
        owner_id: userId,
        companion_id: companion?.id ?? null,
        decor_id: decor.id,
        slot_key: payload.slot
      },
      { onConflict: 'owner_id,slot_key', ignoreDuplicates: false }
    )
    .select('id, slot_key, placed_at, updated_at')
    .single();

  if (placementError) {
    console.error('[sanctuary] placement update failed', placementError);
    return json({ error: 'update_failed' }, { status: 500 });
  }

  if (companion?.id) {
    const { error: journalError } = await supabase.from('companion_journal_entries').insert({
      owner_id: userId,
      companion_id: companion.id,
      source_type: 'system',
      title: `${decor.title} found a place`,
      body: reaction,
      meta_json: {
        category: 'sanctuary',
        decorSlug: decor.slug,
        decorTitle: decor.title,
        slot: payload.slot
      }
    });
    if (journalError) {
      console.error('[sanctuary] journal reaction failed', journalError);
    }
  }

  return json({
    ok: true,
    placement: { ...placement, decor },
    reaction
  });
};
