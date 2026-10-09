// Deliberately never imports the real SDK or any server/auth/client modules.
import { fixture, record, delay } from './runtime';
export const CLIENT_VERSION = '1.0.0';
export type GameSessionStart = { sessionId: string; nonce: string; serverTime: number; caps: { maxDurationMs: number; minDurationMs: number; maxScorePerMin: number; minClientVer: string; maxScore: number } };
export type GameSessionServerResult = { xpDelta: number; currencyDelta: number; companionBonus?: { name?: string | null }; rituals: { list: any[]; completed: any[] } };
export type CompleteResponse = GameSessionServerResult;
let serial = 0;
export async function startSession(...args: unknown[]): Promise<GameSessionStart> {
  // AbortSignal is not browser structured-cloneable; capture its state, not the live handle.
  const options = args[3] as { signal?: AbortSignal } | undefined;
  const recordedArgs = [...args];
  if (options?.signal) recordedArgs[3] = { ...options, signal: { aborted: options.signal.aborted } };
  record('start', ...recordedArgs);
  const scenario = fixture.scenario;
  if (scenario === 'delayed-start') await delay('start');
  if (scenario === 'start-failure') throw new Error('Synthetic start failure');
  return {
    sessionId: `synthetic-orbfield-session-${++serial}`,
    nonce: 'synthetic-not-a-credential', serverTime: 1791136800000,
    caps: { maxDurationMs: 180000, minDurationMs: 1000, maxScorePerMin: 10000, minClientVer: '1.0.0', maxScore: 10000 }
  };
}
export async function completeSession(...args: unknown[]): Promise<GameSessionServerResult> {
  record('complete', ...args);
  const scenario = fixture.scenario;
  if (scenario === 'delayed-completion') await delay('completion');
  if (scenario === 'completion-failure') throw new Error('Synthetic completion failure');
  if (scenario === 'negative-reward') return { xpDelta: -3, currencyDelta: 11, rituals: { list: [], completed: [] } };
  if (scenario === 'fractional-reward') return { xpDelta: 37, currencyDelta: 1.5, rituals: { list: [], completed: [] } };
  // Unusual values deliberately distinguish server rewards from a local score estimate.
  return { xpDelta: 37, currencyDelta: 11, rituals: { list: [{ id: 'synthetic-ritual', state: 'complete' }], completed: [] } };
}
export async function fetchPlayerState() {
  record('fetchPlayerState');
  throw new Error('The Orbfield slice must not call the legacy player-state refresh.');
}
export const getPlayerState = fetchPlayerState;
export function getGameErrorMessage(_error: unknown, context = 'load') {
  return context === 'complete' ? 'We couldn’t confirm your rewards' : 'Could not start this round. Please try again.';
}
export function getGameErrorKind(_error: unknown, context = 'load'): 'network' | 'unauthorized' | 'completion_failed' | 'generic' {
  return context === 'complete' ? 'completion_failed' : 'network';
}

export function abandonSession(sessionId: string) { record('abandon', sessionId); }

// Preview fixtures contain no authenticated owner or live Auth client.
export const watchGameOwner = (_onChange: (ownerId: string | null) => void, _expectedOwnerId?: string | null) => () => {};
