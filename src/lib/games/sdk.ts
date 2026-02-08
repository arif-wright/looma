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
import type {
  GameSessionCompleteRequest,
  GameSessionResults,
  GameSessionStartRequest
} from '$lib/games/types';
import { getActiveCompanionSnapshot } from '$lib/stores/companions';
import { sendAnalytics } from '$lib/utils/analytics';
import { sendEvent } from '$lib/client/events/sendEvent';

export const CLIENT_VERSION = '1.0.0';
const SESSION_GAMES_PLAYED_KEY = 'looma_session_games_played';

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
  gameId: string;
  mode?: string;
  clientMeta?: Record<string, any> | null;
  startedAt: number;
  clientVersion?: string;
};

const activeSessions = new Map<string, SessionContext>();
let currentSessionId: string | null = null;

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type StartSessionMeta = Record<string, any>;

const semverLikePattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const isSemverLike = (value: string) => semverLikePattern.test(value.trim());

export async function startSession(
  gameId: string,
  mode?: string,
  clientMeta?: Record<string, unknown>
): Promise<StartResponse>;
export async function startSession(
  gameId: string,
  metadataOrVersion?: StartSessionMeta | string
): Promise<StartResponse>;
export async function startSession(
  gameId: string,
  second?: StartSessionMeta | string,
  third?: Record<string, unknown>
): Promise<StartResponse> {
  let mode: string | undefined;
  let clientMeta: Record<string, any> | undefined;

  if (typeof second === 'string' && isRecord(third)) {
    mode = second.trim() || undefined;
    clientMeta = third;
  } else if (isRecord(second)) {
    clientMeta = second;
  } else if (typeof second === 'string' && !isSemverLike(second)) {
    mode = second.trim() || undefined;
  }

  const clientVersion =
    typeof second === 'string' && isSemverLike(second)
      ? second
      : typeof clientMeta?.clientVersion === 'string'
        ? clientMeta.clientVersion
        : CLIENT_VERSION;

  const startRequest: GameSessionStartRequest = {
    gameId,
    mode,
    clientMeta
  };

  const response = await fetch('/api/games/session/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      slug: gameId,
      clientVersion,
      metadata: {
        ...(clientMeta ?? {}),
        gameId,
        mode: mode ?? null
      },
      gameId: startRequest.gameId,
      mode: startRequest.mode,
      clientMeta: startRequest.clientMeta
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? 'Unable to start session');
  }

  const payload = (await response.json()) as StartResponse;
  const context: SessionContext = {
    ...payload,
    gameId,
    mode,
    clientMeta: clientMeta ?? null,
    startedAt: Date.now(),
    clientVersion: clientVersion ?? CLIENT_VERSION
  };
  activeSessions.set(context.sessionId, context);
  currentSessionId = context.sessionId;
  sendGameEvent('session_started', {
    gameId,
    sessionId: context.sessionId,
    mode: mode ?? null,
    clientMeta: clientMeta ?? null
  });
  await sendEvent(
    'game.session.start',
    {
      sessionId: context.sessionId,
      gameId,
      mode: mode ?? null,
      clientMeta: clientMeta ?? null
    },
    { sessionId: context.sessionId }
  );
  return payload;
}

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
  baseXpDelta?: number;
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
  stats?: Record<string, unknown>;
  rewards?: GameRewardPayload;
  extra?: Record<string, any>;
  server?: GameSessionServerResult;
} & Record<string, unknown>;

const postSessionCompletion = async (args: CompleteArgs) => {
  const payload = { ...args, clientVersion: args.clientVersion ?? CLIENT_VERSION };
  const response = await fetch('/api/games/session/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
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

const normalizeCompletionResults = (
  result: GameSessionResult,
  score: number,
  durationMs: number
): GameSessionResults => {
  const normalized: GameSessionResults = {
    ...result,
    score,
    durationMs,
    success: result.success,
    stats: result.stats ?? result.extra ?? undefined
  };
  return normalized;
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
    slug: context.gameId,
    score,
    durationMs,
    nonce: context.nonce,
    clientVersion: context.clientVersion ?? CLIENT_VERSION
  });

  const completion = await postSessionCompletion({
    sessionId,
    score,
    durationMs,
    nonce: context.nonce,
    signature,
    clientVersion: context.clientVersion ?? CLIENT_VERSION
  });

  activeSessions.delete(sessionId);
  if (currentSessionId === sessionId) {
    currentSessionId = null;
  }

  sendGameEvent('session_completed', {
    sessionId,
    gameId: context.gameId,
    success: result.success ?? null,
    durationMs,
    score,
    stats: result.stats ?? null,
    rewards: result.rewards ?? null,
    extra: result.extra ?? null
  });

  if (typeof window !== 'undefined') {
    const current = Number(window.sessionStorage.getItem(SESSION_GAMES_PLAYED_KEY) ?? '0');
    const next = Number.isFinite(current) && current > 0 ? Math.floor(current) + 1 : 1;
    window.sessionStorage.setItem(SESSION_GAMES_PLAYED_KEY, String(next));
  }

  const completionRequest: GameSessionCompleteRequest = {
    sessionId,
    results: normalizeCompletionResults(result, score, durationMs)
  };

  const response = await sendEvent('game.complete', {
    sessionId,
    gameId: context.gameId,
    mode: context.mode ?? null,
    results: completionRequest.results
  }, {
    sessionId
  });

  const output = response?.output ?? null;
  const reaction = output?.suppressed === true ? null : output?.reaction ?? null;
  if (reaction) {
    const { pushCompanionReaction } = await import('$lib/stores/companionReactions');
    pushCompanionReaction(reaction);
  }

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
  slug: string;
  score: number;
  durationMs: number;
  nonce: string;
  clientVersion?: string;
};

export const signCompletion = async (args: SignArgs) => {
  const payload = {
    ...args,
    clientVersion: args.clientVersion ?? CLIENT_VERSION
  };
  const response = await fetch('/api/games/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
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

export const getPlayerState = fetchPlayerState;

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
