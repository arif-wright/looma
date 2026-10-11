// Offline storage and event-wiring tests. These mocks do NOT measure Phaser,
// browser latency, GPU work, actual rendered frames, or production performance.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { BoundedNumericBuffer, PromptTimingMetrics, parsePromptTimingHash, KEY_CODES } from './prompt-timing-metrics.mjs';

const makeMetrics = (mode = 'candidate', capacities) => new PromptTimingMetrics({ mode, runId: 7, now: () => 10, capacities });
function frame(metrics, id, at = 30) { metrics.recordPostRender(id, at, true, 1472, 536, 1, 0, 0, 1, false); }

test('bounded numeric buffer preserves initial samples and reports all overflow attempts', () => {
  const buffer = new BoundedNumericBuffer(2, 2), data = buffer.data;
  const first = buffer.reserve(); buffer.write(first, 0, 1.5); buffer.write(first, 1, 2.5);
  const second = buffer.reserve(); buffer.write(second, 0, 3.5); buffer.write(second, 1, 4.5);
  assert.equal(buffer.reserve(), -1); buffer.write(-1, 0, 999);
  assert.equal(buffer.reserve(), -1);
  assert.equal(buffer.total, 4); assert.equal(buffer.count, 2); assert.equal(buffer.overflow, true);
  assert.equal(buffer.data, data); assert.equal(buffer.data.byteLength, 32);
  assert.deepEqual(buffer.snapshot(['x', 'y']), [{ x: 1.5, y: 2.5 }, { x: 3.5, y: 4.5 }]);
});
test('reset reuses the same preallocated buffer, clears data, counts, and overflow', () => {
  const buffer = new BoundedNumericBuffer(1, 1), data = buffer.data;
  buffer.write(buffer.reserve(), 0, 9); buffer.reserve(); buffer.reset();
  assert.equal(buffer.data, data); assert.equal(buffer.data[0], 0); assert.equal(buffer.count, 0);
  assert.equal(buffer.total, 0); assert.equal(buffer.overflow, false); assert.deepEqual(buffer.snapshot(['x']), []);
  buffer.write(buffer.reserve(), 0, 4); assert.deepEqual(buffer.snapshot(['x']), [{ x: 4 }]);
});
test('numeric buffer rejects non-finite data and invalid dimensions or cells', () => {
  for (const capacity of [0, -1, 1.1, Infinity, 1000001]) assert.throws(() => new BoundedNumericBuffer(capacity, 2));
  const buffer = new BoundedNumericBuffer(1, 1); buffer.reserve();
  for (const value of [NaN, Infinity, -Infinity, '1', undefined]) assert.throws(() => buffer.write(0, 0, value));
  assert.throws(() => buffer.write(1, 0, 0)); assert.throws(() => buffer.write(0, 1, 0));
  assert.throws(() => buffer.snapshot([]));
});
test('hash parser accepts only explicit candidate/bypass and safe integer run IDs', () => {
  assert.deepEqual(parsePromptTimingHash('#promptMode=candidate&promptRun=2'), { mode: 'candidate', runId: 2 });
  assert.deepEqual(parsePromptTimingHash('#promptRun=0&promptMode=bypass'), { mode: 'bypass', runId: 0 });
  for (const hash of ['', '#promptMode=x&promptRun=1', '#promptMode=candidate', '#promptMode=bypass&promptRun=-1',
    '#promptMode=bypass&promptRun=1.2', '#promptMode=bypass&promptRun=9007199254740992', '#promptMode=bypass&promptRun='])
    assert.throws(() => parsePromptTimingHash(hash));
});
test('frames use real supplied timestamps, scalar state, and per-frame actual callback counts', () => {
  const metrics = makeMetrics(), id = metrics.registerScene(11); metrics.createdScene(id, 12);
  metrics.recordUpdate(id, 20, 23, 1000, 16.67);
  metrics.recordPreRender(id, 24); metrics.recordPrompt(id, 25, 27, true); frame(metrics, id, 30);
  metrics.setStage('motion', 32); metrics.recordUpdate(id, 35, 36, 1016.67, 16.67);
  metrics.recordPreRender(id, 38); metrics.recordPrompt(id, 39, 39.5, true); metrics.recordPrompt(id, 40, 41, true); frame(metrics, id, 47);
  const result = metrics.snapshot(50);
  assert.equal(result.kind, 'arpg-prompt-timing-diagnostic'); assert.equal(result.version, 1);
  assert.equal(result.mode, 'candidate'); assert.equal(result.runId, 7); assert.equal(result.counterfactual, false);
  assert.equal(result.frames[0].intervalMs, null); assert.equal(result.frames[1].intervalMs, 17);
  assert.equal(result.frames[0].renderPhaseMs, 6); assert.equal(result.frames[1].renderPhaseMs, 9);
  assert.equal(result.frames[0].sceneUpdateMs, 3); assert.equal(result.frames[1].sceneUpdateMs, 1);
  assert.equal(result.frames[0].promptMs, 2); assert.equal(result.frames[1].promptMs, 1.5);
  assert.equal(result.frames[0].promptCalls, 1); assert.equal(result.frames[1].promptCalls, 2);
  assert.equal(result.frames[1].promptExecutedCalls, 2); assert.equal(result.frames[1].stage, 'motion');
  assert.equal(result.frames[1].x, 1472); assert.equal(result.frames[1].y, 536); assert.equal(result.frames[1].intentX, 1);
  assert.equal(result.frames[1].mainCameraFollowupdateListenerCount, 1);
  assert.equal(result.counts.promptCalls, 3); assert.equal(result.counts.promptMs, 3.5);
  assert.equal(result.counts.sceneUpdateCalls, 2); assert.equal(result.counts.sceneUpdateMs, 4);
  assert.equal(result.counts.preRenderCalls, 2); assert.equal(result.counts.invalidSamples, 0);
  assert.equal(metrics.frameCount, 2); assert.equal(result.stageEvents[1].at, 32); assert.equal(result.stageEvents[1].frameCount, 1);
  assert.equal(result.scenes[0].installedAt, 11); assert.equal(result.scenes[0].createdAt, 12);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
test('frame overflow is explicit while actual callback counts and accumulators keep updating', () => {
  const metrics = makeMetrics('candidate', { frames: 1 }), id = metrics.registerScene(11);
  metrics.recordPreRender(id, 20); metrics.recordPrompt(id, 21, 22, true); frame(metrics, id, 30);
  metrics.recordPreRender(id, 35); metrics.recordPrompt(id, 36, 38, true); frame(metrics, id, 40);
  const result = metrics.snapshot();
  assert.equal(metrics.frameCount, 2); assert.equal(result.frames.length, 1); assert.equal(result.counts.framesStored, 1);
  assert.equal(result.overflow.frames, true); assert.equal(result.counts.promptCalls, 2); assert.equal(result.counts.promptMs, 3);
});
test('bypass counts skipped callback invocations and records the raw no-op timing bracket', () => {
  const metrics = makeMetrics('bypass'), id = metrics.registerScene(11);
  metrics.recordPreRender(id, 20); metrics.recordPrompt(id, 21, 21.25, false); frame(metrics, id);
  const result = metrics.snapshot();
  assert.equal(result.counterfactual, true); assert.match(result.bypassInterpretation, /Visibility state and subsequent render work may differ/);
  assert.equal(result.counts.promptCalls, 1); assert.equal(result.counts.promptExecutedCalls, 0);
  assert.equal(result.counts.promptBypassedCalls, 1); assert.equal(result.counts.promptMs, 0.25);
  assert.match(result.promptTimingInterpretation, /bypass measures the no-op branch/);
});
test('only trusted specified key data are recorded with separate native and observed timestamps', () => {
  const metrics = makeMetrics('candidate', { keyEvents: 1 }), id = metrics.registerScene(11);
  metrics.recordKey(id, 20, 19.5, 0, true, false, false);
  metrics.recordKey(id, 21, 20.5, 4, true, false, true);
  metrics.recordKey(id, 22, 21.5, 4, false, false, true);
  const result = metrics.snapshot();
  assert.equal(result.counts.keyEvents, 2); assert.equal(result.keyEvents.length, 1); assert.equal(result.overflow.keyEvents, true);
  assert.deepEqual(result.keyEvents[0], { sequence: 1, sceneId: 1, at: 21, eventTimeStamp: 20.5, repeat: false,
    stage: 'warmup', code: 'Space', type: 'keydown', isTrusted: true });
});
test('stage and scene capacities are hard bounds with lifecycle metadata and no duplicate stop count', () => {
  const metrics = makeMetrics('candidate', { stageEvents: 2, scenes: 1 });
  const id = metrics.registerScene(11); metrics.createdScene(id, 12);
  assert.equal(metrics.setStage('motion', 20), 20); assert.equal(metrics.setStage('checkpoint', 21), 21);
  assert.equal(metrics.registerScene(22), 0); metrics.stoppedScene(id, 23, 1); metrics.stoppedScene(id, 24, 2);
  const result = metrics.snapshot();
  assert.equal(result.stage, 'checkpoint'); assert.equal(result.counts.stageEvents, 3); assert.equal(result.stageEvents.length, 2);
  assert.equal(result.counts.scenes, 2); assert.equal(result.scenes.length, 1); assert.equal(result.counts.activeScenes, 0);
  assert.equal(result.scenes[0].stoppedAt, 23); assert.equal(result.scenes[0].stopReason, 'shutdown');
  assert.equal(result.overflow.scenes, true); assert.equal(result.overflow.stageEvents, true);
});
test('neutral stage is an explicit timestamped stage for stationary comparison', () => {
  const metrics = makeMetrics(), id = metrics.registerScene(11);
  assert.equal(metrics.setStage('neutral', 20), 20);
  metrics.recordPreRender(id, 21); frame(metrics, id, 30);
  assert.equal(metrics.snapshot().stage, 'neutral'); assert.equal(metrics.snapshot().frames[0].stage, 'neutral');
  assert.equal(metrics.snapshot().stageEvents[1].at, 20);
});
test('missing render pairs and invalid data remain explicit instead of invented measurements', () => {
  const metrics = makeMetrics(), id = metrics.registerScene(11);
  metrics.recordUpdate(id, 20, 19, 0, 16); metrics.recordPrompt(id, 20, NaN, true);
  metrics.recordPostRender(id, 25, true, NaN, 1, 0, 0, 0, 1, false);
  frame(metrics, id, 30);
  metrics.recordPreRender(id, 31); metrics.recordPreRender(id, 32);
  metrics.recordPostRender(id, 40, false, NaN, NaN, NaN, NaN, NaN, 1, true);
  const result = metrics.snapshot();
  assert.equal(result.counts.invalidSamples, 3); assert.equal(result.counts.unpairedPostRenderCalls, 1);
  assert.equal(result.counts.frames, 3); assert.equal(result.counts.framesAccepted, 2); assert.equal(metrics.frameCount, 3);
  assert.equal(result.counts.promptCalls, 1); assert.equal(result.counts.sceneUpdateCalls, 1);
  assert.equal(result.counts.overwrittenPreRenderCalls, 1); assert.equal(result.frames[0].renderPhaseMs, null);
  assert.equal(result.frames[1].renderPhaseMs, 8); assert.equal(result.frames[1].x, null); assert.equal(result.frames[1].documentHidden, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

function mockObserver(mode = 'candidate') {
  let clock = 10;
  class MockScene {
    constructor() {
      this.events = new EventEmitter(); this.sys = { game: { events: new EventEmitter() } };
      this.cameras = { main: new EventEmitter() }; this.initialized = true;
      this.world = { getTransform: () => this.position }; this.position = { x: 1472, y: 536 };
      this.playerId = 1; this.movementInput = { x: 0, y: 0 }; this.expedition = { area: 0 };
      this.promptRuns = 0; this.updateRuns = 0; this.initRuns = 0;
    }
    init(data) { this.initRuns++; this.initData = data; return 17; }
    update(time, delta) { this.updateRuns++; this.args = [time, delta]; clock += 3; if (this.throwUpdate) throw this.throwUpdate; return 19; }
    updatePortalPromptVisibility() { this.promptRuns++; clock += 2; if (this.throwPrompt) throw this.throwPrompt; return 23; }
  }
  const listeners = new EventEmitter(), optionHistory = [];
  const window = {
    devicePixelRatio: 1,
    addEventListener(type, callback, options) { optionHistory.push({ type, options }); listeners.on(type, callback); },
    removeEventListener(type, callback, options) { assert.equal(options.passive, true); assert.equal(options.capture, true); listeners.off(type, callback); }
  };
  const Phaser = { VERSION: 'offline-mock', Core: { Events: { PRE_RENDER: 'prerender', POST_RENDER: 'postrender', DESTROY: 'game-destroy' } },
    Scenes: { Events: { CREATE: 'create', SHUTDOWN: 'shutdown', DESTROY: 'destroy' } },
    Cameras: { Scene2D: { Events: { FOLLOW_UPDATE: 'followupdate' } } } };
  const source = readFileSync(new URL('./prompt-timing-observer.ts', import.meta.url), 'utf8');
  const stripped = stripTypeScriptTypes(source, { mode: 'strip' }).replace(/^import .*;\s*$/gm, '');
  runInNewContext(stripped, { Phaser, GameScene: MockScene, PromptTimingMetrics, parsePromptTimingHash, KEY_CODES,
    location: { hash: `#promptMode=${mode}&promptRun=9` }, window, document: { hidden: false, visibilityState: 'visible' },
    navigator: { hardwareConcurrency: 4 }, performance: { now: () => clock } });
  const scene = new MockScene(), api = window.__arpgPromptTiming;
  return { scene, api, window, listeners, optionHistory, setClock(value) { clock = value; }, getClock() { return clock; } };
}
test('actual observer installs once in init, preserves original update/callback return values, and timestamps before fixture inspection', () => {
  const mock = mockObserver(), { scene, api } = mock;
  assert.equal(api.snapshot().startedAt, 10); assert.equal(api.setStage('neutral'), 10);
  assert.equal(scene.init('input'), 17); assert.equal(scene.initData, 'input'); scene.init('again');
  assert.equal(scene.initRuns, 2); assert.equal(scene.sys.game.events.listenerCount('postrender'), 1);
  scene.events.emit('create'); scene.cameras.main.on('followupdate', () => scene.updatePortalPromptVisibility());
  scene.sys.game.events.on('postrender', () => mock.setClock(mock.getClock() + 100));
  mock.setClock(20); assert.equal(scene.update(100, 16), 19);
  scene.sys.game.events.emit('prerender'); assert.equal(scene.updatePortalPromptVisibility(), 23);
  scene.sys.game.events.emit('postrender');
  const result = api.snapshot();
  assert.equal(scene.updateRuns, 1); assert.equal(scene.promptRuns, 1);
  assert.equal(result.frames[0].at, 25); assert.equal(result.frames[0].renderPhaseMs, 2);
  assert.equal(result.frames[0].sceneUpdateMs, 3); assert.equal(result.frames[0].promptMs, 2);
  assert.equal(result.mainCameraFollowupdateListenerCount, 1); assert.equal(api.frameCount, 1);
  assert.equal(result.counts.scenes, 1); assert.equal(result.counts.invalidSamples, 0);
});
test('observer bypass skips the actual method while counting native followupdate invocations', () => {
  const { scene, api } = mockObserver('bypass'); scene.init(); scene.events.emit('create');
  scene.cameras.main.on('followupdate', () => scene.updatePortalPromptVisibility());
  scene.sys.game.events.emit('prerender'); scene.cameras.main.emit('followupdate'); scene.sys.game.events.emit('postrender');
  assert.equal(scene.promptRuns, 0); assert.equal(api.snapshot().counts.promptCalls, 1);
  assert.equal(api.snapshot().counts.promptExecutedCalls, 0); assert.equal(api.snapshot().counts.promptMs, 0);
});
test('observer passive native key listeners ignore untrusted events and unrelated keys', () => {
  const { scene, api, listeners, optionHistory, setClock } = mockObserver(); scene.init(); scene.events.emit('create'); setClock(20);
  assert.equal(optionHistory.length, 2); assert(optionHistory.every(entry => entry.options.passive && entry.options.capture));
  listeners.emit('keydown', { code: 'KeyW', type: 'keydown', timeStamp: 19, repeat: false, isTrusted: false });
  listeners.emit('keydown', { code: 'KeyQ', type: 'keydown', timeStamp: 19, repeat: false, isTrusted: true });
  listeners.emit('keydown', { code: 'Space', type: 'keydown', timeStamp: 19, repeat: false, isTrusted: true });
  setClock(22); listeners.emit('keyup', { code: 'Space', type: 'keyup', timeStamp: 21, repeat: false, isTrusted: true });
  const result = api.snapshot(); assert.equal(result.keyEvents.length, 2);
  assert.equal(result.keyEvents[0].at, 20); assert.equal(result.keyEvents[0].eventTimeStamp, 19);
  assert.equal(result.keyEvents[1].type, 'keyup'); assert.equal(result.keyEvents[1].at, 22);
});
for (const stop of ['shutdown', 'destroy', 'game-destroy']) test(`observer removes all its listeners on ${stop} and keeps other observers`, () => {
  const { scene, api, listeners } = mockObserver(); scene.init();
  const unrelated = () => {}; scene.sys.game.events.on('postrender', unrelated);
  if (stop === 'game-destroy') scene.sys.game.events.emit(stop); else scene.events.emit(stop);
  assert.equal(scene.sys.game.events.listenerCount('prerender'), 0); assert.equal(scene.sys.game.events.listenerCount('postrender'), 1);
  assert.equal(scene.sys.game.events.listeners('postrender')[0], unrelated); assert.equal(scene.sys.game.events.listenerCount('game-destroy'), 0);
  assert.equal(scene.events.listenerCount('create'), 0); assert.equal(scene.events.listenerCount('shutdown'), 0); assert.equal(scene.events.listenerCount('destroy'), 0);
  assert.equal(listeners.listenerCount('keydown'), 0); assert.equal(listeners.listenerCount('keyup'), 0);
  assert.equal(api.snapshot().counts.activeScenes, 0); assert.equal(api.snapshot().scenes[0].stopReason, stop);
});
test('observer can reattach once after a genuine scene restart and reports current camera listeners on snapshot', () => {
  const { scene, api } = mockObserver(); scene.init(); scene.events.emit('create');
  const follow = () => scene.updatePortalPromptVisibility(); scene.cameras.main.on('followupdate', follow);
  scene.events.once('shutdown', () => scene.cameras.main.off('followupdate', follow));
  scene.events.emit('shutdown'); assert.equal(api.snapshot().mainCameraFollowupdateListenerCount, 0);
  scene.init(); scene.events.emit('create'); assert.equal(scene.sys.game.events.listenerCount('postrender'), 1);
  assert.equal(api.snapshot().counts.scenes, 2); assert.equal(api.snapshot().counts.activeScenes, 1);
});
test('observer preserves thrown errors and still records the actual completed timing bracket', () => {
  const { scene, api } = mockObserver(); scene.init(); scene.events.emit('create');
  const error = new Error('original failure'); scene.throwPrompt = error; scene.throwUpdate = error;
  assert.throws(() => scene.update(1, 16), value => value === error);
  assert.throws(() => scene.updatePortalPromptVisibility(), value => value === error);
  const result = api.snapshot(); assert.equal(result.counts.sceneUpdateCalls, 1); assert.equal(result.counts.sceneUpdateMs, 3);
  assert.equal(result.counts.promptCalls, 1); assert.equal(result.counts.promptMs, 2);
});
test('environment and existing WebGL parameters are read only by snapshot, never on renderer hot path', () => {
  const { scene, api } = mockObserver(); let parameterReads = 0, extensionReads = 0;
  scene.sys.game.renderer = { type: 2, gl: { VERSION: 1, RENDERER: 2, VENDOR: 3,
    getParameter(parameter) { parameterReads++; return `parameter-${parameter}`; },
    getExtension(name) { extensionReads++; assert.equal(name, 'WEBGL_debug_renderer_info'); return null; } } };
  scene.sys.game.canvas = { width: 800, height: 600 }; scene.sys.game.loop = { targetFps: 60, actualFps: 58.5 };
  scene.init(); scene.events.emit('create'); scene.update(100, 16); scene.sys.game.events.emit('prerender');
  scene.updatePortalPromptVisibility(); scene.sys.game.events.emit('postrender');
  assert.equal(parameterReads, 0); assert.equal(extensionReads, 0);
  const result = api.snapshot(); assert.equal(parameterReads, 3); assert.equal(extensionReads, 1);
  assert.equal(result.environment.phaserVersion, 'offline-mock'); assert.equal(result.environment.rendererType, 2);
  assert.equal(result.environment.canvasPixelSize.width, 800); assert.equal(result.environment.hardwareConcurrency, 4);
  assert.equal(result.environment.loop.targetFps, 60); assert.equal(result.environment.loop.actualFps, 58.5);
  assert.equal(result.environment.webgl.renderer, 'parameter-2'); assert.equal(result.environment.webgl.unmaskedRenderer, null);
});
test('cleanup snapshot stays safe after game renderer, canvas, and scene systems are destroyed', () => {
  const { scene, api } = mockObserver(); scene.init(); scene.events.emit('create');
  scene.sys.game.renderer = { type: 2 }; scene.sys.game.canvas = { width: 800, height: 600 };
  const before = api.snapshot(); assert.equal(before.environment.canvasPixelSize.width, 800);
  scene.sys.game.events.emit('game-destroy');
  scene.sys.game.renderer = null; scene.sys.game.canvas = null;
  assert.equal(api.snapshot().environment.canvasPixelSize, null);
  scene.sys.game = null; assert.equal(api.snapshot().environment.rendererType, null);
  scene.sys = null;
  const after = api.snapshot(); assert.equal(after.counts.activeScenes, 0);
  assert.equal(after.mainCameraFollowupdateListenerCount, 0); assert.equal(after.scenes[0].stopReason, 'game-destroy');
  assert.equal(after.environment.webgl, null); assert.equal(after.environment.canvasPixelSize, null);
  assert.equal(before.environment.canvasPixelSize.width, 800);
});
