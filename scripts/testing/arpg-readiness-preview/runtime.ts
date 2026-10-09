export type AuthSession = { user: { id: string } } | null;
export type AuthCallback = (event: string, session: AuthSession) => void;
export type SceneObservation = {
  id: number; pageId: number | null; preloadAt: number; createAt: number | null;
  queuedKeys: string[]; decodedKeys: string[]; missingKeys: string[];
  loadErrors: string[]; loadComplete: boolean; totalFailed: number | null;
  framesAfterCreate: number; destroyed: boolean;
};
export const fixture = {
  ready: false,
  owner: 'owner-a' as string | null,
  callbacks: new Set<AuthCallback>(),
  api: [] as Array<{ path: string; method: string; sessionId?: string; at: number }>,
  blocked: [] as string[],
  rewardMutations: [] as unknown[],
  navigations: [] as string[],
  scenes: [] as SceneObservation[],
  mountAnother: async (): Promise<number> => { throw new Error('Not mounted'); },
  unmountPage: async (_id: number): Promise<void> => { throw new Error('Not mounted'); },
  unmountAll: async (): Promise<void> => { throw new Error('Not mounted'); },
  emitAuth(event: string, owner: string | null) {
    fixture.owner = owner;
    for (const callback of [...fixture.callbacks]) callback(event, owner ? { user: { id: owner } } : null);
  },
  snapshot() {
    return { ready: fixture.ready, authCallbacks: fixture.callbacks.size, owner: fixture.owner, api: fixture.api, blocked: fixture.blocked,
      rewardMutations: fixture.rewardMutations, navigations: fixture.navigations,
      scenes: fixture.scenes, canvasCount: document.querySelectorAll('canvas').length, pages: [...document.querySelectorAll<HTMLElement>('[data-fixture-page]')].map(el => ({ id: Number(el.dataset.fixturePage), status: el.querySelector('.game-status')?.textContent ?? null, canvases: el.querySelectorAll('canvas').length })), mountedPages: [...document.querySelectorAll('[data-fixture-page]')].map(el => Number((el as HTMLElement).dataset.fixturePage)) };
  }
};

// Actual SDK and route; only their transport is synthetic. There is no native
// fetch fallback, signature/completion responder, account or backend credential.
export function installSyntheticTransport() {
  window.fetch = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.origin);
    const method = init.method ?? (input instanceof Request ? input.method : 'GET');
    const start = url.pathname === '/api/games/session/start' && method === 'POST' && !url.search;
    const leaderboard = url.pathname === '/api/leaderboard/arpg/alltime' && method === 'GET' && url.search === '?page=1&limit=25';
    if (url.origin !== location.origin || (!start && !leaderboard)) {
      fixture.blocked.push(`${method} ${url.href}`);
      throw new Error('Forbidden fetch in ARPG fixture');
    }
    if (leaderboard) {
      fixture.api.push({ path: url.pathname, method, at: performance.now() });
      return Response.json({ rows: [], meta: { page: 1, limit: 25, total: 0 } });
    }
    const sessionId = `fixture-arpg-${fixture.api.filter(call => call.path === url.pathname).length + 1}`;
    fixture.api.push({ path: url.pathname, method, sessionId, at: performance.now() });
    return Response.json({ sessionId, nonce: `nonce-${sessionId}`, serverTime: Date.now(),
      caps: { minDurationMs: 1000, maxDurationMs: 120000, maxScore: 150000, maxScorePerMin: 150000, minClientVer: '1.0.0' } });
  };
}
declare global { interface Window { __arpgFixture: typeof fixture; } }
window.__arpgFixture = fixture;
