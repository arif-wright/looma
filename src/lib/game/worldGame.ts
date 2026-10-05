import Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from './config';
import { WorldScene, type TouchDirection } from './WorldScene';
import type { GameRuntime } from './lifecycle';
import { getWorldArea, type WorldArea, type WorldPortal } from './areas';
import type { WorldSession } from './worldSession';

export type WorldGameRuntime = GameRuntime & {
  setTouchDirection: (x: number, y: number) => void;
  interact: () => void;
  enterPortal: () => void;
};

export type WorldGameOptions = {
  session: WorldSession;
  onGatherPrompt: (visible: boolean) => void;
  onPortalPrompt?: (portal: WorldPortal | null) => void;
  onAreaChange?: (area: WorldArea) => void;
};

export const createWorldGame = (host: HTMLElement, options: WorldGameOptions): WorldGameRuntime => {
  let activePortal: WorldPortal | null = null;
  let currentAreaId = '';
  let paused = false;
  let focused = document.hasFocus();
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
  options.session.setSnapshotConsumer((snapshot) => {
    scene.applyNetworkSnapshot(snapshot);
    const local = snapshot.players.get(snapshot.localPlayerId);
    if (local && (local.mapId ?? 'wilds-exploration') !== currentAreaId) {
      currentAreaId = local.mapId ?? 'wilds-exploration';
      options.onAreaChange?.(getWorldArea(currentAreaId));
    }
  });
  const refreshInput = () => scene.setConnectionActive(!paused && focused && options.session.connectionStatus === 'connected');
  const onBlur = () => { focused = false; options.session.stopMovement(); refreshInput(); };
  const onFocus = () => { focused = true; refreshInput(); };
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  options.session.setStatusConsumer(refreshInput);
  scene.setPortalHandlers(() => { if (activePortal) options.session.enterPortal(activePortal.id); }, (portal) => {
    activePortal = portal; options.onPortalPrompt?.(portal);
  });
  scene.setMovementSender((intent) => options.session.sendMovement(intent));
  scene.setInteractionHandlers(() => options.session.gatherMoonberry(), options.onGatherPrompt);

  let destroyed = false;
  const runtime: WorldGameRuntime = {
    resize: () => game.scale.refresh(),
    pause: () => {
      if (!destroyed) {
        paused = true;
        options.session.stopMovement();
        scene.setConnectionActive(false);
        game.loop.sleep();
      }
    },
    resume: () => {
      if (!destroyed) {
        paused = false;
        refreshInput();
        game.loop.wake();
      }
    },
    setTouchDirection: (x, y) => {
      touchDirection.x = x;
      touchDirection.y = y;
    },
    interact: () => options.session.gatherMoonberry(),
    enterPortal: () => { if (activePortal) options.session.enterPortal(activePortal.id); },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      touchDirection.x = 0;
      touchDirection.y = 0;
      options.session.stopMovement();
      options.session.setSnapshotConsumer(null);
      options.session.setStatusConsumer(null);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      game.destroy(true);
    }
  };

  return runtime;
};
