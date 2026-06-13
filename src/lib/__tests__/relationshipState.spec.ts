import { describe, expect, it } from 'vitest';
import { bondClosenessFromScore, bondClosenessSentence } from '$lib/companions/relationshipState';
import { getCompanionMoodMeta } from '$lib/companions/moodMeta';

describe('relationship state language', () => {
  it('keeps bond closeness separate from current companion mood', () => {
    const closeness = bondClosenessFromScore(20);
    const mood = getCompanionMoodMeta('steady').label;

    expect(closeness).toBe('Distant');
    expect(mood).toBe('Steady');
    expect(bondClosenessSentence('Mira', closeness)).toBe('Your bond with Mira feels distant.');
  });

  it('uses the same closeness thresholds across launch surfaces', () => {
    expect(bondClosenessFromScore(0)).toBe('Distant');
    expect(bondClosenessFromScore(35)).toBe('Near');
    expect(bondClosenessFromScore(70)).toBe('Resonant');
  });
});
