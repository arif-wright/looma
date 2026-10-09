type PhaserGameInstance = import('phaser').Game;

type BootOwner = { parent: HTMLDivElement; cancel: () => void };
let activeBoot: BootOwner | null = null;
const importGame = () => Promise.all([import('phaser'), import('./scenes/GameScene')]);
let pendingImports: ReturnType<typeof importGame> | null = null;
const loadGame = () => {
  if (!pendingImports) pendingImports = importGame().finally(() => { pendingImports = null; });
  return pendingImports;
};

export type TownStatus = 'ready' | 'starting' | 'saving' | 'retry' | 'blocked';
export type ArpgControls = {
  beginExpedition: (maxDurationMs: number) => void;
  setTownStatus: (status: TownStatus, message?: string) => void;
};

export type BootOptions = {
  onGameOver: (score: number, durationMs?: number) => void;
  onDepartureRequested?: () => void;
  onRetryRequested?: () => void;
  onControls?: (controls: ArpgControls) => void;
  signal?: AbortSignal;
};

const interrupted = () => new DOMException('Game loading was interrupted.', 'AbortError');

/** Resolves after the owned scene finishes initialization, not at renderer construction. */
export const bootGame = async (parent: HTMLDivElement, opts: BootOptions) => {
  if (typeof window === 'undefined') return;
  if (!parent) throw new Error('Game container missing');
  if (opts.signal?.aborted) throw interrupted();

  let ownedGame: PhaserGameInstance | null = null;
  let cancelled = false;
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    rejectAbort(interrupted());
    opts.signal?.removeEventListener('abort', cancel);
    // Phaser destruction is deferred to its next frame. Scene callbacks must
    // also check this owner before that frame can remove the old renderer.
    ownedGame?.destroy(true);
    ownedGame = null;
    if (activeBoot === owner) activeBoot = null;
  };
  const owner: BootOwner = { parent, cancel };
  const isCurrent = () => activeBoot === owner && !cancelled && !opts.signal?.aborted;
  activeBoot?.cancel();
  activeBoot = owner;
  opts.signal?.addEventListener('abort', cancel, { once: true });

  try {
    const [{ default: Phaser }, { GameScene }] = await Promise.race([loadGame(), aborted]);
    if (!isCurrent()) throw interrupted();

    let resolveReady!: () => void;
    let rejectReady!: (reason: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const scene = new GameScene({
      isCurrent,
      onReady: resolveReady,
      onError: rejectReady,
      onDepartureRequested: () => { if (isCurrent()) opts.onDepartureRequested?.(); },
      onRetryRequested: () => { if (isCurrent()) opts.onRetryRequested?.(); },
      onGameOver: (score, durationMs) => {
        if (isCurrent()) {
          if (durationMs === undefined) opts.onGameOver(score);
          else opts.onGameOver(score, durationMs);
        }
      }
    });
    // Attach the failure handlers before constructing Phaser: boot callbacks
    // can run synchronously when the document and textures are already ready.
    const initialized = Promise.race([ready, aborted]);
    // A constructor throw skips the await below; still observe later cancellation.
    void initialized.catch(() => {});
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
      scene: [scene]
    });
    if (!isCurrent()) {
      ownedGame.destroy(true);
      ownedGame = null;
      throw interrupted();
    }
    await initialized;
    if (!isCurrent()) throw interrupted();
    opts.onControls?.({
      beginExpedition: (maxDurationMs) => { if (isCurrent()) scene.beginExpedition(maxDurationMs); },
      setTownStatus: (status, message) => { if (isCurrent()) scene.setTownStatus(status, message); }
    });
  } catch (error) {
    cancel();
    throw error;
  }
};

/** An optional container limits cleanup to this page's boot and game. */
export const shutdownGame = (parent?: HTMLDivElement) => {
  if (!parent || activeBoot?.parent === parent) activeBoot?.cancel();
};
