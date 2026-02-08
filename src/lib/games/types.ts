// Shared types for canvas mini-games

export type LoomaGameResult = {
  score: number;
  durationMs: number;
  meta?: Record<string, number>;
};

export type LoomaPowerupState = {
  shield: boolean;
  magnet: number;
  doubleShards: number;
  slowMo: number;
  dash: number;
  dreamSurge: number;
};

export type LoomaGameInitOptions = {
  canvas: HTMLCanvasElement;
  /** Called once when the game ends */
  onGameOver: (result: LoomaGameResult) => void;
  difficulty?: 'easy' | 'normal' | 'hard';
  audioEnabled?: boolean;
  onShardCollected?: (count: number) => void;
  onPowerupState?: (state: LoomaPowerupState) => void;
};

export type LoomaGameInstance = {
  start(): void;
  destroy(): void;
  pause?(): void;
  resume?(): void;
  reset?(): void;
  playerJump?(): void;
};

export type LoomaGameFactory = (opts: LoomaGameInitOptions) => LoomaGameInstance;

export type GameSessionStartRequest = {
  gameId: string;
  mode?: string;
  clientMeta?: Record<string, unknown>;
};

export type GameSessionResults = {
  score?: number;
  durationMs?: number;
  success?: boolean;
  stats?: Record<string, unknown>;
} & Record<string, unknown>;

export type GameSessionCompleteRequest = {
  sessionId: string;
  results: GameSessionResults;
};
