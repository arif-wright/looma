import { describe, expect, it } from 'vitest';
import { getBondMilestoneTier, getMissingMilestoneActions } from '$lib/companions/bond';

describe('bond milestone helpers', () => {
  it('determines milestone tier thresholds', () => {
    expect(getBondMilestoneTier(0)).toBe(0);
    expect(getBondMilestoneTier(2)).toBe(1);
    expect(getBondMilestoneTier(5)).toBe(2);
    expect(getBondMilestoneTier(8)).toBe(3);
  });

  it('returns missing milestone actions only once', () => {
    const recorded = new Set<string>();
    const first = getMissingMilestoneActions(5, recorded);
    expect(first).toEqual(['bond_milestone_minor', 'bond_milestone_major']);

    recorded.add('bond_milestone_minor');
    const next = getMissingMilestoneActions(5, recorded);
    expect(next).toEqual(['bond_milestone_major']);

    recorded.add('bond_milestone_major');
    const none = getMissingMilestoneActions(9, recorded);
    expect(none).toEqual(['bond_milestone_legendary']);
  });
});
