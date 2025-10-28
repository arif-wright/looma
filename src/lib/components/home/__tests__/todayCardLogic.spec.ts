import { describe, expect, it } from 'vitest';
import { computeTodayCardState } from '../todayCardLogic';

describe('computeTodayCardState', () => {
  it('prioritises reward when pending', () => {
    const result = computeTodayCardState({ rewardPending: true, mission: null });
    expect(result.ctaState).toBe('reward');
    expect(result.label).toContain('Claim');
    expect(result.disabled).toBe(false);
  });

  it('resumes mission when available', () => {
    const result = computeTodayCardState({
      rewardPending: false,
      mission: { id: 'mission-1', name: 'Boost Run' },
      failMissionId: null
    });
    expect(result.ctaState).toBe('resume');
    expect(result.label).toContain('Boost Run');
    expect(result.missionId).toBe('mission-1');
  });

  it('switches to retry when there is a recent failure', () => {
    const result = computeTodayCardState({
      rewardPending: false,
      mission: null,
      failMissionId: 'mission-x',
      failMissionName: 'Vault Dive'
    });
    expect(result.ctaState).toBe('retry');
    expect(result.label).toContain('Retry');
    expect(result.missionId).toBe('mission-x');
    expect(result.secondary).toContain('Vault Dive');
  });
});
