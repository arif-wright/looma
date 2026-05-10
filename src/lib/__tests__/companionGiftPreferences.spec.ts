import { describe, expect, it } from 'vitest';
import {
  calculateGiftBondGain,
  companionGiftItems,
  getCompanionGiftPreferences,
  getFavoriteGiftItemsForCompanion,
  getGiftPreferenceForCompanion
} from '$lib/companions/giftPreferences';
import type { Companion } from '$lib/stores/companions';

const companion = (overrides: Partial<Companion> = {}): Companion => ({
  id: 'c1',
  name: 'Lumi',
  species: 'muse',
  rarity: 'epic',
  level: 8,
  xp: 0,
  affection: 70,
  trust: 70,
  energy: 80,
  mood: 'happy',
  avatar_url: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  ...overrides
});

describe('companion gift preferences', () => {
  it('resolves archetype and secondary element favorite categories', () => {
    const preferences = getCompanionGiftPreferences(companion());

    expect(preferences.loved).toContain('music');
    expect(preferences.loved).toContain('crystal');
    expect(preferences.loved).toContain('prism');
    expect(preferences.liked).toContain('lantern');
  });

  it('uses strongest positive preference across archetype and element expression', () => {
    const spark = companion({ name: 'Zephyr', species: 'spark' });
    const musicGift = companionGiftItems.find((gift) => gift.category === 'music');

    expect(musicGift).toBeTruthy();
    expect(getGiftPreferenceForCompanion(spark, musicGift!)).toBe('liked');
  });

  it('lets individual overrides take priority', () => {
    const custom = companion({
      favoriteGiftOverrides: {
        disliked: ['crystal']
      }
    } as Partial<Companion>);
    const crystalGift = companionGiftItems.find((gift) => gift.category === 'crystal');

    expect(crystalGift).toBeTruthy();
    expect(getGiftPreferenceForCompanion(custom, crystalGift!)).toBe('disliked');
  });

  it('calculates gentle bond gain and favorite gift display items', () => {
    const gift = companionGiftItems.find((entry) => entry.id === 'resonance_crystal');
    expect(gift).toBeTruthy();

    const result = calculateGiftBondGain(companion(), gift!);
    expect(result.preference).toBe('loved');
    expect(result.bondGain).toBe(18);
    expect(result.response).toContain('Lumi');

    const favorites = getFavoriteGiftItemsForCompanion(companion(), 3);
    expect(favorites).toHaveLength(3);
    expect(favorites.every((entry) => entry.preference === 'loved')).toBe(true);
  });
});
