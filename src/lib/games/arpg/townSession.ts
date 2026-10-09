import type { GameSessionServerResult, GameSessionStart } from '../sdk';

/** Town time is unlimited. This is the inherited expedition limit, not a reward rule. */
export const ARPG_EXPEDITION_LIMIT_MS = 90_000;

export type TownSessionPhase =
  | 'ready' | 'starting' | 'expedition' | 'waiting' | 'saving' | 'retry' | 'rejected' | 'blocked' | 'disposed';

export type TownSessionIssue = {
  context: 'start' | 'complete' | 'caps' | 'entry';
  error: unknown;
  sessionCreated?: boolean;
};

export type TownSessionState = Readonly<{
  phase: TownSessionPhase;
  issue: TownSessionIssue | null;
  waitMs: number;
}>;

export type FrozenExpeditionResult = Readonly<{
  score: number;
  durationMs: number;
  success: boolean;
  stats: Readonly<Record<string, unknown>>;
}>;

type SessionDependencies = {
  start: (signal: AbortSignal) => Promise<GameSessionStart>;
  beginExpedition: (maxDurationMs: number) => void;
  sign: (session: GameSessionStart, result: FrozenExpeditionResult) => Promise<string>;
  complete: (
    session: GameSessionStart, result: FrozenExpeditionResult, signature: string
  ) => Promise<GameSessionServerResult>;
  /** Local bookkeeping only. This never cancels a server session. */
  abandon: (sessionId: string) => void;
  onState: (state: TownSessionState) => void;
  onSettled: (result: GameSessionServerResult, isCurrent: () => boolean) => void;
  /** A monotonic clock. Wall-clock adjustments must not create expedition time. */
  now: () => number;
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/** Fail closed when the server cannot accommodate this bounded expedition. */
export const resolveExpeditionCaps = (caps: GameSessionStart['caps']) => {
  const minimum = caps.minDurationMs;
  const maximum = caps.maxDurationMs;
  if (!Number.isSafeInteger(minimum) || minimum < 0 ||
      !Number.isSafeInteger(maximum) || maximum < Math.max(1, minimum)) {
    throw new Error('The server returned invalid expedition timing limits.');
  }
  const limit = Math.min(ARPG_EXPEDITION_LIMIT_MS, maximum);
  if (minimum > limit) {
    throw new Error('The server minimum is longer than this expedition supports.');
  }
  return { minimum, limit };
};

/**
 * Owns one reward session at a time, independently of the persistent town scene.
 * No transport, Svelte, Phaser, account-state, or reward-policy side effects live here.
 * A return fixes gameplay data; an uncertain save keeps the exact same submission.
 */
export const createTownSession = (deps: SessionDependencies) => {
  let state: TownSessionState = Object.freeze({ phase: 'ready', issue: null, waitMs: 0 });
  let generation = 0;
  let disposed = false;
  let startController: AbortController | null = null;
  let session: GameSessionStart | null = null;
  let startedAt = 0;
  let caps = { minimum: 0, limit: ARPG_EXPEDITION_LIMIT_MS };
  let result: FrozenExpeditionResult | null = null;
  let pendingWait: { timer: ReturnType<typeof setTimeout>; resolve: () => void } | null = null;

  const current = (owner: number) => !disposed && generation === owner;
  const update = (phase: TownSessionPhase, issue: TownSessionIssue | null = null, waitMs = 0) => {
    if (disposed) return;
    state = Object.freeze({ phase, issue, waitMs });
    deps.onState(state);
  };
  const forget = () => {
    if (session) deps.abandon(session.sessionId);
    session = null;
    result = null;
  };

  const depart = async () => {
    if (disposed || state.phase !== 'ready') return;
    const owner = ++generation;
    // Acquire the singleflight guard before calling start or crossing an await.
    update('starting');
    const controller = new AbortController();
    startController = controller;
    let created: GameSessionStart | null = null;
    try {
      created = await deps.start(controller.signal);
      if (!current(owner)) {
        deps.abandon(created.sessionId);
        return;
      }
      session = created;
      try {
        caps = resolveExpeditionCaps(created.caps);
      } catch (error) {
        forget();
        update('blocked', { context: 'caps', error });
        return;
      }
      startedAt = deps.now();
      update('expedition');
      deps.beginExpedition(caps.limit);
    } catch (error) {
      if (!current(owner)) return;
      forget();
      // Scene entry can fail after mutating its world. Never open another server
      // session against that partial scene; the host must reload it first.
      if (created) update('blocked', { context: 'entry', error, sessionCreated: true });
      else update('ready', { context: 'start', error, sessionCreated: false });
    } finally {
      if (current(owner)) startController = null;
    }
  };

  const save = async () => {
    if (disposed || !session || !result ||
        !['expedition', 'waiting', 'retry'].includes(state.phase)) return;
    const owner = generation;
    const ownedSession = session;
    const ownedResult = result;
    update('saving');
    let receipt: GameSessionServerResult;
    try {
      const signature = await deps.sign(ownedSession, ownedResult);
      // A stale sign response must never cause a completion for a different owner.
      if (!current(owner)) return;
      receipt = await deps.complete(ownedSession, ownedResult, signature);
      if (!current(owner)) return;
    } catch (error) {
      if (!current(owner)) return;
      const code = (error as { code?: string })?.code;
      const rejected = ['invalid_input', 'invalid_score', 'invalid_score_rate', 'invalid_duration',
        'conflict', 'client_outdated', 'game_unavailable'].includes(code ?? '');
      update(rejected ? 'rejected' : 'retry', { context: 'complete', error });
      return;
    }
    // The receipt is authoritative. Forget only after confirmed success, never
    // in finally: losing a receipt must preserve the session and frozen retry.
    forget();
    update('ready');
    try {
      deps.onSettled(receipt, () => current(owner));
    } catch (error) {
      // Presentation must not turn a confirmed save into a retry with no context.
      console.warn('[arpg] result saved but reward presentation failed', error);
    }
  };

  const returnToTown = async (
    score: number, durationMs?: number, success = true, stats: Record<string, unknown> = { mode: 'standard' }
  ) => {
    if (disposed || state.phase !== 'expedition' || !session || result) return;
    const owner = generation;
    const elapsed = Math.max(0, Math.floor(deps.now() - startedAt));
    const reported = typeof durationMs === 'number' && Number.isFinite(durationMs)
      ? Math.max(0, Math.floor(durationMs)) : elapsed;
    const expeditionDurationMs = Math.min(reported, elapsed, caps.limit);
    // Never wait to satisfy a score rate. Minimum duration is existing protocol;
    // actual gameplay duration remains explicit, and delayed timers add no time.
    const submissionDurationMs = Math.max(1, caps.minimum, expeditionDurationMs);
    result = deepFreeze({
      score: Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0,
      durationMs: submissionDurationMs,
      success,
      stats: { ...JSON.parse(JSON.stringify(stats)), expeditionDurationMs }
    });
    let remaining = submissionDurationMs - (deps.now() - startedAt);
    while (current(owner) && remaining > 0) {
      update('waiting', null, Math.ceil(remaining));
      await new Promise<void>((resolve) => {
        pendingWait = {
          timer: setTimeout(() => { pendingWait = null; resolve(); }, Math.ceil(remaining)),
          resolve
        };
      });
      remaining = submissionDurationMs - (deps.now() - startedAt);
    }
    if (current(owner)) await save();
  };

  const retry = async () => {
    if (state.phase === 'retry') await save();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ++generation;
    startController?.abort();
    startController = null;
    if (pendingWait) {
      clearTimeout(pendingWait.timer);
      pendingWait.resolve();
      pendingWait = null;
    }
    forget();
    state = Object.freeze({ phase: 'disposed', issue: null, waitMs: 0 });
  };

  return { depart, returnToTown, retry, dispose, get state() { return state; } };
};

export type TownSession = ReturnType<typeof createTownSession>;
