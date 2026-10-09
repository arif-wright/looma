// Real maintained game shells + real SDK. All auth/transport/engines are local fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const h = vi.hoisted(() => ({
  engineOptions: null as any, engine: null as any,
  createGame: vi.fn((options: any) => {
    h.engineOptions = options;
    h.engine = { start: vi.fn(), destroy: vi.fn(), pause: vi.fn(), resume: vi.fn(),
      playerJump: vi.fn(), activateSlowMo: vi.fn(), getState: vi.fn() };
    return h.engine;
  }),
  callbacks: new Set<(event: string, session: any) => void>(), owner: 'owner-a' as string | null,
  initialAuth: true, authUnavailable: false, preload: null as Promise<any> | null, rituals: vi.fn(), applyPlayerState: vi.fn(), goto: vi.fn(), event: vi.fn(async () => null)
}));
vi.mock('$app/stores', () => ({ page: { subscribe: (run: any) => { run({ data: { user: { id: 'owner-a' } } }); return () => {}; } } }));
vi.mock('$lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ auth: {
  onAuthStateChange: (callback: any) => {
    if (h.authUnavailable) throw new Error('Synthetic unavailable Auth');
    h.callbacks.add(callback);
    if (h.initialAuth) void Promise.resolve().then(() => callback('INITIAL_SESSION', h.owner ? { user: { id: h.owner } } : null));
    return { data: { subscription: { unsubscribe: () => h.callbacks.delete(callback) } } };
  }
} }) }));
vi.mock('$app/navigation', () => ({ goto: h.goto }));
vi.mock('$lib/games/endlessRunner', () => ({ createEndlessRunner: h.createGame }));
vi.mock('$lib/games/audio', () => ({ playSound: vi.fn(), stopSound: vi.fn(), isAudioEnabled: () => false, toggleAudioEnabled: () => false }));
vi.mock('$lib/games/runnerLanternwaySkin', () => ({
  loadRunnerLanternwaySkin: () => h.preload ?? Promise.resolve({ assets: {}, complete: false }), RUNNER_LANTERNWAY_URLS: {}
}));
vi.mock('$lib/games/orbfieldSkin', () => ({
  loadOrbfieldSkin: () => h.preload ?? Promise.resolve({ assets: {}, complete: false }), ORBFIELD_SKIN_URLS: {}
}));
vi.mock('$lib/stores/companionRituals', () => ({ applyRitualUpdate: h.rituals }));
vi.mock('$lib/games/state', () => ({ applyPlayerState: h.applyPlayerState, getPlayerProgressSnapshot: () => ({}) }));
vi.mock('$lib/stores/companions', () => ({ getActiveCompanionSnapshot: () => null }));
vi.mock('$lib/stores/companionReactions', () => ({ pushCompanionReaction: vi.fn() }));
vi.mock('$lib/utils/analytics', () => ({ sendAnalytics: vi.fn() }));
vi.mock('$lib/client/events/sendEvent', () => ({ sendEvent: h.event }));

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const startPayload = (sessionId: string) => ({ sessionId, nonce: `nonce-${sessionId}`, serverTime: 1000,
  caps: { minDurationMs: 1000, maxDurationMs: 60000, maxScore: 10000, maxScorePerMin: 10000, minClientVer: '1.0.0' } });
let component: ReturnType<typeof mount> | null = null;
let calls: Array<{ url: string; init?: RequestInit }>;
let fetchMock: ReturnType<typeof vi.fn>;
let serial = 0;
const sync = async () => { await vi.advanceTimersByTimeAsync(0); flushSync(); };
const click = (text: string) => {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  expect(button, `button ${text}`).toBeTruthy(); button!.click();
};
const atEndpoint = (path: string) => calls.filter(call => call.url === path);
const emitAuth = (event: string, owner: string | null) => {
  h.owner = owner; [...h.callbacks].forEach(callback => callback(event, owner ? { user: { id: owner } } : null));
};

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  document.body.innerHTML = '';
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  calls = []; h.engineOptions = null; h.engine = null; h.callbacks.clear(); h.owner = 'owner-a'; h.preload = null; h.initialAuth = true; h.authUnavailable = false;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === '/api/games/session/start') return Response.json(startPayload(`session-${++serial}`));
    if (url === '/api/games/sign') return Response.json({ signature: 'signed' });
    if (url === '/api/games/session/complete') return Response.json({ xpDelta: 37, currencyDelta: 11 });
    throw new Error(`Forbidden request in local start DOM harness: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  if (component) await unmount(component); component = null;
  expect(h.callbacks.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllGlobals(); vi.useRealTimers();
});

for (const kind of ['neon', 'orbfield'] as const) {
  const startLabel = kind === 'neon' ? 'Start run' : 'Start round';
  const newLabel = kind === 'neon' ? 'Start new run' : 'Start new round';
  const selector = kind === 'neon' ? 'neon-run-game' : 'orbfield-game';
  const phase = () => document.querySelector(`[data-testid="${selector}"]`)?.getAttribute('data-phase');
  const open = async () => {
    if (kind === 'neon') {
      const { default: Component } = await import('../../../src/lib/components/games/NeonRun.svelte');
      component = mount(Component, { target: document.body, props: { createGame: h.createGame } });
    } else {
      const { default: Component } = await import('../../../src/lib/games/GameShell.svelte');
      component = mount(Component, { target: document.body, props: { title: 'Orbfield', description: 'Local test', gameId: 'orbfield', createGame: h.createGame } });
    }
    flushSync(); await sync();
  };
  const hangStart = (stage: 'fetch' | 'body' | 'error body' = 'fetch') => {
    const late = deferred<any>();
    fetchMock.mockImplementationOnce(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return stage === 'fetch' ? late.promise : { ok: stage !== 'error body', status: stage === 'error body' ? 500 : 200, json: () => late.promise };
    });
    return late;
  };

  describe(`real ${kind} start recovery`, () => {
    it.each(['fetch', 'body', 'error body'] as const)('leaves a hung %s start with honest uncertainty and no automatic new session', async (stage) => {
      const late = hangStart(stage); await open(); click(startLabel); await sync(); expect(phase()).toBe('starting');
      await vi.advanceTimersByTimeAsync(30_000); flushSync(); expect(phase()).toBe('start-error');
      expect(document.body.textContent).toContain('A session may already exist.');
      expect(document.body.textContent).toContain('may count toward your daily limit');
      expect(document.body.textContent).toContain(newLabel);
      expect(document.activeElement?.tagName).toBe('H2');
      expect(atEndpoint('/api/games/session/start')).toHaveLength(1);
      expect(atEndpoint('/api/games/session/start')[0].init!.signal!.aborted).toBe(true);
      late.resolve(stage === 'fetch' ? Response.json(startPayload('old')) : startPayload('old')); await sync();
      expect(phase()).toBe('start-error'); expect(h.createGame).not.toHaveBeenCalled(); expect(h.event).not.toHaveBeenCalled();
      expect(h.applyPlayerState).not.toHaveBeenCalled();
    });

    it('coalesces repeated UI clicks and completes only the explicit new session after a late old response', async () => {
      const late = hangStart(); await open(); click(startLabel); click(startLabel); click(startLabel); await sync();
      expect(atEndpoint('/api/games/session/start')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(30_000); flushSync();
      click(newLabel); click(newLabel); click(newLabel); await sync(); expect(phase()).toBe('playing');
      expect(atEndpoint('/api/games/session/start')).toHaveLength(2); expect(h.createGame).toHaveBeenCalledTimes(1);
      const newId = (h.event.mock.calls[0] as any)[1].sessionId;
      late.resolve(Response.json(startPayload('old'))); await sync(); expect(h.createGame).toHaveBeenCalledTimes(1);
      h.engineOptions.onGameOver({ score: 84, durationMs: 8000, meta: {} }); await sync(); expect(phase()).toBe('complete');
      const signed = JSON.parse(atEndpoint('/api/games/sign')[0].init!.body as string);
      const completed = JSON.parse(atEndpoint('/api/games/session/complete')[0].init!.body as string);
      expect(signed.sessionId).toBe(newId); expect(signed.nonce).toBe(`nonce-${newId}`); expect(completed.sessionId).toBe(newId);
      expect(document.body.textContent).toContain('+37 XP'); expect(document.body.textContent).not.toContain('999');
    });

    it.each(['exit', 'unmount'] as const)('cancels a pending start on %s and ignores its late response', async (action) => {
      const late = hangStart(); await open(); click(startLabel); await sync();
      if (action === 'exit') click('← Back to Play'); else { await unmount(component!); component = null; }
      await sync(); expect(atEndpoint('/api/games/session/start')[0].init!.signal!.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      late.resolve(Response.json(startPayload('old'))); await sync();
      expect(h.createGame).not.toHaveBeenCalled(); expect(h.event).not.toHaveBeenCalled();
      if (action === 'exit') expect(h.goto).toHaveBeenCalledWith('/app/games'); else expect(phase()).toBeUndefined();
    });

    it.each(['account switch', 'sign out'] as const)('invalidates a pending start on %s without applying the late owner response', async (change) => {
      const late = hangStart(); await open(); click(startLabel); await sync();
      emitAuth(change === 'sign out' ? 'SIGNED_OUT' : 'SIGNED_IN', change === 'sign out' ? null : 'owner-b');
      await sync(); expect(phase()).toBe('start-error'); expect(document.body.textContent).toContain(change === 'sign out' ? 'You were signed out' : 'Your account changed');
      expect(document.body.textContent).toContain(change === 'sign out' ? 'Sign in' : 'Refresh page');
      late.resolve(Response.json(startPayload('owner-a-old'))); await sync();
      expect(h.createGame).not.toHaveBeenCalled(); expect(h.event).not.toHaveBeenCalled();
      expect(atEndpoint('/api/games/session/start')).toHaveLength(1);
    });

    it('preserves a pending start across same-owner refresh and pauses when it arrives in the background', async () => {
      const late = hangStart(); await open(); click(startLabel); await sync();
      emitAuth('TOKEN_REFRESHED', 'owner-a'); emitAuth('SIGNED_IN', 'owner-a');
      Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
      late.resolve(Response.json(startPayload('same-owner'))); await sync(); expect(phase()).toBe('paused'); expect(h.engine.pause).toHaveBeenCalledTimes(1);
    });

    it.each(['owner change', 'unmount'] as const)('never starts a server session after %s during artwork preload', async (action) => {
      const art = deferred<any>(); h.preload = art.promise; await open(); click(startLabel); await sync();
      if (action === 'owner change') emitAuth('SIGNED_IN', 'owner-b'); else { await unmount(component!); component = null; }
      art.resolve({ assets: {}, complete: false }); await sync();
      expect(atEndpoint('/api/games/session/start')).toHaveLength(0); expect(h.createGame).not.toHaveBeenCalled();
    });

    it('does not adopt owner B when the first Auth notification arrives during A’s preload', async () => {
      h.initialAuth = false;
      const art = deferred<any>(); h.preload = art.promise;
      await open(); click(startLabel); await sync();
      emitAuth('SIGNED_IN', 'owner-b'); emitAuth('INITIAL_SESSION', 'owner-b');
      art.resolve({ assets: {}, complete: false }); await sync();
      expect(phase()).toBe('start-error'); expect(document.body.textContent).toContain('Your account changed');
      expect(atEndpoint('/api/games/session/start')).toHaveLength(0); expect(h.createGame).not.toHaveBeenCalled();
    });

    it('renders and fails closed when Auth setup is unavailable', async () => {
      h.authUnavailable = true;
      await open(); expect(phase()).toBe('ready'); click(startLabel); await sync();
      expect(phase()).toBe('start-error'); expect(document.body.textContent).toContain(newLabel);
      expect(atEndpoint('/api/games/session/start')).toHaveLength(0); expect(h.createGame).not.toHaveBeenCalled();
    });

    it('offers an explicit refresh rather than looping new starts against a stale rendered owner', async () => {
      const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
      const late = hangStart(); await open(); click(startLabel); await sync();
      emitAuth('SIGNED_IN', 'owner-b'); await sync();
      expect(document.body.textContent).toContain('Refresh this page before starting again');
      click('Refresh page'); await sync(); expect(reload).toHaveBeenCalledTimes(1);
      expect(atEndpoint('/api/games/session/start')).toHaveLength(1);
      late.resolve(Response.json(startPayload('old'))); await sync(); expect(h.createGame).not.toHaveBeenCalled();
      reload.mockRestore();
    });

    it('offers Sign in when Auth was already signed out before Start', async () => {
      h.owner = null; await open(); click(startLabel); await sync();
      expect(phase()).toBe('start-error'); expect(document.body.textContent).toContain('Sign in before starting again');
      click('Sign in'); expect(h.goto).toHaveBeenCalledWith('/app/auth');
      expect(atEndpoint('/api/games/session/start')).toHaveLength(0);
    });

    it('preserves practice without signing, completion or local rewards', async () => {
      await open(); click(startLabel); await sync();
      h.engineOptions.onGameOver({ score: 3, durationMs: 250, meta: {} }); await sync(); expect(phase()).toBe('practice');
      expect(atEndpoint('/api/games/sign')).toHaveLength(0); expect(atEndpoint('/api/games/session/complete')).toHaveLength(0);
      expect(h.applyPlayerState).not.toHaveBeenCalled();
    });
  });
}
