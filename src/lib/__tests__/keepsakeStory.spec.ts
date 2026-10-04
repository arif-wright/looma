import { describe, expect, it } from 'vitest';
import { buildKeepsakeStory, keepsakeStoryHref, qualifiedCareEvents, storyDateLabel, STORY_MOMENT_LIMIT, type StoryOwnedItem, type StoryJournalRow } from '$lib/items/story';
const id = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ownerId = id(1), ownedId = id(2), companionId = id(3);
const events = ['feed', 'play', 'groom'].map((action, i) => ({ id: id(10 + i), action, createdAt: `2026-10-0${i + 1}T10:00:00Z` }));
const owned: StoryOwnedItem = { id: ownedId, owner_id: ownerId, companion_id: companionId, quantity: 2,
  source_type: 'care_milestone', source_key: 'care_3', acquired_at: '2026-10-03T11:00:00Z',
  provenance_json: { ruleVersion: 'direct-care-3-v1', careMoments: 3, careEvents: events }, companion: { id: companionId, name: 'Moss' },
  item: { id: id(4), item_key: 'care-moss-seat', title: 'Moss Seat', visual_key: 'moss_seat', capabilities: ['placeable', 'interactive'] } };
const journal = (n: number, overrides: Partial<StoryJournalRow> = {}): StoryJournalRow => ({ id: id(n), owner_id: ownerId, companion_id: companionId,
  source_type: 'system', source_id: id(500), title: 'A quiet rest', body: 'Moss settles beside you.', created_at: '2026-10-04T10:00:00Z',
  meta_json: { category: 'sanctuary', itemKey: 'care-moss-seat', userItemId: ownedId, placementId: id(20), slot: 'left_grove', interactionType: 'shared_rest', action: 'shared_rest' }, ...overrides });
const story = (overrides: Partial<Parameters<typeof buildKeepsakeStory>[0]> = {}) => buildKeepsakeStory({ ownerId, owned, placements: [], journal: [], ...overrides })!;

describe('keepsake story facts', () => {
  it('shows exactly the versioned, persisted direct-care evidence in chronological order', () => {
    const value = story({ owned: { ...owned, provenance_json: { ruleVersion: 'direct-care-3-v1', careMoments: 3, careEvents: [...events].reverse() } } });
    expect(value.careEvents.map((event) => event.action)).toEqual(['feed', 'play', 'groom']);
    expect(value.sourceLabel).toBe('Earned through three care moments');
    expect(value.companionName).toBe('Moss');
  });
  it.each(['passive', 'milestone', 'sanctuary_rest', 'checkin'])('does not present %s as earning care', (action) => {
    expect(qualifiedCareEvents({ ...owned, provenance_json: { ruleVersion: 'direct-care-3-v1', careMoments: 3, careEvents: [events[0], events[1], { ...events[2], action }] } })).toEqual([]);
  });
  it.each([[['feed']], [{ action: 'feed' }]])('rejects non-string care actions %j', (action) => {
    expect(qualifiedCareEvents({ ...owned, provenance_json: { ruleVersion: 'direct-care-3-v1', careMoments: 3, careEvents: [events[0], events[1], { ...events[2], action }] } })).toEqual([]);
  });
  it.each([
    null, [], { ruleVersion: 'old', careMoments: 3, careEvents: events },
    { ruleVersion: 'direct-care-3-v1', careMoments: 99, careEvents: events },
    { ruleVersion: 'direct-care-3-v1', careMoments: 3, careEvents: [events[0], events[0], events[2]] },
    { ruleVersion: 'direct-care-3-v1', careMoments: 3, careEvents: events.slice(0, 2) },
    { ruleVersion: 'direct-care-3-v1', careMoments: 3, careEvents: [...events.slice(0, 2), { ...events[2], createdAt: '2027-01-01' }] },
    { ruleVersion: 'direct-care-3-v1', careMoments: 3, careEvents: [...events.slice(0, 2), { ...events[2], createdAt: 'bad' }] }
  ])('handles malformed or legacy evidence with a neutral source-only story', (provenance_json) => {
    const value = story({ owned: { ...owned, provenance_json } });
    expect(value.careEvents).toEqual([]);
    expect(value.sourceLabel).toBe('Added as a care keepsake');
    expect(value.sourceNote).toContain('not recorded');
  });
  it('rejects another owner even when a selected id is known', () => {
    expect(story({ owned: { ...owned, owner_id: id(999) } })).toBeNull();
  });
  it('does not borrow companion identity from an unrelated joined row or raw provenance', () => {
    expect(story({ owned: { ...owned, companion: { id: id(999), name: 'Foreign' }, provenance_json: { companionName: 'Fabricated' } } }).companionName).toBeNull();
  });
  it('shows all quantity-two placements for the exact acquisition, not another same-catalog acquisition', () => {
    const placements = [
      { id: id(20), owner_id: ownerId, user_item_id: ownedId, slot_key: 'left_grove' },
      { id: id(21), owner_id: ownerId, user_item_id: ownedId, slot_key: 'near_right' },
      { id: id(22), owner_id: ownerId, user_item_id: id(44), slot_key: 'center_glade' },
      { id: id(23), owner_id: id(999), user_item_id: ownedId, slot_key: 'right_grove' },
      { id: id(24), owner_id: ownerId, user_item_id: null, slot_key: 'near_left' }
    ];
    expect(story({ placements }).placements.map((p) => p.label)).toEqual(['Left grove', 'Near right']);
  });
  it('presents chapter reward acquisition without interpreting its theme as a strong bond', () => {
    const value = story({ owned: { ...owned, source_type: 'chapter_reward', provenance_json: { body: 'Your unbreakable bond', reason: '<script>invented</script>' } } });
    expect(value.sourceLabel).toBe('Added as a chapter keepsake');
    expect(JSON.stringify(value)).not.toContain('unbreakable');
    expect(JSON.stringify(value)).not.toContain('script');
  });
});

describe('exact recorded moments', () => {
  it('uses each recorded companion and Journal id, independent of today’s companion', () => {
    const row = journal(30, { companion_id: id(77) });
    expect(story({ journal: [row] }).moments[0]?.href).toBe(`/app/memory?companion=${id(77)}&moment=${id(30)}#moment-${id(30)}`);
  });
  it('keeps historical slot labels after removing or replacing today’s placement', () => {
    const value = story({ journal: [journal(30)], placements: [{ id: id(20), owner_id: ownerId, user_item_id: id(44), slot_key: 'near_right' }] });
    expect(value.placements).toEqual([]);
    expect(value.moments[0]?.slotLabel).toBe('Left grove');
  });
  it('does not treat rest source_id as the acquisition id', () => {
    expect(story({ journal: [journal(30)] }).moments).toHaveLength(1);
  });
  it('never guesses legacy or same-catalog history and ignores another owner', () => {
    const row = journal(30);
    expect(story({ journal: [
      { ...row, owner_id: id(999) },
      { ...row, meta_json: { ...(row.meta_json as object), userItemId: id(44) } },
      { ...row, meta_json: { category: 'sanctuary', itemKey: 'care-moss-seat' } },
      { ...row, meta_json: { ...(row.meta_json as object), interactionType: 'unknown' } }
    ] }).moments).toEqual([]);
  });
  it('only projects supported system entries and valid recorded fields', () => {
    expect(story({ journal: [journal(30, { source_type: 'reflection' }), journal(31, { body: null }), journal(32, { created_at: 'bad' }), journal(33, { companion_id: '' })] }).moments).toEqual([]);
  });
  it('supports the exact qualified acquisition memory, and ordinary placement metadata', () => {
    const unlock = journal(30, { source_id: ownedId, meta_json: { category: 'item_unlock', itemKey: 'care-moss-seat', userItemId: ownedId, sourceType: 'care_milestone', sourceKey: 'care_3', ruleVersion: 'direct-care-3-v1', careEvents: events } });
    const place = journal(31, { meta_json: { category: 'sanctuary', itemKey: 'care-moss-seat', userItemId: ownedId, placementId: id(20), slot: 'near_left' } });
    expect(story({ journal: [unlock, place] }).moments.map((m) => m.label)).toEqual(['Found a place', 'Keepsake arrived']);
  });
  it('sorts stably newest first, deduplicates and bounds recent moments', () => {
    const rows = Array.from({ length: 10 }, (_, i) => journal(40 + i));
    const value = story({ journal: [...rows.reverse(), rows[0]!] });
    expect(value.moments).toHaveLength(STORY_MOMENT_LIMIT);
    expect(value.moments[0]?.id).toBe(id(49));
  });
  it.each(['disabled', 'unavailable'] as const)('never returns history when %s', (historyState) => {
    expect(story({ historyState, journal: [journal(30)] }).moments).toEqual([]);
  });
  it('does not manufacture a memory from a valid acquisition', () => {
    expect(story().careEvents).toHaveLength(3);
    expect(story().moments).toEqual([]);
  });
  it('keeps deep links exact and supports a safe Sanctuary return', () => {
    expect(keepsakeStoryHref(ownedId, true)).toBe(`/app/inventory?item=${ownedId}&from=sanctuary#keepsake-story`);
    expect(storyDateLabel('bad')).toBe('Date not recorded');
  });
});
