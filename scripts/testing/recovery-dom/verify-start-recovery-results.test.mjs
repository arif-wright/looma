// Synthetic report-shape tests only. They do not execute application/browser tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BROWSER_TITLES, UNIT_FILES, DOM_FILES, verifyBrowser, verifyVitest } from './verify-start-recovery-results.mjs';

function browser(mode = 'execution') {
  const execution = mode === 'execution';
  return {
    config: { version: '1.57.0', forbidOnly: true, workers: 1, shard: null, projects: [{ id: 'chromium-start-recovery', name: 'chromium-start-recovery', repeatEach: 1, retries: 0, testMatch: ['start-recovery.browser.spec.ts'] }] },
    errors: [], stats: { expected: execution ? 42 : 0, skipped: execution ? 0 : 42, unexpected: 0, flaky: 0 },
    suites: [{ title: 'start-recovery.browser.spec.ts', file: 'start-recovery.browser.spec.ts', specs: [], suites: ['neon', 'orbfield'].map(shell => ({
      title: `${shell}: actual shell + actual SDK, synthetic collaborators`, file: 'start-recovery.browser.spec.ts',
      specs: BROWSER_TITLES.map((title, index) => ({ title, ok: true, id: `${shell}-${index}`, file: 'start-recovery.browser.spec.ts', tests: [{
        projectId: 'chromium-start-recovery', projectName: 'chromium-start-recovery', expectedStatus: 'passed', annotations: [], status: execution ? 'expected' : 'skipped',
        results: execution ? [{ status: 'passed', retry: 0, errors: [], annotations: [], workerIndex: 0, startTime: '2026-10-09T00:00:00.000Z', duration: 1,
          attachments: [{ name: 'synthetic-fixture-observations', contentType: 'application/json', body: Buffer.from(JSON.stringify({ state: { blocked: [], playerStates: [] }, blocked: [], errors: [] })).toString('base64') }] }] : []
      }] }))
    })) }]
  };
}
const firstSpec = report => report.suites[0].suites[0].specs[0];
const firstTest = report => firstSpec(report).tests[0];
const firstResult = report => firstTest(report).results[0];
function vitest(kind = 'unit') {
  const files = kind === 'unit' ? UNIT_FILES : DOM_FILES[kind];
  const count = Object.values(files).reduce((sum, value) => sum + value, 0);
  return { success: true, numTotalTests: count, numPassedTests: count, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    numTotalTestSuites: Object.keys(files).length, numPassedTestSuites: Object.keys(files).length, numFailedTestSuites: 0, numPendingTestSuites: 0,
    testResults: Object.entries(files).map(([name, length]) => ({ name: `/synthetic/${name}`, status: 'passed', message: '',
      assertionResults: Array.from({ length }, (_, index) => ({ fullName: `Synthetic report assertion ${index}`, status: 'passed', failureMessages: [] })) })) };
}

test('valid synthetic execution schema is accepted', () => assert.match(verifyBrowser(browser(), 'execution'), /42 executed synthetic-browser/));
test('valid discovery is explicitly zero execution', () => assert.match(verifyBrowser(browser('discovery'), 'discovery'), /ZERO executed/));
test('discovery can never satisfy execution', () => assert.throws(() => verifyBrowser(browser('discovery'), 'execution')));
test('execution cannot be relabeled discovery', () => assert.throws(() => verifyBrowser(browser(), 'discovery')));
const browserMutations = {
  'empty suite': r => { r.suites = []; },
  'missing shell': r => { r.suites[0].suites.pop(); },
  'duplicate shell': r => { r.suites[0].suites[1] = structuredClone(r.suites[0].suites[0]); },
  'missing case': r => { r.suites[0].suites[0].specs.pop(); },
  'extra case': r => { r.suites[0].suites[0].specs.push(structuredClone(firstSpec(r))); },
  'duplicate title replacing missing case': r => { r.suites[0].suites[0].specs[1].title = firstSpec(r).title; },
  'duplicate identity': r => { r.suites[0].suites[0].specs[1].id = firstSpec(r).id; },
  'unexpected case': r => { firstSpec(r).title = 'Unreviewed case'; },
  'wrong file': r => { firstSpec(r).file = 'other.spec.ts'; },
  'wrong project': r => { firstTest(r).projectName = 'other'; },
  'extra project result': r => { firstSpec(r).tests.push(structuredClone(firstTest(r))); },
  'spec failure': r => { firstSpec(r).ok = false; },
  'expected failure': r => { firstTest(r).expectedStatus = 'failed'; },
  'skip annotation': r => { firstTest(r).annotations = [{ type: 'skip' }]; },
  'skipped result': r => { firstResult(r).status = 'skipped'; },
  'failed result': r => { firstResult(r).status = 'failed'; },
  'timed out result': r => { firstResult(r).status = 'timedOut'; },
  'interrupted result': r => { firstResult(r).status = 'interrupted'; },
  'missing execution': r => { firstTest(r).results = []; },
  'retried pass': r => { firstTest(r).results.unshift({ status: 'failed', retry: 0 }); firstTest(r).results[1].retry = 1; },
  'only final retry supplied': r => { firstResult(r).retry = 1; },
  'flaky case': r => { firstTest(r).status = 'flaky'; },
  'global error': r => { r.errors = [{ message: 'Global teardown failed' }]; },
  'hidden result error': r => { firstResult(r).errors = [{ message: 'Failure' }]; },
  'result error field': r => { firstResult(r).error = { message: 'Failure' }; },
  'runtime skip annotation': r => { firstResult(r).annotations = [{ type: 'skip' }]; },
  'missing guard observations': r => { firstResult(r).attachments = []; },
  'guard reports forbidden traffic': r => { firstResult(r).attachments[0].body = Buffer.from(JSON.stringify({ state: { blocked: [], playerStates: [] }, blocked: ['POST /api/live'], errors: [] })).toString('base64'); },
  'guard reports missing runtime snapshot': r => { firstResult(r).attachments[0].body = Buffer.from(JSON.stringify({ state: null, blocked: [], errors: [] })).toString('base64'); },
  'guard reports local reward mutation': r => { firstResult(r).attachments[0].body = Buffer.from(JSON.stringify({ state: { blocked: [], playerStates: [{}] }, blocked: [], errors: [] })).toString('base64'); },
  'inflated expected stats': r => { r.stats.expected = 43; },
  'skipped stats': r => { r.stats.skipped = 1; },
  'unexpected stats': r => { r.stats.unexpected = 1; },
  'flaky stats': r => { r.stats.flaky = 1; },
  'wrong Playwright version': r => { r.config.version = '1.56.0'; },
  'only allowed': r => { r.config.forbidOnly = false; },
  'sharded suite': r => { r.config.shard = { current: 1, total: 2 }; },
  'retries configured': r => { r.config.projects[0].retries = 1; },
  'repeats configured': r => { r.config.projects[0].repeatEach = 2; },
  'extra configured project': r => { r.config.projects.push(structuredClone(r.config.projects[0])); }
};
for (const [name, mutate] of Object.entries(browserMutations)) test(`reject browser ${name}`, () => { const report = browser(); mutate(report); assert.throws(() => verifyBrowser(report, 'execution')); });
for (const kind of ['unit', ...Object.keys(DOM_FILES)]) test(`accept exact ${kind} count`, () => assert.match(verifyVitest(vitest(kind), kind), /Verified/));
const vitestMutations = {
  'empty files': r => { r.testResults = []; },
  'missing file': r => { r.testResults.pop(); },
  'duplicate file': r => { r.testResults[1] = structuredClone(r.testResults[0]); },
  'unexpected file': r => { r.testResults[0].name = 'unknown.spec.ts'; },
  'process failure': r => { r.success = false; },
  'failed count': r => { r.numFailedTests = 1; },
  'pending count': r => { r.numPendingTests = 1; },
  'todo count': r => { r.numTodoTests = 1; },
  'failed suite count': r => { r.numFailedTestSuites = 1; },
  'pending suite count': r => { r.numPendingTestSuites = 1; },
  'incorrect total count': r => { r.numTotalTests++; },
  'interrupted execution': r => { r.wasInterrupted = true; },
  'unhandled errors': r => { r.unhandledErrors = [{ message: 'Unhandled rejection' }]; },
  'runtime error suite': r => { r.numRuntimeErrorTestSuites = 1; },
  'partial passed count': r => { r.numPassedTests--; },
  'missing assertion': r => { r.testResults[0].assertionResults.pop(); },
  'duplicate assertion': r => { r.testResults[0].assertionResults[1].fullName = r.testResults[0].assertionResults[0].fullName; },
  'skipped assertion': r => { r.testResults[0].assertionResults[0].status = 'skipped'; },
  'failed assertion': r => { r.testResults[0].assertionResults[0].status = 'failed'; },
  'assertion errors': r => { r.testResults[0].assertionResults[0].failureMessages = ['Failure']; },
  'suite errors': r => { r.testResults[0].message = 'AfterAll failed'; },
  'reported retry': r => { r.testResults[0].assertionResults[0].retryCount = 1; },
  'repeated assertion': r => { r.testResults[0].assertionResults[0].invocations = 2; }
};
for (const kind of ['unit', ...Object.keys(DOM_FILES)]) {
  for (const [name, mutate] of Object.entries(vitestMutations)) test(`reject ${kind} Vitest ${name}`, () => {
    const report = vitest(kind); mutate(report); assert.throws(() => verifyVitest(report, kind));
  });
}
test('original DOM CLI applies the same strict gate to every DOM suite, including town', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dom-report-selftest-'));
  const helper = fileURLToPath(new URL('./verify-results.mjs', import.meta.url));
  try {
    for (const kind of Object.keys(DOM_FILES)) {
      const filename = join(directory, `${kind}.json`);
      writeFileSync(filename, JSON.stringify(vitest(kind)));
      assert.equal(spawnSync(process.execPath, [helper, kind, filename]).status, 0);
      for (const mutate of Object.values(vitestMutations)) {
        const report = vitest(kind); mutate(report); writeFileSync(filename, JSON.stringify(report));
        assert.notEqual(spawnSync(process.execPath, [helper, kind, filename]).status, 0);
      }
    }
    for (const args of [[], ['unit', join(directory, 'neon.json')], ['arpg-town', join(directory, 'missing.json')]]) {
      assert.notEqual(spawnSync(process.execPath, [helper, ...args]).status, 0);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('CLI fails closed for missing, malformed, empty, unknown-mode and discovery-as-execution input', () => {
  const directory = mkdtempSync(join(tmpdir(), 'startup-report-selftest-'));
  const helper = fileURLToPath(new URL('./verify-start-recovery-results.mjs', import.meta.url));
  try {
    const files = [['malformed.json', '{'], ['empty.json', '{}'], ['discovery.json', JSON.stringify(browser('discovery'))]];
    for (const [name, contents] of files) writeFileSync(join(directory, name), contents);
    for (const args of [[], ['execution', join(directory, 'missing.json')], ['execution', join(directory, 'malformed.json')], ['execution', join(directory, 'empty.json')], ['unknown', join(directory, 'discovery.json')], ['execution', join(directory, 'discovery.json')]]) {
      const result = spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8' });
      assert.notEqual(result.status, 0);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
