// Actual Wrapper/ARPG pages and SDK; all network, auth, presentation and engine effects are local fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { BootOptions } from '../../../src/lib/games/arpg/main';
const h = vi.hoisted(() => ({
  callbacks: new Set<(event: string, session: any) => void>(), owner: 'owner-a' as string | null,
  fullscreen: null as Promise<void> | null, fullscreenSignals: [] as AbortSignal[], boot: vi.fn(), shutdown: vi.fn(), goto: vi.fn(),
  event: vi.fn(async () => null), landscape: vi.fn(async () => {}), begin: vi.fn(), townStatus: vi.fn()
}));
vi.mock('$app/environment', () => ({ browser: true, dev: false }));
vi.mock('$app/navigation', () => ({ goto: h.goto }));
vi.mock('$app/stores', () => ({ page: { subscribe: (run: any) => { run({ data: { user: { id: 'owner-a' } } }); return () => {}; } } }));
vi.mock('$lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ auth: {
  onAuthStateChange: (callback: any) => {
    h.callbacks.add(callback);
    void Promise.resolve().then(() => callback('INITIAL_SESSION', h.owner ? { user: { id: h.owner } } : null));
    return { data: { subscription: { unsubscribe: () => h.callbacks.delete(callback) } } };
  }
} }) }));
vi.mock('$lib/games/arpg/main', () => ({ bootGame: h.boot, shutdownGame: h.shutdown }));
vi.mock('$lib/games/fullscreen', () => ({
  enterFullscreen: (_target: HTMLElement, options: { signal: AbortSignal }) => {
    h.fullscreenSignals.push(options.signal);
    return h.fullscreen ?? Promise.resolve();
  }, requestLandscape: h.landscape,
  ensureFallbackLayout: vi.fn(), isFullscreen: () => false
}));
vi.mock('$lib/games/audio', () => ({ playSound: vi.fn(), stopSound: vi.fn(), isAudioEnabled: () => false,
  toggleAudioEnabled: () => false, setAudioEnabled: vi.fn(), setMasterVolume: vi.fn() }));
vi.mock('$lib/progression/listeners', () => ({}));
vi.mock('$lib/games/state', () => ({ applyPlayerState: vi.fn(), recordRewardResult: vi.fn(), getPlayerProgressSnapshot: () => ({}) }));
vi.mock('$lib/stores/companions', () => ({ getActiveCompanionSnapshot: () => null }));
vi.mock('$lib/stores/companionRituals', () => ({ applyRitualUpdate: vi.fn() }));
vi.mock('$lib/utils/analytics', () => ({ sendAnalytics: vi.fn() }));
vi.mock('$lib/client/events/sendEvent', () => ({ sendEvent: h.event }));
vi.mock('$lib/achievements/store', () => ({ achievementsUI: { focusAchievement: vi.fn(), open: vi.fn() } }));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const payload = (sessionId: string) => ({ sessionId, nonce: `nonce-${sessionId}`, serverTime: 1000,
  caps: { minDurationMs: 1000, maxDurationMs: 60000, maxScore: 10000, maxScorePerMin: 10000, minClientVer: '1.0.0' } });
let component: ReturnType<typeof mount> | null = null;
let calls: Array<{ url: string; init?: RequestInit }>;
let fetchMock: ReturnType<typeof vi.fn>;
let serial = 0;
let forbidden: string[];
const sync = async () => { await vi.advanceTimersByTimeAsync(0); flushSync(); };
const starts = () => calls.filter(call => call.url === '/api/games/session/start');
const button = (label: string) => [...document.querySelectorAll('button')].find(item => item.textContent?.includes(label));
const click = (label: string) => { const target = button(label); expect(target, label).toBeTruthy(); target!.click(); };
const emitOwner = (owner: string | null) => {
  h.owner = owner; [...h.callbacks].forEach(callback => callback(owner ? 'SIGNED_IN' : 'SIGNED_OUT', owner ? { user: { id: owner } } : null));
};
const hangStart = () => {
  const late = deferred<Response>();
  fetchMock.mockImplementationOnce((url: string, init?: RequestInit) => { calls.push({ url, init }); return late.promise; });
  return late;
};
const hangBoot = () => {
  const late = deferred<void>();
  h.boot.mockImplementationOnce((_target, options) => new Promise<void>((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    late.promise.then(() => {
      options.onControls?.({ beginExpedition: h.begin, setTownStatus: h.townStatus });
      resolve();
    }, reject);
  }));
  return late;
};

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); document.body.innerHTML = '';
  h.callbacks.clear(); h.owner = 'owner-a'; h.fullscreen = null; h.fullscreenSignals = []; calls = []; forbidden = [];
  h.begin.mockReset(); h.townStatus.mockReset();
  h.boot.mockReset().mockImplementation(async (_target, options: BootOptions) => {
    options.onControls?.({ beginExpedition: h.begin, setTownStatus: h.townStatus });
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === '/api/games/session/start') return Response.json(payload(`legacy-${++serial}`));
    if (url.startsWith('/api/leaderboard/')) return Response.json({ rows: [], meta: { page: 1, limit: 25, total: 0 } });
    forbidden.push(url);
    throw new Error(`Forbidden request in local legacy start harness: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  if (component) await unmount(component); component = null;
  await sync();
  expect(h.callbacks.size).toBe(0); expect(vi.getTimerCount()).toBe(0); expect(forbidden).toEqual([]);
  vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks();
});

// The inherited Wrapper matrix is unchanged; ARPG now has a separate town lifecycle.
{
  const loaded = vi.fn();
  const open = async () => {
    const { default: Wrapper } = await import('../../../src/lib/components/games/GameWrapper.svelte');
    component = mount(Wrapper, { target: document.body, props: { gameId: 'custom', onLoaded: loaded } });
    flushSync(); await sync(); click('Tap to Begin'); await sync();
  };
  beforeEach(() => loaded.mockReset());
  describe('actual wrapper start lifecycle', () => {
    it('coalesces repeated clicks and shows explicit new-run recovery after a hung request', async () => {
      const late = hangStart(); await open();
      click('Preparing'); click('Preparing');
      await sync(); expect(starts()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(30_000); flushSync();
      expect(document.body.textContent).toContain('A session may already exist.');
      expect(button('Start new run')?.disabled).toBe(false);
      expect(starts()).toHaveLength(1);
      click('Start new run'); await sync();
      expect(starts()).toHaveLength(2);
      late.resolve(Response.json(payload('old'))); await sync();
      expect(loaded.mock.calls.length).toBe(1);
      expect(button('Tap to Begin')).toBeUndefined();
    });

    it('unmount cancels a pending start without later loading or booting', async () => {
      const late = hangStart(); await open();
      const signal = starts()[0].init!.signal!;
      await unmount(component!); component = null; expect(signal.aborted).toBe(true);
      late.resolve(Response.json(payload('late-unmount'))); await sync();
      expect(loaded).not.toHaveBeenCalled(); expect(h.boot).not.toHaveBeenCalled();
    });

    it.each(['owner-b', null])('invalidates an in-flight start for owner %s and offers the correct account action', async (owner) => {
      const late = hangStart(); await open(); emitOwner(owner); await sync();
      expect(starts()[0].init!.signal!.aborted).toBe(true);
      expect(button(owner ? 'Refresh page' : 'Sign in')?.disabled).toBe(false);
      late.resolve(Response.json(payload('old-owner'))); await sync();
      expect(loaded).not.toHaveBeenCalled(); expect(h.boot).not.toHaveBeenCalled();
      expect(starts()).toHaveLength(1);
      if (!owner) { click('Sign in'); expect(h.goto).toHaveBeenCalledWith('/app/auth'); }
    });

    it('fails closed when initial Auth differs from the rendered account', async () => {
      h.owner = 'owner-b'; await open();
      expect(starts()).toHaveLength(0); expect(button('Refresh page')).toBeTruthy();
      expect(loaded).not.toHaveBeenCalled(); expect(h.boot).not.toHaveBeenCalled();
    });

    it('cleans an accepted session when loading fails and permits an explicit new run', async () => {
      loaded.mockRejectedValueOnce(new Error('loader failed'));
      await open(); expect(button('Start new run')?.disabled).toBe(false);
      const { completeSession } = await import('../../../src/lib/games/sdk');
      expect(await completeSession(`legacy-${serial}`, { score: 1, durationMs: 1000 })).toBeNull();
      click('Start new run'); await sync(); expect(starts()).toHaveLength(2);
      expect(loaded.mock.calls.length).toBe(2);
    });

    it('bounds the accepted-session load and ignores its late resolution after a new run', async () => {
      const late = deferred<void>();
      loaded.mockReturnValueOnce(late.promise);
      await open(); expect(starts()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(30_000); flushSync();
      expect(button('Start new run')?.disabled).toBe(false);
      expect(document.body.textContent).toContain('may already count toward your daily limit');
      const { completeSession } = await import('../../../src/lib/games/sdk');
      expect(await completeSession(`legacy-${serial}`, { score: 1, durationMs: 1000 })).toBeNull();
      click('Start new run'); await sync(); expect(starts()).toHaveLength(2);
      late.resolve(); await sync();
      expect(button('Tap to Begin')).toBeUndefined();
    });

    it('aborts load/boot on account change before a late continuation', async () => {
      const late = deferred<void>();
      loaded.mockReturnValueOnce(late.promise);
      await open();
      const signal = loaded.mock.calls[0][0].signal;
      emitOwner('owner-b'); await sync(); expect(signal.aborted).toBe(true);
      late.resolve(); await sync(); expect(button('Refresh page')).toBeTruthy();
      expect(starts()).toHaveLength(1);
    });
  });
}

describe('actual arpg town departure lifecycle', () => {
  const options = () => h.boot.mock.calls.at(-1)![1] as BootOptions;
  const open = async () => {
    const { default: Arpg } = await import('../../../src/routes/app/(game)/games/arpg/+page.svelte');
    component = mount(Arpg, { target: document.body, props: { data: { slug: 'arpg' } } });
    flushSync(); await sync();
    expect(starts()).toHaveLength(0);
    expect(h.begin).not.toHaveBeenCalled();
  };
  const depart = async () => { click('Depart on expedition'); await sync(); };

  it('coalesces repeated departure requests and recovers uncertain starts only after another explicit departure', async () => {
    await open(); const late = hangStart(); await depart();
    click('Starting'); click('Starting'); options().onDepartureRequested?.();
    await sync(); expect(starts()).toHaveLength(1); expect(h.begin).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000); flushSync();
    expect(document.body.textContent).toContain('A session may already exist.');
    expect(button('Depart on expedition')?.disabled).toBe(false);
    expect(starts()).toHaveLength(1);
    await depart(); expect(starts()).toHaveLength(2);
    late.resolve(Response.json(payload('old'))); await sync();
    expect(h.boot).toHaveBeenCalledOnce(); expect(h.begin).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('Expedition in progress');
  });

  it('unmount cancels a pending departure without entering the dungeon after a late start', async () => {
    await open(); const late = hangStart(); await depart();
    const signal = starts()[0].init!.signal!;
    await unmount(component!); component = null; expect(signal.aborted).toBe(true);
    late.resolve(Response.json(payload('late-unmount'))); await sync();
    expect(h.begin).not.toHaveBeenCalled(); expect(h.boot).toHaveBeenCalledOnce();
    expect(options().signal?.aborted).toBe(true); expect(h.shutdown).toHaveBeenCalled();
  });

  it.each(['owner-b', null])('invalidates an in-flight departure for owner %s and offers the correct account action', async (owner) => {
    await open(); const late = hangStart(); await depart(); emitOwner(owner); await sync();
    expect(starts()[0].init!.signal!.aborted).toBe(true);
    expect(options().signal?.aborted).toBe(true); expect(h.shutdown).toHaveBeenCalled();
    expect(button(owner ? 'Refresh page' : 'Sign in')?.disabled).toBe(false);
    late.resolve(Response.json(payload('old-owner'))); options().onDepartureRequested?.(); await sync();
    expect(h.begin).not.toHaveBeenCalled(); expect(h.boot).toHaveBeenCalledOnce();
    expect(starts()).toHaveLength(1);
    if (!owner) { click('Sign in'); expect(h.goto).toHaveBeenCalledWith('/app/auth'); }
  });

  it('fails closed before boot or departure when initial Auth differs from the rendered account', async () => {
    h.owner = 'owner-b'; await open();
    expect(button('Refresh page')).toBeTruthy(); expect(h.boot).not.toHaveBeenCalled();
  });

  it('cleans an accepted session and requires refresh instead of another departure when scene entry throws', async () => {
    h.begin.mockImplementationOnce(() => { throw new Error('entry failed'); });
    await open(); const old = options(); await depart();
    expect(button('Depart on expedition')).toBeUndefined();
    expect(button('Refresh page')?.disabled).toBe(false);
    expect(h.shutdown).toHaveBeenCalled();
    expect(document.body.textContent).toContain('A session was already created');
    expect(document.body.textContent).toContain('it was not cancelled');
    const { completeSession } = await import('../../../src/lib/games/sdk');
    expect(await completeSession(`legacy-${serial}`, { score: 1, durationMs: 1000 })).toBeNull();
    old.onDepartureRequested?.(); old.onRetryRequested?.(); old.onGameOver(400, 2000); await sync();
    expect(starts()).toHaveLength(1);
    expect(h.begin).toHaveBeenCalledOnce(); expect(h.boot).toHaveBeenCalledOnce();
    expect(button('Refresh page')?.disabled).toBe(false);
  });

  it('bounds town loading without consuming a session and ignores stale controls after an explicit reload', async () => {
    const late = hangBoot(); await open(); const old = options();
    await vi.advanceTimersByTimeAsync(30_000); flushSync();
    expect(old.signal?.aborted).toBe(true);
    expect(button('Retry loading town')?.disabled).toBe(false);
    expect(document.body.textContent).toContain('No expedition session was started');
    expect(starts()).toHaveLength(0);
    click('Retry loading town'); await sync();
    late.resolve(); await sync(); old.onDepartureRequested?.(); await sync();
    expect(starts()).toHaveLength(0); expect(h.boot).toHaveBeenCalledTimes(2);
    await depart(); expect(starts()).toHaveLength(1); expect(h.begin).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('Expedition in progress');
  });

  it('aborts town boot on account change before a late continuation can request departure', async () => {
    const late = hangBoot(); await open(); const old = options();
    emitOwner('owner-b'); await sync(); expect(old.signal?.aborted).toBe(true);
    late.resolve(); await sync(); old.onDepartureRequested?.(); await sync();
    expect(button('Refresh page')).toBeTruthy(); expect(starts()).toHaveLength(0);
    expect(h.begin).not.toHaveBeenCalled(); expect(h.shutdown).toHaveBeenCalled();
  });
});

describe('Wrapper optional fullscreen preflight', () => {
  it('does not let a stalled fullscreen request strand a confirmed start', async () => {
    const fullscreen = deferred<void>(); h.fullscreen = fullscreen.promise;
    const loaded = vi.fn();
    const { default: Wrapper } = await import('../../../src/lib/components/games/GameWrapper.svelte');
    component = mount(Wrapper, { target: document.body, props: { gameId: 'custom', onLoaded: loaded } });
    flushSync(); await sync(); click('Tap to Begin'); await sync();
    expect(starts()).toHaveLength(1); expect(loaded).toHaveBeenCalledTimes(1);
    await unmount(component); component = null;
    expect(h.fullscreenSignals[0]?.aborted).toBe(true);
    fullscreen.resolve(); await sync(); expect(h.landscape).not.toHaveBeenCalled();
  });
});
