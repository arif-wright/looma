import { describe, expect, it } from 'vitest';
import { evaluateCompanionMilestones } from '$lib/companions/progression';

describe('companion progression milestones', () => {
  it('earns streak and games milestones when thresholds are met', () => {
    const earned = evaluateCompanionMilestones({
      nowIso: '2026-02-08T00:00:00.000Z',
      firstActiveAtIso: '2026-02-01T00:00:00.000Z',
      streakDays: 3,
      gamesPlayedCount: 5,
      unlockedCosmetics: []
    });

    expect(earned.map((item) => item.id)).toEqual(['streak_3', 'games_5', 'first_week_active']);
  });

  it('does not re-earn already unlocked cosmetics', () => {
    const earned = evaluateCompanionMilestones({
      nowIso: '2026-02-10T00:00:00.000Z',
      firstActiveAtIso: '2026-02-01T00:00:00.000Z',
      streakDays: 10,
      gamesPlayedCount: 8,
      unlockedCosmetics: ['streak-trace-v1', 'arcade-spark-v1', 'week-one-badge-v1']
    });

    expect(earned).toHaveLength(0);
  });
});

