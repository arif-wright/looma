import Phaser from 'phaser';
import { GameScene } from '../../../src/lib/games/arpg/scenes/GameScene';
import { fixture, type SceneObservation, type GameplayObservation, type ArtObjectObservation } from './runtime';
import type { World, EntityId } from '../../../src/lib/games/arpg/ecs/components';
import type { Expedition } from '../../../src/lib/games/arpg/expedition';

// Read-only inspection of real scene state. No field, clock, callback, input,
// texture or combat outcome is replaced. Browser input drives the scene.
type ObservedState = {
  initialized: boolean; expedition: Expedition; expeditionActive: boolean;
  durationLimit: number; elapsed: number; world: World; playerId: EntityId | null;
  worldLayer: Phaser.GameObjects.Layer; playerSprite: Phaser.GameObjects.Sprite;
  primaryControl: Phaser.GameObjects.Text; secondaryControl: Phaser.GameObjects.Text;
};
const ART_KEYS = ['town_corner_cobble_patch_v1', 'town_corner_shop_v1', 'town_corner_lantern_v1'];
const readArtObject = (object: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite): ArtObjectObservation => ({
  key: object.texture.key, x: object.x, y: object.y, depth: object.depth, originX: object.originX, originY: object.originY,
  scaleX: object.scaleX, scaleY: object.scaleY
});
function readGameplay(scene: GameScene): GameplayObservation | null {
  const state = scene as unknown as ObservedState;
  if (!state.initialized || state.playerId === null) return null;
  const position = state.world.getTransform(state.playerId), health = state.world.getHealth(state.playerId);
  if (!position || !health) return null;
  const rect = scene.sys.game.canvas.getBoundingClientRect();
  const control = (text: Phaser.GameObjects.Text) => {
    const bounds = text.getBounds();
    return { label: text.text, x: bounds.centerX * rect.width / scene.scale.width, y: bounds.centerY * rect.height / scene.scale.height };
  };
  return { at: performance.now(), area: state.expedition.area, elapsed: state.elapsed,
    durationLimit: state.durationLimit, expeditionActive: state.expeditionActive,
    outcome: state.expedition.outcome, returned: state.expedition.returned,
    x: position.x, y: position.y, hp: health.current, kills: state.expedition.kills,
    townArt: state.expedition.area === 0 ? {
      hero: readArtObject(state.playerSprite),
      objects: state.worldLayer.list.filter((object): object is Phaser.GameObjects.Image => object instanceof Phaser.GameObjects.Image && ART_KEYS.includes(object.texture.key)).map(readArtObject)
    } : null,
    primary: control(state.primaryControl), secondary: control(state.secondaryControl) };
}

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
    loadErrors: [], loadComplete: false, totalFailed: null, framesAfterCreate: 0, destroyed: false, gameplay: null
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
    if (observation.createAt !== null) {
      observation.framesAfterCreate++;
      observation.gameplay = readGameplay(scene);
    }
  });
  game.events.once(Phaser.Core.Events.DESTROY, () => { observation.destroyed = true; });
  return originalPreload.apply(this, args);
};
