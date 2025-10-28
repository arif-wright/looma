import { describe, expect, it } from 'vitest';
import {
  computeLanding,
  surfaceToPath,
  shouldResolveLanding,
  type PreferenceRow,
  type MissionCandidate
} from '../server/landing';

const basePrefs = (overrides: Partial<PreferenceRow> = {}): PreferenceRow => ({
  user_id: 'user-1',
  start_on: 'home',
  last_context: null,
  last_context_payload: null,
  ab_variant: 'C',
  updated_at: new Date().toISOString(),
  ...overrides
});

describe('surfaceToPath', () => {
  it('creates mission path with id', () => {
    expect(surfaceToPath('mission', { missionId: 'abc' })).toBe('/app/missions/abc');
  });

  it('falls back to base path when payload missing', () => {
    expect(surfaceToPath('creatures')).toBe('/app/creatures');
  });
});

describe('shouldResolveLanding', () => {
  it('resolves for app root', () => {
    expect(shouldResolveLanding('/app', false)).toBe('resolve');
  });

  it('force-homes when query overrides', () => {
    expect(shouldResolveLanding('/app', true)).toBe('force-home');
  });

  it('skips for home subpath', () => {
    expect(shouldResolveLanding('/app/home', false)).toBe('skip');
  });

  it('skips for deep routes', () => {
    expect(shouldResolveLanding('/app/u/demo', false)).toBe('skip');
    expect(shouldResolveLanding('/app/creatures', false)).toBe('skip');
  });
});

describe('computeLanding', () => {
  const mission: MissionCandidate = { id: 'mission-1', status: 'active', updated_at: new Date().toISOString() };

  it('prioritises active mission', () => {
    const decision = computeLanding(basePrefs(), 'C', mission, null, null);
    expect(decision.surface).toBe('mission');
    expect(decision.target).toBe('/app/missions/mission-1');
    expect(decision.reason).toBe('mission');
  });

  it('uses care due when no mission', () => {
    const decision = computeLanding(basePrefs(), 'C', null, { creatureId: 'creature-1' }, null);
    expect(decision.surface).toBe('creatures');
    expect(decision.target).toBe('/app/creatures?focus=creature-1');
    expect(decision.reason).toBe('care');
  });

  it('honours recent feed context', () => {
    const prefs = basePrefs({ last_context: 'feed', updated_at: new Date().toISOString() });
    const decision = computeLanding(prefs, 'A', null, null, null);
    expect(decision.surface).toBe('home');
    expect(decision.reason).toBe('context');
  });

  it('uses structured mission context when available', () => {
    const payload = { missionId: 'mission-x' };
    const prefs = basePrefs({
      last_context: { context: 'mission', trigger: 'mission_click' } as any,
      last_context_payload: payload,
      updated_at: new Date().toISOString()
    });

    const decision = computeLanding(prefs, 'C', null, null, payload);
    expect(decision.surface).toBe('mission');
    expect(decision.target).toBe('/app/missions/mission-x');
    expect(decision.reason).toBe('context');
  });

  it('respects explicit start preference', () => {
    const prefs = basePrefs({ start_on: 'dashboard' });
    const decision = computeLanding(prefs, 'C', null, null, null);
    expect(decision.surface).toBe('dashboard');
    expect(decision.target).toBe('/app/dashboard');
    expect(decision.reason).toBe('preference');
  });

  it('falls back to variant when no other signals', () => {
    const prefs = basePrefs({ ab_variant: 'B' });
    const decision = computeLanding(prefs, 'B', null, null, null);
    expect(decision.surface).toBe('creatures');
    expect(decision.reason).toBe('variant');
  });
});
