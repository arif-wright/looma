import { describe, expect, it } from 'vitest';
import { validateMissionComplete, validateMissionStart } from '$lib/server/missions/validation';
import type { MissionDefinition, MissionSessionRow } from '$lib/server/missions/types';

const baseMission: MissionDefinition = {
  id: 'mission-1',
  owner_id: null,
  title: 'Mission',
  summary: null,
  difficulty: null,
  status: 'available',
  energy_reward: 0,
  xp_reward: 0,
  type: 'action',
  cost: null,
  cooldown_ms: null,
  privacy_tags: null
};

describe('validateMissionStart', () => {
  it('rejects identity mission cost', () => {
    const result = validateMissionStart(
      { id: 'u1' },
      { ...baseMission, type: 'identity', cost: { energy: 2 } },
      null
    );
    expect(result.ok).toBe(false);
  });

  it('rejects invalid action cost payload', () => {
    const result = validateMissionStart(
      { id: 'u1' },
      { ...baseMission, type: 'action', cost: {} },
      null
    );
    expect(result.ok).toBe(false);
  });

  it('allows action mission with explicit zero energy cost', () => {
    const result = validateMissionStart(
      { id: 'u1' },
      { ...baseMission, type: 'action', cost: { energy: 0 } },
      null
    );
    expect(result.ok).toBe(true);
  });
});

describe('validateMissionComplete', () => {
  it('rejects non-owner completion', () => {
    const session: MissionSessionRow = {
      id: 's1',
      mission_id: 'mission-1',
      user_id: 'u2',
      status: 'started',
      cost_snapshot: null,
      started_at: new Date().toISOString(),
      completed_at: null
    };
    const result = validateMissionComplete({ id: 'u1' }, session);
    expect(result.ok).toBe(false);
  });

  it('allows active owner session completion', () => {
    const session: MissionSessionRow = {
      id: 's1',
      mission_id: 'mission-1',
      user_id: 'u1',
      status: 'started',
      cost_snapshot: null,
      started_at: new Date().toISOString(),
      completed_at: null
    };
    const result = validateMissionComplete({ id: 'u1' }, session);
    expect(result.ok).toBe(true);
  });
});
