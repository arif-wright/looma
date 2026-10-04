import { journalMomentHref } from '$lib/launch/proofIntegrity';

export const STORY_MOMENT_LIMIT = 6;
export const isOwnedItemId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, limit = 400) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const one = <T>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] ?? null : value ?? null;
const slots: Record<string, string> = {
  left_grove: 'Left grove', center_glade: 'Center glade', right_grove: 'Right grove', near_left: 'Near left', near_right: 'Near right'
};
export const storySlotLabel = (value: unknown) => typeof value === 'string' ? slots[value] ?? null : null;
export const keepsakeStoryHref = (id: string, fromSanctuary = false, selectedItemId?: string | null) =>
  `/app/inventory?item=${encodeURIComponent(id)}${fromSanctuary ? `&from=sanctuary${isOwnedItemId(selectedItemId) ? `&selected=${encodeURIComponent(selectedItemId)}` : ''}` : ''}#keepsake-story`;
export const keepsakeCollectionHref = (id?: string | null) => `/app/inventory${id ? `#keepsake-${encodeURIComponent(id)}` : ''}`;
export const storyDateLabel = (value: string | null) => value && date(value)
  ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
  : 'Date not recorded';

export type StoryOwnedItem = {
  id: string; owner_id: string; companion_id: string | null; quantity: number;
  source_type: string; source_key: string | null; acquired_at: string; provenance_json: unknown;
  companion?: { id: string; name: string } | { id: string; name: string }[] | null;
  item: { id: string; item_key: string; title: string; visual_key: string; capabilities: string[] } |
    { id: string; item_key: string; title: string; visual_key: string; capabilities: string[] }[] | null;
};
export type StoryPlacement = { id: string; owner_id: string; user_item_id: string | null; slot_key: string };
export type StoryJournalRow = {
  id: string; owner_id: string; companion_id: string; source_type: string; source_id?: string | null;
  title: string | null; body: string | null; created_at: string; meta_json: unknown;
};
export type CareStoryEvent = { id: string; action: 'feed' | 'play' | 'groom'; label: string; occurredAt: string };

/** Only the versioned direct-care award proves which three actions earned this acquisition. */
export const qualifiedCareEvents = (owned: StoryOwnedItem): CareStoryEvent[] => {
  const item = one(owned.item);
  const provenance = record(owned.provenance_json);
  if (item?.item_key !== 'care-moss-seat' || owned.source_type !== 'care_milestone' || owned.source_key !== 'care_3' ||
      provenance.ruleVersion !== 'direct-care-3-v1' || provenance.careMoments !== 3 || !owned.companion_id ||
      !Array.isArray(provenance.careEvents) || provenance.careEvents.length !== 3 || !date(owned.acquired_at)) return [];
  const labels = { feed: 'Fed together', play: 'Played together', groom: 'Groomed together' };
  const events: CareStoryEvent[] = [];
  for (const raw of provenance.careEvents) {
    const event = record(raw);
    const action = event.action;
    const occurredAt = date(event.createdAt);
    if (!isOwnedItemId(event.id) || !occurredAt || typeof action !== 'string' || !['feed', 'play', 'groom'].includes(action) ||
        Date.parse(occurredAt) > Date.parse(owned.acquired_at) || events.some((prior) => prior.id === event.id)) return [];
    events.push({ id: event.id, action: action as CareStoryEvent['action'], label: labels[action as keyof typeof labels], occurredAt });
  }
  return events.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id));
};

export type KeepsakeStory = {
  id: string; title: string; visualKey: string; companionName: string | null; acquiredAt: string | null;
  sourceLabel: string; sourceNote: string | null; careEvents: CareStoryEvent[]; placeable: boolean;
  placements: { id: string; label: string }[]; placementsAvailable: boolean;
  historyState: 'ready' | 'unavailable' | 'disabled';
  moments: { id: string; title: string; body: string; occurredAt: string; label: string; slotLabel: string | null; href: string }[];
};

export const buildKeepsakeStory = (args: {
  ownerId: string; owned: StoryOwnedItem; placements: StoryPlacement[]; journal: StoryJournalRow[];
  placementsAvailable?: boolean; historyState?: KeepsakeStory['historyState'];
}): KeepsakeStory | null => {
  const { ownerId, owned } = args;
  const item = one(owned.item);
  if (!item || owned.owner_id !== ownerId || !isOwnedItemId(owned.id)) return null;
  const careEvents = qualifiedCareEvents(owned);
  const companion = one(owned.companion);
  const companionName = companion?.id === owned.companion_id ? text(companion.name, 100) || null : null;
  const sourceLabel = careEvents.length === 3 ? 'Earned through three care moments'
    : owned.source_type === 'care_milestone' ? 'Added as a care keepsake'
    : owned.source_type === 'chapter_reward' ? 'Added as a chapter keepsake'
    : owned.source_type === 'world' ? 'Gathered in The Wilds' : 'Added to your collection';
  const sourceNote = owned.source_type === 'care_milestone' && careEvents.length === 0
    ? 'The individual care moments behind this keepsake are not recorded here.' : null;
  const historyState = args.historyState ?? 'ready';
  const moments: KeepsakeStory['moments'] = [];
  for (const row of historyState === 'ready' ? args.journal : []) {
    const meta = record(row.meta_json);
    if (row.owner_id !== ownerId || meta.userItemId !== owned.id || row.source_type !== 'system' ||
        !isOwnedItemId(row.id) || !isOwnedItemId(row.companion_id) || !date(row.created_at) ||
        !text(row.title) || !text(row.body) || moments.some((moment) => moment.id === row.id)) continue;
    let label: string;
    if (meta.category === 'item_unlock' && meta.itemKey === item.item_key && row.source_id === owned.id &&
        row.companion_id === owned.companion_id && meta.sourceType === owned.source_type && meta.sourceKey === owned.source_key &&
        meta.ruleVersion === 'direct-care-3-v1' && careEvents.length === 3) {
      label = 'Keepsake arrived';
    } else if (meta.category === 'sanctuary' && meta.itemKey === item.item_key && isOwnedItemId(meta.placementId) && storySlotLabel(meta.slot)) {
      if (meta.interactionType === 'shared_rest' && meta.action === 'shared_rest' && item.item_key === 'care-moss-seat') label = 'Rested together';
      else if (!meta.interactionType && !meta.action) label = 'Found a place';
      else continue;
    } else continue;
    moments.push({ id: row.id, title: text(row.title, 160), body: text(row.body), occurredAt: row.created_at,
      label, slotLabel: storySlotLabel(meta.slot), href: journalMomentHref(row.companion_id, row.id) });
  }
  moments.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id.localeCompare(a.id));
  return {
    id: owned.id, title: text(item.title, 160) || 'Keepsake', visualKey: text(item.visual_key, 60), companionName,
    acquiredAt: date(owned.acquired_at), sourceLabel, sourceNote, careEvents,
    placeable: Array.isArray(item.capabilities) && item.capabilities.includes('placeable'),
    placements: args.placements.filter((placement) => placement.owner_id === ownerId && placement.user_item_id === owned.id)
      .map((placement) => ({ id: placement.id, label: storySlotLabel(placement.slot_key) ?? 'Sanctuary space' }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    placementsAvailable: args.placementsAvailable ?? true, historyState, moments: moments.slice(0, STORY_MOMENT_LIMIT)
  };
};
