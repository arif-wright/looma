type PhaserGameInstance = import('phaser').Game;

let activeGame: PhaserGameInstance | null = null;
let activeParent: HTMLDivElement | null = null;
let removeActiveAbortListener: (() => void) | null = null;
let bootGeneration = 0;
let pendingParent: HTMLDivElement | null = null;
const importGame = () => Promise.all([import('phaser'), import('./scenes/GameScene')]);
let pendingImports: ReturnType<typeof importGame> | null = null;
const loadGame = () => {
  if (!pendingImports) pendingImports = importGame().finally(() => { pendingImports = null; });
  return pendingImports;
};

export type BootOptions = {
  onGameOver: (score: number) => void;
  signal?: AbortSignal;
};

const interrupted = () => new DOMException('Game loading was interrupted.', 'AbortError');

export const bootGame = async (parent: HTMLDivElement, opts: BootOptions) => {
  if (typeof window === 'undefined') return;
  if (!parent) throw new Error('Game container missing');
  if (opts.signal?.aborted) throw interrupted();

  const generation = ++bootGeneration;
  pendingParent = parent;
  let ownedGame: PhaserGameInstance | null = null;
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    rejectAbort(interrupted());
    // A late cancellation belongs only to the instance created by this boot.
    if (ownedGame && activeGame === ownedGame) {
      activeGame.destroy(true);
      activeGame = null;
      activeParent = null;
      removeActiveAbortListener?.();
      removeActiveAbortListener = null;
    }
  };
  const removeAbortListener = () => opts.signal?.removeEventListener('abort', onAbort);
  opts.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const [{ default: Phaser }, { GameScene }] = await Promise.race([
      loadGame(),
      aborted
    ]);
    if (generation !== bootGeneration || opts.signal?.aborted) throw interrupted();

    removeActiveAbortListener?.();
    activeGame?.destroy(true);
    activeGame = null;
    activeParent = null;

    GameScene.setGameHandlers({ onGameOver: opts.onGameOver });
    ownedGame = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#05060a',
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      width: 960,
      height: 540,
      physics: {
        default: 'arcade',
        arcade: { debug: false, gravity: { x: 0, y: 0 } }
      },
      scene: [GameScene]
    });
    if (generation !== bootGeneration || opts.signal?.aborted) {
      ownedGame.destroy(true);
      throw interrupted();
    }
    activeGame = ownedGame;
    activeParent = parent;
    removeActiveAbortListener = removeAbortListener;
  } finally {
    if (generation === bootGeneration) pendingParent = null;
    if (!ownedGame || activeGame !== ownedGame) removeAbortListener();
  }
};

/** An optional container limits cleanup to this page's boot and game. */
export const shutdownGame = (parent?: HTMLDivElement) => {
  if (!parent || pendingParent === parent) {
    ++bootGeneration;
    pendingParent = null;
  }
  if (!parent || activeParent === parent) {
    removeActiveAbortListener?.();
    removeActiveAbortListener = null;
    activeGame?.destroy(true);
    activeGame = null;
    activeParent = null;
  }
};
