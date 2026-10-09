import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const auth = vi.hoisted(() => ({ callbacks: new Set<(event: string, session: any) => void>(), owner: 'local-owner' as string | null, initial: true, unavailable: false }));
vi.mock('$lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ auth: {
  onAuthStateChange: (callback: any) => {
    if (auth.unavailable) throw new Error('Synthetic unavailable Auth');
    auth.callbacks.add(callback);
    if (auth.initial) void Promise.resolve().then(() => callback('INITIAL_SESSION', auth.owner ? { user: { id: auth.owner } } : null));
    return { data: { subscription: { unsubscribe: () => auth.callbacks.delete(callback) } } };
  }
} }) }));
vi.mock('$lib/games/state', () => ({ applyPlayerState: vi.fn(), getPlayerProgressSnapshot: () => ({}) }));
vi.mock('$lib/stores/companions', () => ({ getActiveCompanionSnapshot: () => null }));
vi.mock('$lib/utils/analytics', () => ({ sendAnalytics: vi.fn() }));
vi.mock('$lib/client/events/sendEvent', () => ({ sendEvent: vi.fn(async () => null) }));
import { sendAnalytics } from '$lib/utils/analytics';
import { sendEvent } from '$lib/client/events/sendEvent';

const payload = (sessionId = 'first') => ({ sessionId, nonce: `nonce-${sessionId}`, serverTime: 1000,
  caps: { minDurationMs: 1000, maxDurationMs: 60000, maxScore: 10000, maxScorePerMin: 10000, minClientVer: '1.0.0' } });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
let sdk: typeof import('$lib/games/sdk');
let fetchMock: Mock<[string, RequestInit], Promise<any>>;

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  auth.callbacks.clear(); auth.owner = 'local-owner'; auth.initial = true; auth.unavailable = false;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('window', { sessionStorage: { getItem: vi.fn(), setItem: vi.fn() } });
  fetchMock = vi.fn(async (_url: string, _init: RequestInit) => Response.json(payload()));
  vi.stubGlobal('fetch', fetchMock);
  sdk = await import('$lib/games/sdk');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('start-session transport recovery', () => {
  it.each(['fetch', 'body', 'error body'])('bounds a hanging %s without replay and ignores the late session', async (stage) => {
    const late = deferred<any>();
    fetchMock.mockImplementationOnce(() => stage === 'fetch' ? late.promise : Promise.resolve({
      ok: stage !== 'error body', status: stage === 'error body' ? 500 : 200, json: () => late.promise
    }));
    const start = sdk.startSession('runner');
    const rejection = expect(start).rejects.toMatchObject({ kind: 'network', code: 'start_timeout', message: expect.stringContaining('may already exist') });
    await vi.advanceTimersByTimeAsync(30_000); await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1].signal!.aborted).toBe(true);
    late.resolve(stage === 'fetch' ? Response.json(payload()) : payload());
    await vi.advanceTimersByTimeAsync(0);
    expect(sendAnalytics).not.toHaveBeenCalled(); expect(sendEvent).not.toHaveBeenCalled();
    expect(await sdk.completeSession('first', { score: 1, durationMs: 1000 })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('an explicit new start retains its identity when the first response arrives late', async () => {
    const old = deferred<Response>(); fetchMock.mockImplementationOnce(() => old.promise);
    const first = sdk.startSession('runner');
    const rejection = expect(first).rejects.toMatchObject({ code: 'start_timeout' });
    await vi.advanceTimersByTimeAsync(30_000); await rejection;
    fetchMock.mockResolvedValueOnce(Response.json(payload('new')));
    expect(await sdk.startSession('runner')).toEqual(payload('new'));
    old.resolve(Response.json(payload('old'))); await vi.advanceTimersByTimeAsync(0);
    sdk.sendGameEvent('probe');
    expect(sendAnalytics).toHaveBeenLastCalledWith('game_probe', { payload: { sessionId: 'new' } });
    expect(await sdk.completeSession('old', { score: 1, durationMs: 1000 })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cancels a caller wait without registering its late response or replaying', async () => {
    const late = deferred<Response>(); fetchMock.mockImplementationOnce(() => late.promise);
    const controller = new AbortController();
    const start = sdk.startSession('runner', 'standard', {}, { signal: controller.signal });
    const rejection = expect(start).rejects.toMatchObject({ code: 'start_cancelled' });
    await vi.advanceTimersByTimeAsync(0); controller.abort(); await rejection;
    late.resolve(Response.json(payload())); await vi.advanceTimersByTimeAsync(0);
    expect(sendEvent).not.toHaveBeenCalled(); expect(sendAnalytics).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not send a pre-cancelled request', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(sdk.startSession('runner', 'standard', {}, { signal: controller.signal })).rejects.toMatchObject({ code: 'start_cancelled' });
    expect(fetchMock).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, {}, { ...payload(), nonce: '' }, { ...payload(), caps: null },
    { ...payload(), caps: { ...payload().caps, maxDurationMs: -1 } }])('rejects malformed starts without local session/telemetry: %j', async (bad) => {
    fetchMock.mockResolvedValueOnce(Response.json(bad));
    await expect(sdk.startSession('runner')).rejects.toMatchObject({ code: 'invalid_start', message: expect.stringContaining('may already exist') });
    expect(sendEvent).not.toHaveBeenCalled(); expect(sendAnalytics).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['network', 'json', 'server'])('reports an uncertain %s failure honestly', async (failure) => {
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('disconnected'));
    if (failure === 'json') fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('bad body'); } });
    if (failure === 'server') fetchMock.mockResolvedValueOnce(Response.json({ code: 'server_error' }, { status: 500 }));
    await expect(sdk.startSession('runner')).rejects.toMatchObject({ message: expect.stringContaining('may already exist') });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(sendEvent).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves known unauthorized errors and clears the timer', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: 'unauthorized' }, { status: 401 }));
    await expect(sdk.startSession('runner')).rejects.toMatchObject({ kind: 'unauthorized', status: 401, code: 'unauthorized' });
    expect(vi.getTimerCount()).toBe(0);
  });
});

const emitAuth = (event: string, owner: string | null) => {
  auth.owner = owner;
  for (const callback of [...auth.callbacks]) callback(event, owner ? { user: { id: owner } } : null);
};

describe('start-session account and lifetime isolation', () => {
  it('waits for the initial account before sending a start', async () => {
    auth.initial = false;
    const start = sdk.startSession('runner');
    await vi.advanceTimersByTimeAsync(0); expect(fetchMock).not.toHaveBeenCalled();
    emitAuth('INITIAL_SESSION', 'owner-a');
    expect(await start).toEqual(payload());
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(auth.callbacks.size).toBe(0);
  });

  it('bounds auth initialization and never sends after a late initial event', async () => {
    auth.initial = false;
    const start = sdk.startSession('runner');
    const callbacks = [...auth.callbacks];
    const rejection = expect(start).rejects.toMatchObject({ code: 'start_auth_timeout' });
    await vi.advanceTimersByTimeAsync(30_000); await rejection;
    callbacks.forEach(callback => callback('INITIAL_SESSION', { user: { id: 'owner-a' } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled(); expect(auth.callbacks.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('fails closed without a signed-in initial session', async () => {
    auth.owner = null;
    await expect(sdk.startSession('runner')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled(); expect(auth.callbacks.size).toBe(0);
  });

  it.each([['SIGNED_OUT', null], ['SIGNED_IN', 'owner-b']])('invalidates a pending start on %s without adopting the old response', async (event, owner) => {
    const late = deferred<Response>(); fetchMock.mockImplementationOnce(() => late.promise);
    const start = sdk.startSession('runner');
    const rejection = expect(start).rejects.toMatchObject({ code: 'start_account_changed' });
    await vi.advanceTimersByTimeAsync(0); emitAuth(event!, owner); await rejection;
    expect(fetchMock.mock.calls[0]![1].signal!.aborted).toBe(true);
    late.resolve(Response.json(payload())); await vi.advanceTimersByTimeAsync(0);
    expect(sendEvent).not.toHaveBeenCalled(); expect(sendAnalytics).not.toHaveBeenCalled();
    expect(await sdk.completeSession('first', { score: 1, durationMs: 1000 })).toBeNull();
    expect(auth.callbacks.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not invalidate same-owner signed-in, initial or token-refresh events', async () => {
    const late = deferred<Response>(); fetchMock.mockImplementationOnce(() => late.promise);
    const start = sdk.startSession('runner');
    await vi.advanceTimersByTimeAsync(0);
    for (const event of ['TOKEN_REFRESHED', 'SIGNED_IN', 'INITIAL_SESSION']) emitAuth(event, 'local-owner');
    expect(fetchMock.mock.calls[0]![1].signal!.aborted).toBe(false);
    late.resolve(Response.json(payload())); expect(await start).toEqual(payload());
    expect(auth.callbacks.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let an old account listener abort a subsequent account’s new start', async () => {
    const first = sdk.startSession('runner'); const oldCallbacks = [...auth.callbacks]; await first;
    auth.owner = 'owner-b';
    const late = deferred<Response>(); fetchMock.mockImplementationOnce(() => late.promise);
    const next = sdk.startSession('runner'); await vi.advanceTimersByTimeAsync(0);
    oldCallbacks.forEach(callback => callback('SIGNED_OUT', null));
    expect(fetchMock.mock.calls[1]![1].signal!.aborted).toBe(false);
    late.resolve(Response.json(payload('second'))); expect(await next).toEqual(payload('second'));
  });

  it('accepts all legacy metadata/version overloads without changing request bodies', async () => {
    await sdk.startSession('runner', '2.3.4');
    await sdk.startSession('runner', { clientVersion: '2.3.5', source: 'legacy' });
    await sdk.startSession('runner', 'practice');
    await sdk.startSession('runner', 'standard', { clientVersion: '2.3.6', source: 'current' });
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
    expect(bodies.map(body => [body.clientVersion, body.mode])).toEqual([
      ['2.3.4', undefined], ['2.3.5', undefined], ['1.0.0', 'practice'], ['2.3.6', 'standard']
    ]);
    expect(bodies[1].clientMeta).toEqual({ clientVersion: '2.3.5', source: 'legacy' });
    expect(bodies[3].clientMeta).toEqual({ clientVersion: '2.3.6', source: 'current' });
  });

  it('a screen owner watch ignores initial/same-owner events and stops cleanly', async () => {
    const changed = vi.fn(); const stop = sdk.watchGameOwner(changed);
    await vi.advanceTimersByTimeAsync(0); emitAuth('TOKEN_REFRESHED', 'local-owner'); expect(changed).not.toHaveBeenCalled();
    emitAuth('SIGNED_IN', 'other-owner'); expect(changed).toHaveBeenCalledWith('other-owner');
    stop(); emitAuth('SIGNED_OUT', null); expect(changed).toHaveBeenCalledTimes(1); expect(auth.callbacks.size).toBe(0);
  });
});


describe('rendered-owner baseline and unavailable Auth', () => {
  it('rejects a first Auth event for B when the start intent came from A’s screen', async () => {
    auth.initial = false;
    const start = sdk.startSession('runner', 'standard', {}, { ownerId: 'owner-a' });
    const rejection = expect(start).rejects.toMatchObject({ code: 'start_account_changed' });
    emitAuth('SIGNED_IN', 'owner-b'); emitAuth('INITIAL_SESSION', 'owner-b'); await rejection;
    expect(fetchMock).not.toHaveBeenCalled(); expect(sendEvent).not.toHaveBeenCalled(); expect(auth.callbacks.size).toBe(0);
  });

  it('invalidates a screen watch even when its first event is already a different account', async () => {
    auth.owner = 'owner-b';
    const changed = vi.fn(); const stop = sdk.watchGameOwner(changed, 'owner-a');
    await vi.advanceTimersByTimeAsync(0); expect(changed).toHaveBeenCalledWith('owner-b'); stop();
  });

  it('does not crash mounting a watcher with unavailable Auth, but fails start closed', async () => {
    auth.unavailable = true;
    const stop = sdk.watchGameOwner(vi.fn(), 'owner-a'); expect(stop).toBeTypeOf('function'); stop();
    await expect(sdk.startSession('runner')).rejects.toMatchObject({ kind: 'generic' });
    expect(fetchMock).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
