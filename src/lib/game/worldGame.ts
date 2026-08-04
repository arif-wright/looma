import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from './config';
import { WorldScene, type TouchDirection } from './WorldScene';
import type { GameRuntime } from './lifecycle';
import type { WorldSession } from './worldSession';

export type WorldGameRuntime = GameRuntime & {
  setTouchDirection: (x: number, y: number) => void;
  interact: () => void;
};

export type WorldGameOptions = {
  session: WorldSession;
  onGatherPrompt: (visible: boolean) => void;
};

export const createWorldGame = (host: HTMLElement, options: WorldGameOptions): WorldGameRuntime => {
  const touchDirection: TouchDirection = { x: 0, y: 0 };
  const scene = new WorldScene(touchDirection);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    backgroundColor: '#101d2a',
    pixelArt: false,
    antialias: true,
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false }
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT
    },
    scene: [scene]
  });
  options.session.setSnapshotConsumer((snapshot) => scene.applyNetworkSnapshot(snapshot));
  scene.setMovementSender((intent) => options.session.sendMovement(intent));
  scene.setInteractionHandlers(() => options.session.gatherMoonberry(), options.onGatherPrompt);

  let destroyed = false;
  const runtime: WorldGameRuntime = {
    resize: () => game.scale.refresh(),
    pause: () => {
      if (!destroyed) game.loop.sleep();
    },
    resume: () => {
      if (!destroyed) game.loop.wake();
    },
    setTouchDirection: (x, y) => {
      touchDirection.x = x;
      touchDirection.y = y;
    },
    interact: () => options.session.gatherMoonberry(),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      touchDirection.x = 0;
      touchDirection.y = 0;
      options.session.setSnapshotConsumer(null);
      game.destroy(true);
    }
  };

  return runtime;
};
