import {
  abandonSession,
  completeSession,
  GameClientError,
  startSession,
  watchGameOwner,
  type GameSessionResult,
  type GameSessionServerResult,
  type GameSessionStart,
  type GameSessionStartOptions
} from '$lib/games/sdk';

export type GameIntegrationState = {
  gameId: string;
  session: GameSessionStart | null;
  startedAtMs: number;
  lastServerRewards: GameSessionServerResult | null;
};

export const createGameIntegrationState = (gameId: string): GameIntegrationState => ({
  gameId,
  session: null,
  startedAtMs: 0,
  lastServerRewards: null
});

type PendingStart = {
  controller: AbortController;
  intent: string;
  promise: Promise<GameSessionStart>;
};

const pendingStarts = new WeakMap<GameIntegrationState, PendingStart>();

/** Stop waiting locally. A request already sent may still have created a server session. */
export const cancelGameSessionStart = (state: GameIntegrationState) => {
  const pending = pendingStarts.get(state);
  if (!pending) return;
  pendingStarts.delete(state);
  pending.controller.abort();
};

export const beginGameSession = (
  state: GameIntegrationState,
  mode = 'standard',
  clientMeta: Record<string, unknown> = {},
  options: Pick<GameSessionStartOptions, 'ownerId'> = {}
): Promise<GameSessionStart> => {
  if (state.session) return Promise.reject(new GameClientError({
    message: 'A game session is already active. Finish or abandon that run before starting a new one.',
    kind: 'generic',
    code: 'session_active'
  }));
  const gameId = state.gameId;
  let intent: string;
  try {
    // Conservative equality: never share an owner/game/mode/metadata-mismatched start.
    intent = JSON.stringify([gameId, mode, clientMeta, options.ownerId === undefined ? { unspecified: true } : options.ownerId]);
  } catch (err) {
    return Promise.reject(err);
  }
  const pending = pendingStarts.get(state);
  if (pending) return pending.intent === intent ? pending.promise : Promise.reject(new GameClientError({
    message: 'A different game start is already in progress. Wait for it or cancel it before starting a new run.',
    kind: 'generic',
    code: 'start_in_progress'
  }));

  const controller = new AbortController();
  const attempt = { controller, intent } as PendingStart;
  pendingStarts.set(state, attempt);
  let accountFailure: GameClientError | null = null;
  const stopWatchingOwner = watchGameOwner((ownerId) => {
    if (pendingStarts.get(state) !== attempt) return;
    accountFailure = new GameClientError({
      message: ownerId
        ? 'Your account changed while starting. Refresh the page before starting a new run.'
        : 'You signed out while starting. Sign in before starting a new run.',
      kind: ownerId ? 'generic' : 'unauthorized',
      code: 'start_account_changed'
    });
    cancelGameSessionStart(state);
  }, options.ownerId);
  attempt.promise = (async () => {
    try {
      const session = await startSession(gameId, mode, clientMeta, { ...options, signal: controller.signal });
      if (controller.signal.aborted || pendingStarts.get(state) !== attempt || state.gameId !== gameId) {
        abandonSession(session.sessionId);
        throw new DOMException('Starting was interrupted. Start a new run when ready.', 'AbortError');
      }
      state.session = session;
      state.startedAtMs = Date.now();
      return session;
    } catch (err) {
      throw accountFailure ?? err;
    } finally {
      stopWatchingOwner();
      if (pendingStarts.get(state) === attempt) pendingStarts.delete(state);
    }
  })();
  return attempt.promise;
};

export const finishGameSession = async (
  state: GameIntegrationState,
  result: Pick<GameSessionResult, 'score' | 'success' | 'stats'> & { durationMs?: number }
) => {
  if (!state.session) {
    throw new Error('No active game session. Call beginGameSession() first.');
  }

  const durationMs = Math.max(
    0,
    Math.floor(result.durationMs ?? Date.now() - state.startedAtMs)
  );

  const completionResult: GameSessionResult = {
    durationMs,
    ...(typeof result.score === 'number' ? { score: result.score } : {}),
    ...(typeof result.success === 'boolean' ? { success: result.success } : {}),
    ...(result.stats ? { stats: result.stats } : {})
  };
  const server = await completeSession(state.session.sessionId, completionResult);

  state.lastServerRewards = server ?? null;
  state.session = null;
  state.startedAtMs = 0;

  return server;
};

export const GAME_INTEGRATION_SVELTE_SNIPPET = `<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    beginGameSession,
    cancelGameSessionStart,
    createGameIntegrationState,
    finishGameSession
  } from '$lib/games/GameIntegrationTemplate';

  const state = createGameIntegrationState('your-game-id');
  onDestroy(() => cancelGameSessionStart(state));
  let rewards: { xpDelta?: number; currencyDelta?: number } | null = null;

  const onStart = async () => {
    await beginGameSession(state, 'standard', { clientVersion: '1.0.0' });
  };

  const onGameOver = async (score: number, durationMs: number) => {
    rewards = await finishGameSession(state, {
      score,
      durationMs,
      success: true,
      stats: { mode: 'standard' }
    });
  };
</script>`;
