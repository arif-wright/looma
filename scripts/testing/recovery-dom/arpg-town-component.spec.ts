// Actual route + coordinator + SDK. Synthetic Auth/transport/scene/presentation;
// this is lifecycle evidence, not Phaser browser rendering or hosted settlement.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { BootOptions } from '../../../src/lib/games/arpg/main';
const h = vi.hoisted(() => ({
  callbacks: new Set<(event: string, session: unknown) => void>(), owner: 'owner-a' as string | null,
  boot: vi.fn(), shutdown: vi.fn(), begin: vi.fn(), townStatus: vi.fn(), goto: vi.fn(),
  event: vi.fn(async () => null), reward: vi.fn(), player: vi.fn(), rituals: vi.fn()
}));
vi.mock('$app/environment', () => ({ browser: true, dev: false }));
vi.mock('$app/navigation', () => ({ goto: h.goto }));
vi.mock('$app/stores', () => ({ page: { subscribe: (run: (value: unknown) => void) => { run({ data: { user: { id: 'owner-a' } } }); return () => {}; } } }));
vi.mock('$lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ auth: {
  onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
    h.callbacks.add(callback);
    void Promise.resolve().then(() => {
      if (h.callbacks.has(callback)) callback('INITIAL_SESSION', h.owner ? { user: { id: h.owner } } : null);
    });
    return { data: { subscription: { unsubscribe: () => h.callbacks.delete(callback) } } };
  }
} }) }));
vi.mock('$lib/games/arpg/main', () => ({ bootGame: h.boot, shutdownGame: h.shutdown }));
vi.mock('$lib/games/state', () => ({ applyPlayerState: h.player, recordRewardResult: h.reward, getPlayerProgressSnapshot: () => ({}) }));
vi.mock('$lib/stores/companions', () => ({ getActiveCompanionSnapshot: () => null }));
vi.mock('$lib/stores/companionRituals', () => ({ applyRitualUpdate: h.rituals }));
vi.mock('$lib/utils/analytics', () => ({ sendAnalytics: vi.fn() }));
vi.mock('$lib/client/events/sendEvent', () => ({ sendEvent: h.event }));
vi.mock('$lib/achievements/store', () => ({ achievementsUI: { focusAchievement: vi.fn(), open: vi.fn() } }));

const START = '/api/games/session/start';
const SIGN = '/api/games/sign';
const COMPLETE = '/api/games/session/complete';
const PLAYER = '/api/games/player/state';
const LEADERBOARD = '/api/leaderboard/arpg/alltime?page=1&limit=25';
const deferred = <T>() => {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let minDurationMs: number;
let maxDurationMs: number;
let serial = 0;
const payload = (sessionId: string) => ({ sessionId, nonce: `nonce-${sessionId}`, serverTime: 1000,
  caps: { minDurationMs, maxDurationMs, maxScore: 150000, maxScorePerMin: 9000, minClientVer: '1.0.0' } });
type Call = { url: string; init?: RequestInit; body: Record<string, unknown> | null };
let calls: Call[];
let handler: (call: Call) => Promise<Response> | null;
let component: ReturnType<typeof mount> | null = null;
const sync = async () => { await vi.advanceTimersByTimeAsync(0); flushSync(); };
const requests = (url: string) => calls.filter(call => call.url === url);
const button = (label: string) => [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === label);
const click = (label: string) => { const target = button(label); expect(target, label).toBeTruthy(); target!.click(); };
const options = () => h.boot.mock.calls.at(-1)![1] as BootOptions;
const emitOwner = (owner: string | null) => {
  h.owner = owner;
  [...h.callbacks].forEach(callback => callback(owner ? 'SIGNED_IN' : 'SIGNED_OUT', owner ? { user: { id: owner } } : null));
};
const open = async () => {
  const { default: Arpg } = await import('../../../src/routes/app/(game)/games/arpg/+page.svelte');
  component = mount(Arpg, { target: document.body, props: { data: { slug: 'arpg' } } });
  flushSync(); await sync();
};
const depart = async () => { click('Depart on expedition'); await sync(); };
const finish = async (score = 400, elapsed = 2000) => {
  await vi.advanceTimersByTimeAsync(elapsed);
  options().onGameOver(score, elapsed); await sync();
};
const hold = (url: string) => {
  const late = deferred<Response>();
  let held = false;
  handler = (call) => {
    if (call.url !== url || held) return null;
    held = true; return late.promise;
  };
  return late;
};
const leaderboard = (name: string) => Response.json({ rows: [{ name }], meta: { page: 1, limit: 25, total: 1 } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  vi.clearAllMocks(); document.body.innerHTML = ''; window.sessionStorage.clear(); calls = [];
  h.callbacks.clear(); h.owner = 'owner-a'; minDurationMs = 1000; maxDurationMs = 600_000;
  handler = () => null;
  h.goto.mockReset().mockResolvedValue(undefined);
  h.boot.mockReset().mockImplementation(async (_target, opts: BootOptions) => {
    opts.onControls?.({ beginExpedition: h.begin, setTownStatus: h.townStatus });
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url, init, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null };
    calls.push(call);
    const handled = handler(call); if (handled) return handled;
    if (url === START) return Response.json(payload(`town-${++serial}`));
    if (url === SIGN) return Response.json({ signature: 'synthetic-signature' });
    if (url === COMPLETE) return Response.json({ settlementVersion: 1, sessionId: call.body!.sessionId,
      xpDelta: 37, currencyDelta: 4, achievements: [], rituals: { list: [], completed: [] } });
    if (url === PLAYER) return Response.json({ xp: 999, currency: 999 });
    if (url.startsWith('/api/leaderboard/')) return leaderboard('initial');
    throw new Error(`Forbidden request in local town harness: ${url}`);
  }));
});
afterEach(async () => {
  if (component) await unmount(component); component = null;
  await sync();
  expect(h.callbacks.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe('actual ARPG town route and SDK lifecycle', () => {
  it('boots town before any session and remains untimed while idle', async () => {
    await open(); expect(h.boot).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('Town is untimed');
    await vi.advanceTimersByTimeAsync(12 * 60 * 60_000); flushSync();
    expect(requests(START)).toHaveLength(0); expect(requests(SIGN)).toHaveLength(0);
    expect(h.begin).not.toHaveBeenCalled(); expect(button('Depart on expedition')?.disabled).toBe(false);
    await depart(); expect(requests(START)).toHaveLength(1); expect(h.begin).toHaveBeenCalledWith(90_000);
  });

  it('boot timeout permits a fresh town load without creating or consuming a session', async () => {
    const late = deferred<void>(); let oldOptions!: BootOptions;
    h.boot.mockImplementationOnce((_target, opts: BootOptions) => {
      oldOptions = opts;
      return new Promise<void>((resolve, reject) => {
        opts.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
        late.promise.then(() => { opts.onControls?.({ beginExpedition: h.begin, setTownStatus: h.townStatus }); resolve(); }, reject);
      });
    });
    await open(); await vi.advanceTimersByTimeAsync(30_000); flushSync();
    expect(requests(START)).toHaveLength(0); expect(oldOptions.signal?.aborted).toBe(true);
    expect(document.body.textContent).toContain('No expedition session was started');
    click('Retry loading town'); await sync();
    late.resolve(); await sync(); oldOptions.onDepartureRequested?.(); await sync();
    expect(h.boot).toHaveBeenCalledTimes(2); expect(requests(START)).toHaveLength(0);
    expect(button('Depart on expedition')?.disabled).toBe(false);
  });

  it('coalesces button/gate repeats into one departure and starts the scene only after the response', async () => {
    await open(); const late = hold(START);
    const target = button('Depart on expedition')!;
    for (let i = 0; i < 3; i++) target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    options().onDepartureRequested?.(); await sync();
    expect(requests(START)).toHaveLength(1); expect(h.begin).not.toHaveBeenCalled();
    late.resolve(Response.json(payload('single-departure'))); await sync();
    expect(h.begin.mock.calls).toEqual([[90_000]]); expect(h.boot).toHaveBeenCalledOnce();
  });

  it('preserves an uncertain-start warning and allows only an explicit fresh departure', async () => {
    await open(); const late = hold(START); await depart();
    await vi.advanceTimersByTimeAsync(30_000); flushSync();
    expect(document.body.textContent).toContain('A session may already exist');
    expect(document.body.textContent).toContain('may count toward your daily limit');
    await vi.advanceTimersByTimeAsync(120_000); expect(requests(START)).toHaveLength(1);
    await depart(); expect(requests(START)).toHaveLength(2);
    late.resolve(Response.json(payload('late-start'))); await sync();
    expect(h.begin).toHaveBeenCalledOnce(); expect(h.boot).toHaveBeenCalledOnce();
  });

  it('blocks incompatible caps after start and does not enter the dungeon', async () => {
    minDurationMs = 90_001; await open(); await depart();
    expect(h.begin).not.toHaveBeenCalled(); expect(requests(START)).toHaveLength(1);
    expect(document.body.textContent).toContain('it was not cancelled');
    expect(button('Refresh page')?.disabled).toBe(false);
    options().onDepartureRequested?.(); await sync(); expect(requests(START)).toHaveLength(1);
  });

  it('saves two expeditions in the same town without rebooting and records one reward per receipt', async () => {
    await open(); await depart(); await finish();
    expect(h.reward).toHaveBeenCalledOnce(); expect(h.player).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem('looma_session_games_played')).toBe('1');
    expect(document.body.textContent).toContain('+37 XP');
    expect(h.townStatus).toHaveBeenLastCalledWith('ready', 'Town is untimed. Depart when ready.');
    await depart(); await finish(800, 3000);
    expect(h.boot).toHaveBeenCalledOnce(); expect(h.begin).toHaveBeenCalledTimes(2);
    expect(h.reward).toHaveBeenCalledTimes(2); expect(requests(COMPLETE)).toHaveLength(2);
    expect(window.sessionStorage.getItem('looma_session_games_played')).toBe('2');
    expect(requests(COMPLETE)[0]!.body!.sessionId).not.toBe(requests(COMPLETE)[1]!.body!.sessionId);
    expect(h.event.mock.calls.filter(call => call[0] === 'game.complete')).toHaveLength(0);
  });

  it('keeps a confirmed save successful when optional session-summary storage fails', async () => {
    await open(); await depart();
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
    await finish();
    expect(h.reward).toHaveBeenCalledOnce();
    expect(button('Depart on expedition')?.disabled).toBe(false);
    expect(button('Retry save')).toBeUndefined();
    expect(debug).toHaveBeenCalledOnce();
  });

  it('holds a short return transparently until the minimum with frozen gameplay time and no new departure', async () => {
    minDurationMs = 10_000; await open(); await depart(); await finish(400, 2000);
    expect(document.body.textContent).toContain('Your result is fixed');
    expect(button('Waiting to save…')?.disabled).toBe(true); expect(requests(SIGN)).toHaveLength(0);
    options().onDepartureRequested?.(); options().onGameOver(9999, 9999); await sync();
    expect(requests(START)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(7999); expect(requests(SIGN)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1); flushSync();
    expect(requests(COMPLETE)[0]!.body).toMatchObject({ score: 400, durationMs: 10_000,
      stats: { mode: 'standard', expeditionDurationMs: 2000 } });
  });

  it('retries the same immutable completion after uncertainty and blocks fresh departures', async () => {
    await open(); await depart();
    let failures = 0;
    handler = (call) => call.url === COMPLETE && failures++ === 0 ? Promise.reject(new TypeError('offline')) : null;
    await finish();
    expect(button('Retry save')?.disabled).toBe(false); expect(h.reward).not.toHaveBeenCalled();
    const first = requests(COMPLETE)[0]!.body;
    options().onDepartureRequested?.(); await vi.advanceTimersByTimeAsync(120_000);
    expect(requests(START)).toHaveLength(1);
    options().onRetryRequested?.(); options().onRetryRequested?.(); await sync();
    expect(requests(COMPLETE)).toHaveLength(2); expect(requests(COMPLETE)[1]!.body).toEqual(first);
    expect(h.reward).toHaveBeenCalledOnce(); expect(button('Depart on expedition')?.disabled).toBe(false);
    expect(window.sessionStorage.getItem('looma_session_games_played')).toBe('1');
  });

  it.each([SIGN, COMPLETE])('bounds a stalled %s and ignores its late response after an identical retry', async (url) => {
    await open(); await depart(); const late = hold(url); await finish();
    await vi.advanceTimersByTimeAsync(30_000); flushSync();
    expect(button('Retry save')?.disabled).toBe(false);
    const first = requests(url)[0]!.body;
    click('Retry save'); await sync(); expect(requests(url)[1]!.body).toEqual(first);
    const result = url === SIGN ? { signature: 'late-signature' } : { xpDelta: 9999, currencyDelta: 9999 };
    late.resolve(Response.json(result)); await sync();
    expect(h.reward).toHaveBeenCalledOnce(); expect(document.body.textContent).toContain('+37 XP');
    expect(document.body.textContent).not.toContain('9999 XP');
  });

  it('does not make a score-rate rejection look retryable or pad time', async () => {
    await open(); await depart();
    handler = (call) => call.url === SIGN ? Promise.resolve(Response.json({ code: 'invalid_score_rate' }, { status: 400 })) : null;
    await finish(5600, 2000);
    expect(button('Result rejected')?.disabled).toBe(true);
    expect(document.body.textContent).toContain('waiting in town cannot make this result valid');
    await vi.advanceTimersByTimeAsync(120_000); options().onRetryRequested?.(); options().onDepartureRequested?.(); await sync();
    expect(requests(START)).toHaveLength(1); expect(requests(SIGN)).toHaveLength(1);
    expect(requests(SIGN)[0]!.body!.durationMs).toBe(2000);
  });

  it.each(['owner-b', null])('stops an active expedition immediately when the owner becomes %s', async (owner) => {
    await open(); await depart(); emitOwner(owner); await sync();
    expect(options().signal?.aborted).toBe(true); expect(h.shutdown).toHaveBeenCalled();
    expect(button(owner ? 'Refresh page' : 'Sign in')?.disabled).toBe(false);
    options().onGameOver(9000, 90_000); options().onDepartureRequested?.(); await sync();
    expect(requests(SIGN)).toHaveLength(0); expect(requests(START)).toHaveLength(1);
    if (!owner) { click('Sign in'); expect(h.goto).toHaveBeenCalledWith('/app/auth'); }
  });

  it.each([SIGN, COMPLETE, PLAYER])('suppresses stale %s continuation after an owner change', async (url) => {
    await open(); await depart(); const late = hold(url); await finish();
    emitOwner('owner-b'); await sync();
    const rewards = h.reward.mock.calls.length, rituals = h.rituals.mock.calls.length;
    late.resolve(Response.json(url === SIGN ? { signature: 'old-owner' }
      : url === PLAYER ? { xp: 9999 } : { xpDelta: 9999, currencyDelta: 9999 }));
    await sync();
    expect(h.player).not.toHaveBeenCalled(); expect(h.reward).toHaveBeenCalledTimes(rewards);
    expect(h.rituals).toHaveBeenCalledTimes(rituals);
    expect(document.body.textContent).not.toContain('+37 XP');
    expect(document.body.textContent).not.toContain('9999 XP');
    if (url === SIGN) expect(requests(COMPLETE)).toHaveLength(0);
  });

  it.each([START, SIGN, COMPLETE, PLAYER])('suppresses a late %s after navigation unmounts the route', async (url) => {
    await open(); const late = hold(url); await depart();
    if (url !== START) await finish();
    await unmount(component!); component = null; await sync();
    const rewards = h.reward.mock.calls.length;
    late.resolve(Response.json(url === START ? payload('late-unmounted') : url === SIGN ? { signature: 'late' }
      : url === PLAYER ? { xp: 9999 } : { xpDelta: 9999, currencyDelta: 9999 }));
    await sync();
    expect(h.reward).toHaveBeenCalledTimes(rewards); expect(h.player).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Result saved');
    if (url === START || url === SIGN) expect(requests(COMPLETE)).toHaveLength(0);
  });

  it('cancels the pending minimum wait on unmount without a later signing attempt', async () => {
    minDurationMs = 10_000; await open(); await depart(); await finish(100, 2000);
    await unmount(component!); component = null;
    await vi.advanceTimersByTimeAsync(120_000); expect(requests(SIGN)).toHaveLength(0);
  });

  it('fails closed before boot if the first owner differs from the rendered page', async () => {
    h.owner = 'owner-b'; await open();
    expect(h.boot).not.toHaveBeenCalled(); expect(requests(START)).toHaveLength(0);
    expect(button('Refresh page')).toBeTruthy();
  });

  it('keeps the active route usable if Back navigation fails', async () => {
    await open(); h.goto.mockRejectedValueOnce(new Error('navigation cancelled'));
    click('← Back to hub'); await sync();
    expect(h.shutdown).not.toHaveBeenCalled(); expect(options().signal?.aborted).toBe(false);
    expect(document.body.textContent).toContain('Unable to return to the hub');
    await depart(); expect(requests(START)).toHaveLength(1);
  });

  it('ignores an older leaderboard response after a newer result refresh', async () => {
    const late = hold(LEADERBOARD); await open(); await depart(); await finish();
    expect(requests(LEADERBOARD)).toHaveLength(2);
    late.resolve(leaderboard('stale')); await sync();
    expect(document.querySelector('[data-testid="town-test-leaderboard"]')?.textContent).toContain('initial');
    expect(document.querySelector('[data-testid="town-test-leaderboard"]')?.textContent).not.toContain('stale');
  });

  it('ignores a late leaderboard response after an owner change', async () => {
    const late = hold(LEADERBOARD); await open(); emitOwner('owner-b'); await sync();
    late.resolve(leaderboard('foreign-stale')); await sync();
    expect(document.querySelector('[data-testid="town-test-leaderboard"]')?.textContent).not.toContain('foreign-stale');
  });
});
