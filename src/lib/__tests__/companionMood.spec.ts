import { describe, it, expect } from 'vitest';
import { getCompanionMoodMeta, normalizeMoodKey } from '../companions/moodMeta';

describe('companion mood helpers', () => {
  it('normalizes variants into canonical keys', () => {
    expect(normalizeMoodKey('radiant')).toBe('radiant');
    expect(normalizeMoodKey('CURIOUS')).toBe('curious');
    expect(normalizeMoodKey('low_energy')).toBe('tired');
    expect(normalizeMoodKey(null)).toBe('steady');
  });

  it('returns descriptive copy for each mood', () => {
    const radiant = getCompanionMoodMeta('radiant');
    expect(radiant.description).toContain('Radiant');

    const tired = getCompanionMoodMeta('tired');
    expect(tired.accent).toBe('amber');
    expect(tired.indicatorTitle).toContain('tired');
  });
});
