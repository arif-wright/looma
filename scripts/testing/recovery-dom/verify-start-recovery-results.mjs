import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Release-specific expectations. Changes require review alongside the test matrix.
export const UNIT_FILES = {
  'gameSdkSessionLifecycle.spec.ts': 53,
  'gameSdkStartRecovery.spec.ts': 27,
  'gameIntegrationStartRecovery.spec.ts': 9,
  'arpgBootStartRecovery.spec.ts': 5,
  'arpgBootSceneReadiness.spec.ts': 13,
  'arpgGameSceneReadiness.spec.ts': 12,
  'arpgExpedition.spec.ts': 8,
  'arpgExpeditionScene.spec.ts': 21,
  'arpgTownSession.spec.ts': 30,
  'gameFullscreenStartRecovery.spec.ts': 18
};
export const DOM_FILES = {
  neon: { 'neon-component.spec.ts': 3 },
  portal: { 'portal-component.spec.ts': 52 },
  start: { 'start-component.spec.ts': 32 },
  legacy: { 'legacy-component.spec.ts': 17 },
  'arpg-town': { 'arpg-town-component.spec.ts': 26 }
};
export const BROWSER_TITLES = [
  ...['fetch', 'body', 'error-body'].map(stage => `30-second ${stage} timeout is uncertain, never auto-replayed, and ignores a late reply`),
  'repeated clicks open one request; explicit new start settles only its own identity after an old reply',
  'a successful original start preserves its original session and nonce through completion',
  ...['exit', 'unmount'].map(action => `${action} aborts a pending start and rejects its late response`),
  ...['account switch', 'sign out'].map(change => `${change} aborts pending start and offers the correct recovery action`),
  'same-owner token refresh keeps the pending start; a synthetic background signal pauses it on arrival',
  ...['owner change', 'unmount'].map(action => `${action} during the explicit preload gate prevents any server-session attempt`),
  'the first Auth event cannot adopt owner B during the rendered owner A preload',
  'an initial owner mismatch before Start fails closed with Refresh page',
  'unavailable Auth renders safely and fails closed before any API request',
  'missing initial Auth notification times out at 30 seconds without opening a session',
  'Refresh page really reloads once, without automatically starting against stale rendered ownership',
  'already signed-out Auth offers Sign in and navigates locally without an API request',
  'a short practice run still skips signing, completion and local rewards',
  ...['account switch', 'sign out'].map(change => `${change} after timeout blocks explicit new start before another API attempt`)
];
const projectName = 'chromium-start-recovery';
const browserFile = 'start-recovery.browser.spec.ts';
const shells = ['neon', 'orbfield'];
const suiteTitle = shell => `${shell}: actual shell + actual SDK, synthetic collaborators`;
const empty = (value, message) => assert.deepEqual(value, [], message);
const basename = value => value.replaceAll('\\', '/').split('/').at(-1);

export function verifyVitest(report, kind) {
  const files = kind === 'unit' ? UNIT_FILES : DOM_FILES[kind];
  assert(files, 'Expected unit, neon, portal, start, legacy or arpg-town');
  const count = Object.values(files).reduce((sum, value) => sum + value, 0);
  assert.equal(report.success, true, 'Vitest process must succeed');
  if (report.wasInterrupted !== undefined) assert.equal(report.wasInterrupted, false);
  if (report.unhandledErrors !== undefined) empty(report.unhandledErrors, 'No unhandled errors');
  if (report.numRuntimeErrorTestSuites !== undefined) assert.equal(report.numRuntimeErrorTestSuites, 0);
  for (const name of ['numFailedTests', 'numPendingTests', 'numTodoTests', 'numFailedTestSuites', 'numPendingTestSuites']) assert.equal(report[name], 0, name);
  assert.equal(report.numTotalTests, count, 'Exact expected test count');
  assert.equal(report.numPassedTests, count, 'Every expected test passed');
  assert(Number.isInteger(report.numTotalTestSuites) && report.numTotalTestSuites > 0);
  assert.equal(report.numPassedTestSuites, report.numTotalTestSuites);
  assert.equal(report.testResults.length, Object.keys(files).length, 'Exact expected test files');
  const seenFiles = new Set();
  for (const file of report.testResults) {
    const name = basename(file.name);
    assert(Object.hasOwn(files, name), `Unexpected test file: ${name}`);
    assert(!seenFiles.has(name), `Duplicate test file: ${name}`);
    seenFiles.add(name);
    assert.equal(file.status, 'passed', name);
    assert.equal(file.message, '', `Suite errors in ${name}`);
    assert.equal(file.assertionResults.length, files[name], name);
    const seenNames = new Set();
    for (const result of file.assertionResults) {
      assert.equal(result.status, 'passed', `${name}: no skipped, pending, todo or failed assertions`);
      assert.equal(typeof result.fullName, 'string');
      assert(result.fullName.trim());
      assert(!seenNames.has(result.fullName), `Duplicate assertion: ${result.fullName}`);
      seenNames.add(result.fullName);
      empty(result.failureMessages, 'No assertion failures');
      // Some reporter versions expose retry counts; never accept them if present.
      if (result.retryCount !== undefined) assert.equal(result.retryCount, 0);
      if (result.invocations !== undefined) assert.equal(result.invocations, 1);
    }
  }
  return `Verified ${count} passing ${kind} cases in ${seenFiles.size} files; none skipped.`;
}

export function verifyBrowser(report, mode) {
  assert(['discovery', 'execution'].includes(mode), 'Expected discovery or execution mode');
  empty(report.errors, 'No global Playwright errors');
  assert.equal(report.config.version, '1.57.0', 'Reviewed Playwright version');
  assert.equal(report.config.forbidOnly, true);
  assert.equal(report.config.workers, 1);
  assert.equal(report.config.shard, null, 'No partial shards');
  assert.equal(report.config.projects.length, 1);
  const project = report.config.projects[0];
  assert.equal(project.id, projectName);
  assert.equal(project.name, projectName);
  assert.equal(project.repeatEach, 1);
  assert.equal(project.retries, 0);
  assert.deepEqual(project.testMatch, [browserFile]);
  assert.equal(report.suites.length, 1, 'Exactly one browser spec file');
  const file = report.suites[0];
  assert.equal(file.title, browserFile);
  assert.equal(file.file, browserFile);
  empty(file.specs, 'All tests must be in the two maintained-shell suites');
  assert.equal(file.suites.length, 2);
  const seenShells = new Set(), seenIds = new Set();
  let count = 0;
  for (const suite of file.suites) {
    const shell = shells.find(value => suite.title === suiteTitle(value));
    assert(shell && !seenShells.has(shell), `Unknown or duplicate shell: ${suite.title}`);
    seenShells.add(shell);
    assert.equal(suite.file, browserFile);
    empty(suite.suites ?? [], 'No unexpected nested suites');
    assert.equal(suite.specs.length, 21, 'Each maintained shell has 21 distinct cases');
    const seenTitles = new Set();
    for (const spec of suite.specs) {
      assert(BROWSER_TITLES.includes(spec.title), `Unexpected browser case: ${spec.title}`);
      assert(!seenTitles.has(spec.title), `Duplicate browser case: ${spec.title}`);
      seenTitles.add(spec.title);
      assert.equal(spec.file, browserFile);
      assert.equal(spec.ok, true);
      assert.equal(typeof spec.id, 'string');
      assert(spec.id && !seenIds.has(spec.id), 'Missing or duplicate spec identity');
      seenIds.add(spec.id);
      assert.equal(spec.tests.length, 1);
      const test = spec.tests[0];
      assert.equal(test.projectId, projectName);
      assert.equal(test.projectName, projectName);
      assert.equal(test.expectedStatus, 'passed', 'No expected-fail tests');
      empty(test.annotations, 'No skip, fixme or expected-fail annotations');
      assert.equal(test.results.length, mode === 'execution' ? 1 : 0, 'Execution requires one actual attempt; discovery requires zero');
      assert.equal(test.status, mode === 'execution' ? 'expected' : 'skipped');
      if (mode === 'execution') {
        const result = test.results[0];
        assert.equal(result.status, 'passed');
        assert.equal(result.retry, 0, 'No retry may replace a clean first-attempt pass');
        assert.equal(result.error, undefined);
        empty(result.errors, 'No attempt errors');
        empty(result.annotations, 'No runtime skip annotations');
        assert(Number.isInteger(result.workerIndex) && result.workerIndex >= 0);
        assert(Number.isFinite(Date.parse(result.startTime)));
        assert(Number.isFinite(result.duration) && result.duration >= 0);
        const observations = result.attachments.filter(item => item.name === 'synthetic-fixture-observations');
        assert.equal(observations.length, 1, 'The unchanged isolation guard must record each browser attempt');
        assert.equal(observations[0].contentType, 'application/json');
        assert.equal(typeof observations[0].body, 'string');
        const observation = JSON.parse(Buffer.from(observations[0].body, 'base64').toString('utf8'));
        empty(observation.blocked, 'No forbidden browser requests');
        empty(observation.errors, 'No uncaught page errors');
        assert(observation.state && typeof observation.state === 'object', 'Runtime snapshot is required');
        empty(observation.state.blocked, 'No forbidden in-memory fetches');
        empty(observation.state.playerStates, 'No local reward mutation');
      }
      count++;
    }
  }
  assert.equal(count, 42);
  assert.equal(report.stats.expected, mode === 'execution' ? 42 : 0);
  assert.equal(report.stats.skipped, mode === 'execution' ? 0 : 42);
  assert.equal(report.stats.unexpected, 0);
  assert.equal(report.stats.flaky, 0);
  return mode === 'execution'
    ? 'Verified 42 executed synthetic-browser cases: 21 per maintained shell; zero failures, skips or retries.'
    : 'Verified discovery of 42 browser cases; ZERO executed. Discovery is not a browser pass.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [kind, filename, ...extra] = process.argv.slice(2);
  assert(filename && extra.length === 0, 'Usage: node verify-start-recovery-results.mjs <unit|neon|portal|start|legacy|arpg-town|discovery|execution> <report.json>');
  const report = JSON.parse(readFileSync(filename, 'utf8'));
  console.log(['discovery', 'execution'].includes(kind) ? verifyBrowser(report, kind) : verifyVitest(report, kind));
}
