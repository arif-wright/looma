import { describe, expect, it } from 'vitest';
import { evaluateMuseEvolutionUnlocks, resolveMuseEvolutionStage } from '$lib/companions/evolution';

describe('muse evolution stages', () => {
  it('unlocks Harmonae when streak or games thresholds are met', () => {
    const streakEarned = evaluateMuseEvolutionUnlocks({
      companionId: 'muse',
      streakDays: 3,
      gamesPlayedCount: 0,
      unlockedCosmetics: []
    });
    expect(streakEarned.map((entry) => entry.stage.label)).toContain('Harmonae');

    const gamesEarned = evaluateMuseEvolutionUnlocks({
      companionId: 'muse',
      streakDays: 0,
      gamesPlayedCount: 5,
      unlockedCosmetics: []
    });
    expect(gamesEarned.map((entry) => entry.stage.label)).toContain('Harmonae');
  });

  it('resolves highest unlocked stage from cosmetics', () => {
    expect(resolveMuseEvolutionStage({ companionId: 'muse', unlockedCosmetics: [] }).label).toBe('Whisperlight');
    expect(
      resolveMuseEvolutionStage({
        companionId: 'muse',
        unlockedCosmetics: ['muse-stage-harmonae-v1']
      }).label
    ).toBe('Harmonae');
    expect(
      resolveMuseEvolutionStage({
        companionId: 'muse',
        unlockedCosmetics: ['muse-stage-harmonae-v1', 'muse-stage-mirae-v1']
      }).label
    ).toBe('Mirae');
  });
});
