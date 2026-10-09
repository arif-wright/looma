import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTownSession, resolveExpeditionCaps, type FrozenExpeditionResult } from '$lib/games/arpg/townSession';
import type { GameSessionStart } from '$lib/games/sdk';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const session = (minDurationMs = 0, maxDurationMs = 600_000): GameSessionStart => ({
  sessionId: 'session-one', nonce: 'nonce-one', serverTime: 0,
  caps: { minDurationMs, maxDurationMs, maxScore: 150_000, maxScorePerMin: 9000, minClientVer: '1.0.0' }
});
const receipt = { xpDelta: 24, currencyDelta: 3 };
const setup = (started = session()) => {
  const deps = {
    start: vi.fn(async (_signal: AbortSignal) => started),
    beginExpedition: vi.fn(),
    sign: vi.fn(async (_session: GameSessionStart, _result: FrozenExpeditionResult) => 'signature-one'),
    complete: vi.fn(async (_session: GameSessionStart, _result: FrozenExpeditionResult, _signature: string) => receipt),
    abandon: vi.fn(), onState: vi.fn(), onSettled: vi.fn(),
    now: () => performance.now()
  };
  return { deps, town: createTownSession(deps) };
};
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); });

describe('untimed town session lifecycle', () => {
  it('does not start a reward session while resting in town', async () => {
    const { town, deps } = setup();
    await vi.advanceTimersByTimeAsync(12 * 60 * 60_000);
    expect(town.state.phase).toBe('ready');
    expect(deps.start).not.toHaveBeenCalled();
    expect(deps.sign).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('guards repeated departure requests before the first await and starts the bounded scene once', async () => {
    const { town, deps } = setup();
    const pending = deferred<GameSessionStart>();
    deps.start.mockReturnValue(pending.promise);
    const first = town.depart();
    await town.depart(); await town.depart();
    expect(town.state.phase).toBe('starting');
    expect(deps.start).toHaveBeenCalledTimes(1);
    expect(deps.beginExpedition).not.toHaveBeenCalled();
    pending.resolve(session()); await first;
    expect(deps.beginExpedition.mock.calls).toEqual([[90_000]]);
    await town.depart();
    expect(deps.start).toHaveBeenCalledTimes(1);
  });

  it('respects a smaller server maximum', async () => {
    const { town, deps } = setup(session(1000, 30_000));
    await town.depart();
    expect(deps.beginExpedition).toHaveBeenCalledWith(30_000);
  });

  it('blocks an incompatible minimum without pretending the created session was cancelled', async () => {
    const { town, deps } = setup(session(90_001));
    await town.depart(); await town.depart();
    expect(town.state).toMatchObject({ phase: 'blocked', issue: { context: 'caps' } });
    expect(deps.abandon.mock.calls).toEqual([['session-one']]);
    expect(deps.start).toHaveBeenCalledTimes(1);
    expect(deps.beginExpedition).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it.each([
    [-1, 90_000], [NaN, 90_000], [0, 0], [10_000, 9000], [0.5, 90_000], [0, Infinity]
  ])('rejects malformed timing caps min=%s max=%s', (min, max) => {
    expect(() => resolveExpeditionCaps(session(min, max).caps)).toThrow();
  });

  it('allows explicit departure retry after a failed start without automatically sending a second start', async () => {
    const { town, deps } = setup();
    deps.start.mockRejectedValueOnce(new Error('start outcome unknown'));
    await town.depart();
    expect(town.state).toMatchObject({ phase: 'ready', issue: { context: 'start' } });
    expect(deps.start).toHaveBeenCalledTimes(1);
    expect(deps.abandon).not.toHaveBeenCalled();
    await town.depart();
    expect(deps.start).toHaveBeenCalledTimes(2);
    expect(deps.beginExpedition).toHaveBeenCalledTimes(1);
  });

  it('fixes one return result, ignores repeated returns, and permits departure only after a receipt', async () => {
    const { town, deps } = setup();
    const pending = deferred<typeof receipt>(); deps.complete.mockReturnValue(pending.promise);
    await town.depart(); await vi.advanceTimersByTimeAsync(20_000);
    const returned = town.returnToTown(1200.8, 19_990, false, { mode: 'standard', floor: 2 });
    await town.returnToTown(9999, 20_000, true); await town.depart(); await flush();
    expect(town.state.phase).toBe('saving');
    expect(deps.start).toHaveBeenCalledTimes(1);
    expect(deps.complete).toHaveBeenCalledTimes(1);
    expect(deps.complete.mock.calls[0]?.[1]).toEqual({
      score: 1200, durationMs: 19_990, success: false,
      stats: { mode: 'standard', floor: 2, expeditionDurationMs: 19_990 }
    });
    pending.resolve(receipt); await returned;
    expect(town.state.phase).toBe('ready');
    expect(deps.onSettled).toHaveBeenCalledTimes(1);
    expect(deps.abandon).toHaveBeenCalledOnce();
    await town.depart(); expect(deps.start).toHaveBeenCalledTimes(2);
  });

  it('waits only for real minimum elapsed time, freezes gameplay duration and nested stats, and blocks departure', async () => {
    const { town, deps } = setup(session(10_000));
    const stats = { mode: 'standard', nested: { floor: 2 } };
    await town.depart(); await vi.advanceTimersByTimeAsync(3000);
    const returned = town.returnToTown(400, 3000, true, stats);
    stats.nested.floor = 99;
    expect(town.state).toMatchObject({ phase: 'waiting', waitMs: 7000 });
    await town.depart(); await town.retry();
    await vi.advanceTimersByTimeAsync(6999);
    expect(deps.sign).not.toHaveBeenCalled(); expect(deps.start).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await returned;
    const result = deps.complete.mock.calls[0]?.[1];
    expect(result).toEqual({ score: 400, durationMs: 10_000, success: true,
      stats: { mode: 'standard', nested: { floor: 2 }, expeditionDurationMs: 3000 } });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.stats.nested)).toBe(true);
  });

  it('does not enlarge the submitted duration when a minimum-wait timer is delayed', async () => {
    const { deps } = setup(session(10_000));
    let now = 0;
    const town = createTownSession({ ...deps, now: () => now });
    await town.depart(); now = 3000;
    const returned = town.returnToTown(400, 3000);
    now = 300_000;
    await vi.advanceTimersByTimeAsync(7000); await returned;
    expect(deps.complete.mock.calls[0]?.[1].durationMs).toBe(10_000);
  });

  it('waits one real millisecond for an immediate zero-duration return, without relying on SDK elapsed fallback', async () => {
    const { town, deps } = setup(); await town.depart();
    const returned = town.returnToTown(0, 0);
    expect(deps.sign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await returned;
    expect(deps.complete.mock.calls[0]?.[1]).toMatchObject({ durationMs: 1, stats: { expeditionDurationMs: 0 } });
  });

  it('does not wait or enlarge duration to make a high score satisfy the score-rate cap', async () => {
    const { town, deps } = setup(session(10_000));
    deps.sign.mockRejectedValue(new Error('invalid_score_rate'));
    await town.depart(); await vi.advanceTimersByTimeAsync(12_000);
    await town.returnToTown(5600, 12_000);
    expect(deps.sign.mock.calls[0]?.[1]).toMatchObject({ score: 5600, durationMs: 12_000 });
    expect(town.state.phase).toBe('retry');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['sign', 'complete'] as const)('retains the exact immutable payload after uncertain %s and guards repeated retries', async (stage) => {
    const { town, deps } = setup();
    deps[stage].mockRejectedValueOnce(new Error('receipt lost'));
    await town.depart(); await vi.advanceTimersByTimeAsync(5000);
    await town.returnToTown(400, 5000);
    const frozen = deps.sign.mock.calls[0]?.[1];
    expect(town.state.phase).toBe('retry');
    expect(deps.abandon).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120_000); await town.depart();
    expect(deps.start).toHaveBeenCalledTimes(1);
    const pending = deferred<string>(); deps.sign.mockReturnValueOnce(pending.promise);
    const retry = town.retry(); await town.retry(); await town.returnToTown(9999, 9999);
    expect(deps.sign).toHaveBeenCalledTimes(2);
    expect(deps.sign.mock.calls[1]?.[1]).toBe(frozen);
    pending.resolve('signature-retry'); await retry;
    expect(deps.complete.mock.calls.at(-1)?.[1]).toBe(frozen);
    expect(deps.onSettled).toHaveBeenCalledTimes(1);
    expect(town.state.phase).toBe('ready');
  });

  it.each(['invalid_score_rate', 'invalid_duration', 'conflict'])('blocks a permanently rejected %s without padding or retrying', async (code) => {
    const { town, deps } = setup();
    deps.sign.mockRejectedValue(Object.assign(new Error(code), { code }));
    await town.depart(); await vi.advanceTimersByTimeAsync(2000);
    await town.returnToTown(5600, 2000);
    expect(town.state.phase).toBe('rejected');
    await vi.advanceTimersByTimeAsync(90_000); await town.retry(); await town.depart();
    expect(deps.sign).toHaveBeenCalledTimes(1);
    expect(deps.start).toHaveBeenCalledTimes(1);
    expect(deps.abandon).not.toHaveBeenCalled();
    expect(deps.onSettled).not.toHaveBeenCalled();
  });

  it('does not turn a confirmed save into retry when optional reward presentation throws', async () => {
    const { town, deps } = setup();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deps.onSettled.mockImplementation(() => { throw new Error('presentation failed'); });
    await town.depart(); await vi.advanceTimersByTimeAsync(2000);
    await town.returnToTown(100, 2000);
    expect(town.state.phase).toBe('ready');
    expect(deps.abandon).toHaveBeenCalledOnce();
    await town.retry(); expect(deps.complete).toHaveBeenCalledOnce();
    await town.depart(); expect(deps.start).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledOnce(); warning.mockRestore();
  });

  it('uses monotonic time and bounds untrusted reported elapsed time by real elapsed and the expedition maximum', async () => {
    const { town, deps } = setup(session(0, 30_000));
    await town.depart(); await vi.advanceTimersByTimeAsync(40_000);
    vi.setSystemTime(Date.now() + 365 * 24 * 60 * 60_000);
    await town.returnToTown(400, 999_999);
    expect(deps.complete.mock.calls[0]?.[1].durationMs).toBe(30_000);
  });

  it('uses actual monotonic elapsed when legacy game-over omits its duration', async () => {
    const { town, deps } = setup(); await town.depart();
    await vi.advanceTimersByTimeAsync(5000); await town.returnToTown(100);
    expect(deps.complete.mock.calls[0]?.[1].durationMs).toBe(5000);
  });

  it('aborts a pending start on navigation/owner change and forgets any late-created context without a scene or UI update', async () => {
    const { town, deps } = setup(); const pending = deferred<GameSessionStart>();
    deps.start.mockReturnValue(pending.promise);
    const departure = town.depart();
    const signal = deps.start.mock.calls[0]![0];
    town.dispose(); const changes = deps.onState.mock.calls.length;
    expect(signal.aborted).toBe(true);
    pending.resolve(session()); await departure;
    expect(deps.abandon).toHaveBeenCalledWith('session-one');
    expect(deps.beginExpedition).not.toHaveBeenCalled();
    expect(deps.onState).toHaveBeenCalledTimes(changes);
  });

  it('clears the minimum timer and never submits after navigation/owner change', async () => {
    const { town, deps } = setup(session(10_000)); await town.depart();
    await vi.advanceTimersByTimeAsync(2000);
    const returned = town.returnToTown(100, 2000);
    town.dispose(); const changes = deps.onState.mock.calls.length;
    await returned; await vi.advanceTimersByTimeAsync(100_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(deps.sign).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.onState).toHaveBeenCalledTimes(changes);
  });

  it('does not post completion after a stale signature resolves', async () => {
    const { town, deps } = setup(); const pending = deferred<string>(); deps.sign.mockReturnValue(pending.promise);
    await town.depart(); await vi.advanceTimersByTimeAsync(2000);
    const returned = town.returnToTown(100, 2000);
    town.dispose(); const changes = deps.onState.mock.calls.length;
    pending.resolve('late-signature'); await returned;
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.onSettled).not.toHaveBeenCalled();
    expect(deps.onState).toHaveBeenCalledTimes(changes);
  });

  it.each(['resolve', 'reject'] as const)('suppresses all result/UI callbacks when a completion %ss after disposal', async (outcome) => {
    const { town, deps } = setup(); const pending = deferred<typeof receipt>(); deps.complete.mockReturnValue(pending.promise);
    await town.depart(); await vi.advanceTimersByTimeAsync(2000);
    const returned = town.returnToTown(100, 2000); await flush();
    town.dispose(); const changes = deps.onState.mock.calls.length;
    if (outcome === 'resolve') pending.resolve(receipt); else pending.reject(new Error('late error'));
    await returned;
    expect(deps.onSettled).not.toHaveBeenCalled();
    expect(deps.onState).toHaveBeenCalledTimes(changes);
    expect(deps.abandon).toHaveBeenCalledOnce();
  });

  it('invalidates an old settlement refresh on the next departure or page disposal', async () => {
    const { town, deps } = setup(); await town.depart();
    await vi.advanceTimersByTimeAsync(2000); await town.returnToTown(100, 2000);
    const current = deps.onSettled.mock.calls[0]![1] as () => boolean;
    expect(current()).toBe(true); await town.depart(); expect(current()).toBe(false);
    await vi.advanceTimersByTimeAsync(2000); await town.returnToTown(100, 2000);
    const latest = deps.onSettled.mock.calls[1]![1] as () => boolean;
    expect(latest()).toBe(true); town.dispose(); expect(latest()).toBe(false);
  });
});
