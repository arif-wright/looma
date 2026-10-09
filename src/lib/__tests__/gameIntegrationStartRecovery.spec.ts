import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  start: vi.fn(), abandon: vi.fn(), complete: vi.fn(),
  watchers: new Set<(owner: string | null) => void>(), watch: vi.fn()
}));
vi.mock('$lib/games/sdk', () => ({
  GameClientError: class extends Error {
    constructor(input: { message: string }) { super(input.message); Object.assign(this, input); }
  },
  startSession: h.start,
  abandonSession: h.abandon,
  completeSession: h.complete,
  watchGameOwner: h.watch
}));
import {
  beginGameSession, cancelGameSessionStart, createGameIntegrationState, finishGameSession
} from '$lib/games/GameIntegrationTemplate';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const context = (sessionId: string) => ({ sessionId, nonce: `nonce-${sessionId}` });

beforeEach(() => {
  vi.clearAllMocks(); h.watchers.clear();
  h.watch.mockImplementation((callback) => {
    h.watchers.add(callback);
    return () => h.watchers.delete(callback);
  });
});
afterEach(() => { expect(h.watchers.size).toBe(0); });

describe('integration template start ownership', () => {
  it('coalesces matching pending begins and rejects an already active session', async () => {
    const gate = deferred<any>(); h.start.mockReturnValueOnce(gate.promise);
    const state = createGameIntegrationState('custom');
    const first = beginGameSession(state, 'practice', { source: 'test' });
    const duplicate = beginGameSession(state, 'practice', { source: 'test' });
    expect(duplicate).toBe(first); expect(h.start).toHaveBeenCalledTimes(1);
    gate.resolve(context('one')); expect(await first).toEqual(context('one'));
    await expect(beginGameSession(state)).rejects.toMatchObject({ code: 'session_active' });
    expect(h.start).toHaveBeenCalledTimes(1); expect(state.startedAtMs).toBeGreaterThan(0);
    expect(h.start).toHaveBeenCalledWith('custom', 'practice', { source: 'test' }, { signal: expect.any(AbortSignal) });
  });

  it('forgets a cancelled late start without disturbing a newer pending attempt', async () => {
    const oldGate = deferred<any>(); const nextGate = deferred<any>();
    h.start.mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(nextGate.promise);
    const state = createGameIntegrationState('custom');
    const old = beginGameSession(state); const oldRejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    const oldSignal = h.start.mock.calls[0][3].signal;
    cancelGameSessionStart(state); expect(oldSignal.aborted).toBe(true);
    const next = beginGameSession(state);
    oldGate.resolve(context('old')); await oldRejected;
    expect(state.session).toBeNull(); expect(beginGameSession(state)).toBe(next);
    expect(h.abandon).toHaveBeenCalledWith('old');
    expect(h.start.mock.calls[1][3].signal.aborted).toBe(false);
    nextGate.resolve(context('next')); await next;
    expect(state.session?.sessionId).toBe('next'); expect(h.start).toHaveBeenCalledTimes(2);
  });

  it('an account change cancels only its pending attempt and forwards the rendered owner', async () => {
    const oldGate = deferred<any>(); const nextGate = deferred<any>();
    h.start.mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(nextGate.promise);
    const state = createGameIntegrationState('custom');
    const old = beginGameSession(state, 'standard', {}, { ownerId: 'owner-a' });
    const rejected = expect(old).rejects.toMatchObject({ code: 'start_account_changed', message: expect.stringContaining('Refresh the page') });
    const oldCallback = [...h.watchers][0]!; oldCallback('owner-b');
    expect(h.start.mock.calls[0][3]).toMatchObject({ ownerId: 'owner-a' });
    expect(h.start.mock.calls[0][3].signal.aborted).toBe(true);
    const next = beginGameSession(state, 'standard', {}, { ownerId: 'owner-b' });
    oldCallback(null); expect(h.start.mock.calls[1][3].signal.aborted).toBe(false);
    nextGate.resolve(context('next')); await next;
    oldGate.resolve(context('old')); await rejected;
    expect(state.session?.sessionId).toBe('next');
  });

  it('leaves failures available for an explicit new begin without automatic replay', async () => {
    const uncertain = new Error('A session may already exist');
    h.start.mockRejectedValueOnce(uncertain).mockResolvedValueOnce(context('new'));
    const state = createGameIntegrationState('custom');
    await expect(beginGameSession(state)).rejects.toBe(uncertain);
    expect(state.session).toBeNull(); expect(state.startedAtMs).toBe(0);
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(await beginGameSession(state)).toEqual(context('new'));
  });

  it('rejects a new-owner begin against an active session without returning the old context', async () => {
    h.start.mockResolvedValueOnce(context('owner-a-session'));
    const state = createGameIntegrationState('custom');
    await beginGameSession(state, 'standard', {}, { ownerId: 'owner-a' });
    await expect(beginGameSession(state, 'standard', {}, { ownerId: 'owner-b' })).rejects.toMatchObject({ code: 'session_active' });
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(state.session?.sessionId).toBe('owner-a-session');
  });

  it.each(['owner', 'mode', 'metadata'])('rejects an incompatible pending %s without changing the first request', async (difference) => {
    const gate = deferred<any>(); h.start.mockReturnValueOnce(gate.promise);
    const state = createGameIntegrationState('custom');
    const first = beginGameSession(state, 'standard', { source: 'first' }, { ownerId: 'owner-a' });
    await expect(beginGameSession(state,
      difference === 'mode' ? 'practice' : 'standard',
      { source: difference === 'metadata' ? 'second' : 'first' },
      { ownerId: difference === 'owner' ? 'owner-b' : 'owner-a' }
    )).rejects.toMatchObject({ code: 'start_in_progress' });
    expect(h.start).toHaveBeenCalledTimes(1); expect(h.start.mock.calls[0][3].signal.aborted).toBe(false);
    gate.resolve(context('first')); expect(await first).toEqual(context('first'));
  });

  it('keeps successful completion and reward bookkeeping unchanged', async () => {
    h.start.mockResolvedValueOnce(context('one'));
    const rewards = { xpDelta: 12, currencyDelta: 8 };
    h.complete.mockResolvedValueOnce(rewards);
    const state = createGameIntegrationState('custom');
    await beginGameSession(state);
    expect(await finishGameSession(state, { score: 15, durationMs: 1000, success: true })).toBe(rewards);
    expect(h.complete).toHaveBeenCalledWith('one', { score: 15, durationMs: 1000, success: true });
    expect(state).toMatchObject({ session: null, startedAtMs: 0, lastServerRewards: rewards });
  });
});
