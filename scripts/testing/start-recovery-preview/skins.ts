// Real maintained loaders and original checked-in art. Only the optional, explicitly
// synthetic post-preload gate is added for cancellation-during-preload tests.
import { loadRunnerLanternwaySkin as loadRunner } from '../../../src/lib/games/runnerLanternwaySkin';
import { loadOrbfieldSkin as loadOrbfield } from '../../../src/lib/games/orbfieldSkin';
import { fixture } from './runtime';
export { RUNNER_LANTERNWAY_URLS, type RunnerLanternwayAssets } from '../../../src/lib/games/runnerLanternwaySkin';
export { ORBFIELD_SKIN_URLS, type OrbfieldSkinLoad } from '../../../src/lib/games/orbfieldSkin';
export const loadRunnerLanternwaySkin = async (options: Parameters<typeof loadRunner>[0]) => fixture.waitForArtGate(await loadRunner(options));
export const loadOrbfieldSkin = async (options: Parameters<typeof loadOrbfield>[0]) => fixture.waitForArtGate(await loadOrbfield(options));
