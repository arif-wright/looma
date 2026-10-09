import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('$lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ auth: {
  onAuthStateChange: (callback: any) => {
    void Promise.resolve().then(() => callback('INITIAL_SESSION', { user: { id: 'local-owner' } }));
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }
} }) }));
vi.mock('$lib/games/state', () => ({
  applyPlayerState: vi.fn(),
  getPlayerProgressSnapshot: vi.fn(() => ({ xp: 0, currency: 0 }))
}));
vi.mock('$lib/stores/companions', () => ({ getActiveCompanionSnapshot: vi.fn(() => null) }));
vi.mock('$lib/utils/analytics', () => ({ sendAnalytics: vi.fn() }));
vi.mock('$lib/client/events/sendEvent', () => ({ sendEvent: vi.fn(async () => null) }));

import { sendAnalytics } from '$lib/utils/analytics';
import { sendEvent } from '$lib/client/events/sendEvent';
import { applyPlayerState } from '$lib/games/state';

const serverReward = { xpDelta: 12, currencyDelta: 24, achievements: [] };
const run = { score: 1200, durationMs: 60_000, success: true };
const startPayload = (sessionId: string) => ({
  sessionId,
  nonce: `nonce-${sessionId}`,
  serverTime: 1000,
  caps: {
    minDurationMs: 10_000,
    maxDurationMs: 600_000,
    maxScorePerMin: 8000,
    minClientVer: '1.0.0',
    maxScore: 100_000
  }
});

let sdk: typeof import('$lib/games/sdk');
let fetchMock: Mock<[string, (RequestInit | undefined)?], Promise<Response>>;
let getItem: Mock<[string], string | null>;
let setItem: Mock<[string, string], void>;

beforeEach(async () => {
  vi.resetModules();
  vi.mocked(sendAnalytics).mockReset();
  vi.mocked(sendEvent).mockReset().mockResolvedValue(null);
  vi.mocked(applyPlayerState).mockClear();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  getItem = vi.fn<[string], string | null>(() => null);
  setItem = vi.fn<[string, string], void>();
  vi.stubGlobal('window', { sessionStorage: { getItem, setItem } });
  let starts = 0;
  fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === '/api/games/session/start') return Response.json(startPayload(`session-${++starts}`));
    if (url === '/api/games/sign') return Response.json({ signature: 'signed' });
    if (url === '/api/games/session/complete') return Response.json(serverReward);
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  sdk = await import('$lib/games/sdk');
});

afterEach(() => {
  vi.doUnmock('$lib/stores/companionReactions');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('game SDK local session release', () => {
  it('forgets an abandoned session without completion, telemetry or reward mutations', async () => {
    const session = await sdk.startSession('orbfield');
    fetchMock.mockClear();
    vi.mocked(sendEvent).mockClear();
    vi.mocked(sendAnalytics).mockClear();

    sdk.abandonSession(session.sessionId);
    sdk.abandonSession(session.sessionId);
    sdk.abandonSession('unknown');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();
    expect(sendAnalytics).not.toHaveBeenCalled();
    expect(await sdk.completeSession(session.sessionId, run)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    sdk.sendGameEvent('probe');
    expect(sendAnalytics).toHaveBeenLastCalledWith('game_probe', { payload: { sessionId: null } });
  });

  it('releasing an older session preserves a newer session and its completion context', async () => {
    const first = await sdk.startSession('orbfield');
    const second = await sdk.startSession('orbfield');
    sdk.abandonSession(first.sessionId);
    sdk.sendGameEvent('probe');
    expect(sendAnalytics).toHaveBeenLastCalledWith('game_probe', {
      payload: { sessionId: second.sessionId }
    });
    expect(await sdk.completeSession(first.sessionId, run)).toBeNull();
    expect(await sdk.completeSession(second.sessionId, run)).toEqual(serverReward);
    const completionCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/games/session/complete');
    expect(completionCalls).toHaveLength(1);
    expect(JSON.parse((completionCalls[0]![1] as RequestInit).body as string).sessionId).toBe(second.sessionId);
  });

  it('does not retry an ambiguous completion when the caller releases its local context', async () => {
    const session = await sdk.startSession('orbfield');
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/games/sign') return Response.json({ signature: 'signed' });
      throw new TypeError('Completion response lost');
    });
    await expect(sdk.completeSession(session.sessionId, run)).rejects.toMatchObject({ kind: 'network' });
    sdk.abandonSession(session.sessionId);
    const requestCount = fetchMock.mock.calls.length;
    expect(await sdk.completeSession(session.sessionId, run)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(requestCount);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('game SDK successful completion bookkeeping', () => {
  it('returns a confirmed start while its optional event remains pending', async () => {
    vi.mocked(sendEvent).mockImplementationOnce(() => new Promise(() => {}));
    expect(await sdk.startSession('orbfield')).toEqual(startPayload('session-1'));
    expect(sendEvent).toHaveBeenCalledWith('game.session.start', expect.any(Object), { sessionId: 'session-1' });
  }, 1000);

  it('returns confirmed rewards while the optional completion event remains pending', async () => {
    const session = await sdk.startSession('orbfield');
    vi.mocked(sendEvent).mockImplementationOnce(() => new Promise(() => {}));

    expect(await sdk.completeSession(session.sessionId, run)).toEqual(serverReward);
    expect(sendEvent).toHaveBeenLastCalledWith('game.complete', expect.any(Object), { sessionId: session.sessionId, idempotencyKey: `game.complete:${session.sessionId}` });
    const requestCount = fetchMock.mock.calls.length;
    expect(await sdk.completeSession(session.sessionId, run)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(requestCount);
  }, 1000);

  it('does not show a delayed completion reaction during a newer active round', async () => {
    const pushReaction = vi.fn();
    vi.doMock('$lib/stores/companionReactions', () => ({ pushCompanionReaction: pushReaction }));
    // Preload the mock so flushing microtasks also flushes its dynamic import.
    await import('$lib/stores/companionReactions');
    const first = await sdk.startSession('orbfield');
    let resolveEvent!: (value: unknown) => void;
    vi.mocked(sendEvent).mockImplementationOnce(() => new Promise((resolve) => { resolveEvent = resolve; }));
    expect(await sdk.completeSession(first.sessionId, run)).toEqual(serverReward);
    const second = await sdk.startSession('orbfield');

    resolveEvent({ output: { reaction: { text: 'Old round reaction' } } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pushReaction).not.toHaveBeenCalled();
    sdk.sendGameEvent('probe');
    expect(sendAnalytics).toHaveBeenLastCalledWith('game_probe', {
      payload: { sessionId: second.sessionId }
    });
  });

  it.each(['read', 'write', 'access'] as const)(
    'returns the server result when sessionStorage %s is blocked',
    async (failure) => {
      const blocked = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
      if (failure === 'read') getItem.mockImplementation(blocked);
      if (failure === 'write') setItem.mockImplementation(blocked);
      if (failure === 'access') Object.defineProperty(window, 'sessionStorage', { get: blocked });
      const session = await sdk.startSession('orbfield');

      expect(await sdk.completeSession(session.sessionId, run)).toEqual(serverReward);
      expect(sendEvent).toHaveBeenCalledWith('game.complete', expect.any(Object), { sessionId: session.sessionId, idempotencyKey: `game.complete:${session.sessionId}` });
      const requestCount = fetchMock.mock.calls.length;
      // Success releases the context; it neither fabricates a cached result nor posts twice.
      expect(await sdk.completeSession(session.sessionId, run)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(requestCount);
    }
  );

  it('does not fail a successful start or completion when optional analytics throws', async () => {
    vi.mocked(sendAnalytics).mockImplementation(() => { throw new Error('localStorage unavailable'); });
    const session = await sdk.startSession('orbfield');
    expect(session.sessionId).toBe('session-1');
    expect(await sdk.completeSession(session.sessionId, run)).toEqual(serverReward);
    expect(setItem).toHaveBeenCalledWith('looma_session_games_played', '1');
  });

  it('increments the counter once and returns only the server reward payload', async () => {
    getItem.mockReturnValue('4');
    const session = await sdk.startSession('orbfield');
    expect(await sdk.completeSession(session.sessionId, { ...run, rewards: { xp: 999_999 } })).toEqual(serverReward);
    expect(setItem).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledWith('looma_session_games_played', '5');
  });

  it.each(['import', 'store'] as const)(
    'preserves the committed result when optional reaction %s fails',
    async (failure) => {
      vi.doMock('$lib/stores/companionReactions', () => {
        if (failure === 'import') throw new Error('Reaction chunk unavailable');
        return { pushCompanionReaction: () => { throw new Error('Reaction subscriber failed'); } };
      });
      const session = await sdk.startSession('orbfield');
      vi.mocked(sendEvent).mockResolvedValueOnce({ output: { reaction: { text: 'Test reaction' } } });

      expect(await sdk.completeSession(session.sessionId, run)).toEqual(serverReward);
      await vi.waitFor(() => expect(console.debug).toHaveBeenCalledWith(
        '[games/sdk] completion reaction unavailable', expect.any(Error)
      ));
      const requestCount = fetchMock.mock.calls.length;
      expect(await sdk.completeSession(session.sessionId, run)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(requestCount);
    }
  );
});


const postedBodies = (endpoint: string) => fetchMock.mock.calls
  .filter(([url]) => url === endpoint)
  .map(([, init]) => JSON.parse(init!.body as string));
const completionEvents = () => vi.mocked(sendEvent).mock.calls.filter(([type]) => type === 'game.complete');

describe('game SDK bounded completion recovery', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const timeoutError = { kind: 'network', code: 'request_timeout' };
  const endpointFor = (stage: 'sign' | 'complete') => stage === 'sign'
    ? '/api/games/sign' : '/api/games/session/complete';

  for (const stage of ['sign', 'complete'] as const) {
    for (const stalledPart of ['headers', 'body'] as const) {
      it(`bounds stalled ${stage} ${stalledPart}, retains exact retry and ignores late resolution`, async () => {
        const session = await sdk.startSession('runner');
        const original = { score: 84, success: false, stats: { shards: 4, powerupsUsed: { shield: 1 } } };
        await vi.advanceTimersByTimeAsync(8123);
        const endpoint = endpointFor(stage);
        let release!: (value: any) => void;
        let timedSignal: AbortSignal | null | undefined;
        let stall = true;
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
          if (url === endpoint && stall) {
            stall = false;
            timedSignal = init?.signal;
            const pending = new Promise<any>((resolve) => { release = resolve; });
            // Deliberately ignore abort to prove that a late transport cannot
            // continue to settlement, erase retry context or award twice.
            return stalledPart === 'headers' ? pending : { ok: true, json: () => pending } as Response;
          }
          if (url === '/api/games/sign') return Response.json({ signature: 'signed' });
          if (url === '/api/games/session/complete') return Response.json(serverReward);
          throw new Error(`Unexpected request: ${url}`);
        });
        let failure: unknown;
        const pending = sdk.completeSession(session.sessionId, original).catch((error) => { failure = error; });
        await vi.advanceTimersByTimeAsync(29_999);
        expect(failure).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        expect(failure).toMatchObject(timeoutError);
        await pending;
        expect(timedSignal?.aborted).toBe(true);
        expect(setItem).not.toHaveBeenCalled();
        expect(completionEvents()).toEqual([]);
        expect(applyPlayerState).not.toHaveBeenCalled();
        expect(postedBodies('/api/games/session/start')).toHaveLength(1);

        const countAfterTimeout = fetchMock.mock.calls.length;
        await vi.advanceTimersByTimeAsync(300_000);
        expect(fetchMock).toHaveBeenCalledTimes(countAfterTimeout); // No automatic retry.
        await expect(sdk.completeSession(session.sessionId, { ...original, score: 85 })).rejects.toMatchObject({ code: 'conflict' });
        expect(fetchMock).toHaveBeenCalledTimes(countAfterTimeout);

        // An explicit identical retry reuses the frozen first duration and stats.
        expect(await sdk.completeSession(session.sessionId, structuredClone(original))).toEqual(serverReward);
        const signs = postedBodies('/api/games/sign');
        expect(signs).toHaveLength(2);
        expect(signs[1]).toEqual(signs[0]);
        expect(signs[1]).toMatchObject({ sessionId: session.sessionId, score: 84, durationMs: 8123 });
        const saves = postedBodies('/api/games/session/complete');
        expect(saves).toHaveLength(stage === 'complete' ? 2 : 1);
        if (stage === 'complete') expect(saves[1]).toEqual(saves[0]);
        expect(saves.at(-1)).toMatchObject({ ...original, durationMs: 8123 });
        expect(completionEvents()).toHaveLength(1);
        expect(completionEvents()[0]?.[2]).toEqual({ sessionId: session.sessionId, idempotencyKey: `game.complete:${session.sessionId}` });
        expect(setItem).toHaveBeenCalledTimes(1);

        const reply = stage === 'sign' ? { signature: 'late-signature' } : { xpDelta: 999, currencyDelta: 999 };
        release(stalledPart === 'headers' ? Response.json(reply) : reply);
        await vi.advanceTimersByTimeAsync(0);
        expect(postedBodies('/api/games/session/complete')).toHaveLength(stage === 'complete' ? 2 : 1);
        expect(completionEvents()).toHaveLength(1);
        expect(setItem).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
      });
    }
  }

  it('coalesces repeated clicks before and after a timeout without a late response clearing the retry', async () => {
    const session = await sdk.startSession('runner');
    const releases: Array<(response: Response) => void> = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/games/sign') return Response.json({ signature: 'signed' });
      if (url === '/api/games/session/complete') return new Promise((resolve) => releases.push(resolve));
      throw new Error(`Unexpected request: ${url}`);
    });
    const first = sdk.completeSession(session.sessionId, run).catch((error) => error);
    const twin = sdk.completeSession(session.sessionId, run).catch((error) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await first).toMatchObject(timeoutError);
    expect(await twin).toMatchObject(timeoutError);
    expect(releases).toHaveLength(1);

    const retry = sdk.completeSession(session.sessionId, run);
    const retryTwin = sdk.completeSession(session.sessionId, run);
    await vi.advanceTimersByTimeAsync(0);
    expect(releases).toHaveLength(2);
    releases[0]!(Response.json(serverReward));
    await vi.advanceTimersByTimeAsync(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(completionEvents()).toEqual([]);
    const afterLateResponse = sdk.completeSession(session.sessionId, run);
    expect(releases).toHaveLength(2);
    releases[1]!(Response.json(serverReward));
    expect(await Promise.all([retry, retryTwin, afterLateResponse])).toEqual([serverReward, serverReward, serverReward]);
    expect(postedBodies('/api/games/sign')).toHaveLength(2);
    expect(postedBodies('/api/games/session/complete')).toHaveLength(2);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(completionEvents()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not restart or settle a timed-out run after explicit abandonment', async () => {
    const session = await sdk.startSession('runner');
    let release!: (response: Response) => void;
    fetchMock.mockImplementation(async () => new Promise((resolve) => { release = resolve; }));
    let failure: unknown;
    const pending = sdk.completeSession(session.sessionId, run).catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(failure).toMatchObject(timeoutError);
    await pending;
    sdk.abandonSession(session.sessionId);
    const count = fetchMock.mock.calls.length;
    release(Response.json({ signature: 'late-signature' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(await sdk.completeSession(session.sessionId, run)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(count);
    expect(postedBodies('/api/games/session/complete')).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
    expect(completionEvents()).toEqual([]);
  });

  it.each(['runner', 'orbfield', 'tiles-run', 'arpg'])(
    'preserves successful %s completion and clears request timers', async (gameId) => {
      const session = await sdk.startSession(gameId);
      expect(await sdk.completeSession(session.sessionId, run)).toEqual(serverReward);
      expect(vi.getTimerCount()).toBe(0);
      const count = fetchMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock).toHaveBeenCalledTimes(count);
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(completionEvents()).toHaveLength(1);
      expect(applyPlayerState).not.toHaveBeenCalled();
    }
  );

  it('bounds the pre-signed completion overload without local bookkeeping or automatic retries', async () => {
    fetchMock.mockImplementation(async () => new Promise(() => {}));
    let failure: unknown;
    const pending = sdk.completeSession({ sessionId: 'direct', score: 84, durationMs: 8000, nonce: 'nonce', signature: 'signed' })
      .catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(failure).toMatchObject(timeoutError);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postedBodies('/api/games/sign')).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
    expect(completionEvents()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['sign', 401], ['sign', 409], ['complete', 401], ['complete', 409]
  ] as const)('preserves %s HTTP %s classification and cleans its timer', async (stage, status) => {
    const session = await sdk.startSession('runner');
    fetchMock.mockImplementation(async (url: string) => url === endpointFor(stage)
      ? Response.json({ code: status === 401 ? 'unauthorized' : 'conflict' }, { status })
      : Response.json({ signature: 'signed' }));
    await expect(sdk.completeSession(session.sessionId, run)).rejects.toMatchObject({
      status, code: status === 401 ? 'unauthorized' : 'conflict'
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each(['sign', 'complete'] as const)('keeps the timeout classification when %s transport rejects on abort', async (stage) => {
    const session = await sdk.startSession('runner');
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url !== endpointFor(stage)) return Response.json({ signature: 'signed' });
      return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      }, { once: true }));
    });
    let failure: unknown;
    const pending = sdk.completeSession(session.sessionId, run).catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(failure).toMatchObject(timeoutError);
    await pending;
    expect(setItem).not.toHaveBeenCalled();
    expect(completionEvents()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['sign', 'complete'] as const)('bounds a stalled non-OK %s response body', async (stage) => {
    const session = await sdk.startSession('runner');
    fetchMock.mockImplementation(async (url: string) => url === endpointFor(stage)
      ? { ok: false, status: 401, json: () => new Promise(() => {}) } as Response
      : Response.json({ signature: 'signed' }));
    let failure: unknown;
    const pending = sdk.completeSession(session.sessionId, run).catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(failure).toMatchObject(timeoutError);
    await pending;
    expect(setItem).not.toHaveBeenCalled();
    expect(completionEvents()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('game SDK immutable completion submission', () => {
  it('sends success and stats to settlement and uses one stable session event key', async () => {
    const session = await sdk.startSession('orbfield');
    const stats = { waves: 3, scoreBreakdown: { dodges: 7, bonus: 2 } };
    expect(await sdk.completeSession(session.sessionId, { ...run, stats })).toEqual(serverReward);
    expect(postedBodies('/api/games/session/complete')).toEqual([{
      sessionId: session.sessionId, score: run.score, durationMs: run.durationMs,
      nonce: session.nonce, signature: 'signed', clientVersion: '1.0.0', success: true, stats
    }]);
    expect(completionEvents()).toEqual([[
      'game.complete', { sessionId: session.sessionId, gameId: 'orbfield', mode: null, results: { ...run, stats } },
      { sessionId: session.sessionId, idempotencyKey: `game.complete:${session.sessionId}` }
    ]]);
    expect(applyPlayerState).not.toHaveBeenCalled();
  });

  it('coalesces identical in-flight completions into one network attempt and one bookkeeping update', async () => {
    const session = await sdk.startSession('orbfield');
    fetchMock.mockClear();
    let releaseSign!: (response: Response) => void;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/games/sign') return new Promise((resolve) => { releaseSign = resolve; });
      if (url === '/api/games/session/complete') return Response.json(serverReward);
      throw new Error(`Unexpected request: ${url}`);
    });
    const first = sdk.completeSession(session.sessionId, { ...run, stats: { waves: 3, hits: 0 } });
    const second = sdk.completeSession(session.sessionId, { ...run, stats: { hits: 0, waves: 3 } });
    expect(postedBodies('/api/games/sign')).toHaveLength(1);
    expect(postedBodies('/api/games/session/complete')).toEqual([]);
    releaseSign(Response.json({ signature: 'signed' }));
    expect(await Promise.all([first, second])).toEqual([serverReward, serverReward]);
    expect(postedBodies('/api/games/sign')).toHaveLength(1);
    expect(postedBodies('/api/games/session/complete')).toHaveLength(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(completionEvents()).toHaveLength(1);
    expect(applyPlayerState).not.toHaveBeenCalled();
  });

  it.each([
    ['score', { score: run.score + 1 }], ['duration', { durationMs: run.durationMs + 1 }],
    ['success', { success: false }], ['stats', { stats: { waves: 4 } }]
  ] as Array<[string, Record<string, unknown>]>)('rejects changed in-flight %s without disturbing the original completion', async (_field, changed) => {
    const session = await sdk.startSession('orbfield');
    fetchMock.mockClear();
    let releaseSign!: (response: Response) => void;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/games/sign') return new Promise((resolve) => { releaseSign = resolve; });
      if (url === '/api/games/session/complete') return Response.json(serverReward);
      throw new Error(`Unexpected request: ${url}`);
    });
    const original = sdk.completeSession(session.sessionId, { ...run, stats: { waves: 3 } });
    await expect(sdk.completeSession(session.sessionId, { ...run, stats: { waves: 3 }, ...changed })).rejects.toMatchObject({
      kind: 'completion_failed', status: 409, code: 'conflict'
    });
    expect(postedBodies('/api/games/sign')).toHaveLength(1);
    releaseSign(Response.json({ signature: 'signed' }));
    expect(await original).toEqual(serverReward);
    expect(postedBodies('/api/games/session/complete')).toHaveLength(1);
    expect(postedBodies('/api/games/session/complete')[0]).toMatchObject({ ...run, stats: { waves: 3 } });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(completionEvents()).toHaveLength(1);
  });

  it('deep-copies submitted stats before an in-flight caller can mutate them', async () => {
    const session = await sdk.startSession('orbfield');
    let releaseSign!: (response: Response) => void;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/games/sign') return new Promise((resolve) => { releaseSign = resolve; });
      if (url === '/api/games/session/complete') return Response.json(serverReward);
      throw new Error(`Unexpected request: ${url}`);
    });
    const stats = { waves: 3, breakdown: { bonus: 2 }, checkpoints: [1, 2] };
    const originalStats = structuredClone(stats);
    const pending = sdk.completeSession(session.sessionId, { ...run, stats });
    stats.waves = 99; stats.breakdown.bonus = 99; stats.checkpoints.push(99);
    releaseSign(Response.json({ signature: 'signed' }));
    expect(await pending).toEqual(serverReward);
    expect(postedBodies('/api/games/session/complete')[0].stats).toEqual(originalStats);
    expect(completionEvents()[0]?.[1]).toMatchObject({ results: { stats: originalStats } });
  });

  it('retries a lost completion with the first normalized elapsed duration and stats after time advances', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const session = await sdk.startSession('orbfield');
    now += 30_123;
    let completions = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/games/sign') return Response.json({ signature: 'signed' });
      if (url === '/api/games/session/complete') {
        if (++completions === 1) throw new TypeError('Completion response lost after commit');
        return Response.json(serverReward);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const result = { score: 1200.9, success: true, stats: { waves: 3, nested: { bonus: 2 } } };
    await expect(sdk.completeSession(session.sessionId, result)).rejects.toMatchObject({ kind: 'network' });
    expect(setItem).not.toHaveBeenCalled();
    expect(completionEvents()).toEqual([]);
    now += 600_000;
    expect(await sdk.completeSession(session.sessionId, structuredClone(result))).toEqual(serverReward);
    const signs = postedBodies('/api/games/sign');
    const completed = postedBodies('/api/games/session/complete');
    expect(signs).toHaveLength(2); expect(signs[1]).toEqual(signs[0]);
    expect(completed).toHaveLength(2); expect(completed[1]).toEqual(completed[0]);
    expect(completed[0]).toMatchObject({ score: 1200, durationMs: 30_123, success: true, stats: result.stats });
    expect(completionEvents()).toHaveLength(1);
    expect(completionEvents()[0]?.[2]).toEqual({ sessionId: session.sessionId, idempotencyKey: `game.complete:${session.sessionId}` });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(applyPlayerState).not.toHaveBeenCalled();
  });

  it('rejects a changed retry after an uncertain response instead of replacing its frozen payload', async () => {
    const session = await sdk.startSession('orbfield');
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/games/sign') return Response.json({ signature: 'signed' });
      throw new TypeError('Completion response lost');
    });
    await expect(sdk.completeSession(session.sessionId, { ...run, stats: { waves: 3 } })).rejects.toMatchObject({ kind: 'network' });
    const count = fetchMock.mock.calls.length;
    await expect(sdk.completeSession(session.sessionId, { ...run, stats: { waves: 4 } })).rejects.toMatchObject({
      kind: 'completion_failed', status: 409, code: 'conflict'
    });
    expect(fetchMock).toHaveBeenCalledTimes(count);
    expect(completionEvents()).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null], ['missing rewards', {}], ['missing currency', { xpDelta: 12 }],
    ['negative XP', { ...serverReward, xpDelta: -1 }], ['fractional XP', { ...serverReward, xpDelta: 1.5 }],
    ['string XP', { ...serverReward, xpDelta: '12' }], ['unsafe XP', { ...serverReward, xpDelta: Number.MAX_SAFE_INTEGER + 1 }],
    ['negative currency', { ...serverReward, currencyDelta: -1 }], ['nonfinite currency', { ...serverReward, currencyDelta: Infinity }],
    ['unknown version', { ...serverReward, settlementVersion: 2, sessionId: 'session-1' }],
    ['foreign session', { ...serverReward, settlementVersion: 1, sessionId: 'session-other' }]
  ])('rejects a malformed successful %s receipt without releasing retry context or applying local rewards', async (_label, invalid) => {
    const session = await sdk.startSession('orbfield');
    let completions = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/games/sign') return Response.json({ signature: 'signed' });
      if (url === '/api/games/session/complete') return Response.json(++completions === 1 ? invalid : serverReward);
      throw new Error(`Unexpected request: ${url}`);
    });
    await expect(sdk.completeSession(session.sessionId, run)).rejects.toMatchObject({ kind: 'completion_failed', code: 'invalid_receipt' });
    expect(setItem).not.toHaveBeenCalled();
    expect(completionEvents()).toEqual([]);
    expect(applyPlayerState).not.toHaveBeenCalled();
    expect(await sdk.completeSession(session.sessionId, run)).toEqual(serverReward);
    expect(postedBodies('/api/games/session/complete')).toHaveLength(2);
    expect(completionEvents()).toHaveLength(1);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('returns a matching v1 receipt unchanged and uses distinct event keys for distinct sessions', async () => {
    const first = await sdk.startSession('orbfield');
    const firstReward = { ...serverReward, settlementVersion: 1, sessionId: first.sessionId };
    fetchMock.mockImplementationOnce(async () => Response.json({ signature: 'signed' }))
      .mockImplementationOnce(async () => Response.json(firstReward));
    expect(await sdk.completeSession(first.sessionId, run)).toEqual(firstReward);
    const second = await sdk.startSession('orbfield');
    expect(await sdk.completeSession(second.sessionId, run)).toEqual(serverReward);
    expect(completionEvents().map(([, , options]) => options?.idempotencyKey)).toEqual([
      `game.complete:${first.sessionId}`, `game.complete:${second.sessionId}`
    ]);
  });
});
