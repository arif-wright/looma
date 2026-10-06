import { describe, expect, it, vi } from 'vitest';
import { load } from '../../routes/app/(protected)/inventory/+page.server';
import { withinStoryJournalWindow } from '$lib/server/items/storyHistory';
const id = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const owner = id(1), ownedId = id(2), companion = id(3), otherOwned = id(4);
const owned = { id: ownedId, owner_id: owner, companion_id: companion, quantity: 2, source_type: 'care_milestone', source_key: 'care_3', acquired_at: '2026-10-01T10:00:00Z', provenance_json: {}, item: { id: id(99), item_key: 'care-moss-seat', title: 'Moss Seat', visual_key: 'moss_seat', capabilities: ['placeable'] } };
const moment = { id: id(40), owner_id: owner, companion_id: companion, source_type: 'system', title: 'A quiet rest', body: 'Moss settles beside you.', created_at: '2026-10-04T10:00:00Z', meta_json: { category: 'sanctuary', userItemId: ownedId, itemKey: 'care-moss-seat', placementId: id(20), slot: 'left_grove', interactionType: 'shared_rest', action: 'shared_rest' } };
const fixture = (options: { selected?: string; owner?: string | null; missing?: boolean; foreign?: boolean; fail?: string; throwTable?: string; consent?: boolean; extraRecent?: number; returnSelection?: string; subscription?: { status: string; ends_at: string }; companions?: string[]; journal?: any[]; visibilityFailure?: boolean } = {}) => {
  const calls: any[] = [];
  const sources: Record<string, any> = {
    shop_inventory: [], user_items: options.missing ? [] : [{ ...owned, owner_id: options.foreign ? id(999) : owner }, { ...owned, id: otherOwned }],
    companion_chapter_rewards: [], sanctuary_placements: [
      { id: id(20), owner_id: owner, user_item_id: ownedId, slot_key: 'left_grove' },
      { id: id(21), owner_id: owner, user_item_id: ownedId, slot_key: 'near_right' }
    ], user_preferences: { consent_memory: options.consent ?? true }, companion_journal_entries: options.journal ?? [moment],
    companions: { id: companion }, user_subscriptions: options.subscription ?? null, user_daily_checkins: [], mission_sessions: [], game_sessions: [], companion_care_events: [], companion_memory_summary: null
  };
  const from = vi.fn((table: string) => {
    const call: any = { table, filters: [], selected: '', order: [], limit: null };
    calls.push(call);
    const resolve = () => {
      if (table === options.throwTable) return Promise.reject(new Error('private connection details'));
      let data = sources[table];
      if (table === 'companions') {
        const requested = call.filters.find((filter: any[]) => filter[1] === 'id')?.[2];
        data = (options.companions ?? [companion]).includes(requested) ? { id: requested } : null;
      }
      if (table === 'companion_journal_entries' && call.selected === 'id, created_at') {
        if (options.visibilityFailure) return Promise.resolve({ data: null, error: { message: 'private visibility details' } });
        const requested = call.filters.find((filter: any[]) => filter[1] === 'companion_id')?.[2];
        data = [...sources.companion_journal_entries.filter((row: any) => row.companion_id === requested), ...Array.from({ length: options.extraRecent ?? 0 }, (_, i) => ({ id: id(100 + i), created_at: '2026-10-05T10:00:00Z' }))];
      }
      return Promise.resolve({ data, error: table === options.fail ? { message: 'private database details' } : null });
    };
    const q: any = { select: (columns: string) => { call.selected = columns; return q; },
      eq: (column: string, value: unknown) => { call.filters.push(['eq', column, value]); return q; },
      in: (column: string, value: unknown) => { call.filters.push(['in', column, value]); return q; },
      contains: (column: string, value: unknown) => { call.filters.push(['contains', column, value]); return q; },
      order: (column: string, value: unknown) => { call.order.push([column, value]); return q; },
      limit: (value: number) => { call.limit = value; return q; }, maybeSingle: () => q,
      then: (success: any, failure: any) => resolve().then(success, failure) };
    return q;
  });
  const url = new URL('https://example.test/app/inventory');
  if (options.selected !== undefined) url.searchParams.set('item', options.selected);
  if (options.returnSelection) { url.searchParams.set('from', 'sanctuary'); url.searchParams.set('selected', options.returnSelection); }
  const event = { locals: { supabase: { from }, user: options.owner === null ? null : { id: options.owner ?? owner } }, url } as any;
  return { run: () => load(event) as Promise<any>, calls, from, event };
};

describe('read-only keepsake route', () => {
  it('does not query any data for signed-out visitors', async () => {
    const test = fixture({ owner: null, selected: ownedId });
    expect((await test.run()).story).toBeNull();
    expect(test.from).not.toHaveBeenCalled();
  });
  it('loads the collection without any Journal or consent query when no story is selected', async () => {
    const test = fixture();
    expect((await test.run()).storyStatus).toBeNull();
    expect(test.calls).toHaveLength(5);
    for (const call of test.calls) expect(call.filters).toContainEqual(['eq', call.table === 'shop_inventory' ? 'user_id' : 'owner_id', owner]);
  });
  it.each(['', 'invalid', '../../foreign', id(999)])('fails closed on unavailable selection %s without history reads', async (selected) => {
    const test = fixture({ selected });
    const data = await test.run();
    expect(data.story).toBeNull(); expect(data.storyStatus).toBe('unavailable'); expect(data.unifiedItems).toHaveLength(2);
    expect(test.calls.some((call) => call.table === 'companion_journal_entries')).toBe(false);
  });
  it('does not disclose a foreign acquisition or query its history', async () => {
    const test = fixture({ selected: ownedId, foreign: true });
    const data = await test.run();
    expect(data.story).toBeNull(); expect(data.unifiedItems.map((row: any) => row.id)).not.toContain(ownedId);
    expect(test.calls.some((call) => call.table === 'companion_journal_entries')).toBe(false);
  });
  it('returns exact owner-filtered, bounded history and all placements', async () => {
    const test = fixture({ selected: ownedId });
    const data = await test.run();
    expect(data.story.moments).toHaveLength(1); expect(data.story.placements).toHaveLength(2);
    const history = test.calls.find((call) => call.table === 'companion_journal_entries' && call.selected.includes('meta_json'));
    expect(history.filters).toEqual([['eq', 'owner_id', owner], ['eq', 'source_type', 'system'], ['contains', 'meta_json', { userItemId: ownedId }]]);
    expect(history.limit).toBe(6); expect(history.order.map((entry: any) => entry[0])).toEqual(['created_at', 'id']);
    for (const call of test.calls) expect(call.filters.some((entry: any) => ['owner_id', 'user_id'].includes(entry[1]) && entry[2] === owner)).toBe(true);
  });
  it('does not return an older item-linked record hidden by Journal’s free window', async () => {
    const test = fixture({ selected: ownedId, extraRecent: 30 });
    const data = await test.run(); expect(data.story.moments).toEqual([]);
    // The entire payload must exclude archived text and identifiers.
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain(moment.body);
    expect(serialized).not.toContain(moment.title);
    expect(serialized).not.toContain(moment.id);
  });
  it.each(['companion_journal_entries', 'user_preferences', 'user_subscriptions', 'companion_care_events'])('keeps acquisition and collection when %s fails', async (fail) => {
    const test = fixture({ selected: ownedId, fail }); const data = await test.run();
    expect(data.unifiedItems).toHaveLength(2); expect(data.story.historyState).toBe('unavailable'); expect(data.story.moments).toEqual([]);
    expect(JSON.stringify(data)).not.toContain('private database');
  });
  it('preserves collection and gives unknown placement state on a failed placement read', async () => {
    const data = await fixture({ selected: ownedId, fail: 'sanctuary_placements' }).run();
    expect(data.unifiedItems).toHaveLength(2); expect(data.story.placementsAvailable).toBe(false); expect(data.story.placements).toEqual([]);
    expect(data.placementsAvailable).toBe(false);
  });
  it('uses current subscription expiry when deciding whether the same candidate is visible', async () => {
    const active = await fixture({ selected: ownedId, extraRecent: 30, subscription: { status: 'active', ends_at: '2999-01-01T00:00:00Z' } }).run();
    const expired = await fixture({ selected: ownedId, extraRecent: 30, subscription: { status: 'active', ends_at: '2000-01-01T00:00:00Z' } }).run();
    expect(active.story.moments).toHaveLength(1);
    expect(expired.story.moments).toEqual([]);
    expect(JSON.stringify(expired)).not.toContain(moment.id);
    expect(JSON.stringify(expired)).not.toContain(moment.body);
  });
  it('omits history for a missing or no-longer-owned recorded companion', async () => {
    const data = await fixture({ selected: ownedId, companions: [] }).run();
    expect(data.story.moments).toEqual([]);
    expect(JSON.stringify(data)).not.toContain(moment.id);
  });
  it('keeps mixed-companion history tied to each verified recorded companion', async () => {
    const other = { ...moment, id: id(41), companion_id: id(8) };
    const allowed = await fixture({ selected: ownedId, companions: [companion, id(8)], journal: [moment, other] }).run();
    expect(allowed.story.moments.map((row: any) => row.href)).toEqual(expect.arrayContaining([
      expect.stringContaining(`companion=${companion}`), expect.stringContaining(`companion=${id(8)}`)
    ]));
    const missing = await fixture({ selected: ownedId, journal: [moment, other] }).run();
    expect(missing.story.moments.map((row: any) => row.id)).toEqual([moment.id]);
    expect(JSON.stringify(missing)).not.toContain(other.id);
  });
  it('does not serialize candidate text or IDs when its timestamp-only visibility query fails', async () => {
    const data = await fixture({ selected: ownedId, visibilityFailure: true }).run();
    expect(data.story.historyState).toBe('unavailable');
    expect(data.story.moments).toEqual([]);
    expect(JSON.stringify(data)).not.toContain(moment.id);
    expect(JSON.stringify(data)).not.toContain(moment.body);
    expect(JSON.stringify(data)).not.toContain('private visibility');
  });
  it('handles rejected reads without throwing or erasing acquisition facts', async () => {
    const data = await fixture({ selected: ownedId, throwTable: 'companion_journal_entries' }).run();
    expect(data.story.historyState).toBe('unavailable'); expect(data.unifiedItems).toHaveLength(2);
  });
  it('honors memory opt-out without reading Journal', async () => {
    const test = fixture({ selected: ownedId, consent: false });
    expect((await test.run()).story.historyState).toBe('disabled');
    expect(test.calls.some((call) => call.table === 'companion_journal_entries')).toBe(false);
  });
  it('preserves the prior owned Sanctuary selection and rejects a foreign return target', async () => {
    expect((await fixture({ selected: ownedId, returnSelection: otherOwned }).run()).storySanctuarySelection).toBe(otherOwned);
    expect((await fixture({ selected: ownedId, returnSelection: id(999) }).run()).storySanctuarySelection).toBeNull();
  });
  it('reloads/repeats the same read without changing facts and follows a new selected acquisition', async () => {
    const test = fixture({ selected: ownedId });
    expect((await test.run()).story).toEqual((await test.run()).story);
    test.event.url.searchParams.set('item', otherOwned);
    const other = await test.run(); expect(other.story.id).toBe(otherOwned); expect(other.story.moments).toEqual([]); expect(other.story.placements).toEqual([]);
    test.event.url.searchParams.delete('item'); expect((await test.run()).story).toBeNull();
    test.event.url.searchParams.set('item', ownedId); expect((await test.run()).story.id).toBe(ownedId);
  });
});

describe('conservative Journal visibility', () => {
  const journal = [moment];
  it('includes care, checkin, mission, game and summary timestamps in the window', () => {
    expect(withinStoryJournalWindow(moment, { journal, subscriber: false, otherDates: Array(28).fill('2026-10-05') })).toBe(false);
    expect(withinStoryJournalWindow(moment, { journal, subscriber: false, otherDates: Array(27).fill('2026-10-05') })).toBe(true);
  });
  it('uses the existing subscriber allowance but still bounds older records', () => {
    expect(withinStoryJournalWindow(moment, { journal, subscriber: true, otherDates: Array(60).fill('2026-10-05') })).toBe(true);
    expect(withinStoryJournalWindow(moment, { journal, subscriber: true, otherDates: Array(90).fill('2026-10-05') })).toBe(false);
  });
  it('does not reveal a candidate outside the latest 60 Journal input records', () => {
    expect(withinStoryJournalWindow(moment, { journal: [], subscriber: true, otherDates: [] })).toBe(false);
  });
  it('excludes the ambiguous equal-timestamp edge of the Journal input window', () => {
    const tied = Array.from({ length: 60 }, (_, i) => ({ id: id(i + 40), created_at: moment.created_at }));
    expect(withinStoryJournalWindow(moment, { journal: tied, subscriber: true, otherDates: [] })).toBe(false);
  });
  it('counts all timestamp ties against the visibility budget', () => {
    expect(withinStoryJournalWindow(moment, { journal, subscriber: false, otherDates: Array(28).fill(moment.created_at) })).toBe(false);
  });
});
