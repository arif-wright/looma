import { describe, expect, it } from 'vitest';
import { calculateBondScore, scoreToBondLevel, getBondBonusForLevel } from '$lib/companions/bond';

describe('companion bond helpers', () => {
  it('calculates bond score with care bonus capped at +20', () => {
    expect(calculateBondScore(60, 50, 0)).toBe(110);
    expect(calculateBondScore(60, 50, 200)).toBe(130); // 20 bonus from care
    expect(calculateBondScore(-10, 20, 0)).toBe(20);
    expect(calculateBondScore(300, 50, 0)).toBe(200);
  });

  it('maps score to the correct bond level tiers', () => {
    const levels: Array<[number, number]> = [
      [0, 0],
      [9, 0],
      [10, 1],
      [19, 1],
      [20, 2],
      [39, 2],
      [40, 3],
      [60, 4],
      [80, 5],
      [100, 6],
      [140, 8],
      [180, 10]
    ];
    levels.forEach(([score, expected]) => {
      expect(scoreToBondLevel(score)).toBe(expected);
    });
  });

  it('returns the right bonus metadata for each tier', () => {
    expect(getBondBonusForLevel(0)).toMatchObject({ xpMultiplier: 1, missionEnergyBonus: 0 });
    expect(getBondBonusForLevel(3)).toMatchObject({ xpMultiplier: 1.02, missionEnergyBonus: 0 });
    expect(getBondBonusForLevel(5)).toMatchObject({ xpMultiplier: 1.05, missionEnergyBonus: 2 });
    expect(getBondBonusForLevel(7)).toMatchObject({ xpMultiplier: 1.08, missionEnergyBonus: 3 });
    expect(getBondBonusForLevel(9)).toMatchObject({ xpMultiplier: 1.1, missionEnergyBonus: 5 });
  });
});
