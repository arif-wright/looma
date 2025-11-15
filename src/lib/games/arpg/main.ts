type PhaserGameInstance = import('phaser').Game;

let activeGame: PhaserGameInstance | null = null;
let booting: Promise<void> | null = null;

export type BootOptions = {
  onGameOver: (score: number) => void;
};

export const bootGame = async (parent: HTMLDivElement, opts: BootOptions) => {
  if (typeof window === 'undefined') return;
  if (!parent) throw new Error('Game container missing');
  if (booting) {
    await booting;
  }

  const start = async () => {
    if (activeGame) {
      activeGame.destroy(true);
      activeGame = null;
    }

    const [{ default: Phaser }, { GameScene }] = await Promise.all([
      import('phaser'),
      import('./GameScene')
    ]);

    GameScene.setGameHandlers({ onGameOver: opts.onGameOver });

    activeGame = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#05060a',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 960,
        height: 540
      },
      width: 960,
      height: 540,
      scene: [GameScene]
    });
  };

  booting = start();
  await booting;
  booting = null;
};

export const shutdownGame = () => {
  if (activeGame) {
    activeGame.destroy(true);
    activeGame = null;
  }
};
