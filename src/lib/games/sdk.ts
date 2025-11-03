type BridgeHandler = (payload: any, rawEvent: MessageEvent) => void;

type InitOptions = {
  targetWindow: Window;
  origin?: string;
};

type Subscription = () => void;

type Bridge = {
  subscribe: (type: string, handler: BridgeHandler) => Subscription;
  post: (type: string, payload?: any) => void;
  destroy: () => void;
};

let bridgeListeners: Map<string, Set<BridgeHandler>> = new Map();
let bridgeTarget: Window | null = null;
let bridgeOrigin = '*';
let teardown: (() => void) | null = null;

const handleMessage = (event: MessageEvent) => {
  if (!bridgeTarget || event.source !== bridgeTarget) return;
  if (bridgeOrigin !== '*' && event.origin !== bridgeOrigin) return;
  const data = event.data ?? {};
  const type = typeof data.type === 'string' ? data.type : null;
  if (!type) return;
  const payload = data.payload ?? null;
  const handlers = bridgeListeners.get(type);
  if (!handlers) return;
  handlers.forEach((handler) => {
    try {
      handler(payload, event);
    } catch (err) {
      console.error('[games:sdk] handler error', err);
    }
  });
};

export const init = ({ targetWindow, origin = '*' }: InitOptions): Bridge => {
  if (teardown) {
    teardown();
  }

  bridgeTarget = targetWindow;
  bridgeOrigin = origin;
  bridgeListeners = new Map();

  window.addEventListener('message', handleMessage);
  teardown = () => {
    window.removeEventListener('message', handleMessage);
    bridgeListeners.clear();
    bridgeTarget = null;
  };

  return {
    subscribe(type: string, handler: BridgeHandler) {
      const set = bridgeListeners.get(type) ?? new Set<BridgeHandler>();
      set.add(handler);
      bridgeListeners.set(type, set);
      return () => {
        const listeners = bridgeListeners.get(type);
        if (!listeners) return;
        listeners.delete(handler);
        if (listeners.size === 0) {
          bridgeListeners.delete(type);
        }
      };
    },
    post(type: string, payload?: any) {
      if (!bridgeTarget) return;
      bridgeTarget.postMessage({ type, payload }, bridgeOrigin);
    },
    destroy() {
      teardown?.();
      teardown = null;
    }
  };
};

type StartResponse = {
  sessionId: string;
  nonce: string;
  serverTime: number;
  caps: {
    maxDurationMs: number;
    minDurationMs: number;
    maxScorePerMin: number;
    minClientVer: string;
    maxScore: number;
  };
};

export const startSession = async (slug: string, clientVersion?: string): Promise<StartResponse> => {
  const response = await fetch('/api/games/session/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, clientVersion })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? 'Unable to start session');
  }

  const payload = (await response.json()) as StartResponse;
  return payload;
};

type CompleteArgs = {
  sessionId: string;
  score: number;
  durationMs: number;
  nonce: string;
  signature: string;
  clientVersion?: string;
};

export type SessionAchievement = {
  key: string;
  name: string;
  icon: string;
  points: number;
  rarity?: string | null;
  shards?: number;
};

type CompleteResponse = {
  xpDelta: number;
  currencyDelta: number;
  baseCurrencyDelta?: number;
  currencyMultiplier?: number;
  achievements?: SessionAchievement[];
};

export const completeSession = async (args: CompleteArgs) => {
  const response = await fetch('/api/games/session/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error?.error ?? 'Unable to complete session';
    const err = new Error(message);
    (err as any).details = error;
    throw err;
  }

  return (await response.json()) as CompleteResponse;
};

type SignArgs = {
  sessionId: string;
  score: number;
  durationMs: number;
  nonce: string;
  clientVersion?: string;
};

export const signCompletion = async (args: SignArgs) => {
  const response = await fetch('/api/games/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error?.message ?? 'Unable to sign result';
    const err = new Error(message);
    (err as any).details = error;
    throw err;
  }

  return (await response.json()) as { signature: string };
};

export const fetchConfig = async () => {
  const response = await fetch('/api/games/config');
  if (!response.ok) {
    throw new Error('Unable to fetch game configuration');
  }
  return response.json();
};

export const fetchPlayerState = async () => {
  const response = await fetch('/api/games/player/state', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to fetch game player state');
  }
  return response.json();
};
