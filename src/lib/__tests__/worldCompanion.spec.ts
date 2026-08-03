import { describe, expect, it } from 'vitest';
import { resolveWorldCompanionProjection, type WorldCompanionRow } from '$lib/server/worldCompanion';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const row = (overrides: Partial<WorldCompanionRow> = {}): WorldCompanionRow => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner_id: OWNER,
  name: 'Lumi', species: 'muse', is_active: true, slot_index: 0, ...overrides
});

describe('world companion projection', () => {
  it('rejects another owner companion and supports a missing companion', () => {
    expect(resolveWorldCompanionProjection(OWNER, [row({ owner_id: OTHER })])).toEqual({
      present: false, name: '', kind: '', availability: 'unavailable'
    });
    expect(resolveWorldCompanionProjection(OWNER, [])).toMatchObject({ present: false });
  });

  it('uses the canonical active companion and reflects a changed selection', () => {
    const first = row({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Lumi', is_active: true });
    const second = row({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Ember', species: 'guardian', is_active: false });
    expect(resolveWorldCompanionProjection(OWNER, [first, second])).toMatchObject({ name: 'Lumi', kind: 'muse' });
    first.is_active = false;
    second.is_active = true;
    expect(resolveWorldCompanionProjection(OWNER, [first, second])).toMatchObject({ name: 'Ember', kind: 'guardian' });
  });

  it('serializes only bounded public presentation fields', () => {
    const projection = resolveWorldCompanionProjection(OWNER, [row({
      name: `Lumi\u0000${'x'.repeat(80)}`, species: 'Muse<script>'
    })]);
    expect(Object.keys(projection).sort()).toEqual(['availability', 'kind', 'name', 'present']);
    expect(projection.name.length).toBeLessThanOrEqual(32);
    expect(projection.kind).toBe('musescript');
    expect(JSON.stringify(projection)).not.toContain('aaaaaaaa-aaaa');
  });
});
