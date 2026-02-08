import {
  completeSession,
  startSession,
  type GameSessionResult,
  type GameSessionServerResult,
  type GameSessionStart
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

export const beginGameSession = async (
  state: GameIntegrationState,
  mode = 'standard',
  clientMeta: Record<string, unknown> = {}
) => {
  state.session = await startSession(state.gameId, mode, clientMeta);
  state.startedAtMs = Date.now();
  return state.session;
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

  const server = await completeSession(state.session.sessionId, {
    score: result.score,
    durationMs,
    success: result.success,
    stats: result.stats
  });

  state.lastServerRewards = server ?? null;
  state.session = null;
  state.startedAtMs = 0;

  return server;
};

export const GAME_INTEGRATION_SVELTE_SNIPPET = `<script lang="ts">
  import {
    beginGameSession,
    createGameIntegrationState,
    finishGameSession
  } from '$lib/games/GameIntegrationTemplate';

  const state = createGameIntegrationState('your-game-id');
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
