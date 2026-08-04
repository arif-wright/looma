import { describe, expect, it } from 'vitest';
import { nextContextStatus } from '$lib/game/renderers/three/contextRecovery';

describe('Three WebGL context recovery', () => {
  it('moves through lost, restoring, and ready without requiring a new session', () => {
    const lost = nextContextStatus('ready', 'lost');
    const restoring = nextContextStatus(lost, 'restore-started');
    const ready = nextContextStatus(restoring, 'restored');
    expect([lost, restoring, ready]).toEqual(['lost', 'restoring', 'ready']);
  });
});
