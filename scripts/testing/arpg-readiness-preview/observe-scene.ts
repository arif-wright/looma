import Phaser from 'phaser';
import { GameScene } from '../../../src/lib/games/arpg/scenes/GameScene';
import { fixture, type SceneObservation } from './runtime';

// Observation only: execute the real preload unchanged and listen to genuine
// loader/scene/game events. Never call a readiness callback or simulate CREATE.
const originalPreload = GameScene.prototype.preload;
GameScene.prototype.preload = function (...args: Parameters<typeof originalPreload>) {
  const scene = this;
  const game = scene.sys.game;
  const container = game.canvas.parentElement ?? (game.config.parent instanceof HTMLElement ? game.config.parent : null);
  const parent = container?.closest<HTMLElement>('[data-fixture-page]');
  const observation: SceneObservation = {
    id: fixture.scenes.length + 1, pageId: parent ? Number(parent.dataset.fixturePage) : null,
    preloadAt: performance.now(), createAt: null, queuedKeys: [], decodedKeys: [], missingKeys: [],
    loadErrors: [], loadComplete: false, totalFailed: null, framesAfterCreate: 0, destroyed: false
  };
  fixture.scenes.push(observation);
  scene.load.on(Phaser.Loader.Events.ADD, (key: string, type: string) => {
    if (type === 'image') observation.queuedKeys.push(key);
  });
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => observation.loadErrors.push(file.key));
  scene.load.once(Phaser.Loader.Events.COMPLETE, (_loader: Phaser.Loader.LoaderPlugin, _complete: number, failed: number) => {
    observation.loadComplete = true;
    observation.totalFailed = failed;
    observation.decodedKeys = observation.queuedKeys.filter(key => scene.textures.exists(key));
    observation.missingKeys = observation.queuedKeys.filter(key => !scene.textures.exists(key));
  });
  scene.events.once(Phaser.Scenes.Events.CREATE, () => { observation.createAt = performance.now(); });
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    if (observation.createAt !== null) observation.framesAfterCreate++;
  });
  game.events.once(Phaser.Core.Events.DESTROY, () => { observation.destroyed = true; });
  return originalPreload.apply(this, args);
};
