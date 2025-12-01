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

import type { CompanionRitual } from '$lib/companions/rituals';
import { applyPlayerState, getPlayerProgressSnapshot } from '$lib/games/state';
import { getActiveCompanionSnapshot } from '$lib/stores/companions';
import { sendAnalytics } from '$lib/utils/analytics';

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

export type GameSessionStart = StartResponse;

type SessionContext = StartResponse & {
  slug: string;
  metadata?: Record<string, any> | null;
  startedAt: number;
  clientVersion?: string;
};

const activeSessions = new Map<string, SessionContext>();
let currentSessionId: string | null = null;

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type StartSessionMeta = Record<string, any>;

export const startSession = async (
  slug: string,
  metadataOrVersion?: StartSessionMeta | string
): Promise<StartResponse> => {
  const metadata = isRecord(metadataOrVersion) ? metadataOrVersion : undefined;
  const clientVersion =
    typeof metadataOrVersion === 'string'
      ? metadataOrVersion
      : typeof metadata?.clientVersion === 'string'
      ? metadata.clientVersion
      : undefined;
  const response = await fetch('/api/games/session/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      slug,
      clientVersion,
      metadata
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? 'Unable to start session');
  }

  const payload = (await response.json()) as StartResponse;
  const context: SessionContext = {
    ...payload,
    slug,
    metadata: metadata ?? null,
    startedAt: Date.now(),
    clientVersion
  };
  activeSessions.set(context.sessionId, context);
  currentSessionId = context.sessionId;
  sendGameEvent('session_started', {
    slug,
    sessionId: context.sessionId,
    metadata: metadata ?? null
  });
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

export type GameSessionServerResult = {
  xpDelta: number;
  baseXp?: number;
  finalXp?: number;
  xpFromCompanion?: number;
  xpFromStreak?: number;
  xpMultiplier?: number;
  companionBonus?: {
    companionId: string;
    name: string | null;
    bondLevel: number;
    xpMultiplier: number;
  } | null;
  currencyDelta: number;
  baseCurrencyDelta?: number;
  currencyMultiplier?: number;
  rituals?: {
    list: CompanionRitual[];
    completed: CompanionRitual[];
  } | null;
  achievements?: SessionAchievement[];
};

export type CompleteResponse = GameSessionServerResult;

export type GameRewardPayload = {
  xp?: number;
  shards?: number;
  [key: string]: any;
};

export type GameSessionResult = {
  score?: number;
  success?: boolean;
  durationMs?: number;
  rewards?: GameRewardPayload;
  extra?: Record<string, any>;
  server?: GameSessionServerResult;
};

const postSessionCompletion = async (args: CompleteArgs) => {
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
  return (await response.json()) as GameSessionServerResult;
};

const resolveActiveContext = (sessionId: string): SessionContext | null => {
  const context = activeSessions.get(sessionId) ?? null;
  if (context) return context;
  return null;
};

const normalizeScore = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const resolveDuration = (input: number | undefined, context: SessionContext | null) => {
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    return Math.floor(input);
  }
  if (!context) return 0;
  return Math.max(0, Math.floor(Date.now() - context.startedAt));
};

const completeWithResult = async (sessionId: string, result: GameSessionResult = {}) => {
  const context = resolveActiveContext(sessionId);
  if (!context) {
    console.warn('[games/sdk] no active context for session', sessionId);
    return null;
  }

  const score = normalizeScore(result.score);
  const durationMs = resolveDuration(result.durationMs, context);

  const { signature } = await signCompletion({
    sessionId,
    score,
    durationMs,
    nonce: context.nonce,
    clientVersion: context.clientVersion
  });

  const completion = await postSessionCompletion({
    sessionId,
    score,
    durationMs,
    nonce: context.nonce,
    signature,
    clientVersion: context.clientVersion
  });

  activeSessions.delete(sessionId);
  if (currentSessionId === sessionId) {
    currentSessionId = null;
  }

  sendGameEvent('session_completed', {
    sessionId,
    slug: context.slug,
    success: result.success ?? null,
    durationMs,
    score,
    rewards: result.rewards ?? null,
    extra: result.extra ?? null
  });

  return completion;
};

export async function completeSession(args: CompleteArgs): Promise<CompleteResponse>;
export async function completeSession(
  sessionId: string,
  result: GameSessionResult
): Promise<GameSessionServerResult | null>;
export async function completeSession(
  first: CompleteArgs | string,
  second?: GameSessionResult
): Promise<CompleteResponse | GameSessionServerResult | null | void> {
  if (typeof first === 'string') {
    return completeWithResult(first, second);
  }
  return postSessionCompletion(first);
}

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

const clampRewardValue = (value: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return 0;
  return Math.trunc(value);
};

const updateLocalXp = (delta: number) => {
  if (!delta) return;
  const snapshot = getPlayerProgressSnapshot();
  const current = typeof snapshot.xp === 'number' ? snapshot.xp : 0;
  applyPlayerState({ xp: current + delta });
};

const updateLocalCurrency = (delta: number) => {
  if (!delta) return;
  const snapshot = getPlayerProgressSnapshot();
  const current = typeof snapshot.currency === 'number' ? snapshot.currency : 0;
  applyPlayerState({ currency: current + delta });
};

export const awardXP = async (amount: number, reason = 'game_reward'): Promise<void> => {
  const delta = clampRewardValue(amount);
  if (delta === 0) return;
  sendGameEvent('xp_awarded', { amount: delta, reason });
  try {
    const response = await fetch('/api/xp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: delta, reason })
    });
    if (!response.ok) {
      throw new Error(`xp_request_failed_${response.status}`);
    }
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload.newXp === 'number') {
      applyPlayerState({ xp: payload.newXp });
      return;
    }
  } catch (err) {
    console.warn('[games/sdk] awardXP request failed, using local fallback', err);
  }
  updateLocalXp(delta);
};

export const awardShards = async (amount: number, reason = 'game_reward'): Promise<void> => {
  const delta = clampRewardValue(amount);
  if (delta === 0) return;
  sendGameEvent('shards_awarded', { amount: delta, reason });
  updateLocalCurrency(delta);
};

export const getMood = async (): Promise<{ state: string; intensity: number } | null> => {
  const snapshot = getActiveCompanionSnapshot();
  if (!snapshot?.mood) return null;
  return { state: snapshot.mood, intensity: 1 };
};

export const getCompanionState = async (): Promise<Record<string, any> | null> => {
  const snapshot = getActiveCompanionSnapshot();
  if (!snapshot) return null;
  return { ...snapshot };
};

export const sendGameEvent = (type: string, payload: Record<string, any> = {}): void => {
  if (!type || typeof type !== 'string') return;
  const enrichedPayload = {
    ...payload,
    sessionId: currentSessionId
  };

  if (typeof window === 'undefined') {
    console.debug('[games:event]', type, enrichedPayload);
    return;
  }

  sendAnalytics(`game_${type}`, {
    payload: enrichedPayload
  });
};
