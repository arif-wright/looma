import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { createCompanionRosterState } from '$lib/stores/companionRosterState';
import type { Companion } from '$lib/stores/companions';

const makeCompanion = (overrides: Partial<Companion>): Companion => ({
  id: overrides.id ?? crypto.randomUUID(),
  owner_id: overrides.owner_id ?? 'user-1',
  name: overrides.name ?? 'Mirae',
  species: overrides.species ?? 'Muse',
  rarity: overrides.rarity ?? 'common',
  level: overrides.level ?? 1,
  xp: overrides.xp ?? 0,
  affection: overrides.affection ?? 50,
  trust: overrides.trust ?? 50,
  energy: overrides.energy ?? 50,
  mood: overrides.mood ?? 'steady',
  state: overrides.state ?? 'idle',
  is_active: overrides.is_active ?? false,
  slot_index: overrides.slot_index ?? 0,
  avatar_url: overrides.avatar_url ?? null,
  created_at: overrides.created_at ?? new Date('2025-01-01T00:00:00.000Z').toISOString(),
  updated_at: overrides.updated_at ?? new Date('2025-01-01T00:00:00.000Z').toISOString(),
  stats: overrides.stats ?? null,
  bond_level: overrides.bond_level ?? 0,
  bond_score: overrides.bond_score ?? 0
});

describe('companionRosterState', () => {
  it('sets and reads one canonical active instance', () => {
    const first = makeCompanion({ id: 'c1', name: 'Mirae', slot_index: 0, is_active: true, state: 'active' });
    const second = makeCompanion({ id: 'c2', name: 'Nova', slot_index: 1, is_active: false, state: 'idle' });
    const store = createCompanionRosterState([first, second], first.id);

    const activeBefore = store.getActiveCompanion();
    expect(activeBefore?.id).toBe('c1');

    store.setActiveCompanion('c2');
    const activeAfter = store.getActiveCompanion();
    expect(activeAfter?.id).toBe('c2');

    const snapshot = get(store);
    expect(snapshot.instances.find((entry) => entry.id === 'c1')?.is_active).toBe(false);
    expect(snapshot.instances.find((entry) => entry.id === 'c2')?.is_active).toBe(true);
  });

  it('updates stats and records interactions on the same instance', () => {
    const base = makeCompanion({ id: 'c1', name: 'Mirae', is_active: true, state: 'active' });
    const store = createCompanionRosterState([base], base.id);

    store.updateCompanionStats('c1', {
      affection: 62,
      trust: 66,
      energy: 71,
      mood: 'happy',
      bond_level: 4,
      bond_score: 220
    });
    store.recordInteraction('c1', 'feed', '2026-02-09T10:30:00.000Z');

    const active = store.getActiveCompanion();
    expect(active?.affection).toBe(62);
    expect(active?.trust).toBe(66);
    expect(active?.energy).toBe(71);
    expect(active?.mood).toBe('happy');
    expect(active?.stats?.fed_at).toBe('2026-02-09T10:30:00.000Z');
    expect(active?.stats?.bond_level).toBe(4);
    expect(active?.stats?.bond_score).toBe(220);
  });
});
