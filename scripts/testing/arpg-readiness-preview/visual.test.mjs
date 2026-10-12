// Offline tests only: load the real checked-in controller and World, using
// explicit Phaser lifecycle/render doubles. Fabricated verifier inputs remain
// in memory and are never emitted as browser execution or captured PNG proof.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import * as contract from './visual-contract.mjs';
import { verifyVisual, verifyVisualReceipt, verifyVisualPNG } from './visual-verifier.mjs';
import { fabricateCourtyardSchema } from './courtyard-schema-data.mjs';
import { expectedBackdropCommands } from './town-ground.mjs';
import { PLAZA_KEYS } from './plaza-contract.mjs';
import { readCourtyardFills } from './courtyard-visibility.mjs';

const require = createRequire(import.meta.url), ts = require('typescript');
const here = dirname(fileURLToPath(import.meta.url));
const phaser = { Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } }, Core: { Events: { POST_RENDER: 'postrender', DESTROY: 'destroy' } } };
function load(file, imports) {
  const output = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  assert.deepEqual(output.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  const module = { exports: {} };
  new Function('require','module','exports', output.outputText)(specifier => {
    assert(Object.hasOwn(imports, specifier), `Unexpected import ${specifier}`); return imports[specifier];
  }, module, module.exports);
  return module.exports;
}
const { World } = load(resolve(here, '../../../src/lib/games/arpg/ecs/components.ts'), {});
function harness({ enabled = false, bind = true } = {}) {
  const fixture = { scenes: [], api: [], rewardMutations: [], navigations: [], blocked: [] };
  class Scene { preload() { fixture.scenes.push(observation); this.preloadCalled = (this.preloadCalled ?? 0) + 1; } }
  const original = Scene.prototype.preload;
  const observation = { id: 1, pageId: 1, createAt: 0, framesAfterCreate: 1, loadComplete: true,
    totalFailed: 0, loadErrors: [], missingKeys: [], destroyed: false };
  globalThis.window = enabled ? { __arpgCourtyardVisualFlow: true, __arpgPlazaFlow: true, __arpgCourtyardFlow: false, __arpgReturnFlow: false } : {};
  const exports = load(resolve(here, 'visual-observer.ts'), {
    phaser, '../../../src/lib/games/arpg/scenes/GameScene': { GameScene: Scene }, './runtime': { fixture }, './visual-contract.mjs': contract
  });
  if (!enabled) assert.equal(Scene.prototype.preload, original, 'No prototype/global write without explicit mode');
  Object.assign(window, { __arpgCourtyardVisualFlow: true, __arpgPlazaFlow: true, __arpgCourtyardFlow: false, __arpgReturnFlow: false });
  const scene = new Scene(), world = new World(), playerId = world.createEntity();
  world.setTransform(playerId, { x: 1472, y: 536, rot: 0 }); world.setVelocity(playerId, { vx: 0, vy: 0, speed: 220 });
  world.tagPlayer(playerId, { score: 0 }); world.setDash(playerId, { cd: 0, cdMax: 700, power: 230, duration: 100, timer: 0, lastDir: { x: 0, y: 1 } });
  const key = () => ({ isDown: false, _justDown: false });
  const camera = { x: 0, y: 0, width: 358, height: 500, zoom: .7, scrollX: 0, scrollY: 0,
    matrix: { a: .7, b: 0, c: 0, d: .7, e: 0, f: 0 } };
  Object.assign(scene, { world, playerId, initialized: true, ended: false, runState: 'running', townStatus: 'ready',
    handlers: { isCurrent: () => true }, expedition: { area: 0, returned: false, outcome: 'preparing' }, expeditionActive: false,
    movementInput: { x: 0, y: 0 }, pendingDash: false, pointerAttack: false, heroAttacking: false,
    wasd: Object.fromEntries(['w','a','s','d'].map(name => [name, key()])), cursors: Object.fromEntries(['up','down','left','right'].map(name => [name, key()])),
    interactKey: key(), dashKeys: [key(),key()], input: { activePointer: { isDown: false } },
    playerSprite: { x: 1472, y: 536, depth: 556, alpha: 1, active: true, visible: true, texture: { key: 'hero-knight_armed_idle-S' }, frame: { name: 0 }, anims: { currentAnim: { key: 'hero-knight_armed_idle-S' }, isPlaying: true } },
    cameras: { main: camera }, events: new EventEmitter(), sys: { game: { loop: { frame: 10 }, events: new EventEmitter() } } });
  const controller = enabled ? window.__arpgCourtyardVisual : exports.createVisualController();
  if (bind) {
    if (enabled) scene.preload();
    else { fixture.scenes.push(observation); controller.bind(scene, observation); }
  }
  const tick = (sync = true) => {
    // Faithful TimeStep ordering: update → POST_RENDER callback → frame++.
    if (sync) Object.assign(scene.playerSprite, { ...world.getTransform(scene.playerId), depth: world.getTransform(scene.playerId).y + 20 });
    scene.sys.game.events.emit('postrender'); scene.sys.game.loop.frame++; observation.framesAfterCreate++;
  };
  if (bind) tick();
  const settle = () => { for (let i = 0; i < 4; i++) tick(); return controller.currentReceipt(); };
  return { scene, fixture, observation, world, camera, controller, tick, settle, original, Scene };
}

test('all six fixed poses independently clear radius38 and original room; rejected y840 stays unsafe', () => {
  for (const pose of contract.VISUAL_POSES) assert.equal(contract.visualClearance(pose).valid, true);
  const bad = contract.visualClearance({ x: 1728, y: 840 }); assert.equal(bad.valid, false);
  assert(Math.abs(bad.distances.west - 34.93250516799593) < 1e-10);
  assert.deepEqual(contract.VISUAL_POSES.map(p => p.id), ['home','west-inner','east-inner','inner-elbow','west-front-witness','east-front-witness']);
});
test('ordinary fixture import leaves scene prototype and controller global untouched', () => {
  const h = harness({ bind: false }); assert.equal(h.Scene.prototype.preload, h.original); assert.equal(window.__arpgCourtyardVisual, undefined);
});
test('explicit entry wrapper preserves real preload and binds once', () => {
  const h = harness({ enabled: true }); assert.equal(h.scene.preloadCalled, 1); assert.equal(h.controller.snapshot().bound, true);
  assert.equal(h.scene.sys.game.events.listenerCount('postrender'), 1);
});
test('actual TimeStep callback→POST_RENDER→frame++ allows first frame equal to between-callback counter', () => {
  const h = harness(); assert.equal(h.scene.sys.game.loop.frame, 11);
  const receipt = h.controller.assign('home'); assert.equal(receipt.assignedNativeFrame, 10); assert.equal(receipt.assignedFrameCounter, 11);
  h.tick(); assert.equal(h.controller.snapshot().receipts[0].frames[0].nativeFrame, 11); assert.deepEqual(h.controller.snapshot().errors, []);
  h.tick(); h.tick(); h.tick(); assert.equal(h.controller.currentReceipt().settledNativeFrame, 14);
});
test('six ordered assignments change only ECS x/y; genuine native sync settles and records idle frame', () => {
  const h = harness(); let previous = null;
  for (const [i, pose] of contract.VISUAL_POSES.entries()) {
    const velocity = structuredClone(h.world.getVelocity(1)), keys = JSON.stringify([h.scene.wasd,h.scene.cursors,h.scene.dashKeys]);
    const spriteBefore = structuredClone(h.scene.playerSprite), cameraBefore = structuredClone(h.camera);
    h.controller.assign(pose.id);
    assert.deepEqual(h.world.getVelocity(1), velocity); assert.equal(JSON.stringify([h.scene.wasd,h.scene.cursors,h.scene.dashKeys]), keys);
    assert.deepEqual(h.scene.playerSprite, spriteBefore); assert.deepEqual(h.camera, cameraBefore);
    const receipt = h.settle(); verifyVisualReceipt(receipt, i, previous); previous = receipt;
    assert.equal(receipt.frames[0].sprite.animation, 'hero-knight_armed_idle-S');
  }
  const snapshot = h.controller.snapshot(); assert.equal(snapshot.complete, true); assert.equal(snapshot.receipts.length, 6);
  assert.equal(snapshot.receipts[1].prior.y, 536); assert.equal(snapshot.receipts[1].assigned.y, 698);
});
for (const [name, mutate] of [
  ['visual flag missing', () => delete window.__arpgCourtyardVisualFlow],
  ['visual flag truthy string', () => window.__arpgCourtyardVisualFlow = 'true'],
  ['native flag enabled', () => window.__arpgCourtyardFlow = true],
  ['return-flow enabled', () => window.__arpgReturnFlow = true],
  ['plaza mode disabled', () => window.__arpgPlazaFlow = false],
  ['unready', h => h.scene.initialized = false], ['paused', h => h.scene.runState = 'paused'],
  ['stale owner', h => h.scene.handlers.isCurrent = () => false], ['ended', h => h.scene.ended = true],
  ['not initial town', h => h.scene.expedition.area = 1], ['returned town', h => h.scene.expedition.returned = true],
  ['expedition active', h => h.scene.expeditionActive = true], ['scene load error', h => h.observation.loadErrors.push('bad')],
  ['extra live scene', h => h.fixture.scenes.push({ ...h.observation })],
  ['nonzero intent', h => h.scene.movementInput.x = 1], ['nonzero velocity', h => h.world.getVelocity(1).vx = 1],
  ['active dash', h => h.world.getDash(1).timer = 10], ['queued dash', h => h.scene.pendingDash = true],
  ['pressed key', h => h.scene.wasd.w.isDown = true], ['queued key edge', h => h.scene.interactKey._justDown = true],
  ['pointer held', h => h.scene.input.activePointer.isDown = true], ['attack pending', h => h.scene.pointerAttack = true], ['hero attacking', h => h.scene.heroAttacking = true],
  ['forbidden session', h => h.fixture.api.push({ path: '/api/games/session/start', method: 'POST' })],
  ['reward mutation', h => h.fixture.rewardMutations.push({})], ['navigation', h => h.fixture.navigations.push('/outside')]
]) test(`pose guard fails closed before any mutation: ${name}`, () => {
  const h = harness(), before = structuredClone(h.world.getTransform(1)); mutate(h);
  assert.throws(() => h.controller.assign('home')); assert.deepEqual(h.world.getTransform(1), before); assert.equal(h.controller.snapshot().receipts.length, 0);
});
test('unknown or out-of-order pose ID cannot set arbitrary coordinates', () => {
  const h = harness(); assert.throws(() => h.controller.assign('west-inner')); assert.deepEqual(h.world.getTransform(1), { x: 1472, y: 536, rot: 0 });
});
test('new assignment fails while previous pose is pending', () => {
  const h = harness(); h.controller.assign('home'); assert.throws(() => h.controller.assign('west-inner'));
});
test('hero identity cannot switch after first pose', () => {
  const h = harness(); h.controller.assign('home'); h.settle(); h.scene.playerId = h.world.createEntity();
  assert.throws(() => h.controller.assign('west-inner'));
});
test('retained stationary segments reject transform drift rather than rewriting or dropping samples', () => {
  const h = harness(); h.controller.assign('home'); h.tick(); h.world.getTransform(1).x++;
  h.tick(); assert.match(h.controller.snapshot().errors.join(), /drifted/); assert.throws(() => h.controller.currentReceipt());
});
test('duplicate native frame callback cannot count as another settling frame', () => {
  const h = harness(); h.controller.assign('home'); h.scene.sys.game.events.emit('postrender'); h.scene.sys.game.events.emit('postrender');
  assert.match(h.controller.snapshot().errors.join(), /strictly increasing/);
});
test('camera settling is bounded at64 real callbacks and does not override the camera', () => {
  const h = harness(); h.controller.assign('home');
  for (let i = 0; i < 64; i++) { h.camera.scrollX++; h.tick(); }
  const snapshot = h.controller.snapshot(); assert.equal(snapshot.receipts[0].frames.length, 64); assert.match(snapshot.errors.join(), /64 native frames/);
});
test('camera comparison covers viewport bounds and matrix with exact0.01 tolerance', () => {
  const h = harness(); h.controller.assign('home'); h.tick(); h.camera.width += .02; h.tick();
  assert.equal(h.controller.snapshot().receipts[0].stableComparisons, 0);
  h.tick(); h.tick(); h.tick(); assert(h.controller.currentReceipt().settled);
});
test('sprite synchronization is observed rather than forced', () => {
  const h = harness(); h.controller.assign('home'); h.settle(); h.controller.assign('west-inner');
  for (let i = 0; i < 5; i++) h.tick(false);
  assert.equal(h.controller.snapshot().pending, true); assert.equal(h.scene.playerSprite.y, 536);
  for (let i = 0; i < 4; i++) h.tick(); assert(h.controller.currentReceipt().settled);
});
test('capture readback refuses late camera/pose drift and mutable snapshot copies cannot rewrite evidence', () => {
  const h = harness(); h.controller.assign('home'); h.settle(); const copy = h.controller.snapshot(); copy.receipts[0].assigned.x = 3;
  assert.equal(h.controller.currentReceipt().assigned.x, 1472); h.camera.scrollX += 1;
  assert.throws(() => h.controller.currentReceipt(), /stable current/);
});
for (const event of ['shutdown','destroy']) test(`scene ${event} releases all listeners and disallows later assignments`, () => {
  const h = harness(); h.controller.assign('home'); h.settle(); h.scene.events.emit(event);
  assert.equal(h.controller.snapshot().closed, true); assert.equal(h.scene.sys.game.events.listenerCount('postrender'), 0);
  assert.equal(h.scene.sys.game.events.listenerCount('destroy'), 0); assert.equal(h.scene.events.listenerCount('shutdown'), 0); assert.equal(h.scene.events.listenerCount('destroy'), 0);
  assert.throws(() => h.controller.assign('west-inner'));
});
test('game destroy releases callbacks and keeps unsettled assignment failure', () => {
  const h = harness(); h.controller.assign('home'); h.scene.sys.game.events.emit('destroy');
  assert.equal(h.scene.sys.game.events.listenerCount('postrender'), 0); assert.match(h.controller.snapshot().errors.join(), /unsettled assignment/);
});

// An intentionally synthetic PNG and observation schema, only for the offline
// verifier acceptance/rejection tests below. No browser files are written.
const crc = bytes => { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
const chunk = (name, data) => { const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(name, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, -4)), b.length - 4); return b; };
function png(width, height) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const offset = y * (width * 4 + 1) + x * 4 + 1; rows[offset] = x % 256; rows[offset + 1] = y % 256; rows[offset + 3] = 255; }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const camera = { x: 0, y: 0, width: 358, height: 500, zoom: .7, scrollX: 1400, scrollY: 500, matrix: [.7,0,0,.7,0,0] };
function receipts() {
  return contract.VISUAL_POSES.map((pose, i) => {
    const assigned = { x: pose.x, y: pose.y, rot: 0 }, time = i * 100 + 100, nativeFrame = i * 10 + 10;
    const frames = Array.from({ length: 4 }, (_, j) => ({ nativeFrame: nativeFrame + j + 1, at: time + j + 1, transform: { ...assigned },
      intent: { x: 0, y: 0 }, velocity: { vx: 0, vy: 0 }, dashTimer: 0,
      sprite: { x: pose.x, y: pose.y, depth: pose.y + 20, texture: 'hero-knight_armed_idle-S', frame: 0, animation: 'hero-knight_armed_idle-S', playing: true }, camera: structuredClone(camera) }));
    return { evidenceMode: contract.VISUAL_MODE, nativeMovementEvidence: false, assignment: 'actual-ecs-transform', sequence: i + 1, poseId: pose.id,
      sceneId: 1, playerId: 1, prior: i ? { x: contract.VISUAL_POSES[i-1].x, y: contract.VISUAL_POSES[i-1].y, rot: 0 } : { ...assigned }, assigned,
      assignedAt: time, assignedNativeFrame: nativeFrame, assignedFrameCounter: nativeFrame + 1, clearance: contract.visualClearance(pose), frames,
      stableComparisons: 3, cameraTolerance: .01, settled: { ...assigned }, settledNativeFrame: nativeFrame + 4, settledAt: time + 4 };
  });
}
function game(receipt, viewport) {
  const { x, y } = receipt.assigned;
  const hero = { key: 'hero-knight_armed_idle-S', x, y, depth: y+20, originX: .5, originY: .5, alpha: 1, scaleX: 1, scaleY: 1, displayWidth: 100, displayHeight: 100 };
  const ground = { perimeter: [{ objectId: 100 }], backdrop: [{ objectId: 101, commands: expectedBackdropCommands() }] };
  const plaza = ['shop','rear-foundation','rear-upper','endcap-foundation','endcap-upper'].map((id, i) => {
    const shop = id === 'shop', rear = id.startsWith('rear'), py = shop ? 568 : rear ? 432 : 376;
    return { name: `town-plaza-${id}`, objectId: i+10, active: true, visible: true, alpha: 1, depth: py+20,
      key: shop ? 'town_corner_shop_v1' : `town_plaza_${id.replace('-', '_')}_v1`, x: shop ? 1664 : rear ? 1496 : 1728, y: py,
      originX: shop ? .5 : (rear ? 520 : 136)/656, originY: shop ? .5 : rear ? 536/544 : 472/480,
      scaleX: shop ? .24 : .5, scaleY: shop ? .24 : .5, displayWidth: shop ? 301 : 328, displayHeight: shop ? 301 : rear ? 272 : 240 };
  });
  const geometry = { camera: structuredClone(camera), canvas: { width: viewport.css.width, height: viewport.css.height },
    hud: { x: 8, y: 8, width: 342, height: 44 }, controls: { x: 8, y: 438, width: 342, height: 54 },
    hudItems: [{ name: 'score', bounds: { x: 16, y: 13, width: 100, height: 14 } }, { name: 'hp', bounds: { x: 16, y: 33, width: 60, height: 12 } }, { name: 'area', bounds: { x: 148, y: 33, width: 80, height: 12 } }],
    controlItems: [{ name: 'status', bounds: { x: 16, y: 443, width: 160, height: 13 } }, { name: 'primary', bounds: { x: 16, y: 463, width: 90, height: 20 } }],
    heroGround: { x: 120, y: 250 }, heroVisible: { textureKey: 'hero-knight_armed_idle-S', alphaThreshold: 32, sourceBounds: { x: 110, y: 100, width: 30, height: 50, opaquePixels: 700 }, screenBounds: { x: 110, y: 220, width: 18, height: 32 } },
    entranceLabel: null, entrancePrompt: { text: 'E · Enter ruins', visible: false, active: true, alpha: 1, screenBounds: { x: 500, y: 100, width: 90, height: 20 } } };
  const g = { at: receipt.settledAt + 2, courtyardFrame: { frame: receipt.settledNativeFrame + 1, delta: 16, hero: { textureKey: 'hero-knight_armed_idle-S', frameName: 0, animation: 'hero-knight_armed_idle-S', playing: true } }, x, y, area: 0, expeditionActive: false, returned: false, outcome: 'preparing', elapsed: 0,
    intent: { x: 0, y: 0 }, dash: { timer: 0 }, plaza, viewportGeometry: geometry, townArt: { hero, ground },
    plazaVisibility: { samples: 100, readable: 100, meanTransmission: .72, occluders: [] },
    plazaProbe: { id: receipt.sequence, requestedAt: receipt.settledAt + 1, respondedAt: receipt.settledAt + 2 } };
  fabricateCourtyardSchema(g);
  const observedHero = { objectId: 9000, depth: hero.depth };
  const observedWalls = structuredClone(ground.courtyard);
  const painterOrder = [observedHero, ...observedWalls].sort((a, b) => a.depth - b.depth);
  painterOrder.forEach((object, index) => Object.assign(object, { worldIndex: index, painterIndex: index }));
  for (const wall of observedWalls) {
    const aboveHero = wall.painterIndex > observedHero.painterIndex, samples = aboveHero && wall.alpha === .28 ? 10 : 0;
    Object.assign(wall, { aboveHero, worldMatrix: [1,0,0,1,0,0], intersectedSamples: samples, contributingSamples: samples,
      fills: readCourtyardFills(wall.commands).map(fill => ({ ...fill, intersectedSamples: samples, contributingSamples: samples })) });
  }
  g.courtyardVisibility = { method: 'analytic-source-transmission', nativePixels: false, valid: true, issues: [], alphaThreshold: 128, sampleStep: 3,
    samples: 100, readable: 100, meanTransmission: .72, viewport: structuredClone(viewport), camera: { ...camera, alpha: 1 }, hero: observedHero, walls: observedWalls, painterOrder };
  return g;
}
function report(requestedMode = 'execution') {
  const execution = requestedMode === 'execution';
  const specs = contract.VISUAL_TITLES.map((title, index) => {
    const poses = receipts(), viewport = contract.visualViewport(index), shape = { css: { x: 16, y: 100, width: 358, height: 500 }, backing: { width: 358, height: 500 }, logical: { width: 358, height: 500 } };
    const image = png(shape.backing.width, shape.backing.height), body = image.toString('base64');
    const captures = poses.map(receipt => {
      const g = game(receipt, shape);
      return { metadata: { evidenceMode: contract.VISUAL_MODE, nativeMovementEvidence: false, label: contract.visualScreenshot(index, receipt.poseId), poseReceipt: receipt,
        viewport, documentWidth: viewport.width, ...shape, nativeFrame: g.courtyardFrame.frame, heroFrame: g.courtyardFrame.hero, probeId: receipt.sequence, at: g.at, capturedAt: g.at + .1, consumedAt: g.at + 1, gameplay: g, base64Chars: body.length },
        pngSHA256: createHash('sha256').update(image).digest('hex') };
    });
    const visual = { evidenceMode: contract.VISUAL_MODE, nativeMovementEvidence: false, enabled: true, bound: true, closed: false, pending: false, complete: true, receipts: poses, errors: [] };
    const keys = [...Array.from({ length: 249 }, (_, i) => `key-${i}`), 'town_cobble_material_v1','town_corner_shop_v1','town_corner_lantern_v1','town_ruins_entrance_v1', ...PLAZA_KEYS];
    const state = { ready: true, profile: 'readiness', blocked: [], navigations: [], rewardMutations: [], api: [], plazaMotionOverflow: false,
      courtyardEvidence: { evidenceMode: contract.VISUAL_MODE, nativeMovementEvidence: false, visualEnabled: true, visual },
      scenes: [{ id: 1, pageId: 1, loadComplete: true, totalFailed: 0, missingKeys: [], loadErrors: [], queuedKeys: keys, decodedKeys: keys, preloadAt: 1, createAt: 2, framesAfterCreate: 100, destroyed: false }],
      plazaMotion: poses.flatMap((r, i) => [ ...r.frames.map(f => ({ at: f.at, area: 0, x: f.transform.x, y: f.transform.y, intent: { x: 0, y: 0 }, dash: { timer: 0 }, courtyardFrame: { frame: f.nativeFrame, delta: 16, hero: { textureKey: f.sprite.texture, frameName: f.sprite.frame, animation: f.sprite.animation, playing: f.sprite.playing } } })),
        { at: captures[i].metadata.gameplay.at, area: 0, x: r.assigned.x, y: r.assigned.y, intent: { x: 0, y: 0 }, dash: { timer: 0 }, courtyardFrame: structuredClone(captures[i].metadata.gameplay.courtyardFrame) } ]) };
    const cleanup = structuredClone(state); cleanup.scenes[0].destroyed = true; cleanup.courtyardEvidence.visual.closed = true;
    Object.assign(cleanup, { authCallbacks: 0, canvasCount: 0, mountedPages: [] });
    const observation = { browserVersion: '143.0.7499.4', blocked: [], errors: [], consoleErrors: [], unexpectedConsoleErrors: [], cleanupErrors: [], state, afterCleanup: cleanup };
    const driver = { kind: 'controlled-courtyard-visual-driver', evidenceMode: contract.VISUAL_MODE, nativeMovementEvidence: false, index, completed: true, elapsedMs: 1000,
      poseIds: contract.VISUAL_POSES.map(p => p.id), visual, captures,
      captureState: { evidenceMode: contract.VISUAL_MODE, nativeMovementEvidence: false, requests: 6, captureCount: 6, pending: false, requested: false, history: captures.map(c => c.metadata) } };
    const json = (name, data) => ({ name, contentType: 'application/json', body: Buffer.from(JSON.stringify(data)).toString('base64') });
    const attachments = [json('arpg-real-engine-observations', observation), json('courtyard-controlled-visual-driver', driver), ...captures.map(c => ({ name: c.metadata.label, contentType: 'image/png', body }))];
    return { title, id: `visual-${index}`, file: 'visual.spec.ts', ok: true, tests: [{ projectId: 'chromium-arpg-controlled-visual', projectName: 'chromium-arpg-controlled-visual', expectedStatus: 'passed', annotations: [], status: execution ? 'expected' : 'skipped', results: execution ? [{ status: 'passed', retry: 0, annotations: [], errors: [], workerIndex: 0, startTime: '2026-10-11T00:00:00Z', duration: 1000, attachments }] : [] }] };
  });
  return { config: { version: '1.57.0', forbidOnly: true, workers: 1, shard: null, projects: [{ id: 'chromium-arpg-controlled-visual', name: 'chromium-arpg-controlled-visual', repeatEach: 1, retries: 0, testMatch: ['visual.spec.ts'] }] }, errors: [], suites: [{ file: 'visual.spec.ts', title: 'visual.spec.ts', specs }], stats: { expected: execution ? 2 : 0, skipped: execution ? 0 : 2, unexpected: 0, flaky: 0 } };
}
const result = r => r.suites[0].specs[0].tests[0].results[0];
function modify(r, name, callback) {
  const attachment = result(r).attachments.find(a => a.name === name), value = JSON.parse(Buffer.from(attachment.body, 'base64').toString());
  callback(value); attachment.body = Buffer.from(JSON.stringify(value)).toString('base64');
}
const modifyDriver = (r, fn) => modify(r, 'courtyard-controlled-visual-driver', fn);
const modifyObservation = (r, fn) => modify(r, 'arpg-real-engine-observations', fn);

test('synthetic offline report schema is accepted with explicit visual-only result wording', () => assert.match(verifyVisual(report(), 'execution'), /do not satisfy native traversal/));
test('visual discovery proves zero executions and cannot masquerade as execution', () => {
  assert.match(verifyVisual(report('discovery'), 'discovery'), /ZERO executed/);
  assert.throws(() => verifyVisual(report('discovery'), 'execution')); assert.throws(() => verifyVisual(report(), 'discovery'));
});
for (const [name, mutate] of Object.entries({
  'native suite identity': r => r.suites[0].file = 'courtyard.browser.spec.ts',
  'original suite title': r => r.suites[0].specs[0].title = 'desktop native courtyard wall blocks shortcuts while both open ends and gate remain usable',
  'missing case': r => r.suites[0].specs.pop(), 'duplicate case': r => r.suites[0].specs[1].id = r.suites[0].specs[0].id,
  'wrong project': r => r.config.projects[0].name = 'chromium-arpg-courtyard', 'retries': r => r.config.projects[0].retries = 1,
  'skip': r => result(r).annotations.push({ type: 'skip' }), 'failed attempt': r => result(r).status = 'failed',
  'extra PNG': r => result(r).attachments.push({ ...result(r).attachments[2] }), 'missing PNG': r => result(r).attachments.pop(),
  'native label': r => result(r).attachments[2].name = 'desktop-courtyard-home', 'PNG corruption': r => result(r).attachments[2].body = Buffer.alloc(1000).toString('base64'),
  'driver claims native movement': r => modifyDriver(r, d => d.nativeMovementEvidence = true),
  'driver claims native mode': r => modifyDriver(r, d => d.evidenceMode = 'native-courtyard'),
  'incomplete': r => modifyDriver(r, d => d.completed = false), 'too many poses': r => modifyDriver(r, d => d.visual.receipts.push(d.visual.receipts[0])),
  'no pose receipt': r => modifyDriver(r, d => d.captures[0].metadata.poseReceipt = null),
  'arbitrary pose': r => modifyDriver(r, d => d.visual.receipts[0].assigned.x++),
  'unsafe pose clearance': r => modifyDriver(r, d => d.visual.receipts[0].clearance.valid = false),
  'jump hidden': r => modifyDriver(r, d => d.visual.receipts[1].prior.y = d.visual.receipts[1].assigned.y),
  'one-frame settle': r => modifyDriver(r, d => d.visual.receipts[0].frames.splice(1)),
  'duplicate frame': r => modifyDriver(r, d => d.visual.receipts[0].frames[1].nativeFrame = d.visual.receipts[0].frames[0].nativeFrame),
  'drifting pose': r => modifyDriver(r, d => d.visual.receipts[0].frames[1].transform.x++),
  'camera drift': r => modifyDriver(r, d => d.visual.receipts[0].frames.at(-1).camera.matrix[4] += 1),
  'missing idle frame': r => modifyDriver(r, d => delete d.visual.receipts[0].frames[0].sprite.frame),
  'pretend native walk': r => modifyDriver(r, d => d.visual.receipts[0].frames[0].intent.x = 1),
  'hash mismatch': r => modifyDriver(r, d => d.captures[0].pngSHA256 = '0'.repeat(64)),
  'different PNG dimensions': r => modifyDriver(r, d => d.captures[0].metadata.backing.width++),
  'wrong viewport': r => modifyDriver(r, d => d.captures[0].metadata.viewport.width = 900),
  'capture before settling': r => modifyDriver(r, d => d.captures[0].metadata.gameplay.plazaProbe.requestedAt = 0),
  'capture different pose': r => modifyDriver(r, d => d.captures[0].metadata.gameplay.x++),
  'wrong graphics': r => modifyDriver(r, d => d.captures[0].metadata.gameplay.townArt.ground.courtyard[0].commands[0] = 0),
  'missing combined diagnostic': r => modifyDriver(r, d => d.captures[0].metadata.gameplay.courtyardVisibility = null),
  'invalid combined diagnostic': r => modifyDriver(r, d => d.captures[0].metadata.gameplay.courtyardVisibility.valid = false),
  'unreadable hero': r => modifyDriver(r, d => d.captures[0].metadata.gameplay.courtyardVisibility.readable = 0),
  'snapshot relabeled native': r => modifyObservation(r, o => o.state.courtyardEvidence.evidenceMode = 'native-courtyard'),
  'session call': r => modifyObservation(r, o => o.state.api.push({ path: '/api/games/session/start', method: 'POST' })),
  'reward side effect': r => modifyObservation(r, o => o.state.rewardMutations.push({})),
  'navigation side effect': r => modifyObservation(r, o => o.state.navigations.push('/outside')),
  'duplicated raw frame link': r => modifyObservation(r, o => o.state.plazaMotion.splice(1, 0, structuredClone(o.state.plazaMotion[0]))),
  'cross-pose raw frame link': r => modifyObservation(r, o => o.state.plazaMotion[5].x = o.state.plazaMotion[0].x),
  'missing raw capture frame': r => modifyObservation(r, o => o.state.plazaMotion = o.state.plazaMotion.filter(s => s.courtyardFrame.frame !== 15)),
  'native sample overflow': r => modifyObservation(r, o => o.state.plazaMotionOverflow = true),
  'hidden raw jump sample': r => modifyObservation(r, o => o.state.plazaMotion = o.state.plazaMotion.filter(s => s.courtyardFrame.frame !== 21)),
  'mismatched raw hero frame': r => modifyObservation(r, o => o.state.plazaMotion[0].courtyardFrame.hero.frameName++),
  'native motion claim': r => modifyObservation(r, o => o.state.plazaMotion[0].intent.x = 1),
  'browser error': r => modifyObservation(r, o => o.errors.push('bad')),
  'cleanup leaked': r => modifyObservation(r, o => o.afterCleanup.canvasCount = 1),
  'cleanup never closed': r => modifyObservation(r, o => o.afterCleanup.courtyardEvidence.visual.closed = false)
})) test(`visual verifier rejects ${name}`, () => { const r = report(); mutate(r); assert.throws(() => verifyVisual(r, 'execution')); });
test('PNG verifier validates CRC, dimensions, stream contents and does not accept header-only bytes', () => {
  const bytes = png(20, 20); verifyVisualPNG(bytes, { width: 20, height: 20 });
  assert.throws(() => verifyVisualPNG(bytes.subarray(0, 50), { width: 20, height: 20 }));
  const bad = Buffer.from(bytes); bad[bad.length - 1] ^= 1; assert.throws(() => verifyVisualPNG(bad, { width: 20, height: 20 }));
  assert.throws(() => verifyVisualPNG(bytes, { width: 21, height: 20 }));
});

function modifyCoherentDriver(r, callback) {
  let driver;
  modifyDriver(r, value => {
    callback(value);
    value.captureState.history = structuredClone(value.captures.map(c => c.metadata));
    value.captures.forEach((capture, i) => { capture.metadata.poseReceipt = structuredClone(value.visual.receipts[i]); });
    value.captureState.history = structuredClone(value.captures.map(c => c.metadata));
    driver = value;
  });
  modifyObservation(r, value => {
    value.state.courtyardEvidence.visual = structuredClone(driver.visual);
    value.afterCleanup.courtyardEvidence.visual = { ...structuredClone(driver.visual), closed: true };
  });
}
for (const [name, mutate] of Object.entries({
  'capture gameplay must match assigned pose': d => d.captures[0].metadata.gameplay.x++,
  'capture camera must match settled frame': d => {
    const g = d.captures[0].metadata.gameplay;
    g.viewportGeometry.camera.scrollX++; g.courtyardVisibility.camera.scrollX++;
  },
  'combined visibility must be valid': d => d.captures[0].metadata.gameplay.courtyardVisibility.valid = false,
  'combined hero sample count is bounded': d => d.captures[0].metadata.gameplay.courtyardVisibility.samples = 16385,
  'actual combined wall command buffer is required': d => d.captures[0].metadata.gameplay.courtyardVisibility.walls[0].commands[10]++,
  'actual combined hero painter order is required': d => d.captures[0].metadata.gameplay.courtyardVisibility.hero.painterIndex++,
  'actual wall object identity is required': d => d.captures[0].metadata.gameplay.townArt.ground.courtyard[0].objectId++,
  'base64 length must match attachment': d => d.captures[0].metadata.base64Chars++,
  'actual backing dimensions must match PNG': d => d.captures[0].metadata.backing.width++,
  'actual capture SHA must match PNG': d => d.captures[0].pngSHA256 = '0'.repeat(64),
  'visual captures must stay separate': d => d.captures[0].metadata.nativeMovementEvidence = true,
  'probe response must be same observed frame': d => d.captures[0].metadata.gameplay.plazaProbe.respondedAt++,
  'capture follows settled pose': d => d.captures[0].metadata.gameplay.plazaProbe.requestedAt = 1,
  'capture settlement frame cannot be forged': d => d.visual.receipts[0].settledNativeFrame++,
  'capture native frame must match actual gameplay': d => d.captures[0].metadata.nativeFrame++,
  'capture hero frame must match actual gameplay': d => d.captures[0].metadata.heroFrame.frameName++,
  'capture native frame follows settlement': d => { d.captures[0].metadata.nativeFrame = d.visual.receipts[0].settledNativeFrame; d.captures[0].metadata.gameplay.courtyardFrame.frame = d.visual.receipts[0].settledNativeFrame; },
  'animation must really be idle': d => d.visual.receipts[0].frames[0].sprite.animation = 'hero-knight_armed_walk-S',
  'witness points must fit actual visible art band': d => {
    const receipt = d.visual.receipts[4], g = d.captures[4].metadata.gameplay;
    receipt.frames.forEach(f => f.camera.scrollX = 2500);
    g.viewportGeometry.camera.scrollX = 2500; g.courtyardVisibility.camera.scrollX = 2500;
  }
})) test(`coherent visual metadata rejects ${name}`, () => {
  const r = report(); modifyCoherentDriver(r, mutate); assert.throws(() => verifyVisual(r, 'execution'));
});
test('settled screenshot proof is not a frame animation coverage claim', () => {
  const h = harness(); h.scene.playerSprite.anims.currentAnim.key = 'hero-knight_armed_attack-S';
  h.controller.assign('home'); h.tick(); assert.match(h.controller.snapshot().errors.join(), /idle frame/);
});

test('zero simulation delta remains valid stationary visual evidence with increasing native frame IDs', () => {
  const h = harness(); h.scene.sys.game.loop.delta = 0; h.controller.assign('home');
  const settled = h.settle(); assert(settled.frames.every((frame, i, all) => !i || frame.nativeFrame > all[i - 1].nativeFrame));
  const r = report();
  for (const spec of r.suites[0].specs) {
    const attachments = spec.tests[0].results[0].attachments;
    for (const attachment of attachments.filter(a => a.contentType === 'application/json')) {
      const value = JSON.parse(Buffer.from(attachment.body, 'base64').toString());
      if (attachment.name === 'arpg-real-engine-observations') for (const state of [value.state, value.afterCleanup]) state.plazaMotion.forEach(sample => sample.courtyardFrame.delta = 0);
      else {
        value.captures.forEach(capture => capture.metadata.gameplay.courtyardFrame.delta = 0);
        value.captureState.history = structuredClone(value.captures.map(capture => capture.metadata));
      }
      attachment.body = Buffer.from(JSON.stringify(value)).toString('base64');
    }
  }
  assert.match(verifyVisual(r, 'execution'), /visual-only/);
});
