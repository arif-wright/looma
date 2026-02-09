import { describe, it, expect } from 'vitest';
import { COMPANION_RITUALS, describeRitualCompletion } from '$lib/companions/rituals';
import type { CompanionRitual } from '$lib/companions/rituals';

describe('companion rituals helpers', () => {
  it('formats completion copy with companion name', () => {
    const ritual: CompanionRitual = {
      ...COMPANION_RITUALS[0]!,
      progress: 1,
      status: 'completed' as const,
      completedAt: new Date().toISOString()
    };
    const copy = describeRitualCompletion(ritual, 'Mirae');
    expect(copy).toContain('Mirae');
    expect(copy).toContain(ritual.title);
    expect(copy).toContain(`+${ritual.xpReward} XP`);
  });

  it('falls back to generic companion name', () => {
    const ritual: CompanionRitual = {
      ...COMPANION_RITUALS[1]!,
      progress: 1,
      status: 'completed' as const,
      completedAt: null
    };
    const copy = describeRitualCompletion(ritual, null);
    expect(copy).toContain('your companion');
  });
});
