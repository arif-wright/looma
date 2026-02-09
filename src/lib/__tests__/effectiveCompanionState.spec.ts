import { describe, expect, it } from 'vitest';
import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';
import type { Companion } from '$lib/stores/companions';

const makeCompanion = (overrides: Partial<Companion>): Companion => ({
  id: overrides.id ?? crypto.randomUUID(),
  owner_id: overrides.owner_id ?? 'user-1',
  name: overrides.name ?? 'Mirae',
  species: overrides.species ?? 'Muse',
  rarity: overrides.rarity ?? 'common',
  level: overrides.level ?? 1,
  xp: overrides.xp ?? 0,
  affection: overrides.affection ?? 70,
  trust: overrides.trust ?? 65,
  energy: overrides.energy ?? 55,
  mood: overrides.mood ?? 'happy',
  state: overrides.state ?? 'active',
  is_active: overrides.is_active ?? true,
  slot_index: overrides.slot_index ?? 0,
  avatar_url: overrides.avatar_url ?? null,
  created_at: overrides.created_at ?? new Date('2025-01-01T00:00:00.000Z').toISOString(),
  updated_at: overrides.updated_at ?? new Date('2025-01-01T00:00:00.000Z').toISOString(),
  stats: overrides.stats ?? null,
  bond_level: overrides.bond_level ?? 0,
  bond_score: overrides.bond_score ?? 0
});

describe('computeCompanionEffectiveState', () => {
  it('derives mood away from "happy" when care is very old', () => {
    const now = new Date('2026-02-09T12:00:00.000Z');
    const oldCare = new Date('2025-12-02T12:00:00.000Z').toISOString(); // ~69 days before Feb 9, 2026
    const companion = makeCompanion({
      mood: 'happy',
      energy: 60,
      affection: 80,
      trust: 75,
      stats: {
        companion_id: 'c1',
        care_streak: 0,
        fed_at: oldCare,
        played_at: null,
        groomed_at: null,
        last_passive_tick: oldCare,
        last_daily_bonus_at: null,
        bond_level: 10,
        bond_score: 999
      }
    });

    const effective = computeCompanionEffectiveState(companion, now);
    expect(effective.msSinceCare).not.toBeNull();
    expect(effective.moodLabel).not.toBe('Happy');
    expect(effective.energy).toBeLessThan(companion.energy);
  });

  it('uses a bright mood shortly after care', () => {
    const now = new Date('2026-02-09T12:00:00.000Z');
    const recentCare = new Date('2026-02-09T11:50:00.000Z').toISOString();
    const companion = makeCompanion({
      energy: 70,
      affection: 75,
      trust: 70,
      stats: {
        companion_id: 'c1',
        care_streak: 1,
        fed_at: recentCare,
        played_at: null,
        groomed_at: null,
        last_passive_tick: recentCare,
        last_daily_bonus_at: null,
        bond_level: 2,
        bond_score: 50
      }
    });

    const effective = computeCompanionEffectiveState(companion, now);
    expect(['Radiant', 'Calm']).toContain(effective.moodLabel);
  });
});

