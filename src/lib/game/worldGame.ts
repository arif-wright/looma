import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from './config';
import { WorldScene, type TouchDirection } from './WorldScene';
import type { GameRuntime } from './lifecycle';
import type { ConnectionDiagnostic, ConnectionStatus } from './protocol';
import type { GatherResult } from './protocol';
import { WorldConnection } from './worldConnection';

const WORLD_GAME_KEY = Symbol.for('memvoya.world.phaser');

type ActiveWorldGame = { destroy: () => void };

const globalRegistry = globalThis as typeof globalThis & {
  [WORLD_GAME_KEY]?: ActiveWorldGame;
};

export type WorldGameRuntime = GameRuntime & {
  setTouchDirection: (x: number, y: number) => void;
  interact: () => void;
};

export type WorldGameOptions = {
  serverUrl: string | null;
  onConnectionStatus: (status: ConnectionStatus) => void;
  onConnectionDiagnostic: (diagnostic: ConnectionDiagnostic | null) => void;
  onGatherPrompt: (visible: boolean) => void;
  onGatherResult: (result: GatherResult) => void;
};

export const createWorldGame = (host: HTMLElement, options: WorldGameOptions): WorldGameRuntime => {
  globalRegistry[WORLD_GAME_KEY]?.destroy();

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
  const connection = options.serverUrl
    ? new WorldConnection(options.serverUrl, {
        onStatus: options.onConnectionStatus,
        onDiagnostic: options.onConnectionDiagnostic,
        onSnapshot: (snapshot) => scene.applyNetworkSnapshot(snapshot),
        onGatherResult: options.onGatherResult
      })
    : null;
  scene.setMovementSender((intent) => connection?.sendMovement(intent));
  scene.setInteractionHandlers(() => connection?.gatherMoonberry(), options.onGatherPrompt);
  if (connection) void connection.connect();
  else {
    options.onConnectionDiagnostic({ code: 'configuration_missing' });
    options.onConnectionStatus('offline');
  }

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
    interact: () => connection?.gatherMoonberry(),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      touchDirection.x = 0;
      touchDirection.y = 0;
      connection?.destroy();
      game.destroy(true);
      if (globalRegistry[WORLD_GAME_KEY] === runtime) {
        delete globalRegistry[WORLD_GAME_KEY];
      }
    }
  };

  globalRegistry[WORLD_GAME_KEY] = runtime;
  return runtime;
};
