import { describe, expect, it } from 'vitest';
import {
  companionArchetypes,
  getCompanionArchetype,
  getCompanionElementProfile,
  getCompanionIdentity,
  getCompanionPersonality,
  getElementGifts,
  getGiftsForCompanion,
  getGrowthMilestonesForArchetype,
  getStoryForCompanion
} from '$lib/companions/identity';
import type { Companion } from '$lib/stores/companions';

const companion = (overrides: Partial<Companion> = {}): Companion => ({
  id: 'c1',
  name: 'Lumi',
  species: 'muse',
  rarity: 'epic',
  level: 8,
  xp: 0,
  affection: 72,
  trust: 68,
  energy: 80,
  mood: 'happy',
  avatar_url: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  stats: { companion_id: 'c1', care_streak: 0, fed_at: null, played_at: null, groomed_at: null, bond_level: 8, bond_score: 70 },
  ...overrides
});

describe('companion identity framework', () => {
  it('defines the five canonical companion archetypes', () => {
    expect(Object.keys(companionArchetypes).sort()).toEqual(['echo', 'guardian', 'muse', 'root', 'spark']);
    expect(getCompanionArchetype('guardian').primaryElement).toBe('ember');
    expect(getCompanionArchetype('spark').defaultSecondaryElement).toBe('light');
  });

  it('resolves a full default Muse identity with gifts, growth, and story', () => {
    const identity = getCompanionIdentity(companion());

    expect(identity.elementProfile.primary).toBe('sound');
    expect(identity.elementProfile.secondary).toBe('light');
    expect(identity.elementProfile.variantId).toBe('sound_light');
    expect(identity.personality).toEqual(['Empathetic', 'Expressive', 'Soothing']);
    expect(identity.gifts.core.map((gift) => gift.id)).toContain('emotional_mirror');
    expect(identity.gifts.element.map((gift) => gift.id)).toContain('radiant_harmony');
    expect(identity.growth.milestones.length).toBe(5);
    expect(identity.story.origin.body).toContain('small sound');
  });

  it('supports sample companion mappings for current named companions', () => {
    expect(getCompanionElementProfile(companion({ name: 'Nova', species: 'muse' })).secondary).toBe('dream');
    expect(getCompanionElementProfile(companion({ name: 'Ember', species: 'guardian' })).primary).toBe('ember');
    expect(getCompanionElementProfile(companion({ name: 'Aqua', species: 'root' })).secondary).toBe('tide');
  });

  it('keeps elements and emotional domains out of personality tags', () => {
    const identity = getCompanionIdentity(companion({ name: 'Fay', species: 'echo' }));

    expect(identity.elementProfile.primary).toBe('echo');
    expect(identity.elementProfile.secondary).toBe('dream');
    expect(identity.elementProfile.emotionalDomain).toBe('Memory');
    expect(identity.personality).toEqual(['Reflective', 'Gentle', 'Observant']);
    expect(identity.personality).not.toContain('Echo');
    expect(identity.personality).not.toContain('Memory');
    expect(identity.personality).not.toContain('Dream');
  });

  it('resolves behavioral personality defaults by archetype', () => {
    const sparkProfile = getCompanionElementProfile(companion({ name: 'Zephyr', species: 'spark' }));

    expect(getCompanionPersonality('guardian', getCompanionElementProfile(companion({ name: 'Ember', species: 'guardian' })))).toEqual([
      'Loyal',
      'Steady',
      'Protective'
    ]);
    expect(getCompanionPersonality('spark', sparkProfile)).toEqual(['Playful', 'Curious', 'Energetic']);
  });

  it('exposes typed helper slices for tab rendering', () => {
    expect(getElementGifts('sound', 'dream', 'muse').map((gift) => gift.id)).toContain('dreamsong_drift');
    expect(getGiftsForCompanion(companion()).bond[0]?.name).toBe('Bond Warmth');
    expect(getGrowthMilestonesForArchetype('echo').map((milestone) => milestone.id)).toContain('archive_bloom');
    expect(getStoryForCompanion(companion({ species: 'echo', name: 'Fay' })).origin.body).toContain('memory');
  });
});
