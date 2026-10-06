// Fail closed on partial/discovery-only evidence. No services or sockets are opened.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('../../test-results/moonberry-share/', import.meta.url));
const read = async path => JSON.parse(await readFile(`${output}${path}`, 'utf8'));
const expectedWaits = [
  ['two independent requests race for the last unit exactly once', 'different requests serialize through grove lock'],
  ['same-key overlapping retries decrement and write one memory once', 'same request advisory key'],
  ...['acquisition', 'companion'].map(target => [`same-key concurrent ${target} substitution waits and then rejects`, `changed ${target} waits for original request commit`]),
  ['gather then use observes refill after a real advisory-lock wait', 'use waits for gather commit'],
  ['use then gather at stock limit observes decrement after lock wait', 'gather waits for use commit'],
  ['gather at full stock commits terminal result before waiting use', 'use waits behind full gather receipt'],
  ['concurrent existing opt-out first suppresses memory after lock wait', 'use waits for existing consent update'],
  ['concurrent use first holds consent through commit and later opt-out hides history', 'opt-out waits for share consent lock']
];
const waitKey = ([scenario, label]) => JSON.stringify([scenario, label]);
function native(report, cluster) {
  assert.equal(report.status, 'PASSED');
  assert.equal(report.checkCount, 29);
  assert.equal(report.checks.length, 29);
  assert.equal(new Set(report.checks.map(check => check.name)).size, 29);
  assert(report.checks.every(check => check.status === 'PASSED'));
  assert.equal(report.failureCount, 0);
  assert.deepEqual(report.failures, []);
  assert.equal(report.fatalError, undefined);
  assert.equal(report.sourceHashesUnchanged, true);
  assert.equal(report.blockingEvidence.length, 9);
  const observedWaits = report.blockingEvidence.map(wait => waitKey([wait.scenario, wait.label]));
  assert.equal(new Set(observedWaits).size, 9, 'Every required scenario/label wait must be independently present');
  assert.deepEqual(observedWaits.sort(), expectedWaits.map(waitKey).sort());
  for (const wait of report.blockingEvidence) {
    assert(report.checks.some(check => check.name === wait.scenario));
    assert.notEqual(wait.holderPid, wait.waiterPid);
    assert(wait.activity.some(row => row.pid === wait.waiterPid && row.wait_event_type === 'Lock' && row.blockers.includes(wait.holderPid)));
    assert(wait.locks.some(lock => lock.pid === wait.waiterPid && !lock.granted));
  }
  assert.equal(cluster.status, 'PASSED');
  assert.equal(cluster.transactionsStarted, true);
  assert.match(cluster.postgresVersion, /^postgres \(PostgreSQL\) 17\./);
  assert.equal(cluster.noHostedCredentials, true);
  assert.equal(cluster.directoryModes.cluster, 0o700);
  assert.equal(cluster.directoryModes.socket, 0o700);
  for (const key of ['serverStopped', 'serverPidAbsent', 'socketRemoved', 'syntheticClusterDeleted']) assert.equal(cluster.cleanup[key], true);
  assert.equal(cluster.cleanup.pgCtlStatus, 3);
  assert.equal(cluster.cleanup.error, undefined);
  return 'Verified all 29 native scenarios, nine observed lock waits and complete cleanup.';
}
function browser(report) {
  assert.deepEqual(report.errors, []);
  assert.equal(report.stats.expected, 40);
  for (const key of ['unexpected', 'flaky', 'skipped']) assert.equal(report.stats[key], 0);
  const specs = suites => suites.flatMap(suite => [...suite.specs, ...specs(suite.suites || [])]);
  const tests = specs(report.suites).flatMap(spec => spec.tests);
  assert.equal(tests.length, 40);
  for (const test of tests) {
    assert.equal(test.status, 'expected');
    assert.equal(test.expectedStatus, 'passed');
    assert.equal(test.results.length, 1);
    assert.equal(test.results[0].status, 'passed');
    assert(test.results[0].attachments.some(item => item.name === 'synthetic-transport-log.json'));
  }
  for (const project of ['desktop', 'narrow']) assert.equal(tests.filter(test => test.projectName === project).length, 20);
  return 'Verified all 40 browser cases, with zero skipped cases or retries.';
}
if (process.argv[2] === '--self-test') {
  // Synthetic report objects test the verifier, never a database or browser.
  const checks = Array.from({ length: 29 }, (_, index) => ({ name: expectedWaits[index]?.[0] || `scenario-${index}`, status: 'PASSED' }));
  const report = { status: 'PASSED', checkCount: 29, checks, failureCount: 0, failures: [], sourceHashesUnchanged: true,
    blockingEvidence: expectedWaits.map(([scenario, label]) => ({ scenario, label, holderPid: 1, waiterPid: 2,
      activity: [{ pid: 2, wait_event_type: 'Lock', blockers: [1] }], locks: [{ pid: 2, granted: false }] })) };
  const cluster = { status: 'PASSED', transactionsStarted: true, postgresVersion: 'postgres (PostgreSQL) 17.0',
    noHostedCredentials: true, directoryModes: { cluster: 0o700, socket: 0o700 }, cleanup: {
      serverStopped: true, serverPidAbsent: true, socketRemoved: true, syntheticClusterDeleted: true, pgCtlStatus: 3 } };
  native(report, cluster);
  assert.throws(() => native({ ...report, blockingEvidence: report.blockingEvidence.slice(1) }, cluster));
  const duplicatedWait = structuredClone(report); duplicatedWait.blockingEvidence[8] = duplicatedWait.blockingEvidence[0];
  assert.throws(() => native(duplicatedWait, cluster));
  assert.throws(() => native(report, { ...cluster, cleanup: { ...cluster.cleanup, socketRemoved: false } }));
  const test = projectName => ({ projectName, status: 'expected', expectedStatus: 'passed', results: [{ status: 'passed', attachments: [{ name: 'synthetic-transport-log.json' }] }] });
  const results = { errors: [], stats: { expected: 40, skipped: 0, unexpected: 0, flaky: 0 }, suites: [{
    specs: Array.from({ length: 20 }, () => ({ tests: [test('desktop'), test('narrow')] })), suites: [] }] };
  browser(results);
  assert.throws(() => browser({ ...results, stats: { ...results.stats, flaky: 1 } }));
  const retried = structuredClone(results); retried.suites[0].specs[0].tests[0].results.push({ status: 'passed' });
  assert.throws(() => browser(retried));
  // Reject historical NOT_RUN, skipped/discovery-only and partial results.
  assert.throws(() => native({ status: 'NOT_RUN' }, {}));
  assert.throws(() => native({ status: 'PASSED', checkCount: 28 }, {}));
  assert.throws(() => browser({ errors: [], stats: { expected: 0, skipped: 40, unexpected: 0, flaky: 0 } }));
  assert.throws(() => browser({ errors: [], stats: { expected: 40, skipped: 0, unexpected: 0, flaky: 0 }, suites: [] }));
  console.log('Report verifier accepts complete report fixtures and rejects NOT_RUN, partial, missing/duplicate-wait, incomplete-cleanup, skipped, flaky, retried and discovery-only evidence.');
} else if (process.argv[2] === 'native') console.log(native(await read('native/native-postgres.json'), await read('native/native-cluster.json')));
else if (process.argv[2] === 'browser') console.log(browser(await read('browser-results.json')));
else throw new Error('Usage: moonberry-share-verify.mjs native|browser|--self-test');
