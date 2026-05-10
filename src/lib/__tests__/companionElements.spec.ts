import { describe, expect, it } from 'vitest';
import {
  COMPANION_ELEMENT_IDS,
  companionElements,
  getCompanionElementProfile,
  getCompanionVariant,
  getElementById,
  getMuseVariantBySecondary,
  museElementVariants
} from '$lib/companions/elements';

describe('companion element framework', () => {
  it('defines every supported emotional-symbolic element', () => {
    expect(COMPANION_ELEMENT_IDS).toEqual(['light', 'sound', 'root', 'spark', 'tide', 'ember', 'dream', 'echo']);

    for (const id of COMPANION_ELEMENT_IDS) {
      const element = companionElements[id];
      expect(element.id).toBe(id);
      expect(element.label.length).toBeGreaterThan(0);
      expect(element.emotionalMeaning.length).toBeGreaterThan(0);
      expect(element.visualLanguage.length).toBeGreaterThan(0);
      expect(element.compatibleRituals.length).toBeGreaterThan(0);
    }
  });

  it('keeps Muse on Sound and Light by default', () => {
    const profile = getCompanionElementProfile('muse');

    expect(profile.primary).toBe('sound');
    expect(profile.secondary).toBe('light');
    expect(profile.emotionalDomain).toBe('Harmony');
    expect(profile.preferredRituals).toEqual(['Listen', 'Reflect', 'Harmonize']);
  });

  it('resolves Muse secondary variants safely', () => {
    expect(Object.keys(museElementVariants).sort()).toEqual([
      'sound_dream',
      'sound_echo',
      'sound_light',
      'sound_spark',
      'sound_tide'
    ]);
    expect(getMuseVariantBySecondary('dream').label).toBe('Dreamsong Muse');
    expect(getCompanionVariant('muse', 'sound', 'echo')?.label).toBe('Echo Muse');
    expect(getMuseVariantBySecondary('unknown').label).toBe('Radiant Muse');
  });

  it('falls back gently for unknown elements and archetypes', () => {
    expect(getElementById('not-real')).toBeNull();
    expect(getCompanionElementProfile('not-real').primary).toBe('sound');
    expect(getCompanionElementProfile('not-real').secondary).toBe('light');
  });
});
