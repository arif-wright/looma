import { tick } from 'svelte';
import type { LoomaGameResult } from '../../../src/lib/games/types';

export type Kind = 'neon' | 'orbfield';
export type Stage = 'success' | 'fetch' | 'body' | 'error-body';
export type AuthSession = { user: { id: string } } | null;
export type AuthCallback = (event: string, session: AuthSession) => void;
export type ApiCall = {
  path: string; method: string; body: Record<string, unknown>; sessionId: string | null;
  stage: 'fetch-pending' | 'body-pending' | 'responded'; aborted: boolean;
};
const params = new URLSearchParams(location.search);
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const pendingStarts = new Map<number, { release: () => void; resolved: Promise<void> }>();
const artGate = deferred<void>();
let serial = 0;
export const fixture = {
  kind: (params.get('game') === 'orbfield' ? 'orbfield' : 'neon') as Kind,
  stage: (params.get('stage') ?? 'success') as Stage,
  auth: params.get('auth') ?? 'ready',
  owner: (params.get('auth') === 'signed-out' ? null : params.get('auth') === 'other-owner' ? 'owner-b' : 'owner-a') as string | null,
  callbacks: new Set<AuthCallback>(),
  authSubscriptions: 0,
  authNotifications: 0,
  artHeld: params.has('holdArt'),
  artLoaded: false,
  artComplete: false,
  artReleased: false,
  api: [] as ApiCall[],
  blocked: [] as string[],
  events: [] as Array<{ name: string; payload: Record<string, unknown>; options: unknown }>,
  analytics: [] as Array<{ name: string; payload: unknown }>,
  playerStates: [] as unknown[],
  rituals: [] as unknown[],
  reactions: [] as unknown[],
  engineEvents: [] as string[],
  engines: [] as Array<{ id: number; skinKeys: string[] }>,
  navigations: [] as string[],
  ready: false,
  finish: (_result: LoomaGameResult): void => { throw new Error('Synthetic engine is not ready.'); },
  unmount: (): void => { throw new Error('Fixture is not mounted.'); },
  emitAuth(event: string, owner: string | null) {
    fixture.owner = owner;
    for (const callback of [...fixture.callbacks]) {
      fixture.authNotifications++;
      callback(event, owner ? { user: { id: owner } } : null);
    }
  },
  async releaseStart(index = 0) {
    const pending = pendingStarts.get(index);
    if (!pending) throw new Error(`No pending synthetic start ${index}`);
    pending.release();
    await pending.resolved;
    // Drain the real SDK's fetch/body and Promise.race continuations, then Svelte.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await tick();
  },
  async releaseArt() {
    fixture.artReleased = true;
    artGate.resolve();
    await artGate.promise;
    await tick();
  },
  async waitForArtGate<T extends { complete: boolean }>(loaded: T): Promise<T> {
    fixture.artLoaded = true;
    fixture.artComplete = loaded.complete;
    if (fixture.artHeld) await artGate.promise;
    return loaded;
  },
  snapshot() {
    return {
      kind: fixture.kind, ready: fixture.ready, owner: fixture.owner,
      callbacks: fixture.callbacks.size, authSubscriptions: fixture.authSubscriptions,
      authNotifications: fixture.authNotifications,
      artLoaded: fixture.artLoaded, artComplete: fixture.artComplete, artReleased: fixture.artReleased,
      api: fixture.api, blocked: fixture.blocked, events: fixture.events, analytics: fixture.analytics,
      playerStates: fixture.playerStates, rituals: fixture.rituals, reactions: fixture.reactions,
      engineEvents: fixture.engineEvents, engines: fixture.engines, navigations: fixture.navigations,
      persistedStarts: Number(sessionStorage.getItem('fixture:starts') ?? 0)
    };
  }
};
export const startPayload = (sessionId: string) => ({
  sessionId, nonce: `nonce-${sessionId}`, serverTime: 1000,
  caps: { minDurationMs: 1000, maxDurationMs: 60000, maxScore: 10000, maxScorePerMin: 10000, minClientVer: '1.0.0' }
});

// No native fetch fallback. These three SDK requests are simulated entirely in memory.
// Aborts are observed but intentionally do not settle the delayed transport: late
// replies must be harmless even when a transport ignores AbortSignal.
export function installSyntheticTransport() {
  window.fetch = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.origin);
    const method = init.method ?? (input instanceof Request ? input.method : 'GET');
    const permitted = ['/api/games/session/start', '/api/games/sign', '/api/games/session/complete'];
    if (url.origin !== location.origin || !permitted.includes(url.pathname) || method !== 'POST' || url.search) {
      fixture.blocked.push(`${method} ${url.href}`);
      throw new Error(`Forbidden fetch in credential-free fixture: ${method} ${url.href}`);
    }
    const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
    const signal = init.signal;
    const call: ApiCall = { path: url.pathname, method, body, sessionId: null, stage: 'responded', aborted: signal?.aborted ?? false };
    fixture.api.push(call);
    signal?.addEventListener('abort', () => { call.aborted = true; }, { once: true });
    if (url.pathname === '/api/games/sign') return Response.json({ signature: 'synthetic-signature' });
    if (url.pathname === '/api/games/session/complete') {
      return Response.json({ settlementVersion: 1, sessionId: body.sessionId, xpDelta: 37, currencyDelta: 11 });
    }
    const index = serial++;
    call.sessionId = index === 0 ? 'original-session' : `new-session-${index}`;
    sessionStorage.setItem('fixture:starts', String(Number(sessionStorage.getItem('fixture:starts') ?? 0) + 1));
    const payload = startPayload(call.sessionId);
    const stage = index === 0 ? fixture.stage : 'success';
    if (stage === 'success') return Response.json(payload);
    const released = deferred<void>();
    const resolved = deferred<void>();
    pendingStarts.set(index, { release: () => released.resolve(), resolved: resolved.promise });
    if (stage === 'fetch') {
      call.stage = 'fetch-pending';
      await released.promise;
      call.stage = 'responded';
      resolved.resolve();
      return Response.json(payload);
    }
    // Synthetic Response only for the stalled JSON read. No real HTTP response.
    return {
      ok: stage !== 'error-body', status: stage === 'error-body' ? 500 : 200,
      async json() {
        call.stage = 'body-pending';
        await released.promise;
        call.stage = 'responded';
        resolved.resolve();
        return stage === 'error-body' ? { code: 'synthetic_server_error' } : payload;
      }
    } as Response;
  };
}

declare global { interface Window { __startRecovery: typeof fixture; } }
window.__startRecovery = fixture;
