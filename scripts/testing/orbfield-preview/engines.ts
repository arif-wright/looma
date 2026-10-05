import { createDodgeSurvive, type OrbfieldOptions, type OrbfieldInstance, type OrbfieldState } from '../../../src/lib/games/dodgeSurvive';
import { fixture } from './runtime';

// Observes the actual engine through its public callback. Gameplay and inputs are unchanged.
export const realEngine = (options: OrbfieldOptions): OrbfieldInstance => {
  const instance = createDodgeSurvive({
    ...options,
    onStateChange(state) {
      fixture.engineState = structuredClone(state);
      fixture.player = { x: state.playerX, y: state.playerY };
      options.onStateChange?.(state);
    }
  });
  return { ...instance, destroy() { instance.destroy(); fixture.engineEvents.push('real:destroy'); } };
};

// Only lifecycle tests select this manually finished engine. It does not test gameplay.
export const lifecycleEngine = (options: OrbfieldOptions): OrbfieldInstance => {
  let destroyed = false;
  let finished = false;
  let paused = false;
  const state: OrbfieldState = { score: 0, elapsedMs: 0, slowCharges: 3, slowMoActive: false, playerX: options.canvas.width / 2, playerY: options.canvas.height / 2 };
  const publish = () => { fixture.engineState = { ...state }; options.onStateChange?.({ ...state }); };
  const event = (name: string) => { if (!destroyed) fixture.engineEvents.push(`lifecycle:${name}`); };
  fixture.finish = (result) => {
    if (destroyed || finished) return;
    finished = true;
    options.onGameOver(result);
  };
  return {
    start() { event('start'); publish(); },
    pause() { event('pause'); paused = true; },
    resume() { event('resume'); paused = false; },
    activateSlowMo() { if (destroyed || finished || paused || state.slowCharges <= 0) return; state.slowCharges--; state.slowMoActive = true; event('warp'); publish(); },
    getState() { return { ...state }; },
    destroy() { if (!destroyed) fixture.engineEvents.push('lifecycle:destroy'); destroyed = true; }
  };
};
