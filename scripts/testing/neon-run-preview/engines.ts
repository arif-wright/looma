import { createEndlessRunner, type EndlessRunnerOptions, type EndlessRunnerInstance, type EndlessRunnerState } from '../../../src/lib/games/endlessRunner';
import { fixture } from './runtime';
const observeOptions = (options: EndlessRunnerOptions) => {
  const assets = ('skinAssets' in options && options.skinAssets ? options.skinAssets : {}) as Record<string, HTMLImageElement>;
  fixture.engineOptions = { maxDurationMs: options.maxDurationMs, reducedMotion: typeof options.reducedMotion === 'function' ? options.reducedMotion() : Boolean(options.reducedMotion),
    skinLoaded: ['background', 'ground', 'props', 'adventurer', 'echo'].every((key) => assets[key]?.naturalWidth > 0 && assets[key]?.naturalHeight > 0) };
};

// Observe only public state; this factory does not replace gameplay, clocks or inputs.
export const realEngine = (options: EndlessRunnerOptions): EndlessRunnerInstance => {
  observeOptions(options);
  const instance = createEndlessRunner({ ...options, onStateChange(state) {
    fixture.engineState = structuredClone(state); options.onStateChange?.(state);
  } });
  fixture.readEngineState = () => instance.getState();
  return { ...instance, destroy() { instance.destroy(); fixture.engineEvents.push('real:destroy'); } };
};

// Explicitly selected only by lifecycle tests. Never used as physics/input evidence.
export const lifecycleEngine = (options: EndlessRunnerOptions): EndlessRunnerInstance => {
  observeOptions(options);
  let destroyed = false, finished = false, paused = false;
  const initial = (): EndlessRunnerState => ({ score: 0, elapsedMs: 0, simulationElapsedMs: 0, distanceMeters: 0, shardsCollected: 0,
    playerX: options.canvas.width * .2, playerY: options.canvas.height * .75, onGround: true,
    powerups: { shield: true, magnet: 0, doubleShards: 0, slowMo: 0, dash: 0, dreamSurge: 0 } });
  let state = initial();
  const publish = () => { fixture.engineState = structuredClone(state); options.onStateChange?.(structuredClone(state)); };
  const event = (name: string) => { if (!destroyed) fixture.engineEvents.push(`lifecycle:${name}`); };
  fixture.readEngineState = () => structuredClone(state);
  fixture.finish = (result) => {
    if (destroyed || finished) return;
    finished = true;
    state = { ...state, score: result.score, elapsedMs: result.durationMs, simulationElapsedMs: result.meta?.simulation_elapsed_ms ?? result.durationMs,
      distanceMeters: result.meta?.distance_meters ?? 0, shardsCollected: result.meta?.shards ?? 0 };
    fixture.finishedSource = result; publish(); options.onGameOver(result);
  };
  return {
    start() { event('start'); publish(); },
    pause() { event('pause'); paused = true; },
    resume() { event('resume'); paused = false; },
    reset() { event('reset'); state = initial(); finished = false; paused = false; publish(); },
    playerJump() { if (destroyed || finished || paused) return; event('jump'); },
    getState() { return structuredClone(state); },
    destroy() { if (!destroyed) fixture.engineEvents.push('lifecycle:destroy'); destroyed = true; }
  };
};
