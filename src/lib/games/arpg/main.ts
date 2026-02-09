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
      import('./scenes/GameScene')
    ]);

    GameScene.setGameHandlers({ onGameOver: opts.onGameOver });

    activeGame = new Phaser.Game({
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
        arcade: {
          debug: false,
          gravity: { x: 0, y: 0 }
        }
      },
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
