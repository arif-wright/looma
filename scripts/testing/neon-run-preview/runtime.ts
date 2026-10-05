import type { EndlessRunnerState } from '../../../src/lib/games/endlessRunner';
import type { LoomaGameResult } from '../../../src/lib/games/types';
export type Scenario = 'success' | 'start-failure' | 'unauthorized' | 'completion-failure' | 'delayed-start' | 'delayed-completion' | 'practice' | 'negative-reward' | 'fractional-reward';
export type Call = { method: string; args: unknown[] };
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
export const fixture = {
  engine: params.get('engine') === 'lifecycle' ? 'lifecycle' : 'real',
  scenario: (params.get('scenario') ?? 'success') as Scenario,
  calls: [] as Call[], completionFrozen: [] as boolean[], blocked: [] as string[], engineEvents: [] as string[],
  playerStates: [] as unknown[], ritualUpdates: [] as unknown[], audioEvents: [] as string[],
  drawnImages: [] as string[],
  engineState: null as EndlessRunnerState | null,
  engineOptions: null as { maxDurationMs?: number; reducedMotion: boolean; skinLoaded: boolean } | null,
  finishedSource: null as LoomaGameResult | null,
  readEngineState: (): EndlessRunnerState | null => null,
  finish: (_result: LoomaGameResult): void => { throw new Error('Only lifecycle engine exposes finish().'); },
  release: (_kind: 'start' | 'completion') => {},
  configure(scenario: Scenario) { fixture.scenario = scenario; }
};
export type Fixture = typeof fixture;
declare global { interface Window { __neonRunFixture: Fixture } }
if (typeof window !== 'undefined') window.__neonRunFixture = fixture;
const pending = new Map<string, Array<() => void>>();
export const delay = (kind: 'start' | 'completion') => new Promise<void>((resolve) => {
  pending.set(kind, [...(pending.get(kind) ?? []), resolve]);
});
fixture.release = (kind) => {
  const resolvers = pending.get(kind) ?? []; pending.delete(kind);
  for (const resolve of resolvers) resolve();
};
export const record = (method: string, ...args: unknown[]) => fixture.calls.push({ method, args: structuredClone(args) });
