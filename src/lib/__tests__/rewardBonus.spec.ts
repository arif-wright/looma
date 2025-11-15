import { describe, it, expect } from 'vitest';
import { describeCompanionBonus } from '$lib/games/rewardBonus';

describe('describeCompanionBonus', () => {
  it('returns pill highlighting companion XP when bonus > 0', () => {
    const result = describeCompanionBonus({
      xpFromCompanion: 2,
      companionBonus: { name: 'Mirae', bondLevel: 3, xpMultiplier: 1.02 }
    });

    expect(result).not.toBeNull();
    expect(result?.pill).toContain('+2 XP');
    expect(result?.pill).toContain('Mirae');
    expect(result?.pill).toContain('Bond Lv 3');
    expect(result?.detail).toBeUndefined();
  });

  it('still shows descriptive line when no XP gained but bond active', () => {
    const result = describeCompanionBonus({
      xpFromCompanion: 0,
      companionBonus: { name: 'Ara', bondLevel: 4, xpMultiplier: 1.05 }
    });

    expect(result).not.toBeNull();
    expect(result?.pill).toContain('Ara');
    expect(result?.pill).toContain('Bond Lv 4');
    expect(result?.detail).toMatch(/no extra xp/i);
  });

  it('returns null when bond level is below threshold', () => {
    const result = describeCompanionBonus({
      xpFromCompanion: 5,
      companionBonus: { name: 'Nova', bondLevel: 1, xpMultiplier: 1.02 }
    });

    expect(result).toBeNull();
  });
});
