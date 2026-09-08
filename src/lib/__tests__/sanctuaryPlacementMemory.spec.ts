import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../routes/api/sanctuary/placement/+server';

const saved = { id: 'memory-1', companion_id: 'companion-1', title: 'Lantern found a place', body: 'A quiet light.' };
const setup = (journalFails = false, unchanged = false) => {
  const insert = vi.fn();
  const client = { from: (table: string) => {
    let writing = false;
    const q: any = {
      select: () => q, eq: () => q, order: () => q, limit: () => q,
      upsert: () => { writing = true; return q; },
      insert: (row: unknown) => { insert(row); return q; },
      maybeSingle: async () => ({ error: null, data:
        table === 'user_items' ? { item: { id: 'item-1', item_key: 'lantern', title: 'Lantern', tone: 'care', capabilities: ['placeable'] } } :
        table === 'companions' ? { id: 'companion-1', name: 'Root' } :
        unchanged ? { id: 'placement-1', item_id: 'item-1' } : null }),
      single: async () => table === 'companion_journal_entries'
        ? { data: journalFails ? null : saved, error: journalFails ? { message: 'unavailable' } : null }
        : { data: writing ? { id: 'placement-1' } : null, error: null }
    };
    return q;
  } };
  return { insert, event: {
    locals: { supabase: client, user: { id: 'owner-1' } },
    request: new Request('https://example.test/api/sanctuary/placement', { method: 'POST', body: JSON.stringify({ slot: 'center_glade', itemId: 'item-1' }) })
  } as any };
};

describe('placement memory result', () => {
  it('returns the exact persisted entry after placement', async () => {
    const { event, insert } = setup();
    const response = await POST(event);
    expect(response.status).toBe(200);
    expect((await response.json()).memory).toEqual(saved);
    expect(insert.mock.calls[0][0]).toMatchObject({ owner_id: 'owner-1', companion_id: 'companion-1' });
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
