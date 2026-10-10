import Phaser from 'phaser';
import { scanAlphaBounds, VISIBLE_ALPHA_THRESHOLD } from './alpha-bounds.mjs';
import { GameScene } from '../../../src/lib/games/arpg/scenes/GameScene';
import { fixture, type SceneObservation, type GameplayObservation, type ArtObjectObservation, type ScreenRect, type ViewportGeometry, type TownGroundObservation, type VisibleSpriteObservation } from './runtime';
import type { World, EntityId } from '../../../src/lib/games/arpg/ecs/components';
import type { Expedition } from '../../../src/lib/games/arpg/expedition';

// Read-only inspection of real scene state. No field, clock, callback, input,
// texture or combat outcome is replaced. Browser input drives the scene.
type ObservedState = {
  movementInput: { x: number; y: number }; initialized: boolean; expedition: Expedition; expeditionActive: boolean;
  durationLimit: number; elapsed: number; world: World; playerId: EntityId | null;
  worldLayer: Phaser.GameObjects.Layer; playerSprite: Phaser.GameObjects.Sprite;
  uiCamera?: Phaser.Cameras.Scene2D.Camera;
  hudPanel: Phaser.GameObjects.Rectangle; controlPanel: Phaser.GameObjects.Rectangle;
  instructionsText: Phaser.GameObjects.Text; scoreText: Phaser.GameObjects.Text; hpText: Phaser.GameObjects.Text;
  areaText: Phaser.GameObjects.Text; portalText: Phaser.GameObjects.Text; controlStatus: Phaser.GameObjects.Text;
  primaryControl: Phaser.GameObjects.Text; secondaryControl: Phaser.GameObjects.Text;
};
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
const objectId = (object: object) => { if (!objectIds.has(object)) objectIds.set(object, nextObjectId++); return objectIds.get(object)!; };
const ART_KEYS = ['town_ground_plane_v1', 'town_corner_shop_v1', 'town_corner_lantern_v1', 'town_ruins_entrance_v1'];
const readArtObject = (object: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite): ArtObjectObservation => ({
  alpha: object.alpha, key: object.texture.key, x: object.x, y: object.y, depth: object.depth, originX: object.originX, originY: object.originY,
  scaleX: object.scaleX, scaleY: object.scaleY, displayWidth: object.displayWidth, displayHeight: object.displayHeight
});
// Read the actual derived floor canvas only. No draw, texture replacement or
// synthetic readiness: these five points sample the hero-to-gate walking line.
function readTownGround(state: ObservedState, hero: { x: number; y: number }): TownGroundObservation {
  const images = state.worldLayer.list.filter((object): object is Phaser.GameObjects.Image => object instanceof Phaser.GameObjects.Image);
  const plane = images.find(image => image.texture.key === 'town_ground_plane_v1');
  const source = plane?.texture.getSourceImage();
  const canvas = source instanceof HTMLCanvasElement ? source : null;
  const context = canvas?.getContext('2d');
  const samples = Array.from({ length: 5 }, (_, index) => {
    const t = index / 4, worldX = hero.x + (1728 - hero.x) * t, worldY = hero.y + (664 - hero.y) * t;
    const local = plane?.getWorldTransformMatrix().applyInverse(worldX, worldY);
    const pixelX = local && plane ? Math.floor(local.x + plane.displayOriginX) : -1;
    const pixelY = local && plane ? Math.floor(local.y + plane.displayOriginY) : -1;
    const inBounds = canvas && pixelX >= 0 && pixelY >= 0 && pixelX < canvas.width && pixelY < canvas.height;
    return { worldX, worldY, pixelX, pixelY, alpha: context && inBounds ? context.getImageData(pixelX, pixelY, 1, 1).data[3]! : null };
  });
  return { legacyFloorCount: images.filter(image => /^floor_\d+$/.test(image.texture.key)).length,
    largeMarkerCount: state.worldLayer.list.filter(object => object instanceof Phaser.GameObjects.Ellipse && object.width >= 120 && object.height >= 50).length,
    textureWidth: canvas?.width ?? 0, textureHeight: canvas?.height ?? 0, filterMode: plane?.frame.source.scaleMode ?? null, samples };
}
const alphaCache = new WeakMap<Phaser.Textures.Frame, ReturnType<typeof scanAlphaBounds>>();
function decodedAlphaBounds(frame: Phaser.Textures.Frame) {
  if (alphaCache.has(frame)) return alphaCache.get(frame)!;
  // Copy the already decoded frame into a detached analysis canvas at 1:1.
  // It is never appended, registered with Phaser, rendered, or used as art.
  const analysis = document.createElement('canvas');
  analysis.width = frame.cutWidth; analysis.height = frame.cutHeight;
  const context = analysis.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Decoded alpha inspection requires a 2D context');
  context.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight);
  const alpha = scanAlphaBounds(context.getImageData(0, 0, analysis.width, analysis.height).data, analysis.width, analysis.height);
  alphaCache.set(frame, alpha);
  return alpha;
}
// Bounded source-alpha diagnostic, not a GPU screenshot substitute. Read only
// already decoded sprites above the hero. Sample every third opaque source
// pixel and compose their actual alpha at the hero's transformed world point.
const pixelCache = new WeakMap<Phaser.Textures.Frame, ImageData>();
function decodedPixels(frame: Phaser.Textures.Frame) {
  let data = pixelCache.get(frame);
  if (!data) {
    const canvas = document.createElement('canvas');
    canvas.width = frame.cutWidth; canvas.height = frame.cutHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Decoded visibility inspection needs a 2D context');
    context.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight);
    data = context.getImageData(0, 0, frame.cutWidth, frame.cutHeight);
    pixelCache.set(frame, data);
  }
  return data;
}
function readHeroVisibility(scene: GameScene, state: ObservedState) {
  const hero = state.playerSprite, pixels = decodedPixels(hero.frame), bounds = decodedAlphaBounds(hero.frame);
  if (!bounds) return { samples: 0, readable: 0, meanTransmission: 0, occluders: [] };
  const above = state.worldLayer.list.filter((o): o is Phaser.GameObjects.Image => o instanceof Phaser.GameObjects.Image && o.visible && o.active && o.alpha > 0 && o.depth > hero.depth);
  const transform = hero.getWorldTransformMatrix(), occluders = new Set<string>();
  let samples = 0, readable = 0, total = 0;
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 3) for (let x = bounds.x; x < bounds.x + bounds.width; x += 3) {
    if (pixels.data[(y * pixels.width + x) * 4 + 3]! < 128) continue;
    const localX = hero.frame.x + (hero.flipX ? pixels.width - x - .5 : x + .5) - hero.displayOriginX;
    const localY = hero.frame.y + (hero.flipY ? pixels.height - y - .5 : y + .5) - hero.displayOriginY;
    const world = transform.transformPoint(localX, localY);
    let transmission = 1;
    for (const object of above) {
      // Both use the main camera; its matrix cancels. Compensate each
      // object's scroll factor before inversion (vignette is screen-fixed).
      const camera = scene.cameras.main;
      const local = object.getWorldTransformMatrix().applyInverse(
        world.x - camera.scrollX * (hero.scrollFactorX - object.scrollFactorX),
        world.y - camera.scrollY * (hero.scrollFactorY - object.scrollFactorY));
      let px = local.x + object.displayOriginX - object.frame.x, py = local.y + object.displayOriginY - object.frame.y;
      if (object.flipX) px = object.frame.cutWidth - px;
      if (object.flipY) py = object.frame.cutHeight - py;
      const ix = Math.floor(px), iy = Math.floor(py);
      if (ix < 0 || iy < 0 || ix >= object.frame.cutWidth || iy >= object.frame.cutHeight) continue;
      const data = decodedPixels(object.frame), alpha = data.data[(iy * data.width + ix) * 4 + 3]! / 255 * object.alpha;
      if (alpha > 0) { transmission *= 1 - alpha; occluders.add(object.name || object.texture.key); }
    }
    samples++; total += transmission; if (transmission >= .5) readable++;
  }
  return { samples, readable, meanTransmission: samples ? total / samples : 0, occluders: [...occluders].sort() };
}
type RenderCamera = Phaser.Cameras.Scene2D.Camera & { readonly matrix: Phaser.GameObjects.Components.TransformMatrix };
// Phaser keeps its rendered matrix internally; this type exposes it read-only.
// Project actual post-render bounds with Phaser's current camera matrix and
// scroll. No import of viewportLayout or recomputation of its desired layout.
function readViewportGeometry(scene: GameScene, state: ObservedState, css: DOMRect, ground: { x: number; y: number }): ViewportGeometry | null {
  const main = scene.cameras.main as RenderCamera, ui = state.uiCamera as RenderCamera | undefined;
  if (!ui) return null;
  const point = (camera: RenderCamera, x: number, y: number) => {
    const transformed = camera.matrix.transformPoint(x - camera.scrollX, y - camera.scrollY);
    return { x: transformed.x * css.width / scene.scale.width, y: transformed.y * css.height / scene.scale.height };
  };
  const bounds = (camera: RenderCamera, object: { getBounds(): Phaser.Geom.Rectangle }): ScreenRect => {
    const rect = object.getBounds();
    const points = [point(camera, rect.left, rect.top), point(camera, rect.right, rect.top), point(camera, rect.left, rect.bottom), point(camera, rect.right, rect.bottom)];
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
  };
  const visibleSprite = (object: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite): VisibleSpriteObservation | null => {
    const alpha = decodedAlphaBounds(object.frame);
    if (!alpha) return null;
    const transform = object.getWorldTransformMatrix();
    const left = object.frame.x + alpha.x - object.displayOriginX;
    const top = object.frame.y + alpha.y - object.displayOriginY;
    const points = [[left, top], [left + alpha.width, top], [left, top + alpha.height], [left + alpha.width, top + alpha.height]].map(([x, y]) => {
      const world = transform.transformPoint(x!, y!);
      return point(main, world.x, world.y);
    });
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return { textureKey: object.texture.key, alphaThreshold: VISIBLE_ALPHA_THRESHOLD, frameWidth: object.frame.cutWidth, frameHeight: object.frame.cutHeight,
      sourceBounds: alpha, screenBounds: { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y } };
  };
  const texts = (entries: Array<[string, Phaser.GameObjects.Text]>) => entries.filter(([, text]) => text.visible && text.text.length > 0).map(([name, text]) => ({ name, bounds: bounds(ui, text) }));
  const entrance = state.worldLayer.list.find((object): object is Phaser.GameObjects.Image => object instanceof Phaser.GameObjects.Image && object.texture.key === 'town_ruins_entrance_v1');
  const shop = state.worldLayer.list.find((object): object is Phaser.GameObjects.Image => object instanceof Phaser.GameObjects.Image && object.texture.key === 'town_corner_shop_v1');
  return {
    canvas: { width: css.width, height: css.height },
    camera: { x: main.x, y: main.y, width: main.width, height: main.height, zoom: main.zoom, scrollX: main.scrollX, scrollY: main.scrollY,
      matrix: [main.matrix.a, main.matrix.b, main.matrix.c, main.matrix.d, main.matrix.e, main.matrix.f] },
    hud: bounds(ui, state.hudPanel), controls: bounds(ui, state.controlPanel),
    hudItems: texts([['instructions', state.instructionsText], ['score', state.scoreText], ['hp', state.hpText], ['area', state.areaText]]),
    controlItems: texts([['status', state.controlStatus], ['primary', state.primaryControl], ['secondary', state.secondaryControl]]),
    heroVisible: visibleSprite(state.playerSprite), entranceVisible: entrance ? visibleSprite(entrance) : null,
    heroGround: point(main, ground.x, ground.y), shop: shop ? bounds(main, shop) : null, entrance: entrance ? bounds(main, entrance) : null,
    entranceLabel: state.portalText?.visible && state.portalText.text ? bounds(main, state.portalText) : null
  };
}
function readGameplay(scene: GameScene, observedAt = performance.now()): GameplayObservation | null {
  const state = scene as unknown as ObservedState;
  if (!state.initialized || state.playerId === null) return null;
  const position = state.world.getTransform(state.playerId), health = state.world.getHealth(state.playerId);
  if (!position || !health) return null;
  const rect = scene.sys.game.canvas.getBoundingClientRect();
  const control = (text: Phaser.GameObjects.Text) => {
    const bounds = text.getBounds();
    return { label: text.text, x: bounds.centerX * rect.width / scene.scale.width, y: bounds.centerY * rect.height / scene.scale.height };
  };
  return { at: observedAt, area: state.expedition.area, elapsed: state.elapsed,
    durationLimit: state.durationLimit, expeditionActive: state.expeditionActive,
    outcome: state.expedition.outcome, returned: state.expedition.returned,
    x: position.x, y: position.y, hp: health.current, kills: state.expedition.kills,
    plazaProbe: null,
    plazaVisibility: window.__arpgPlazaFlow === true && state.expedition.area === 0 ? readHeroVisibility(scene, state) : null,
    intent: { x: state.movementInput.x, y: state.movementInput.y },
    dash: state.world.getDash(state.playerId) ? structuredClone(state.world.getDash(state.playerId)!) : null,
    plaza: state.worldLayer.list.filter((object): object is Phaser.GameObjects.Image => object instanceof Phaser.GameObjects.Image && /^town-plaza-(rear|endcap|shop)(-|$)/.test(object.name)).map(object => ({ ...readArtObject(object), name: object.name, alpha: object.alpha, active: object.active, visible: object.visible, objectId: objectId(object) })),
    viewportGeometry: state.expedition.area === 0 ? readViewportGeometry(scene, state, rect, position) : null,
    townArt: state.expedition.area === 0 ? {
      hero: readArtObject(state.playerSprite), ground: readTownGround(state, position),
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
  let fulfilledProbeId = 0;
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    if (observation.createAt === null) return;
    observation.framesAfterCreate++;
    if (window.__arpgPlazaFlow !== true) {
      // Original twelve cases retain their full post-render observations.
      observation.gameplay = readGameplay(scene);
      return;
    }
    const state = scene as unknown as ObservedState;
    if (!state.initialized || state.playerId === null) return;
    const position = state.world.getTransform(state.playerId);
    if (!position) return;
    const at = performance.now(), area = state.expedition.area;
    // Preserve EVERY native post-render movement/dash sample. Full pixel reads
    // are expensive and are only requested while keys are released, never on
    // the control loop's hot path. No game clock or update is changed.
    const motion = { at, area, x: position.x, y: position.y,
      intent: { x: state.movementInput.x, y: state.movementInput.y },
      dash: state.world.getDash(state.playerId) ? structuredClone(state.world.getDash(state.playerId)!) : null };
    fixture.plazaLatestMotion = motion;
    if (fixture.plazaMotion.length < 12000) fixture.plazaMotion.push(motion);
    else fixture.plazaMotionOverflow = true;
    const request = fixture.plazaProbeRequest;
    const requested = request !== null && request.id > fulfilledProbeId && at >= request.requestedAt;
    if (requested || observation.gameplay === null || observation.gameplay.area !== area) {
      observation.gameplay = readGameplay(scene, at);
      if (requested && observation.gameplay) {
        observation.gameplay.plazaProbe = { ...request, respondedAt: at };
        fulfilledProbeId = request.id;
      }
    }
  });
  game.events.once(Phaser.Core.Events.DESTROY, () => { observation.destroyed = true; });
  return originalPreload.apply(this, args);
};
