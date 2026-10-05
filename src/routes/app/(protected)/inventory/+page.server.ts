import type { PageServerLoad } from './$types';
import { visibleStoryJournal } from '$lib/server/items/storyHistory';
import { buildKeepsakeStory, isOwnedItemId, recordedMoonberryEventId, STORY_MOMENT_LIMIT, type KeepsakeStory, type StoryOwnedItem } from '$lib/items/story';

// Each read fails independently: a missing history record must not hide an owned collection.
const read = async (query: PromiseLike<any>) => {
  try { return await query; } catch { return { data: null, error: { message: 'unavailable' } }; }
};

export const load: PageServerLoad = async ({ locals, url }) => {
  const supabase = locals.supabase;
  const ownerId = locals.session?.user?.id ?? locals.user?.id ?? null;
  const requestedItem = url.searchParams.get('item');
  const result = { items: [] as any[], unifiedItems: [] as any[], companionRewards: [] as any[], placements: [] as any[],
    placementsAvailable: false,
    story: null as KeepsakeStory | null, storyStatus: requestedItem !== null ? 'unavailable' : null,
    storyFromSanctuary: url.searchParams.get('from') === 'sanctuary', storySanctuarySelection: null as string | null, error: null as string | null };
  if (!supabase || !ownerId) return { ...result, error: 'Sign in to view your keepsakes.' };

  const [inventoryRes, unifiedItemsRes, rewardsRes, placementsRes] = await Promise.all([
    read(supabase.from('shop_inventory')
      .select('acquired_at, item:item_id (id, slug, title, subtitle, image_url, rarity, type)')
      .eq('user_id', ownerId).order('acquired_at', { ascending: false })),
    read(supabase.from('user_items')
      .select('id, owner_id, companion_id, quantity, source_type, source_key, provenance_json, acquired_at, companion:companion_id (id, name), item:item_id (id, item_key, title, description, kind, tone, visual_key, capabilities)')
      .eq('owner_id', ownerId).order('acquired_at', { ascending: false })),
    read(supabase.from('companion_chapter_rewards')
      .select('reward_key, reward_title, reward_body, reward_tone, unlocked_at, companion:companion_id (id, name, species)')
      .eq('owner_id', ownerId).order('unlocked_at', { ascending: false })),
    read(supabase.from('sanctuary_placements').select('id, owner_id, slot_key, item_id, user_item_id').eq('owner_id', ownerId))
  ]);
  result.items = inventoryRes.error ? [] : inventoryRes.data ?? [];
  result.unifiedItems = unifiedItemsRes.error ? [] : (unifiedItemsRes.data ?? []).filter((row: StoryOwnedItem) => row.owner_id === ownerId);
  result.companionRewards = rewardsRes.error ? [] : rewardsRes.data ?? [];
  result.placements = placementsRes.error ? [] : (placementsRes.data ?? []).filter((row: { owner_id: string }) => row.owner_id === ownerId);
  result.placementsAvailable = !placementsRes.error;
  if ([inventoryRes, unifiedItemsRes, rewardsRes, placementsRes].some((response) => response.error)) {
    result.error = 'Some keepsakes details could not be loaded. Please try again.';
  }
  // Resolve only within the owner-scoped collection, never by catalog identity.
  const owned = isOwnedItemId(requestedItem) ? result.unifiedItems.find((row) => row.id === requestedItem) as StoryOwnedItem | undefined : undefined;
  if (!owned) return result;
  const selectedItem = url.searchParams.get('selected');
  result.storySanctuarySelection = result.unifiedItems.some((row) => row.id === selectedItem) ? selectedItem : null;

  let historyState: KeepsakeStory['historyState'] = 'ready';
  let journal: any[] = [];
  const preferences = await read(supabase.from('user_preferences').select('consent_memory').eq('user_id', ownerId).maybeSingle());
  if (preferences.error) historyState = 'unavailable';
  else if (preferences.data?.consent_memory === false) historyState = 'disabled';
  else {
    // Resolve bounded candidates, then apply Journal's ordinary browsing visibility.
    // No archived text or ids are returned through the exact-moment-link exception.
    const historyQuery = read(supabase.from('companion_journal_entries')
      .select('id, owner_id, companion_id, source_type, source_id, title, body, created_at, meta_json')
      .eq('owner_id', ownerId).eq('source_type', 'system').contains('meta_json', { userItemId: owned.id })
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(STORY_MOMENT_LIMIT));
    // Old Moonberry rows already store an exact event link, but their Journal metadata
    // predates userItemId. Never broaden this to all gathers or match by dates/catalog.
    const worldEventId = recordedMoonberryEventId(owned);
    const worldQuery = worldEventId ? read(supabase.from('companion_journal_entries')
      .select('id, owner_id, companion_id, source_type, source_id, title, body, created_at, meta_json')
      .eq('owner_id', ownerId).eq('companion_id', owned.companion_id).eq('source_type', 'system').eq('source_id', worldEventId)
      .contains('meta_json', { kind: 'world_gather', itemKey: 'world-moonberry', mapId: 'wilds-exploration' })
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1))
      : Promise.resolve({ data: [], error: null });
    const [history, worldHistory] = await Promise.all([historyQuery, worldQuery]);
    if (history.error || worldHistory.error) historyState = 'unavailable';
    else {
      try { journal = await visibleStoryJournal(supabase, ownerId, [...(history.data ?? []), ...(worldHistory.data ?? [])]); }
      catch { historyState = 'unavailable'; }
    }
  }
  result.story = buildKeepsakeStory({ ownerId, owned, placements: result.placements, journal,
    placementsAvailable: !placementsRes.error, historyState });
  result.storyStatus = result.story ? 'ready' : 'unavailable';
  return result;
};
