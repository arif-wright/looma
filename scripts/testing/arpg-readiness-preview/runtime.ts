import { FLOW_CAP_MS, SIGNATURE, PLAYER_STATE, RECEIPT, expectedStart, sameJson, validSign, validComplete } from './protocol.mjs';
export type AuthSession = { user: { id: string } } | null;
export type AuthCallback = (event: string, session: AuthSession) => void;
export type ArtObjectObservation = {
  alpha: number; key: string; x: number; y: number; depth: number; originX: number; originY: number;
  scaleX: number; scaleY: number; displayWidth: number; displayHeight: number;
};
export type ScreenRect = { x: number; y: number; width: number; height: number };
export type VisibleSpriteObservation = {
  textureKey: string; alphaThreshold: number; frameWidth: number; frameHeight: number;
  sourceBounds: ScreenRect & { opaquePixels: number }; screenBounds: ScreenRect;
};
export type ViewportGeometry = {
  canvas: { width: number; height: number };
  camera: { x: number; y: number; width: number; height: number; zoom: number; scrollX: number; scrollY: number; matrix: number[] };
  hud: ScreenRect; controls: ScreenRect;
  hudItems: Array<{ name: string; bounds: ScreenRect }>; controlItems: Array<{ name: string; bounds: ScreenRect }>;
  heroVisible: VisibleSpriteObservation | null; entranceVisible: VisibleSpriteObservation | null;
  heroGround: { x: number; y: number }; shop: ScreenRect | null; entrance: ScreenRect | null; entranceLabel: ScreenRect | null;
};
export type TownGroundObservation = {
  legacyFloorCount: number; largeMarkerCount: number; textureWidth: number; textureHeight: number; filterMode: number | null;
  samples: Array<{ worldX: number; worldY: number; pixelX: number; pixelY: number; alpha: number | null }>;
};
export type PlazaObjectObservation = ArtObjectObservation & { name: string; alpha: number; active: boolean; visible: boolean; objectId: number };
export type PlazaMotion = { intent: { x: number; y: number }; at: number; area: number; x: number; y: number; dash: { cd: number; timer: number; lastDir: { x: number; y: number } } | null };
export type GameplayObservation = {
  at: number; area: number; elapsed: number; durationLimit: number; expeditionActive: boolean;
  outcome: string; returned: boolean; x: number; y: number; hp: number; kills: number;
  plazaProbe: { id: number; requestedAt: number; respondedAt: number } | null;
  plazaVisibility: { samples: number; readable: number; meanTransmission: number; occluders: string[] } | null;
  intent: PlazaMotion['intent']; dash: PlazaMotion['dash']; plaza: PlazaObjectObservation[];
  viewportGeometry: ViewportGeometry | null;
  townArt: { hero: ArtObjectObservation; objects: ArtObjectObservation[]; ground: TownGroundObservation } | null;
  primary: { label: string; x: number; y: number }; secondary: { label: string; x: number; y: number };
};
export type SceneObservation = {
  id: number; pageId: number | null; preloadAt: number; createAt: number | null;
  queuedKeys: string[]; decodedKeys: string[]; missingKeys: string[];
  loadErrors: string[]; loadComplete: boolean; totalFailed: number | null;
  framesAfterCreate: number; destroyed: boolean; gameplay: GameplayObservation | null;
};
type ApiCall = { path: string; method: string; sessionId?: string; at: number; responseAt?: number; body?: unknown };
export type Checkpoint = { label: string; at: number; starts: number; scene: SceneObservation | null };
export type VisualObservation = {
  label: string; at: number; starts: number; viewport: { width: number; height: number };
  documentWidth: number; canvas: { x: number; y: number; width: number; height: number; pixelWidth: number; pixelHeight: number };
  scene: SceneObservation | null;
};
let releaseStart: (() => void) | null = null;
let holdNextStart = false;
export const fixture = {
  ready: false,
  profile: 'readiness' as 'readiness' | 'return-flow',
  owner: 'owner-a' as string | null,
  callbacks: new Set<AuthCallback>(),
  api: [] as ApiCall[], blocked: [] as string[], rewardMutations: [] as unknown[],
  plazaMotion: [] as PlazaMotion[], plazaMotionOverflow: false,
  plazaLatestMotion: null as PlazaMotion | null,
  plazaProbeRequest: null as { id: number; requestedAt: number } | null,
  requestPlazaProbe() {
    if (window.__arpgPlazaFlow !== true) throw new Error('Full plaza probe is limited to the two exploration cases');
    fixture.plazaProbeRequest = { id: (fixture.plazaProbeRequest?.id ?? 0) + 1, requestedAt: performance.now() };
    return fixture.plazaProbeRequest;
  },
  navigations: [] as string[], scenes: [] as SceneObservation[], checkpoints: [] as Checkpoint[], visuals: [] as VisualObservation[],
  mountAnother: async (): Promise<number> => { throw new Error('Not mounted'); },
  unmountPage: async (_id: number): Promise<void> => { throw new Error('Not mounted'); },
  unmountAll: async (): Promise<void> => { throw new Error('Not mounted'); },
  holdStart() { holdNextStart = true; },
  releaseStart() { releaseStart?.(); releaseStart = null; },
  record(label: string, pageId = 1) {
    const scene = fixture.scenes.find(scene => scene.pageId === pageId && !scene.destroyed) ?? null;
    const checkpoint = { label, at: performance.now(), starts: fixture.api.filter(call => call.path === '/api/games/session/start').length,
      scene: scene ? structuredClone(scene) : null };
    fixture.checkpoints.push(checkpoint);
    return checkpoint.scene?.gameplay ?? null;
  },
  recordVisual(label: string, pageId = 1) {
    const canvas = document.querySelector<HTMLCanvasElement>(`[data-fixture-page="${pageId}"] canvas`);
    if (!canvas) throw new Error('A real rendered canvas is required');
    const rect = canvas.getBoundingClientRect();
    const scene = fixture.scenes.find(scene => scene.pageId === pageId && !scene.destroyed) ?? null;
    const observation: VisualObservation = {
      label, at: performance.now(), starts: fixture.api.filter(call => call.path === '/api/games/session/start').length,
      viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth,
      canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, pixelWidth: canvas.width, pixelHeight: canvas.height },
      scene: scene ? structuredClone(scene) : null
    };
    fixture.visuals.push(observation);
    return observation;
  },
  emitAuth(event: string, owner: string | null) {
    fixture.owner = owner;
    for (const callback of [...fixture.callbacks]) callback(event, owner ? { user: { id: owner } } : null);
  },
  snapshot() {
    return { plazaMotion: fixture.plazaMotion, plazaMotionOverflow: fixture.plazaMotionOverflow, ready: fixture.ready, profile: fixture.profile, authCallbacks: fixture.callbacks.size, owner: fixture.owner, api: fixture.api, blocked: fixture.blocked,
      rewardMutations: fixture.rewardMutations, navigations: fixture.navigations, checkpoints: fixture.checkpoints, visuals: fixture.visuals,
      scenes: fixture.scenes, canvasCount: document.querySelectorAll('canvas').length, pages: [...document.querySelectorAll<HTMLElement>('[data-fixture-page]')].map(el => ({ id: Number(el.dataset.fixturePage), status: el.querySelector('.game-status')?.textContent ?? null, canvases: el.querySelectorAll('canvas').length })), mountedPages: [...document.querySelectorAll('[data-fixture-page]')].map(el => Number((el as HTMLElement).dataset.fixturePage)) };
  }
};

// Real SDK and route; transport only is synthetic. Every request/body is checked;
// only the three explicit return-flow cases may sign/complete and receive a zero-value receipt.
export function installSyntheticTransport() {
  fixture.profile = window.__arpgReturnFlow === true ? 'return-flow' : 'readiness';
  let signed: unknown = null, completed = false, playerRead = false;
  window.fetch = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.origin);
    const method = init.method ?? (input instanceof Request ? input.method : 'GET');
    const deny = () => { fixture.blocked.push(`${method} ${url.href}`); throw new Error('Forbidden fetch or body in ARPG fixture'); };
    if (url.origin !== location.origin) return deny();
    const leaderboard = url.pathname === '/api/leaderboard/arpg/alltime' && method === 'GET' && url.search === '?page=1&limit=25';
    if (leaderboard && init.body === undefined) {
      fixture.api.push({ path: url.pathname, method, at: performance.now() });
      return Response.json({ rows: [], meta: { page: 1, limit: 25, total: 0 } });
    }
    if (url.search) return deny();
    let body: unknown;
    if (method === 'POST') {
      if (typeof init.body !== 'string' || new Headers(init.headers).get('content-type') !== 'application/json') return deny();
      try { body = JSON.parse(init.body); } catch { return deny(); }
    }
    const call: ApiCall = { path: url.pathname, method, at: performance.now(), ...(body === undefined ? {} : { body }) };
    if (url.pathname === '/api/games/session/start' && method === 'POST' && sameJson(body, expectedStart)) {
      const sessionId = `fixture-arpg-${fixture.api.filter(call => call.path === url.pathname).length + 1}`;
      call.sessionId = sessionId;
      fixture.api.push(call);
      if (holdNextStart) { holdNextStart = false; await new Promise<void>(resolve => { releaseStart = resolve; }); }
      call.responseAt = performance.now();
      return Response.json({ sessionId, nonce: `nonce-${sessionId}`, serverTime: Date.now(),
        caps: { minDurationMs: 1000, maxDurationMs: fixture.profile === 'return-flow' ? FLOW_CAP_MS : 120000,
          maxScore: 150000, maxScorePerMin: 150000, minClientVer: '1.0.0' } });
    }
    if (fixture.profile !== 'return-flow') return deny();
    const starts = fixture.api.filter(call => call.path === '/api/games/session/start');
    if (starts.length !== 1 || starts[0]!.responseAt === undefined) return deny();
    if (url.pathname === '/api/games/sign' && method === 'POST' && signed === null && !completed && validSign(body)) {
      signed = body; fixture.api.push(call); return Response.json({ signature: SIGNATURE });
    }
    if (url.pathname === '/api/games/session/complete' && method === 'POST' && !completed && validComplete(body, signed)) {
      completed = true; fixture.api.push(call); return Response.json(RECEIPT);
    }
    if (url.pathname === '/api/games/player/state' && method === 'GET' && init.body === undefined && completed && !playerRead) {
      playerRead = true; fixture.api.push(call); return Response.json(PLAYER_STATE);
    }
    return deny();
  };
}
declare global { interface Window { __arpgFixture: typeof fixture; __arpgReturnFlow?: boolean; __arpgPlazaFlow?: boolean; } }
window.__arpgFixture = fixture;
