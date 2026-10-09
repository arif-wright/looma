// Credential-free DOM regression: real shell and SDK; simulated engine/network.
// Actual Svelte component + actual SDK; simulated DOM/engine/network only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const h = vi.hoisted(() => ({
  engineOptions: null as any,
  createGame: vi.fn((options: any) => {
    h.engineOptions = options;
    return { start: vi.fn(), destroy: vi.fn(), pause: vi.fn(), resume: vi.fn(), playerJump: vi.fn(), getState: vi.fn() };
  }),
  rituals: vi.fn(), applyPlayerState: vi.fn(), goto: vi.fn()
}));
vi.mock('$app/navigation', () => ({ goto: h.goto }));
vi.mock('$lib/games/endlessRunner', () => ({ createEndlessRunner: h.createGame }));
vi.mock('$lib/games/audio', () => ({
  playSound: vi.fn(), stopSound: vi.fn(), isAudioEnabled: () => false, toggleAudioEnabled: () => false
}));
vi.mock('$lib/games/runnerLanternwaySkin', () => ({
  loadRunnerLanternwaySkin: async () => ({ assets: {}, complete: false }), RUNNER_LANTERNWAY_URLS: {}
}));
vi.mock('$lib/stores/companionRituals', () => ({ applyRitualUpdate: h.rituals }));
vi.mock('$lib/games/state', () => ({ applyPlayerState: h.applyPlayerState, getPlayerProgressSnapshot: () => ({}) }));
vi.mock('$lib/stores/companions', () => ({ getActiveCompanionSnapshot: () => null }));
vi.mock('$lib/stores/companionReactions', () => ({ pushCompanionReaction: vi.fn() }));
vi.mock('$lib/utils/analytics', () => ({ sendAnalytics: vi.fn() }));
vi.mock('$lib/client/events/sendEvent', () => ({ sendEvent: vi.fn(async () => null) }));

let component: ReturnType<typeof mount> | null = null;
let calls: Array<{ url: string; init?: RequestInit }>;
let releases: Array<(response: Response) => void>;
let completeNow = false;
const reward = { xpDelta: 37, currencyDelta: 11, rituals: { list: [], completed: [] } };
const sync = async () => { await vi.advanceTimersByTimeAsync(0); flushSync(); };
const phase = () => document.querySelector('[data-testid="neon-run-game"]')?.getAttribute('data-phase');
const click = (text: string) => {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  expect(button, `button ${text}`).toBeTruthy();
  button!.click();
};
const atEndpoint = (path: string) => calls.filter((call) => call.url === path);

beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks();
  document.body.innerHTML = '';
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  calls = []; releases = []; completeNow = false; h.engineOptions = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url === '/api/games/session/start') return Response.json({
      sessionId: 'local-only-session', nonce: 'local-only-nonce', serverTime: 1000,
      caps: { minDurationMs: 1000, maxDurationMs: 60000, maxScore: 10000, maxScorePerMin: 10000, minClientVer: '1.0.0' }
    });
    if (url === '/api/games/sign') return Response.json({ signature: 'local-only-signature' });
    if (url === '/api/games/session/complete') {
      if (completeNow) return Response.json(reward);
      return new Promise<Response>((resolve) => releases.push(resolve));
    }
    throw new Error(`Forbidden request in local DOM harness: ${url}`);
  }));
  const { default: NeonRun } = await import('../../../src/lib/components/games/NeonRun.svelte');
  component = mount(NeonRun, { target: document.body });
  flushSync(); await sync();
});
afterEach(async () => {
  if (component) await unmount(component);
  component = null; vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('real Neon Run shell with timed-out real SDK in a simulated DOM', () => {
  it('shows uncertainty and same-run retry, coalesces repeated clicks, and displays only the confirmed retry receipt', async () => {
    expect(phase()).toBe('ready');
    click('Start run'); await sync(); expect(phase()).toBe('playing');
    h.engineOptions.onGameOver({ score: 84, durationMs: 8000, meta: { shards: 4, survived_round: 0 } });
    await sync(); expect(phase()).toBe('saving');
    await vi.advanceTimersByTimeAsync(30_000); flushSync();
    expect(phase()).toBe('save-error');
    expect(document.body.textContent).toContain('Your run may already have saved.');
    expect(document.body.textContent).toContain('Retry saving checks this same run.');
    expect(document.querySelector('[data-testid="neon-run-rewards"]')).toBeNull();
    const original = atEndpoint('/api/games/session/complete')[0].init!.body;

    // Three DOM clicks before Svelte updates still submit only one retry.
    click('Retry saving'); click('Retry saving'); click('Retry saving');
    await sync(); expect(phase()).toBe('saving');
    expect(atEndpoint('/api/games/session/complete')).toHaveLength(2);
    expect(atEndpoint('/api/games/session/complete')[1].init!.body).toBe(original);
    expect(atEndpoint('/api/games/session/start')).toHaveLength(1);
    releases[0](Response.json({ xpDelta: 999, currencyDelta: 999 }));
    await sync(); expect(phase()).toBe('saving');
    expect(document.querySelector('[data-testid="neon-run-rewards"]')).toBeNull();
    releases[1](Response.json(reward));
    await sync(); expect(phase()).toBe('complete');
    expect(document.querySelector('[data-testid="neon-run-rewards"]')?.textContent).toBe('+37 XP · +11 shards');
    expect(h.rituals).toHaveBeenCalledTimes(1);
    expect(h.applyPlayerState).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps short practice no-submit behavior unchanged', async () => {
    click('Start run'); await sync();
    h.engineOptions.onGameOver({ score: 3, durationMs: 250, meta: { shards: 0 } });
    await sync(); expect(phase()).toBe('practice');
    expect(document.body.textContent).toContain('No rewards were requested.');
    expect(atEndpoint('/api/games/sign')).toEqual([]);
    expect(atEndpoint('/api/games/session/complete')).toEqual([]);
    expect(h.applyPlayerState).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a late timed-out receipt after the shell unmounts', async () => {
    click('Start run'); await sync();
    h.engineOptions.onGameOver({ score: 84, durationMs: 8000, meta: {} });
    await sync(); await vi.advanceTimersByTimeAsync(30_000); flushSync();
    expect(phase()).toBe('save-error');
    await unmount(component!); component = null;
    releases[0](Response.json(reward)); await sync();
    expect(document.querySelector('[data-testid="neon-run-game"]')).toBeNull();
    expect(h.rituals).not.toHaveBeenCalled();
    expect(h.applyPlayerState).not.toHaveBeenCalled();
    expect(atEndpoint('/api/games/session/complete')).toHaveLength(1);
  });
});
