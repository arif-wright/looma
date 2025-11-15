import { describe, expect, it } from 'vitest';
import { describeBondLevelUpToast } from '$lib/companions/companionCopy';

describe('companion copy helpers', () => {
  it('formats bond level up toast with companion name', () => {
    expect(describeBondLevelUpToast('Mirae', 4)).toContain('Mirae');
    expect(describeBondLevelUpToast('Mirae', 4)).toContain('4');
  });

  it('falls back to generic name when blank', () => {
    expect(describeBondLevelUpToast('   ', 2)).toMatch(/Your companion/i);
  });
});
