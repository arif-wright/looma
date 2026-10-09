// Local, memory-only session service. Never import the production SDK here.
import { fixture, record, delay } from './runtime';
export const CLIENT_VERSION = '1.0.0';
export type GameSessionStart = { sessionId: string; nonce: string; serverTime: number; caps: { maxDurationMs: number; minDurationMs: number; maxScorePerMin: number; minClientVer: string; maxScore: number } };
export type GameSessionServerResult = { xpDelta: number; currencyDelta: number; companionBonus?: { name?: string | null }; rituals?: { list: any[]; completed: any[] } | null };
export type GameSessionResult = { score?: number; durationMs?: number; success?: boolean; stats?: Record<string, unknown>; extra?: Record<string, unknown>; server?: GameSessionServerResult } & Record<string, unknown>;
export type CompleteResponse = GameSessionServerResult;
let serial = 0;
export async function startSession(...args: unknown[]): Promise<GameSessionStart> {
  record('start', ...args);
  const scenario = fixture.scenario;
  if (scenario === 'delayed-start') await delay('start');
  if (scenario === 'start-failure') throw new Error('Synthetic start failure');
  if (scenario === 'unauthorized') throw new Error('Synthetic unauthorized');
  return { sessionId: `synthetic-neon-run-session-${++serial}`, nonce: 'synthetic-not-a-credential', serverTime: 1791158400000,
    caps: { maxDurationMs: 60000, minDurationMs: 1000, maxScorePerMin: 10000, minClientVer: '1.0.0', maxScore: 10000 } };
}
export async function completeSession(...args: unknown[]): Promise<GameSessionServerResult> {
  record('complete', ...args);
  const payload = args[1] as GameSessionResult;
  const stats = payload?.stats as Record<string, unknown> | undefined;
  fixture.completionFrozen.push(Object.isFrozen(payload) && Object.isFrozen(stats) && Object.isFrozen(stats?.powerupsUsed));
  const scenario = fixture.scenario;
  if (scenario === 'delayed-completion') await delay('completion');
  if (scenario === 'completion-failure') throw new Error('Synthetic completion failure');
  if (scenario === 'negative-reward') return { xpDelta: -3, currencyDelta: 11, rituals: { list: [], completed: [] } };
  if (scenario === 'fractional-reward') return { xpDelta: 37, currencyDelta: 1.5, rituals: { list: [], completed: [] } };
  return { xpDelta: 37, currencyDelta: 11, rituals: { list: [{ id: 'synthetic-ritual', state: 'complete' }], completed: [] } };
}
export async function fetchPlayerState(): Promise<never> {
  record('fetchPlayerState'); throw new Error('Neon Run must not call legacy player-state refresh.');
}
export const getPlayerState = fetchPlayerState;
export function getGameErrorMessage(error: unknown, context = 'load') {
  if (error instanceof Error && error.message === 'Synthetic unauthorized') return 'Please sign in to start a run.';
  return context === 'complete' ? 'We couldn’t confirm your rewards' : 'Could not start this run. Please try again.';
}
export function getGameErrorKind(error: unknown, context = 'load'): 'network' | 'unauthorized' | 'completion_failed' | 'generic' {
  if (error instanceof Error && error.message === 'Synthetic unauthorized') return 'unauthorized';
  return context === 'complete' ? 'completion_failed' : 'network';
}
export function abandonSession(sessionId: string) { record('abandon', sessionId); }

// Preview fixtures contain no authenticated owner or live Auth client.
export const watchGameOwner = (_onChange: (ownerId: string | null) => void, _expectedOwnerId?: string | null) => () => {};
