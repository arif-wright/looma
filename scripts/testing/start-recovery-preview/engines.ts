import type { EndlessRunnerOptions, EndlessRunnerInstance, EndlessRunnerState } from '../../../src/lib/games/endlessRunner';
import type { OrbfieldOptions, OrbfieldInstance, OrbfieldState } from '../../../src/lib/games/dodgeSurvive';
import { fixture } from './runtime';
export type { EndlessRunnerOptions, EndlessRunnerInstance, EndlessRunnerState } from '../../../src/lib/games/endlessRunner';
const runnerState = (): EndlessRunnerState => ({ score: 0, elapsedMs: 0, simulationElapsedMs: 0, distanceMeters: 0,
  shardsCollected: 0, playerX: 192, playerY: 405, onGround: true,
  powerups: { shield: true, magnet: 0, doubleShards: 0, slowMo: 0, dash: 0, dreamSurge: 0 } });
const orbState = (): OrbfieldState => ({ score: 0, elapsedMs: 0, slowCharges: 3, slowMoActive: false, playerX: 480, playerY: 270 });
function lifecycle(options: EndlessRunnerOptions | OrbfieldOptions) {
  const id = fixture.engines.length;
  fixture.engines.push({ id, skinKeys: Object.keys(options.skinAssets ?? {}) });
  let destroyed = false, finished = false;
  const record = (event: string) => { if (!destroyed) fixture.engineEvents.push(`${id}:${event}`); };
  fixture.finish = (result) => {
    if (destroyed || finished) throw new Error('Synthetic engine cannot finish twice or after teardown.');
    finished = true;
    options.onGameOver(result);
  };
  return {
    start() { record('start'); }, pause() { record('pause'); }, resume() { record('resume'); },
    reset() { record('reset'); }, playerJump() { record('jump'); }, activateSlowMo() { record('slowmo'); },
    destroy() { record('destroy'); destroyed = true; }
  };
}
// FAKE lifecycle-only engine. No Phaser, movement, collisions, frame loop or physics.
export const createEndlessRunner = (options: EndlessRunnerOptions): EndlessRunnerInstance => ({ ...lifecycle(options), getState: runnerState });
export const createOrbfield = (options: OrbfieldOptions): OrbfieldInstance => ({ ...lifecycle(options), getState: orbState });
