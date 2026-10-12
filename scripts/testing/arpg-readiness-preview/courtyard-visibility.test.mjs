// Offline observer proof only. Real observer/production wall source is loaded;
// Phaser objects, decoded source images and post-render lists are test doubles.
// No renderer, GPU pixels, screenshots or native game outcome is simulated.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import * as visibility from './courtyard-visibility.mjs';
import * as graphics from './courtyard-graphics.mjs';
import * as alphaBounds from './alpha-bounds.mjs';
const require = createRequire(import.meta.url), ts = require('typescript');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
function loadTs(file, external, cache = new Map()) {
  if (cache.has(file)) return cache.get(file).exports;
  const source = readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  assert.deepEqual(output.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  const module = { exports: {} }; cache.set(file, module);
  new Function('require', 'module', 'exports', output.outputText)(specifier => {
    if (Object.hasOwn(external, specifier)) return external[specifier];
    assert(specifier.startsWith('.'), `Unexpected import ${specifier}`);
    return loadTs(resolve(dirname(file), specifier) + '.ts', external, cache);
  }, module, module.exports);
  return module.exports;
}
const pixels = (width = 6, height = 6, alpha = 255) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = alpha;
  return { width, height, data };
};
const frame = (image = pixels()) => ({ x: 0, y: 0, cutX: 0, cutY: 0,
  cutWidth: image.width, cutHeight: image.height, source: { image, scaleMode: 0 }, rotated: false });
class ObjectBase {
  constructor(type) { Object.assign(this, { type, name: '', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    scrollFactorX: 1, scrollFactorY: 1, alpha: 1, depth: 0, active: true, visible: true,
    blendMode: 0, parentContainer: null, mask: null, hasPostPipeline: false,
    displayOriginX: 0, displayOriginY: 0, flipX: false, flipY: false }); }
  getWorldTransformMatrix() {
    if (this.forcedMatrix) return this.forcedMatrix;
    const { x, y, scaleX: sx, scaleY: sy, rotation: r } = this;
    const m = { a: Math.cos(r) * sx, b: Math.sin(r) * sx, c: -Math.sin(r) * sy, d: Math.cos(r) * sy, e: x, f: y };
    m.transformPoint = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    m.applyInverse = (x, y) => { const det = m.a * m.d - m.b * m.c; return { x: (m.d * (x - m.e) - m.c * (y - m.f)) / det, y: (-m.b * (x - m.e) + m.a * (y - m.f)) / det }; };
    return m;
  }
  getBounds() { return { left: this.x, top: this.y, right: this.x + 6, bottom: this.y + 6, centerX: this.x + 3, centerY: this.y + 3 }; }
  setName(name) { this.name = name; return this; }
  setDepth(depth) { this.depth = depth; return this; }
  setAlpha(alpha) { this.alpha = alpha; return this; }
}
class Graphics extends ObjectBase {
  constructor() { super('Graphics'); this.commandBuffer = [6, 1, 0, 0, 7, 0, 0]; }
  fillStyle(color, alpha) { this.commandBuffer.push(7, color, alpha); return this; }
  fillPoints(points, closed) { this.commandBuffer.push(1, 5, points[0].x, points[0].y);
    for (const p of points.slice(1)) this.commandBuffer.push(4, p.x, p.y);
    if (closed) this.commandBuffer.push(4, points[0].x, points[0].y);
    this.commandBuffer.push(8); return this; }
}
class Image extends ObjectBase { constructor() { super('Image'); this.frame = frame(); this.texture = { key: 'test-image', getSourceImage: () => this.frame.source.image }; } }
class Sprite extends ObjectBase { constructor() { super('Sprite'); this.frame = frame(); this.texture = { key: 'test-hero' }; } }
class Text extends ObjectBase { constructor() { super('Text'); this.width = 50; this.height = 20; this.text = 'E · Enter ruins'; } }
class Ellipse extends ObjectBase {}
class GameScene { preload() {} }
const phaser = { GameObjects: { Graphics, Image, Sprite, Text, Ellipse }, Loader: { Events: { ADD: 'add', FILE_LOAD_ERROR: 'loaderror', COMPLETE: 'complete' } },
  Scenes: { Events: { CREATE: 'create' } }, Core: { Events: { POST_RENDER: 'postrender', DESTROY: 'destroy' } } };
const fixture = { scenes: [], plazaMotion: [], plazaMotionOverflow: false, plazaLatestMotion: null, plazaProbeRequest: null };
const { createTownCourtyard } = loadTs(resolve(root, 'src/lib/games/arpg/assets/townCourtyard.ts'), {});
const { readCourtyardVisibility } = loadTs(resolve(here, 'observe-scene.ts'), {
  './courtyard-capture': {courtyardCapture:{fulfill(){}},readCourtyardLifecycle:()=>({})},
  phaser, './courtyard-graphics.mjs': graphics, './courtyard-visibility.mjs': visibility,
  './alpha-bounds.mjs': alphaBounds, './runtime': { fixture }, '../../../src/lib/games/arpg/scenes/GameScene': { GameScene }
});
class Canvas {
  getContext() { return { drawImage: image => { this.image = image; }, getImageData: () => this.image }; }
}
globalThis.document = { createElement: type => { assert.equal(type, 'canvas'); return new Canvas(); } };
globalThis.HTMLCanvasElement = Canvas;
globalThis.HTMLElement = class {};
globalThis.window = {};
const approx = (a, b) => assert(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
function make() {
  const worldLayer = { list: [], alpha: 1, blendMode: -1, visible: true, parentContainer: null, mask: null };
  const courtyard = createTownCourtyard({ add: { graphics: () => new Graphics() } }, object => worldLayer.list.push(object));
  const perimeter = new Graphics().setName('town-perimeter-rim').setDepth(-9000);
  const backdrop = new Graphics().setName('town-exterior-backdrop').setDepth(-9001);
  const hero = new Sprite(); Object.assign(hero, { x: 1500, y: 752, depth: 700 });
  // Exact no-effects defaults initialized by Phaser 3.90 BaseCamera and
  // Camera.initPostPipeline(). Post FX controllers live in postPipelines.
  const camera = { scrollX: 0, scrollY: 0, alpha: 1, matrix: new ObjectBase().getWorldTransformMatrix(), renderList: [],
    fadeEffect: { isRunning: false, isComplete: false, alpha: 0 },
    flashEffect: { isRunning: false, alpha: 1 },
    mask: null, hasPostPipeline: false, postPipelines: [], preFX: null,
    postFX: { isPost: true, enabled: false, list: [] } };
  const scene = new GameScene();
  const game = { canvas: { width: 1600, height: 900, parentElement: null, getBoundingClientRect: () => ({ x: 7, y: 9, width: 800, height: 450 }) }, config: {}, loop: { frame:7,delta: 16.25 }, events: new EventEmitter() };
  Object.assign(scene, { cameras: { main: camera }, sys: { game }, scale: { width: 800, height: 450 }, worldLayer,
    playerSprite: hero, townCorner: { graphics: { perimeter, backdrop, courtyard: courtyard.objects } } });
  worldLayer.list.push(backdrop, perimeter, hero);
  const sort = () => { worldLayer.list.sort((a, b) => a.depth - b.depth); camera.renderList = [...worldLayer.list]; };
  sort();
  const read = () => readCourtyardVisibility(scene, scene);
  const add = object => { worldLayer.list.push(object); sort(); return object; };
  return { scene, game, hero, courtyard, walls: courtyard.objects, camera, worldLayer, sort, read, add, perimeter, backdrop };
}
const assertInvalid = (result, pattern) => { assert.equal(result.valid, false); assert.equal(result.meanTransmission, null); assert.equal(result.samples, 0); assert(result.issues.some(issue => pattern.test(issue)), result.issues.join('; ')); };
function threeSquares(object, square = [[0, 0], [6, 0], [6, 6], [0, 6]], fillAlpha = 1) {
  object.commandBuffer = [6, 1, 0, 0, 7, 0, 0];
  for (let i = 0; i < 3; i++) object.fillStyle(0x123456, fillAlpha).fillPoints(square.map(([x, y]) => ({ x, y })), true);
}

test('actual read-only adapter consumes real production wall buffers and exposes actual camera/viewport/order', () => {
  const m = make(); m.walls[2].alpha = .28;
  const before = m.worldLayer.list.map(o => [o, Object.getOwnPropertyDescriptors(o), [...(o.commandBuffer ?? [])]]);
  const r = m.read(); assert.equal(r.valid, true, r.issues.join()); assert.equal(r.nativePixels, false); assert.equal(r.method, 'analytic-source-transmission');
  assert.equal(r.samples, 4); assert.equal(r.alphaThreshold, 128); assert.equal(r.sampleStep, 3);
  assert.equal(r.walls.length, 4); assert.deepEqual(r.walls.map(w => w.name), graphics.COURTYARD_NAMES);
  for (let i = 0; i < 4; i++) assert.deepEqual(r.walls[i].commands, graphics.expectedCourtyardCommands(graphics.COURTYARD_NAMES[i]));
  assert.deepEqual(r.viewport, { css: { x: 7, y: 9, width: 800, height: 450 }, backing: { width: 1600, height: 900 }, logical: { width: 800, height: 450 } });
  assert.deepEqual(r.hero.worldMatrix, [1, 0, -0, 1, 1500, 752]);
  approx(r.meanTransmission, .72); assert.deepEqual(r.occluders, ['town-courtyard-west-upper']);
  before.forEach(([o, descriptors, commands], i) => { assert.equal(m.worldLayer.list[i], o); assert.deepEqual(Object.getOwnPropertyDescriptors(o), descriptors); assert.deepEqual(o.commandBuffer ?? [], commands); });
});
test('three overlapping fills compound per fill, not as one precomposited Graphics bitmap', () => {
  const m = make(), wall = m.walls[2]; threeSquares(wall); Object.assign(wall, { x: 1500, y: 752, alpha: .28 });
  const r = m.read(); assert.equal(r.valid, true, r.issues.join()); approx(r.meanTransmission, .72 ** 3);
});
test('per-fill and wall object alpha compose independently with opaque camera', () => {
  const m = make(), wall = m.walls[2]; threeSquares(wall, undefined, .5); Object.assign(wall, { x: 1500, y: 752, alpha: .4 });
  const r = m.read(); assert.equal(r.valid, true, r.issues.join()); approx(r.meanTransmission, .8 ** 3);
});
test('overlapping elbow caps from distinct owned Graphics compound', () => {
  const m = make(); Object.assign(m.hero, { x: 1725, y: 848 });
  m.hero.frame = frame(pixels(1, 1)); m.walls[2].alpha = m.walls[3].alpha = .28;
  const r = m.read(); assert.equal(r.valid, true, r.issues.join()); approx(r.meanTransmission, .72 ** 2);
  assert.deepEqual(r.occluders, ['town-courtyard-east-upper', 'town-courtyard-west-upper']);
});
test('actual equal-depth painter order decides which wall is above hero', () => {
  const m = make(); m.walls.forEach(w => w.depth = m.hero.depth); m.walls[2].alpha = .28;
  m.worldLayer.list = [m.backdrop, m.perimeter, ...m.walls, m.hero]; m.camera.renderList = [...m.worldLayer.list];
  const below = m.read(); assert.equal(below.valid, true, below.issues.join()); approx(below.meanTransmission, 1);
  m.worldLayer.list = [m.backdrop, m.perimeter, m.hero, ...m.walls]; m.camera.renderList = [...m.worldLayer.list];
  const above = m.read(); assert.equal(above.valid, true, above.issues.join()); approx(above.meanTransmission, .72);
});
test('actual scaled/rotated world matrices and camera scroll factors map samples into fill-local coordinates', () => {
  const m = make(), wall = m.walls[2]; threeSquares(wall); Object.assign(wall, { x: 1500, y: 752, alpha: .28, rotation: Math.PI / 2, scaleX: 2, scaleY: 2, scrollFactorX: 0 });
  // Hero point around (1403, 756) minus camera delta -100 enters wall at (1503, 756).
  Object.assign(m.hero, { x: 1496, y: 752 }); m.camera.scrollX = -100; wall.x = 1600; m.walls[0].depth = m.walls[1].depth = 699; m.sort();
  const r = m.read(); assert.equal(r.valid, true, r.issues.join()); approx(r.meanTransmission, .72 ** 3);
  assert.equal(r.walls[2].rotation, Math.PI / 2); assert.equal(r.walls[2].scrollFactorX, 0);
});
test('decoded above-hero image alpha composes with vector fills; below hero images are excluded', () => {
  const m = make(); m.walls[2].alpha = .28;
  const image = m.add(Object.assign(new Image(), { name: 'source-image', x: 1500, y: 752, depth: 1000, alpha: .5 })); image.frame = frame(pixels(6, 6, 128));
  m.add(Object.assign(new Image(), { name: 'below', x: 1500, y: 752, depth: 1 }));
  const r = m.read(); assert.equal(r.valid, true, r.issues.join()); approx(r.meanTransmission, .72 * (1 - 128 / 255 * .5));
  assert.deepEqual(r.images.map(o => o.name), ['source-image']);
});
test('same-depth image after hero is counted, before hero is excluded', () => {
  const m = make(); m.hero.depth = 2000; m.sort();
  const image = m.add(Object.assign(new Image(), { name: 'tie-image', x: 1500, y: 752, depth: 2000, alpha: .5 }));
  approx(m.read().meanTransmission, .5);
  const i = m.worldLayer.list.indexOf(image); m.worldLayer.list.splice(i, 1); m.worldLayer.list.splice(m.worldLayer.list.indexOf(m.hero), 0, image); m.camera.renderList = [...m.worldLayer.list];
  approx(m.read().meanTransmission, 1);
});
test('source threshold 128 and stride 3 stay independent of alpha-bounds threshold 32', () => {
  const m = make(); m.hero.depth = 2000; m.sort(); const p = pixels(6, 6, 32);
  p.data[3] = 127; p.data[(3 * 6 + 3) * 4 + 3] = 128; m.hero.frame = frame(p);
  const r = m.read(); assert.equal(r.valid, true, r.issues.join()); assert.equal(r.samples, 1); approx(r.meanTransmission, 1);
});
test('image origin, source frame offset, flips and non-unit scale use decoded source coordinates', () => {
  const m = make(); m.hero.depth = 2000; m.sort(); m.hero.frame = frame(pixels(1, 1));
  const image = m.add(Object.assign(new Image(), { x: 1500, y: 752, depth: 2100, alpha: .5, scaleX: 2, scaleY: 2, displayOriginX: 1, displayOriginY: 2, flipX: true, flipY: true }));
  const p = pixels(6, 6, 0); p.data[(5 * 6 + 5) * 4 + 3] = 255; image.frame = frame(p); Object.assign(image.frame, { x: 1, y: 2 });
  const r = m.read(); assert.equal(r.valid, true, r.issues.join()); approx(r.meanTransmission, .5);
});
test('original owned prompt is explicitly excluded only when disjoint from hero samples', () => {
  const m = make(); m.scene.portalText = m.add(Object.assign(new Text(), { x: 500, y: 500, depth: 1000 }));
  const r = m.read(); assert.equal(r.valid, true, r.issues.join()); assert.equal(r.excludedText.length, 1);
  Object.assign(m.scene.portalText, { x: 1500, y: 752 }); assertInvalid(m.read(), /prompt overlaps/);
});
const adversaries = [
  ['unknown command', m => m.walls[0].commandBuffer[10] = 22, /BEGIN_PATH/],
  ['excess commands', m => m.walls[0].commandBuffer = Array(257).fill(0), /excessive Graphics/],
  ['missing command', m => m.walls[0].commandBuffer.pop(), /grammar/],
  ['non-array commands', m => m.walls[0].commandBuffer = new Float64Array(67), /command buffer/],
  ['unclosed polygon', m => m.walls[0].commandBuffer[24] += 1, /Unclosed/],
  ['nonfinite point', m => m.walls[0].commandBuffer[15] = NaN, /Nonfinite/],
  ['concave polygon', m => { m.walls[0].commandBuffer[18] = m.walls[0].commandBuffer[12]; m.walls[0].commandBuffer[19] = m.walls[0].commandBuffer[13]; }, /Nonconvex/],
  ['invalid fill alpha', m => m.walls[0].commandBuffer[9] = 1.1, /fill color\/alpha/],
  ['invalid object alpha', m => m.walls[0].alpha = NaN, /object alpha/],
  ['per-corner alpha', m => m.hero.alphaTopLeft = .5, /per-corner/],
  ['singular matrix', m => m.walls[0].scaleX = 0, /singular/],
  ['nonfinite matrix', m => m.walls[0].forcedMatrix = { a: 1, b: 0, c: 0, d: 1, e: Infinity, f: 0 }, /nonfinite/],
  ['invalid scroll factor', m => m.walls[0].scrollFactorX = NaN, /scroll factor/],
  ['missing actual matrix', m => m.walls[0].getWorldTransformMatrix = null, /actual world transform/],
  ['nested object', m => m.walls[0].parentContainer = {}, /container/],
  ['additive blend', m => m.walls[0].blendMode = 1, /blend/],
  ['cropped image', m => m.hero.isCropped = true, /crop/],
  ['invalid camera', m => m.camera.scrollX = Infinity, /camera/],
  ['almost transparent camera', m => m.camera.alpha = .01, /camera scroll\/alpha/],
  ['almost transparent hero', m => m.hero.alpha = .01, /non-opaque hero/],
  ['missing camera transform', m => m.camera.matrix = undefined, /transform/],
  ['camera fade', m => m.camera.fadeEffect = { isRunning: true }, /fade/],
  ['camera geometry mask', m => m.camera.mask = { isStencil: true }, /camera mask/],
  ['camera bitmap mask', m => m.camera.mask = { isStencil: false }, /camera mask/],
  ['missing camera mask state', m => delete m.camera.mask, /camera mask/],
  ['camera post-pipeline flag', m => m.camera.hasPostPipeline = true, /camera post-pipelines/],
  ['missing camera post-pipeline flag', m => delete m.camera.hasPostPipeline, /camera post-pipelines/],
  ['camera pipeline despite stale false flag', m => m.camera.postPipelines.push({ active: true }), /camera post-pipelines/],
  ['malformed camera pipeline array', m => m.camera.postPipelines = { length: 0 }, /camera post-pipelines/],
  ['missing camera pipeline array', m => delete m.camera.postPipelines, /camera post-pipelines/],
  ['enabled camera FX', m => m.camera.postFX.enabled = true, /camera FX/],
  ['camera FX controller list', m => m.camera.postFX.list.push({ active: true }), /camera FX/],
  ['malformed camera FX controller list', m => m.camera.postFX.list = { length: 0 }, /camera FX/],
  ['wrong camera FX type', m => m.camera.postFX.isPost = false, /camera FX/],
  ['missing camera FX state', m => m.camera.postFX = null, /camera FX/],
  ['unsupported camera pre-FX', m => m.camera.preFX = { enabled: false, list: [] }, /camera FX/],
  ['invalid viewport', m => m.game.canvas.width = 0, /viewport/],
  ['non-opaque layer', m => m.worldLayer.alpha = .8, /layer/],
  ['layer blend override', m => m.worldLayer.blendMode = 2, /layer/],
  ['missing wall reference', m => m.scene.townCorner.graphics.courtyard = m.walls.slice(1), /owned/],
  ['duplicate owner', m => m.scene.townCorner.graphics.courtyard = [m.walls[0], m.walls[0], ...m.walls.slice(2)], /owned/],
  ['spoofed Graphics name', m => m.walls[0].name = 'fake', /owned/],
  ['missing rendered wall', m => m.camera.renderList.splice(m.camera.renderList.indexOf(m.walls[0]), 1), /owned/],
  ['missing hero', m => m.camera.renderList.splice(m.camera.renderList.indexOf(m.hero), 1), /hero/],
  ['duplicate renderer identity', m => m.camera.renderList.push(m.hero), /Duplicate/],
  ['duplicate world identity', m => m.worldLayer.list.push(m.hero), /Duplicate/],
  ['unsorted world depth', m => m.walls[0].depth = -9999, /Unsorted/],
  ['different painter order', m => { const list = m.camera.renderList; [list[3], list[4]] = [list[4], list[3]]; }, /Painter order/],
  ['unknown renderer object', m => m.camera.renderList.push({}), /Unknown object/],
  ['unexpected Graphics', m => m.add(Object.assign(new Graphics(), { depth: 3000 })), /Unexpected world Graphics/],
  ['original Graphics above hero', m => { m.perimeter.depth = 3000; m.sort(); }, /must remain below/],
  ['unknown above-hero Sprite', m => m.add(Object.assign(new Sprite(), { depth: 3000 })), /Unsupported rendered/],
  ['unowned above-hero Text', m => m.add(Object.assign(new Text(), { depth: 3000 })), /Unsupported rendered/],
  ['hidden owned wall', m => m.walls[0].visible = false, /Inactive/],
  ['empty hero source', m => m.hero.frame = frame(pixels(6, 6, 0)), /source-alpha bounds/],
  ['no threshold-128 samples', m => m.hero.frame = frame(pixels(6, 6, 127)), /No threshold/],
  ['oversized frame', m => m.hero.frame.cutWidth = 9999999, /excessive source/],
  ['rotated atlas frame', m => m.hero.frame.rotated = true, /source frame/],
  ['malformed decoded pixels', m => m.hero.frame.source.image.data = new Uint8ClampedArray(1), /Malformed decoded/],
  ['excess sample candidates', m => m.hero.frame = frame(pixels(513, 513)), /sample budget/],
  ['excess world objects', m => m.worldLayer.list = Array(257).fill(m.hero), /excessive world/],
  ['excess rendered objects', m => m.camera.renderList = Array(513).fill(m.hero), /excessive post-render/]
];
for (const [label, mutate, message] of adversaries) test(`fails closed: ${label}`, () => { const m = make(); mutate(m); assertInvalid(m.read(), message); });

// Execute the actual registered POST_RENDER callback. Full observation methods
// still run unchanged; only test fixture objects stand in for Phaser/DOM state.
function wire(m) {
  Object.assign(m.scene, { initialized: true, playerId: 1, expedition: { area: 0, outcome: 'running', returned: false, kills: 0 },
    expeditionActive: false, elapsed: 0, durationLimit: 120, movementInput: { x: 0, y: 0 },
    world: { getTransform: () => ({ x: 1500, y: 752 }), getHealth: () => ({ current: 100 }), getDash: () => m.dash },
    load: new EventEmitter(), events: new EventEmitter(), textures: { exists: () => true },
    primaryControl: new Text(), secondaryControl: new Text() });
  m.scene.preload(); m.scene.events.emit('create');
  return fixture.scenes.at(-1);
}
test('full neutral request gate is additive; first/area/motion observations never inspect vectors', () => {
  window.__arpgPlazaFlow = true; window.__arpgCourtyardFlow = true;
  fixture.plazaProbeRequest = null; const m = make(), observed = wire(m);
  m.game.events.emit('postrender'); assert.equal(Object.hasOwn(observed.gameplay, 'courtyardVisibility'), false);
  const first = observed.gameplay; m.walls[0].commandBuffer = null;
  m.game.events.emit('postrender'); assert.equal(observed.gameplay, first);
  assert.equal(fixture.plazaLatestMotion.intent.x, 0);
  fixture.plazaProbeRequest = { id: 1, requestedAt: 0 }; m.game.events.emit('postrender');
  assertInvalid(observed.gameplay.courtyardVisibility, /command buffer/);
  assert.equal(observed.gameplay.plazaProbe.id, 1);
  assert(Object.hasOwn(observed.gameplay, 'plazaVisibility'));
});
for (const mode of ['disabled', 'not-plaza', 'moving', 'dashing', 'non-town']) test(`vector observation absent for ${mode}`, () => {
  window.__arpgPlazaFlow = mode !== 'not-plaza'; window.__arpgCourtyardFlow = mode !== 'disabled';
  fixture.plazaProbeRequest = { id: 1, requestedAt: 0 }; const m = make(), observed = wire(m);
  if (mode === 'moving') m.scene.movementInput.x = 1;
  if (mode === 'dashing') m.dash = { timer: .1 };
  if (mode === 'non-town') m.scene.expedition.area = 1;
  m.game.events.emit('postrender'); assert.equal(Object.hasOwn(observed.gameplay, 'courtyardVisibility'), false);
});

test('above-hero per-wall/per-fill intersections distinguish geometric overlap and alpha contribution', () => {
  const m = make(), wall = m.walls[2]; threeSquares(wall); Object.assign(wall, { x: 1500, y: 752, alpha: .28 });
  // One deliberately transparent fill intersects but contributes no occlusion.
  wall.commandBuffer[9] = 0;
  const r = m.read(); assert.equal(r.valid, true, r.issues.join());
  assert.equal(r.walls[2].intersectedSamples, 4); assert.equal(r.walls[2].contributingSamples, 4);
  assert.deepEqual(r.walls[2].fills.map(f => f.intersectedSamples), [4, 4, 4]);
  assert.deepEqual(r.walls[2].fills.map(f => f.contributingSamples), [0, 4, 4]);
  assert.equal(r.walls[3].contributingSamples, 0); approx(r.meanTransmission, .72 ** 2);
});
test('courtyard motion reads native game.loop.delta only when flag is true', () => {
  window.__arpgPlazaFlow = true; window.__arpgCourtyardFlow = false; fixture.plazaProbeRequest = null;
  const m = make(); wire(m); m.game.events.emit('postrender');
  const old = fixture.plazaLatestMotion;
  assert.deepEqual(Object.keys(old).sort(), ['area', 'at', 'dash', 'intent', 'x', 'y']);
  window.__arpgCourtyardFlow = true; m.game.loop.delta = 23.125; m.game.events.emit('postrender');
  assert.equal(fixture.plazaLatestMotion.courtyardFrame.delta,23.125);assert.equal(fixture.plazaLatestMotion.courtyardFrame.frame,7);
  assert.equal(m.game.loop.delta, 23.125);
  m.game.loop.delta = NaN; m.game.events.emit('postrender');
  assert.equal(fixture.plazaLatestMotion.courtyardFrame.delta,null);
});
test('four protected legacy function declarations are still byte-identical to the local freeze', () => {
  // Pinned from revised-combined manifest a17442dd6b2cd84efa4b3c297a636b7a69644b3570cfa7c23f23f40f430fd81f.
  const expected = {
    decodedAlphaBounds: '20a2103f3c5641ab2be59c0410136a62aac6013bbf9d36d579b5ce55f6739523',
    decodedPixels: 'b99f954c8549eb5ed80e20dd2988527c611b624f47b48a2b11f5772043d0f183',
    readHeroVisibility: '139075780bd9ee8779f7a33a8ff18f1b5a1b444b56c82938b36b2997c8ad7659',
    readViewportGeometry: 'a3a20f0635955842071c9838640f247e33b77daf880f8d80b3a40ac362ffbcc1'
  };
  const source = readFileSync(resolve(here, 'observe-scene.ts'), 'utf8');
  const ast = ts.createSourceFile('observe-scene.ts', source, ts.ScriptTarget.Latest, true);
  const declarations = new Map(ast.statements.filter(s => ts.isFunctionDeclaration(s)).map(s => [s.name.text, source.slice(s.getStart(ast), s.end)]));
  for (const [name, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(declarations.get(name)).digest('hex'), hash, name);
});

// Source-backed Phaser3.90 states. Flash's inactive alpha is not a draw flag:
// constructor alpha=1; completion restores _alpha; reset leaves alpha unchanged.
// Both Flash render methods early-return unless isRunning. Fade differs because
// a completed fade can still draw. These mocked observations are not engine pixels.
// https://raw.githubusercontent.com/phaserjs/phaser/v3.90.0/src/cameras/2d/effects/Flash.js
// https://raw.githubusercontent.com/phaserjs/phaser/v3.90.0/src/cameras/2d/effects/Fade.js
for (const [label, effect] of [
  ['constructor defaults', { isRunning:false, alpha:1 }],
  ['completed flash restores original alpha', { isRunning:false, alpha:1, _alpha:1, progress:1 }],
  ['interrupted flash retains intermediate alpha', { isRunning:false, alpha:.5, _alpha:1, progress:.5 }]
]) test(`Phaser3.90 inactive Flash ${label} does not draw or invalidate visibility`,()=>{
  const m=make();m.camera.flashEffect=effect;const before=structuredClone(effect),result=m.read();
  assert.equal(result.valid,true,result.issues.join());assert.equal(result.samples,4);assert.deepEqual(effect,before);
});
for (const alpha of [0,1]) test(`Phaser3.90 active Flash remains unsupported at alpha ${alpha}`,()=>{
  const m=make();m.camera.flashEffect={isRunning:true,alpha};assertInvalid(m.read(),/camera fade\/flash/);
});
test('Phaser3.90 completed opaque Fade remains unsupported while no longer running',()=>{
  const m=make();m.camera.fadeEffect={isRunning:false,isComplete:true,alpha:1};assertInvalid(m.read(),/camera fade\/flash/);
});
test('Phaser3.90 active transparent Fade remains unsupported',()=>{
  const m=make();m.camera.fadeEffect={isRunning:true,isComplete:false,alpha:0};assertInvalid(m.read(),/camera fade\/flash/);
});
test('Phaser3.90 completed transparent fade-in does not obscure the frame',()=>{
  const m=make();m.camera.fadeEffect={isRunning:false,isComplete:true,alpha:0};const result=m.read();assert.equal(result.valid,true,result.issues.join());
});
