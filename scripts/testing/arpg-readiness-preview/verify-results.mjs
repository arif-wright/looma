import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TITLES, isExpectedConsoleError } from './cases.mjs';
const FILE = 'readiness.browser.spec.ts', PROJECT = 'chromium-arpg-readiness';
export const SCREENSHOTS = [
  'initialized-scene-known-floor-wall-visual-defect', 'actual-route-image-download-failure',
  'actual-route-image-decode-failure', 'actual-route-native-30-second-asset-timeout'
];
const empty = (value, reason) => assert.deepEqual(value, [], reason);
export function verify(report, mode) {
  assert(['discovery', 'execution'].includes(mode));
  const execution = mode === 'execution';
  empty(report.errors, 'No global errors');
  assert.equal(report.config.version, '1.57.0');
  assert.equal(report.config.forbidOnly, true);
  assert.equal(report.config.workers, 1);
  assert.equal(report.config.shard, null);
  assert.equal(report.config.projects.length, 1);
  const project = report.config.projects[0];
  assert.equal(project.name, PROJECT); assert.equal(project.id, PROJECT);
  assert.equal(project.repeatEach, 1); assert.equal(project.retries, 0);
  assert.deepEqual(project.testMatch, [FILE]);
  assert.equal(report.suites.length, 1);
  const file = report.suites[0];
  assert.equal(file.file, FILE); assert.equal(file.title, FILE);
  empty(file.suites ?? [], 'No unexpected nested suites');
  assert.equal(file.specs.length, TITLES.length);
  const seenTitles = new Set(), seenIds = new Set();
  for (const spec of file.specs) {
    assert(TITLES.includes(spec.title)); assert(!seenTitles.has(spec.title)); seenTitles.add(spec.title);
    assert(typeof spec.id === 'string' && spec.id && !seenIds.has(spec.id)); seenIds.add(spec.id);
    assert.equal(spec.file, FILE); assert.equal(spec.ok, true); assert.equal(spec.tests.length, 1);
    const test = spec.tests[0];
    assert.equal(test.projectId, PROJECT); assert.equal(test.projectName, PROJECT);
    assert.equal(test.expectedStatus, 'passed'); empty(test.annotations, 'No skip/fixme/expected-fail annotation');
    assert.equal(test.results.length, execution ? 1 : 0);
    assert.equal(test.status, execution ? 'expected' : 'skipped');
    if (!execution) continue;
    const result = test.results[0];
    assert.equal(result.status, 'passed'); assert.equal(result.retry, 0);
    assert.equal(result.error, undefined); empty(result.errors, 'No hidden attempt errors');
    empty(result.annotations, 'No runtime skip');
    assert(Number.isInteger(result.workerIndex) && result.workerIndex >= 0);
    assert(Number.isFinite(Date.parse(result.startTime)));
    assert(Number.isFinite(result.duration) && result.duration >= 0);
    if (spec.title === TITLES[3]) assert(result.duration >= 29_000, 'Native deadline case must actually wait');
    const attachments = result.attachments.filter(item => item.name === 'arpg-real-engine-observations');
    assert.equal(attachments.length, 1); assert.equal(attachments[0].contentType, 'application/json');
    assert.equal(typeof attachments[0].body, 'string');
    const observation = JSON.parse(Buffer.from(attachments[0].body, 'base64').toString('utf8'));
    assert.equal(observation.browserVersion, '143.0.7499.4', 'Observed version of locked managed Chromium');
    for (const key of ['blocked', 'errors', 'unexpectedConsoleErrors', 'cleanupErrors']) empty(observation[key], key);
    assert(Array.isArray(observation.consoleErrors));
    empty(observation.consoleErrors.filter(message => !isExpectedConsoleError(spec.title, message)), 'Recheck exact injected console-error allowlist');
    const state = observation.state, cleanup = observation.afterCleanup;
    assert.equal(state?.ready, true); assert(cleanup);
    for (const value of [state, cleanup]) {
      empty(value.blocked, 'No forbidden fetch'); empty(value.rewardMutations, 'No reward mutation');
      assert(Array.isArray(value.api) && value.api.length > 0);
      for (const call of value.api) assert(
        (call.path === '/api/games/session/start' && call.method === 'POST') ||
        (call.path === '/api/leaderboard/arpg/alltime' && call.method === 'GET'), 'Only synthetic start and leaderboard calls');
      assert(Array.isArray(value.scenes) && value.scenes.length > 0);
      for (const scene of value.scenes) assert.equal(new Set(scene.queuedKeys).size, 249, 'Actual scene must queue its image set');
    }
    assert.equal(cleanup.canvasCount, 0); assert.equal(cleanup.authCallbacks, 0); empty(cleanup.mountedPages, 'No mounted page after cleanup');
    assert(cleanup.scenes.every(scene => scene.destroyed === true));
    const index = TITLES.indexOf(spec.title);
    const expectedStarts = [1, 2, 2, 2, 1, 1, 1, 1, 1, 2][index];
    assert.equal(state.api.filter(call => call.path === '/api/games/session/start').length, expectedStarts);
    if ([0, 1, 2, 3, 8, 9].includes(index)) {
      const active = state.scenes.filter(scene => !scene.destroyed);
      assert.equal(active.length, 1); assert.notEqual(active[0].createAt, null);
      assert.equal(active[0].decodedKeys.length, 249); empty(active[0].missingKeys, 'No missing decoded image on successful startup');
      assert(active[0].framesAfterCreate > 0);
      assert(state.pages.some(page => page.status === 'Session live — survive and dash!'));
    }
    if (index < SCREENSHOTS.length) {
      const images = result.attachments.filter(item => item.name === SCREENSHOTS[index]);
      assert.equal(images.length, 1); assert.equal(images[0].contentType, 'image/png');
      assert.equal(typeof images[0].body, 'string');
      const png = Buffer.from(images[0].body, 'base64');
      assert(png.length > 100); assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    }
  }
  assert.equal(report.stats.expected, execution ? TITLES.length : 0);
  assert.equal(report.stats.skipped, execution ? 0 : TITLES.length);
  assert.equal(report.stats.unexpected, 0); assert.equal(report.stats.flaky, 0);
  return execution
    ? 'Verified 10 executed actual-route/SDK/Phaser browser cases with synthetic Auth/transport; zero skips, failures or retries. Visual/gameplay acceptance remains separate.'
    : 'Verified discovery of 10 ARPG browser cases; ZERO executed. Discovery is not a browser pass.';
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, path, ...extra] = process.argv.slice(2);
  assert(path && extra.length === 0, 'Usage: node verify-results.mjs discovery|execution report.json');
  console.log(verify(JSON.parse(readFileSync(path, 'utf8')), mode));
}
