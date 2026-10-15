import Phaser from 'phaser';
import { GameScene } from '../../../src/lib/games/arpg/scenes/GameScene';
import { KEY_CODES, PromptTimingMetrics, parsePromptTimingHash } from './prompt-timing-metrics.mjs';
import type { World, EntityId } from '../../../src/lib/games/arpg/ecs/components';

// Imported only by the separate local diagnostic entry, BEFORE fixture main.ts.
// Candidate executes the actual published method unchanged. Bypass deliberately
// skips it, changing visibility and possible render work as well as callback CPU.
const options = parsePromptTimingHash(location.hash);
const metrics = new PromptTimingMetrics({ ...options, now: () => performance.now() });
type Stage = 'warmup' | 'neutral' | 'motion' | 'checkpoint' | 'done';
type ObservedState = {
  initialized: boolean; world: World; playerId: EntityId | null;
  movementInput: { x: number; y: number }; expedition: { area: number };
};
type Context = {
  id: number; scene: GameScene; camera: Phaser.Cameras.Scene2D.Camera;
  active: boolean; created: boolean;
};
const contexts = new WeakMap<GameScene, Context>();
// Bounded retained references support actual listener counts in snapshots even
// after cleanup, without adding camera listeners of our own.
const retainedContexts: Array<Context | undefined> = new Array(metrics.capacities.scenes);
const keyboardOptions = Object.freeze({ capture: true, passive: true });

function install(scene: GameScene) {
  if (contexts.has(scene)) return;
  const id = metrics.registerScene(performance.now());
  if (!id) return; // Overflow is explicit and invalidates the diagnostic run.
  const camera = scene.cameras.main;
  const context: Context = { id, scene, camera, active: true, created: false };
  contexts.set(scene, context);
  retainedContexts[id - 1] = context;
  const gameEvents = scene.sys.game.events;
  const onCreate = () => { context.created = true; metrics.createdScene(id, performance.now()); };
  const onPreRender = () => {
    if (context.created) metrics.recordPreRender(id, performance.now());
  };
  const onPostRender = () => {
    if (!context.created) return;
    // Timestamp before reading scene state. This listener was attached in init,
    // before observe-scene.ts attaches its POST_RENDER inspection in preload.
    const at = performance.now();
    const state = scene as unknown as ObservedState;
    const position = state.initialized && state.playerId !== null ? state.world.getTransform(state.playerId) : undefined;
    metrics.recordPostRender(id, at, Boolean(position), position?.x ?? 0, position?.y ?? 0,
      state.movementInput.x, state.movementInput.y, state.expedition.area,
      camera.listenerCount(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE), document.hidden);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.isTrusted !== true) return;
    const codeId = KEY_CODES.indexOf(event.code);
    if (codeId < 0) return;
    metrics.recordKey(id, performance.now(), event.timeStamp, codeId, event.type === 'keydown', event.repeat, event.isTrusted);
  };
  const cleanup = (reason: number) => {
    if (!context.active) return;
    context.active = false;
    metrics.stoppedScene(id, performance.now(), reason);
    gameEvents.off(Phaser.Core.Events.PRE_RENDER, onPreRender);
    gameEvents.off(Phaser.Core.Events.POST_RENDER, onPostRender);
    gameEvents.off(Phaser.Core.Events.DESTROY, onGameDestroy);
    scene.events.off(Phaser.Scenes.Events.CREATE, onCreate);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    scene.events.off(Phaser.Scenes.Events.DESTROY, onDestroy);
    window.removeEventListener('keydown', onKey, keyboardOptions);
    window.removeEventListener('keyup', onKey, keyboardOptions);
    contexts.delete(scene); // A genuine restart can install exactly once again.
  };
  const onShutdown = () => cleanup(1);
  const onDestroy = () => cleanup(2);
  const onGameDestroy = () => cleanup(3);
  scene.events.once(Phaser.Scenes.Events.CREATE, onCreate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  scene.events.once(Phaser.Scenes.Events.DESTROY, onDestroy);
  gameEvents.on(Phaser.Core.Events.PRE_RENDER, onPreRender);
  gameEvents.on(Phaser.Core.Events.POST_RENDER, onPostRender);
  gameEvents.once(Phaser.Core.Events.DESTROY, onGameDestroy);
  window.addEventListener('keydown', onKey, keyboardOptions);
  window.addEventListener('keyup', onKey, keyboardOptions);
}

const prototype = GameScene.prototype as unknown as {
  init?: (this: GameScene, data: unknown) => unknown;
  updatePortalPromptVisibility: (this: GameScene) => unknown;
};
const originalInit = prototype.init;
const originalUpdate = GameScene.prototype.update;
const originalPrompt = prototype.updatePortalPromptVisibility;
if (typeof originalPrompt !== 'function') throw new Error('Published prompt callback is unavailable');
if (window.__arpgPromptTiming !== undefined) throw new Error('Prompt timing observer already installed');

// Phaser invokes init before preload. Wrapping preload would place our render
// listener AFTER observe-scene's existing callback and contaminate render cost.
prototype.init = function (data: unknown) {
  install(this);
  return originalInit?.call(this, data);
};
GameScene.prototype.update = function (time: number, delta: number) {
  const context = contexts.get(this);
  if (!context?.active) return originalUpdate.call(this, time, delta);
  const startedAt = performance.now();
  try { return originalUpdate.call(this, time, delta); }
  finally { metrics.recordUpdate(context.id, startedAt, performance.now(), time, delta); }
};
prototype.updatePortalPromptVisibility = function () {
  const context = contexts.get(this);
  if (!context?.active) return options.mode === 'candidate' ? originalPrompt.call(this) : undefined;
  const startedAt = performance.now();
  try { if (options.mode === 'candidate') return originalPrompt.call(this); }
  finally { metrics.recordPrompt(context.id, startedAt, performance.now(), options.mode === 'candidate'); }
};

function readEnvironment(context: Context | undefined) {
  // Snapshot-only context from the actual existing renderer. Never create a GL
  // context, issue timer queries, finish/flush GPU work, or sample this per frame.
  const game = context?.scene.sys?.game;
  const renderer = game?.renderer as unknown as { type?: number; gl?: WebGLRenderingContext | WebGL2RenderingContext } | undefined;
  const gl = renderer?.gl;
  let webgl: { version: string; renderer: string; vendor: string; unmaskedRenderer: string | null; unmaskedVendor: string | null } | null = null;
  let webglQueryError: string | null = null;
  if (gl) {
    try {
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      webgl = { version: String(gl.getParameter(gl.VERSION)), renderer: String(gl.getParameter(gl.RENDERER)),
        vendor: String(gl.getParameter(gl.VENDOR)),
        unmaskedRenderer: extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null,
        unmaskedVendor: extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : null };
    } catch (error) { webglQueryError = error instanceof Error ? error.message : String(error); }
  }
  return { phaserVersion: Phaser.VERSION, rendererType: renderer?.type ?? null,
    canvasPixelSize: game?.canvas ? { width: game.canvas.width, height: game.canvas.height } : null,
    devicePixelRatio: window.devicePixelRatio, visibilityState: document.visibilityState,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    loop: { targetFps: game?.loop?.targetFps ?? null, actualFps: game?.loop?.actualFps ?? null },
    webgl, webglQueryError };
}

const api = Object.freeze({
  setStage(stage: Stage) { return metrics.setStage(stage); },
  get frameCount() { return metrics.frameCount; },
  snapshot() {
    // Snapshot allocation is intentionally outside the measured motion loop.
    const result = metrics.snapshot();
    for (let index = 0; index < result.scenes.length; index++) {
      const context = retainedContexts[index];
      if (context) result.scenes[index]!.mainCameraFollowupdateListenerCount =
        context.camera.listenerCount(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE);
    }
    const lastScene = result.scenes[result.scenes.length - 1];
    return { ...result, mainCameraFollowupdateListenerCount: lastScene?.mainCameraFollowupdateListenerCount ?? null,
      environment: readEnvironment(retainedContexts[result.scenes.length - 1]),
      observerOrder: 'init listeners precede existing fixture preload POST_RENDER observer',
      sceneUpdateInterpretation: 'performance.now elapsed duration around the unchanged original Scene.update call; includes synchronous callees and may include main-thread preemption.' };
  }
});
declare global { interface Window { __arpgPromptTiming: typeof api; } }
window.__arpgPromptTiming = api;
