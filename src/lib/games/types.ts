// Shared types for canvas mini-games

export type LoomaGameResult = {
  score: number;
  durationMs: number;
  meta?: Record<string, number>;
};

export type LoomaGameInitOptions = {
  canvas: HTMLCanvasElement;
  /** Called once when the game ends */
  onGameOver: (result: LoomaGameResult) => void;
  difficulty?: 'easy' | 'normal' | 'hard';
  audioEnabled?: boolean;
};

export type LoomaGameInstance = {
  start(): void;
  destroy(): void;
  pause?(): void;
  resume?(): void;
  reset?(): void;
};

export type LoomaGameFactory = (opts: LoomaGameInitOptions) => LoomaGameInstance;
