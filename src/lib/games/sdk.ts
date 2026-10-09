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
import { createSupabaseBrowserClient } from '$lib/supabase/client';

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
const submittedResults = new Map<string, { key: string; result: GameSessionResult }>();
let currentSessionId: string | null = null;

/** Forget local bookkeeping only. This does not cancel or settle a server session. */
export const abandonSession = (sessionId: string): void => {
  activeSessions.delete(sessionId);
  submittedResults.delete(sessionId);
  if (currentSessionId === sessionId) {
    currentSessionId = null;
  }
};

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type StartSessionMeta = Record<string, any>;

const semverLikePattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const isSemverLike = (value: string) => semverLikePattern.test(value.trim());

export type GameErrorKind = 'network' | 'unauthorized' | 'completion_failed' | 'generic';
type GameErrorContext = 'start' | 'complete' | 'sign' | 'load';

import {
  SAFE_COMPLETION_MESSAGE,
  SAFE_LOAD_MESSAGE,
  SAFE_NETWORK_MESSAGE,
  SAFE_UNAUTHORIZED_MESSAGE
} from '$lib/safeMessages';

export class GameClientError extends Error {
  kind: GameErrorKind;
  status: number | null;
  code: string | null;
  details: Record<string, unknown> | null;

  constructor(input: {
    message: string;
    kind: GameErrorKind;
    status?: number | null;
    code?: string | null;
    details?: Record<string, unknown> | null;
  }) {
    super(input.message);
    this.name = 'GameClientError';
    this.kind = input.kind;
    this.status = input.status ?? null;
    this.code = input.code ?? null;
    this.details = input.details ?? null;
  }
}

const resolveSafeMessage = (context: GameErrorContext, kind: GameErrorKind) => {
  if (kind === 'network') return SAFE_NETWORK_MESSAGE;
  if (kind === 'unauthorized') return SAFE_UNAUTHORIZED_MESSAGE;
  if (context === 'complete') return SAFE_COMPLETION_MESSAGE;
  return SAFE_LOAD_MESSAGE;
};

const toGameClientError = (
  err: unknown,
  context: GameErrorContext,
  fallbackStatus: number | null = null,
  fallbackCode: string | null = null,
  details: Record<string, unknown> | null = null
): GameClientError => {
  if (err instanceof GameClientError) return err;

  const source = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const status =
    typeof source.status === 'number'
      ? source.status
      : typeof fallbackStatus === 'number'
        ? fallbackStatus
        : null;
  const code =
    typeof source.code === 'string'
      ? source.code
      : typeof fallbackCode === 'string'
        ? fallbackCode
        : null;

  let kind: GameErrorKind = 'generic';
  if (err instanceof TypeError || code === 'network_error') {
    kind = 'network';
  } else if (status === 401 || code === 'unauthorized') {
    kind = 'unauthorized';
  } else if (context === 'complete') {
    kind = 'completion_failed';
  }

  return new GameClientError({
    message: resolveSafeMessage(context, kind),
    kind,
    status,
    code,
    details
  });
};

const parseApiErrorPayload = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const code = typeof payload?.code === 'string' ? payload.code : null;
  const message = typeof payload?.message === 'string' ? payload.message : null;
  return { payload, code, message };
};

export const getGameErrorMessage = (err: unknown, context: GameErrorContext = 'load') =>
  toGameClientError(err, context).message;

export const getGameErrorKind = (err: unknown, context: GameErrorContext = 'load') =>
  toGameClientError(err, context).kind;

// Auth events only invalidate stale client work. The start route remains the
// authority for authentication/ownership; no client identity is sent as proof.
const observeGameOwner = (onChange: (ownerId: string | null) => void, expectedOwnerId?: string | null) => {
  let initialized = false;
  let ownerId: string | null = null;
  let stopped = false;
  let ready!: (ownerId: string | null) => void;
  const initialOwner = new Promise<string | null>((resolve) => { ready = resolve; });
  const { data: { subscription } } = createSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => {
    if (stopped) return;
    const nextOwner = session?.user?.id ?? null;
    if (!initialized) {
      initialized = true; ownerId = nextOwner; ready(ownerId);
      if (expectedOwnerId !== undefined && ownerId !== expectedOwnerId) onChange(ownerId);
    } else if (nextOwner !== ownerId) {
      ownerId = nextOwner;
      onChange(ownerId);
    }
  });
  return { initialOwner, stop: () => { stopped = true; subscription.unsubscribe(); } };
};

/** Watch the current screen as well as pending requests, including preload/boot. */
export const watchGameOwner = (onChange: (ownerId: string | null) => void, expectedOwnerId?: string | null): (() => void) => {
  try { return observeGameOwner(onChange, expectedOwnerId).stop; }
  catch {
    // Mounting a screen must remain safe when Auth is unavailable. startSession
    // independently initializes Auth and fails closed before sending a request.
    return () => {};
  }
};

export type GameSessionStartOptions = { signal?: AbortSignal; ownerId?: string | null };
const START_REQUEST_TIMEOUT_MS = 30_000;
const UNCERTAIN_START_MESSAGE = 'We couldn’t confirm the start. A session may already exist. Starting again creates a new session and may count toward your daily limit.';
const uncertainStart = (code: string, status: number | null = null) => new GameClientError({
  message: UNCERTAIN_START_MESSAGE, kind: 'network', code, status
});
const cancelledStart = () => new GameClientError({
  message: 'Starting was interrupted. Any session already created was not cancelled.', kind: 'generic', code: 'start_cancelled'
});

const validStartResponse = (value: unknown): value is StartResponse => {
  if (!isRecord(value) || typeof value.sessionId !== 'string' || !value.sessionId.trim() ||
      typeof value.nonce !== 'string' || !value.nonce.trim() ||
      !Number.isFinite(value.serverTime) || value.serverTime < 0 || !isRecord(value.caps)) return false;
  const caps = value.caps;
  return Number.isSafeInteger(caps.minDurationMs) && caps.minDurationMs >= 0 &&
    Number.isSafeInteger(caps.maxDurationMs) && caps.maxDurationMs >= Math.max(1, caps.minDurationMs) &&
    Number.isSafeInteger(caps.maxScore) && caps.maxScore >= 0 &&
    Number.isFinite(caps.maxScorePerMin) && caps.maxScorePerMin > 0 &&
    typeof caps.minClientVer === 'string' && isSemverLike(caps.minClientVer);
};

export async function startSession(
  gameId: string,
  mode?: string,
  clientMeta?: Record<string, unknown>,
  options?: GameSessionStartOptions
): Promise<StartResponse>;
export async function startSession(
  gameId: string,
  metadataOrVersion?: StartSessionMeta | string
): Promise<StartResponse>;
export async function startSession(
  gameId: string,
  second?: StartSessionMeta | string,
  third?: Record<string, unknown>,
  options: GameSessionStartOptions = {}
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
    ...(mode ? { mode } : {}),
    ...(clientMeta ? { clientMeta } : {})
  };

  const controller = new AbortController();
  let interruption: GameClientError | null = null;
  let interrupt!: (error: GameClientError) => void;
  const interrupted = new Promise<never>((_resolve, reject) => { interrupt = reject; });
  const cancel = (error: GameClientError) => {
    if (interruption) return;
    interruption = error;
    // Reject before abort so an AbortError cannot obscure the precise outcome.
    interrupt(error); controller.abort();
  };
  const onAbort = () => cancel(cancelledStart());
  let stopWatching: (() => void) | undefined;
  let requestSent = false;
  const timer = setTimeout(() => cancel(requestSent ? uncertainStart('start_timeout') : new GameClientError({
    message: 'We couldn’t check your sign-in. Please try starting again.', kind: 'network', code: 'start_auth_timeout'
  })), START_REQUEST_TIMEOUT_MS);
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (options.signal?.aborted) onAbort();
    const request = async () => {
      if (interruption) throw interruption;
      const owner = observeGameOwner((ownerId) => cancel(new GameClientError({
        message: ownerId ? 'Your account changed while starting. Refresh this page before starting again. Any session already created was not cancelled.'
          : 'You were signed out while starting. Sign in before starting again. Any session already created was not cancelled.',
        kind: ownerId ? 'generic' : 'unauthorized', code: 'start_account_changed'
      })), options.ownerId);
      stopWatching = owner.stop;
      // Establish the account before the request, ignoring same-owner refreshes.
      const ownerId = await owner.initialOwner;
      if (interruption) throw interruption;
      if (!ownerId) throw toGameClientError({ status: 401, code: 'unauthorized' }, 'start');
      requestSent = true;
      const response = await fetch('/api/games/session/start', {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: gameId,
          clientVersion,
          metadata: { ...(clientMeta ?? {}), gameId, mode: mode ?? null },
          gameId: startRequest.gameId,
          mode: startRequest.mode,
          clientMeta: startRequest.clientMeta
        })
      });
      if (!response.ok) {
        const { payload, code } = await parseApiErrorPayload(response);
        // The route can fail after inserting a session. Do not claim a 5xx
        // response means no session exists, or retry a non-idempotent start.
        if (response.status >= 500) throw uncertainStart(code ?? 'start_failed', response.status);
        throw toGameClientError({ status: response.status, code }, 'start', response.status, code, payload);
      }
      return await response.json();
    };
    // Race fetch AND body reads. The losing operation has no bookkeeping/events.
    const payload: unknown = await Promise.race([request(), interrupted]);
    if (interruption) throw interruption;
    if (!validStartResponse(payload)) throw uncertainStart('invalid_start');
    const context: SessionContext = {
      ...payload,
      gameId,
      ...(mode ? { mode } : {}),
      ...(clientMeta ? { clientMeta } : {}),
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
    // Optional event delivery must not hold an already-created game session open.
    void sendEvent(
      'game.session.start',
      {
        sessionId: context.sessionId,
        gameId,
        mode: mode ?? null,
        clientMeta: clientMeta ?? null
      },
      { sessionId: context.sessionId }
    ).catch((err) => console.debug('[games/sdk] start event unavailable', err));
    return payload;
  } catch (err) {
    if (err instanceof GameClientError) throw err;
    // A lost/malformed response cannot prove that the insert did not happen.
    if (requestSent) throw uncertainStart('start_failed');
    throw toGameClientError(err, 'start');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    stopWatching?.();
  }
}

type CompleteArgs = {
  sessionId: string;
  score: number;
  durationMs: number;
  nonce: string;
  signature: string;
  clientVersion?: string;
  success?: boolean | null;
  stats?: Record<string, unknown> | null;
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
  settlementVersion?: 1;
  sessionId?: string;
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

// Bound both signing and receipt reads, including a stalled response body. A
// deadline only ends our wait: the server may already have committed the run.
// Keep local retry context and leave all bookkeeping outside this request race.
const COMPLETION_REQUEST_TIMEOUT_MS = 30_000;
const withCompletionRequestDeadline = async <T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new GameClientError({
        message: 'We couldn’t confirm the saved result. Your run may already have saved.',
        kind: 'network', code: 'request_timeout'
      }));
      controller.abort();
    }, COMPLETION_REQUEST_TIMEOUT_MS);
  });
  try {
    // Race as well as abort: late or non-abortable transports cannot keep the
    // singleflight entry pending, submit a later stage, or apply rewards late.
    return await Promise.race([request(controller.signal), deadline]);
  } finally {
    clearTimeout(timer!);
  }
};

const postSessionCompletion = (args: CompleteArgs) => withCompletionRequestDeadline(async (signal) => {
  const payload = { ...args, clientVersion: args.clientVersion ?? CLIENT_VERSION };
  try {
    const response = await fetch('/api/games/session/complete', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const { payload: errorPayload, code } = await parseApiErrorPayload(response);
      throw toGameClientError(
        { status: response.status, code },
        'complete',
        response.status,
        code,
        errorPayload
      );
    }
    const data: unknown = await response.json();
    if (!isRecord(data) || !Number.isSafeInteger(data.xpDelta) || data.xpDelta < 0 ||
        !Number.isSafeInteger(data.currencyDelta) || data.currencyDelta < 0 ||
        ('settlementVersion' in data && (data.settlementVersion !== 1 || data.sessionId !== args.sessionId))) {
      throw new GameClientError({ message: SAFE_COMPLETION_MESSAGE, kind: 'completion_failed', code: 'invalid_receipt' });
    }
    return data as GameSessionServerResult;
  } catch (err) {
    throw toGameClientError(err, 'complete');
  }
});

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
    ...(typeof result.success === 'boolean' ? { success: result.success } : {}),
    ...(result.stats
      ? { stats: result.stats }
      : result.extra
        ? { stats: result.extra as Record<string, unknown> }
        : {})
  };
  return normalized;
};

const performCompletion = async (sessionId: string, result: GameSessionResult = {}) => {
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
    clientVersion: context.clientVersion ?? CLIENT_VERSION,
    success: typeof result.success === 'boolean' ? result.success : null,
    stats: result.stats ?? result.extra ?? null
  });

  abandonSession(sessionId);

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
    try {
      const current = Number(window.sessionStorage.getItem(SESSION_GAMES_PLAYED_KEY) ?? '0');
      const next = Number.isFinite(current) && current > 0 ? Math.floor(current) + 1 : 1;
      window.sessionStorage.setItem(SESSION_GAMES_PLAYED_KEY, String(next));
    } catch (err) {
      // Optional browser storage must not turn a committed completion into a failure.
      console.debug('[games/sdk] session counter unavailable', err);
    }
  }

  const completionRequest: GameSessionCompleteRequest = {
    sessionId,
    results: normalizeCompletionResults(result, score, durationMs)
  };

  // The reward response is authoritative; optional reactions may finish later.
  void (async () => {
    try {
      const response = await sendEvent('game.complete', {
        sessionId,
        gameId: context.gameId,
        mode: context.mode ?? null,
        results: completionRequest.results
      }, {
        sessionId,
        idempotencyKey: `game.complete:${sessionId}`
      });

      const output = response?.output ?? null;
      const reaction = output?.suppressed === true ? null : output?.reaction ?? null;
      if (reaction) {
        const { pushCompanionReaction } = await import('$lib/stores/companionReactions');
        // A slow response from this round must not interrupt a newer active round.
        if (currentSessionId === null || currentSessionId === sessionId) {
          pushCompanionReaction(reaction);
        }
      }
    } catch (err) {
      // Optional reaction delivery cannot invalidate the server's committed result.
      console.debug('[games/sdk] completion reaction unavailable', err);
    }
  })();

  return completion;
};

const completingSessions = new Map<string, { key: string; promise: Promise<GameSessionServerResult | null> }>();
const stableCompletion = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(stableCompletion).join(',')}]`
  : isRecord(value) ? `{${Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableCompletion(value[key])).join(',')}}`
    : JSON.stringify(value);
const completeWithResult = (sessionId: string, result: GameSessionResult = {}) => {
  const key = stableCompletion({score: result.score, durationMs: result.durationMs, success: result.success,
    stats: result.stats ?? result.extra ?? null});
  const pending = completingSessions.get(sessionId);
  if (pending) {
    if (pending.key !== key) return Promise.reject(new GameClientError({message: SAFE_COMPLETION_MESSAGE,
      kind: 'completion_failed', status: 409, code: 'conflict'}));
    return pending.promise;
  }
  const submitted = submittedResults.get(sessionId);
  if (submitted && submitted.key !== key) return Promise.reject(new GameClientError({message: SAFE_COMPLETION_MESSAGE,
    kind: 'completion_failed', status: 409, code: 'conflict'}));
  // Freeze elapsed duration and nested result fields across an uncertain response.
  // Explicit abandonment forgets this retry context; it never reverses payment.
  const normalized = submitted?.result ?? JSON.parse(JSON.stringify({ ...result,
    score: normalizeScore(result.score), durationMs: resolveDuration(result.durationMs, resolveActiveContext(sessionId))
  })) as GameSessionResult;
  if (!submitted && activeSessions.has(sessionId)) submittedResults.set(sessionId, {key,result:normalized});
  const promise = performCompletion(sessionId, normalized).finally(() => {
    if (completingSessions.get(sessionId)?.promise === promise) completingSessions.delete(sessionId);
  });
  completingSessions.set(sessionId, { key, promise });
  return promise;
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

export const signCompletion = (args: SignArgs) => withCompletionRequestDeadline(async (signal) => {
  const payload = {
    ...args,
    clientVersion: args.clientVersion ?? CLIENT_VERSION
  };
  try {
    const response = await fetch('/api/games/sign', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const { payload: errorPayload, code } = await parseApiErrorPayload(response);
      throw toGameClientError(
        { status: response.status, code },
        'sign',
        response.status,
        code,
        errorPayload
      );
    }

    return (await response.json()) as { signature: string };
  } catch (err) {
    throw toGameClientError(err, 'sign');
  }
});

export const fetchConfig = async () => {
  try {
    const response = await fetch('/api/games/config');
    if (!response.ok) {
      const { payload, code } = await parseApiErrorPayload(response);
      throw toGameClientError(
        { status: response.status, code },
        'load',
        response.status,
        code,
        payload
      );
    }
    return response.json();
  } catch (err) {
    throw toGameClientError(err, 'load');
  }
};

export const fetchPlayerState = async () => {
  try {
    const response = await fetch('/api/games/player/state', { cache: 'no-store' });
    if (!response.ok) {
      const { payload, code } = await parseApiErrorPayload(response);
      throw toGameClientError(
        { status: response.status, code },
        'load',
        response.status,
        code,
        payload
      );
    }
    return response.json();
  } catch (err) {
    throw toGameClientError(err, 'load');
  }
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

  try {
    sendAnalytics(`game_${type}`, {
      payload: enrichedPayload
    });
  } catch (err) {
    // Analytics may encounter blocked localStorage or beacon errors.
    console.debug('[games/sdk] analytics unavailable', err);
  }
};
