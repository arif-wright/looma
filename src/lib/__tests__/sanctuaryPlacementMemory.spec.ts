import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../routes/api/sanctuary/placement/+server';

const saved = { id: 'memory-1', companion_id: 'companion-1', title: 'Lantern found a place', body: 'A quiet light.' };
const setup = (journalFails = false, unchanged = false, options: { missingOwned?: boolean; ambiguous?: boolean; quantityExceeded?: boolean; differentAcquisition?: boolean } = {}) => {
  const insert = vi.fn();
  const upsert = vi.fn();
  const eq = vi.fn();
  const client = { from: (table: string) => {
    let writing = false;
    const q: any = {
      select: () => q, eq: (column: string, value: unknown) => { eq(table, column, value); return q; }, order: () => q, limit: () => q,
      upsert: (row: unknown) => { upsert(row); writing = true; return q; },
      insert: (row: unknown) => { insert(row); return q; },
      maybeSingle: async () => ({ error: table === 'user_items' && options.ambiguous ? { code: 'PGRST116' } : null, data:
        table === 'user_items' && options.missingOwned ? null :
        table === 'user_items' ? { id: 'owned-1', quantity: 1, source_type: 'care_milestone', source_key: 'three-care', provenance_json: {}, item: { id: 'item-1', item_key: 'lantern', title: 'Lantern', tone: 'care', capabilities: ['placeable'] } } :
        table === 'companions' ? { id: 'companion-1', name: 'Root' } :
        unchanged ? { id: 'placement-1', item_id: 'item-1', user_item_id: options.differentAcquisition ? 'owned-2' : 'owned-1' } : null }),
      single: async () => table === 'companion_journal_entries'
        ? { data: journalFails ? null : saved, error: journalFails ? { message: 'unavailable' } : null }
        : { data: writing ? { id: 'placement-1' } : null, error: options.quantityExceeded ? { message: 'item_quantity_exhausted' } : null }
    };
    return q;
  } };
  return { insert, upsert, eq, event: {
    locals: { supabase: client, user: { id: 'owner-1' } },
    request: new Request('https://example.test/api/sanctuary/placement', { method: 'POST', body: JSON.stringify({ slot: 'center_glade', itemId: 'item-1' }) })
  } as any };
};

describe('placement memory result', () => {
  it('resolves the explicitly selected owned row within the current owner', async () => {
    const { event, eq, upsert } = setup();
    event.request = new Request('https://example.test', { method: 'POST', body: JSON.stringify({ slot: 'center_glade', userItemId: 'owned-1' }) });
    expect((await POST(event)).status).toBe(200);
    expect(eq).toHaveBeenCalledWith('user_items', 'owner_id', 'owner-1');
    expect(eq).toHaveBeenCalledWith('user_items', 'id', 'owned-1');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_item_id: 'owned-1', item_id: 'item-1' }));
  });
  it('does not conflate different acquisitions of the same catalog item', async () => {
    const { event, upsert } = setup(false, true, { differentAcquisition: true });
    expect((await POST(event)).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_item_id: 'owned-1' }));
  });
  it('rejects an owned row unavailable to this owner without writing', async () => {
    const { event, upsert } = setup(false, false, { missingOwned: true });
    expect((await POST(event)).status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });
  it('asks legacy callers to choose when a catalog item has multiple acquisitions', async () => {
    const { event, upsert } = setup(false, false, { ambiguous: true });
    const response = await POST(event);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'owned_item_selection_required' });
    expect(upsert).not.toHaveBeenCalled();
  });
  it('surfaces database capacity rejection without recording a placement memory', async () => {
    const { event, insert } = setup(false, false, { quantityExceeded: true });
    const response = await POST(event);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'item_quantity_exhausted' });
    expect(insert).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated callers', async () => {
    const { event, upsert } = setup();
    event.locals.user = null;
    expect((await POST(event)).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });
  it('rejects a null payload rather than throwing', async () => {
    const { event } = setup();
    event.request = new Request('https://example.test', { method: 'POST', body: 'null' });
    expect((await POST(event)).status).toBe(400);
  });
  it('returns the exact persisted entry after placement', async () => {
    const { event, insert } = setup();
    const response = await POST(event);
    expect(response.status).toBe(200);
    expect((await response.json()).memory).toEqual(saved);
    expect(insert.mock.calls[0][0]).toMatchObject({ owner_id: 'owner-1', companion_id: 'companion-1', meta_json: { userItemId: 'owned-1', placementId: 'placement-1', acquisition: { sourceType: 'care_milestone', sourceKey: 'three-care' } } });
  });
  it('reports no memory when the placement succeeds but journal persistence fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { event } = setup(true);
      const response = await POST(event);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, placement: { id: 'placement-1' }, memory: null });
    } finally { log.mockRestore(); }
  });
  it('does not create another memory for an unchanged placement', async () => {
    const { event, insert } = setup(false, true);
    expect(await (await POST(event)).json()).toMatchObject({ ok: true, unchanged: true });
    expect(insert).not.toHaveBeenCalled();
  });
});
