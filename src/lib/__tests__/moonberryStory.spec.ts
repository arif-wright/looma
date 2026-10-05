import { describe, expect, it, vi } from 'vitest';
import { buildKeepsakeStory, recordedMoonberryEventId, type StoryJournalRow, type StoryOwnedItem } from '$lib/items/story';
import { load } from '../../routes/app/(protected)/inventory/+page.server';

const id = (n: number) => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const owner = id(1), companion = id(2), ownedId = id(3), eventId = id(4);
const owned: StoryOwnedItem = {
  id: ownedId, owner_id: owner, companion_id: companion, quantity: 5,
  source_type: 'world', source_key: 'moonberry-bush', acquired_at: '2026-10-01T10:00:00Z',
  provenance_json: { title: 'Gathered in Whispering Grove', worldEventId: eventId },
  companion: { id: companion, name: 'Lumi' },
  item: { id: id(5), item_key: 'world-moonberry', title: 'Moonberry', visual_key: 'moonberry', capabilities: ['consumable', 'giftable'] }
};
const moment: StoryJournalRow = {
  id: id(6), owner_id: owner, companion_id: companion, source_type: 'system', source_id: eventId,
  title: 'Moonberries in Whispering Grove', body: 'Lumi stays close while you gather the softly glowing berry.',
  created_at: '2026-10-01T10:00:00Z',
  meta_json: { kind: 'world_gather', itemKey: 'world-moonberry', mapId: 'wilds-exploration' }
};
const story = (item = owned, journal = [moment]) => buildKeepsakeStory({ ownerId: owner, owned: item, journal, placements: [] })!;

describe('exact Moonberry acquisition story', () => {
  it('uses only the persisted first gather and the recorded companion link', () => {
    const result = story(owned, [moment, { ...moment, id: id(7), source_id: id(8), body: 'A later gather.' }, moment]);
    expect(result.moments).toHaveLength(1);
    expect(result.moments[0]).toMatchObject({ id: moment.id, title: moment.title, body: moment.body,
      label: 'Gathered at Moonberry Grove', href: `/app/memory?companion=${companion}&moment=${moment.id}#moment-${moment.id}` });
    expect(result.sourceNote).toBe('This stack links to its first recorded gather. Later gathers are not linked here.');
    expect(result.placeable).toBe(false);
    expect(result.careEvents).toEqual([]);
  });
  it.each([
    ['missing provenance', { provenance_json: null }],
    ['array provenance', { provenance_json: [{ worldEventId: eventId }] }],
    ['invalid event id', { provenance_json: { worldEventId: `${eventId},source_id.neq.x` } }],
    ['legacy note alone', { provenance_json: { title: 'Gathered in Whispering Grove' } }],
    ['no companion', { companion_id: null }],
    ['invalid companion', { companion_id: 'today-active' }],
    ['other source', { source_type: 'chapter_reward' }],
    ['other node', { source_key: 'other-bush' }],
    ['other item', { item: { ...(owned.item as object), item_key: 'care-moss-seat' } }]
  ])('leaves %s unknown rather than inferring a gather', (_label, changes) => {
    const item = { ...owned, ...changes } as StoryOwnedItem;
    expect(recordedMoonberryEventId(item)).toBeNull();
    expect(story(item).moments).toEqual([]);
  });
  it.each([
    ['foreign owner', { owner_id: id(900) }],
    ['another companion', { companion_id: id(900) }],
    ['another event', { source_id: id(900) }],
    ['another source', { source_type: 'reflection' }],
    ['missing title', { title: null }],
    ['missing body', { body: null }],
    ['invalid date', { created_at: 'invalid' }],
    ['invalid Journal id', { id: 'invalid' }]
  ])('rejects %s on the Journal row', (_label, changes) => {
    expect(story(owned, [{ ...moment, ...changes }]).moments).toEqual([]);
  });
  it.each([
    { kind: 'other' }, { itemKey: 'other-item' }, { mapId: 'other-map' }, { userItemId: id(900) }
  ])('rejects inconsistent gather metadata %j', (changes) => {
    expect(story(owned, [{ ...moment, meta_json: { ...(moment.meta_json as object), ...changes } }]).moments).toEqual([]);
  });
  it('does not manufacture text for an acquisition without a Journal row', () => {
    expect(story(owned, []).moments).toEqual([]);
    expect(story({ ...owned, provenance_json: {} }, []).sourceNote).toContain('link is not available');
  });
  it('keeps the read-only history gate for both disabled and unavailable states', () => {
    for (const historyState of ['disabled', 'unavailable'] as const) {
      expect(buildKeepsakeStory({ ownerId: owner, owned, placements: [], journal: [moment], historyState })!.moments).toEqual([]);
    }
  });
});

type Options = { items?: StoryOwnedItem[]; journal?: StoryJournalRow[]; consent?: boolean; fail?: string;
  failWorld?: boolean; failVisibility?: boolean; recent?: number; tied?: boolean; companions?: string[]; subscriber?: boolean; selected?: string };
const fixture = (options: Options = {}) => {
  const calls: any[] = [];
  const sources: Record<string, any> = {
    shop_inventory: [], user_items: options.items ?? [owned], companion_chapter_rewards: [], sanctuary_placements: [],
    user_preferences: { consent_memory: options.consent ?? true }, companion_journal_entries: options.journal ?? [moment],
    user_subscriptions: options.subscriber ? { status: 'active', ends_at: '2999-01-01T00:00:00Z' } : null,
    user_daily_checkins: [], mission_sessions: [], game_sessions: [], companion_care_events: [], companion_memory_summary: null
  };
  const from = vi.fn((table: string) => {
    const call: any = { table, selected: '', filters: [], order: [], limit: null }; calls.push(call);
    const resolve = () => {
      const worldRead = table === 'companion_journal_entries' && call.filters.some((entry: any[]) => entry[1] === 'source_id');
      const visibility = table === 'companion_journal_entries' && call.selected === 'id, created_at';
      if (table === options.fail || (worldRead && options.failWorld) || (visibility && options.failVisibility)) {
        return { data: null, error: { message: 'private history failure' } };
      }
      let data = sources[table];
      if (table === 'companions') {
        const requested = call.filters.find((entry: any[]) => entry[1] === 'id')?.[2];
        data = (options.companions ?? [companion]).includes(requested) ? { id: requested } : null;
      }
      if (Array.isArray(data)) {
        data = data.filter((row: any) => call.filters.every(([op, column, value]: any[]) =>
          op === 'eq' ? row[column] === value : op === 'contains'
            ? Object.entries(value).every(([key, expected]) => row[column]?.[key] === expected)
            : op === 'in' ? value.includes(row[column]) : true));
        if (visibility) data = [...data, ...Array.from({ length: options.recent ?? 0 }, (_, n) => ({ id: id(100 + n), created_at: options.tied ? moment.created_at : '2026-10-05T00:00:00Z' }))];
        for (const [column, config] of [...call.order].reverse()) data = [...data].sort((a: any, b: any) =>
          String(a[column]).localeCompare(String(b[column])) * (config.ascending ? 1 : -1));
        if (call.limit !== null) data = data.slice(0, call.limit);
      }
      return { data, error: null };
    };
    const q: any = {
      select: (columns: string) => { call.selected = columns; return q; },
      eq: (column: string, value: unknown) => { call.filters.push(['eq', column, value]); return q; },
      in: (column: string, value: unknown) => { call.filters.push(['in', column, value]); return q; },
      contains: (column: string, value: unknown) => { call.filters.push(['contains', column, value]); return q; },
      order: (column: string, config: unknown) => { call.order.push([column, config]); return q; },
      limit: (limit: number) => { call.limit = limit; return q; }, maybeSingle: () => q,
      then: (success: any, failure: any) => Promise.resolve(resolve()).then(success, failure)
    };
    return q;
  });
  const url = new URL(`https://example.test/app/inventory?item=${options.selected ?? ownedId}`);
  const run = () => load({ locals: { supabase: { from }, user: { id: owner } }, url } as any) as Promise<any>;
  return { calls, run, url };
};
const eventReads = (calls: any[]) => calls.filter((call) => call.filters.some((entry: any[]) => entry[1] === 'source_id'));
const noHiddenMoment = (data: unknown) => {
  const serialized = JSON.stringify(data);
  expect(serialized).not.toContain(moment.id);
  expect(serialized).not.toContain(moment.title);
  expect(serialized).not.toContain(moment.body);
};

describe('Moonberry route privacy and recorded-event boundary', () => {
  it('performs one exact bounded event lookup with the same authenticated read-only client', async () => {
    const test = fixture(); const result = await test.run();
    expect(result.story.moments).toHaveLength(1);
    expect(eventReads(test.calls)).toHaveLength(1);
    expect(eventReads(test.calls)[0]).toMatchObject({ table: 'companion_journal_entries', limit: 1, filters: [
      ['eq', 'owner_id', owner], ['eq', 'companion_id', companion], ['eq', 'source_type', 'system'], ['eq', 'source_id', eventId],
      ['contains', 'meta_json', { kind: 'world_gather', itemKey: 'world-moonberry', mapId: 'wilds-exploration' }]
    ] });
    for (const call of test.calls) expect(call.filters.some((entry: any[]) => ['owner_id', 'user_id'].includes(entry[1]) && entry[2] === owner)).toBe(true);
  });
  it.each([{ consent: false }, { fail: 'user_preferences' }])('does not read Journal when consent is closed: %j', async (options) => {
    const test = fixture(options); const result = await test.run();
    expect(result.story.moments).toEqual([]);
    expect(test.calls.some((call) => call.table === 'companion_journal_entries')).toBe(false);
    noHiddenMoment(result);
  });
  it.each([null, {}, [], { worldEventId: 'invalid' }])('does not look up an event for unknown legacy provenance %j', async (provenance_json) => {
    const test = fixture({ items: [{ ...owned, provenance_json }] });
    expect((await test.run()).story.moments).toEqual([]);
    expect(eventReads(test.calls)).toEqual([]);
  });
  it('does not borrow a current companion for a companion-less acquisition', async () => {
    const test = fixture({ items: [{ ...owned, companion_id: null }] });
    expect((await test.run()).story.moments).toEqual([]);
    expect(eventReads(test.calls)).toEqual([]);
  });
  it('cannot select another owner’s acquisition', async () => {
    const test = fixture({ items: [{ ...owned, owner_id: id(999) }] }); const result = await test.run();
    expect(result.story).toBeNull(); expect(eventReads(test.calls)).toEqual([]); noHiddenMoment(result);
  });
  it.each([
    { recent: 30 }, { recent: 90, subscriber: true }, { recent: 60, subscriber: true },
    { companions: [] }, { failWorld: true }, { failVisibility: true }, { fail: 'companion_care_events' }
  ])('keeps inaccessible candidate text and Journal IDs off the complete payload: %j', async (options) => {
    const result = await fixture(options).run();
    expect(result.story.moments).toEqual([]); expect(result.unifiedItems).toHaveLength(1);
    noHiddenMoment(result); expect(JSON.stringify(result)).not.toContain('private history');
  });
  it('honors the existing subscriber window without bypassing it', async () => {
    expect((await fixture({ recent: 30, subscriber: true }).run()).story.moments).toHaveLength(1);
  });
  it('deduplicates an exact gather returned through both supported metadata links', async () => {
    const result = await fixture({ journal: [{ ...moment, meta_json: { ...(moment.meta_json as object), userItemId: ownedId } }] }).run();
    expect(result.story.moments.map((row: any) => row.id)).toEqual([moment.id]);
  });
  it.each([{ recent: 28, tied: true }, { recent: 59, tied: true, subscriber: true }])('does not expose ambiguous timestamp-boundary gathers: %j', async (options) => {
    const result = await fixture(options).run();
    expect(result.story.moments).toEqual([]); noHiddenMoment(result);
  });
  it('does not treat a different event from the same item/companion as the acquisition', async () => {
    const result = await fixture({ journal: [{ ...moment, source_id: id(99) }] }).run();
    expect(result.story.moments).toEqual([]); noHiddenMoment(result);
  });
  it('returns the same facts on reload, and isolates a second Moonberry selection', async () => {
    const second = { ...owned, id: id(10), provenance_json: { worldEventId: id(11) } };
    const secondMoment = { ...moment, id: id(12), source_id: id(11), title: 'A separate Moonberry visit', body: 'A separate acquisition.' };
    const test = fixture({ items: [owned, second], journal: [moment, secondMoment] });
    expect((await test.run()).story).toEqual((await test.run()).story);
    test.url.searchParams.set('item', second.id);
    const result = await test.run();
    expect(result.story.moments.map((row: any) => row.id)).toEqual([secondMoment.id]); noHiddenMoment(result);
  });
  it('preserves collection when the exact recorded gather no longer exists', async () => {
    const result = await fixture({ journal: [] }).run();
    expect(result.story.historyState).toBe('ready'); expect(result.story.moments).toEqual([]);
    expect(result.unifiedItems[0].quantity).toBe(5);
  });
});
